/**
 * books.ts — kitob ro'yxatga olish va PDF-service bilan qayta ishlash
 * oqimi. Fayl R2'da yotadi (`upload.ts` orqali presign qilinib
 * yuklangan) — bu yerga faqat `file_key` keladi, u yerdan PDF-service
 * uchun vaqtinchalik presigned GET URL generatsiya qilinadi.
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { pool, query } from "../db/pool.js";
import { startExerciseExtraction, startPageRendering, startPdfProcessing, waitForPdfJob } from "../services/pdfService.js";
import { createDownloadUrl, uploadBuffer } from "../services/r2.js";

export const booksRouter = Router();
booksRouter.use(telegramAuth);

async function currentUserId(telegramId: number): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [telegramId]
  );
  return row?.id ?? null;
}

async function ownsCourse(courseId: string, userId: string): Promise<boolean> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM courses WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [courseId, userId]
  );
  return !!row;
}

/** Kitob berilgan foydalanuvchining kursiga tegishli bo'lsa qaytaradi,
 * aks holda (topilmasa yoki begona kursga tegishli bo'lsa) null. */
async function getOwnedBook(
  bookId: string,
  userId: string
): Promise<{ id: string } & Record<string, unknown> | null> {
  const [row] = await query<{ id: string }>(
    `SELECT b.* FROM books b
     JOIN courses c ON c.id = b.course_id
     WHERE b.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL`,
    [bookId, userId]
  );
  return row ?? null;
}

const RegisterBookSchema = z.object({
  course_id: z.string().uuid(),
  nomi: z.string().min(1),
  turi: z.enum(["lehrbuch", "arbeitsbuch", "audio", "qoshimcha"]),
  file_key: z.string().min(1), // upload.ts /presign natijasidan
  til_kodi: z.string().default("de"),
});

/**
 * 1) Kitobni DB'ga ro'yxatdan o'tkazadi (holati=jarayonda, fayl_yoli=file_key)
 * 2) file_key uchun vaqtinchalik presigned GET URL yasaydi (PDF-service
 *    o'zi R2 credential'iga ega bo'lmasin — faqat shu URL orqali o'qiydi)
 * 3) PDF-service'ga /process chaqiradi (job_id oladi) va DARHOL 202 bilan
 *    qaytadi — natijani END-TO-END kutmaydi
 * 4) Qayta ishlash fonda (background) davom etadi; mijoz holatni
 *    GET /books/:id orqali pollab turadi (qayta_ishlash_holati:
 *    jarayonda -> tayyor|xato)
 *
 * FIX (#8): avval shu handler PDF-service tayyor bo'lguncha SINXRON
 * kutardi (`waitForPdfJob(..., {timeoutMs: 10*60*1000})` — 10
 * daqiqagacha). Mobil Telegram Mini App'da bu HTTP/WebView
 * timeout'lari, fon rejimiga o'tish yoki tarmoq uzilishi sababli
 * amalda ishlamas edi (frontend hech qanday polling-fallback
 * qilmasdi, faqat bitta uzun `await`). Endi so'rov faqat job'ni
 * boshlab, holatini darhol qaytaradi — qolgan ishni fon jarayoni
 * bajaradi va natijani DB'ga yozadi, xuddi shunday mijoz uni keyin
 * pollab o'qiydi.
 *
 * ESLATMA: fayl_hash orqali duplikat tekshiruvi hozircha olib
 * tashlandi (fayl endi R2'da, Node uni o'qib hash chiqarmaydi —
 * ikki marta o'tkazishga aylanib qoladi). Kerak bo'lsa PDF-service
 * hisoblab, natija bilan birga qaytarishi mumkin — keyingi qadam.
 */
booksRouter.post("/", async (req, res) => {
  const parsed = RegisterBookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const { course_id, nomi, turi, file_key, til_kodi } = parsed.data;

  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  if (!(await ownsCourse(course_id, userId))) {
    return res.status(404).json({ xato: "kurs topilmadi" });
  }

  const [book] = await query<{ id: string }>(
    `INSERT INTO books (course_id, nomi, turi, fayl_yoli, qayta_ishlash_holati)
     VALUES ($1,$2,$3,$4,'jarayonda') RETURNING id`,
    [course_id, nomi, turi, file_key]
  );

  let job_id: string;
  try {
    const file_url = await createDownloadUrl(file_key, { expiresInSec: 30 * 60 });
    ({ job_id } = await startPdfProcessing(book.id, file_url, til_kodi));
  } catch (err) {
    const xato_matni = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE books SET qayta_ishlash_holati='xato', qayta_ishlash_xatosi=$2 WHERE id=$1`,
      [book.id, xato_matni]
    );
    return res.status(502).json({ xato: "PDF-service'ni ishga tushirib bo'lmadi", tafsilot: xato_matni });
  }

  // Mijozga darhol javob — jarayon davom etmoqda. Mijoz
  // GET /books/:id orqali qayta_ishlash_holati'ni pollab turadi.
  res.status(202).json({ book_id: book.id, holati: "jarayonda" });

  // Qolgan qism fonda: job tugashini kutib, natijani DB'ga yozadi.
  // So'rov-javob sikli allaqachon yopilgan, shuning uchun xatolar
  // faqat log'ga va books.qayta_ishlash_xatosi'ga yoziladi.
  void (async () => {
    try {
      const natija = await waitForPdfJob(job_id, { timeoutMs: 10 * 60 * 1000 });

      if (natija.holati !== "tayyor") {
        await query(
          `UPDATE books SET qayta_ishlash_holati='xato', qayta_ishlash_xatosi=$2 WHERE id=$1`,
          [book.id, String(natija.xato_matni ?? "noma'lum xato")]
        );
        return;
      }

      const boblar = (natija.natija as any)?.boblar ?? [];
      for (const [i, bob] of boblar.entries()) {
        await query(
          `INSERT INTO chapters (book_id, nomi, matn, sahifa_boshi, sahifa_oxiri, tartib_raqami, bounding_boxes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            book.id,
            // FIX (#10): `bob.turi` endi generic (nemis bo'lmagan)
            // darsliklar uchun bo'sh/`null` bo'lishi mumkin (qarang
            // chapter_splitter.py) — shablon buni "null" degan matn
            // sifatida chiqarib qo'ymasligi uchun moslashtirildi.
            [bob.unit_nomi, bob.turi].filter(Boolean).join(" — ") +
              (bob.nomi ? ": " + bob.nomi : ""),
            bob.matn,
            bob.sahifa_boshi,
            bob.sahifa_oxiri,
            i + 1,
            JSON.stringify(bob.bounding_boxes ?? []),
          ]
        );
      }

      await query(`UPDATE books SET qayta_ishlash_holati='tayyor' WHERE id=$1`, [book.id]);
    } catch (err) {
      const xato_matni = err instanceof Error ? err.message : String(err);
      console.error(`[books] fon jarayonida xato (book_id=${book.id}):`, xato_matni);
      try {
        await query(
          `UPDATE books SET qayta_ishlash_holati='xato', qayta_ishlash_xatosi=$2 WHERE id=$1`,
          [book.id, xato_matni]
        );
      } catch (dbErr) {
        console.error(`[books] xato holatini DB'ga yozib bo'lmadi (book_id=${book.id}):`, dbErr);
      }
    }
  })();
});

booksRouter.get("/:id", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });
  res.json(book);
});

/** Kitobning boblari — Mini App'da o'quvchi qaysi bobda mashq
 * qilishni tanlashi uchun (matn o'zi bu yerda qaytarilmaydi, faqat
 * ro'yxat — matn hajmi katta bo'lishi mumkin).
 *
 * FIX (#progress-bar): `exercises.ts` har javobdan keyin
 * `user_progress.foiz_bajarilgan`ni yangilab boradi, lekin bu
 * ma'lumot hech qanday endpoint orqali qaytarilmagani uchun
 * frontend'da hech qachon ko'rsatilmasdi — o'lik (write-only)
 * xususiyat edi. Endi shu joyga LEFT JOIN qo'shildi: har bob uchun
 * SHU foydalanuvchining progressi (`foiz_bajarilgan`, `yakunlangan`)
 * ham qaytadi (progress yozuvi hali yo'q bo'lsa — 0/false). */
booksRouter.get("/:id/chapters", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });

  const chapters = await query(
    `SELECT c.id, c.nomi, c.tartib_raqami, c.sahifa_boshi, c.sahifa_oxiri,
            COALESCE(up.foiz_bajarilgan, 0) AS foiz_bajarilgan,
            (up.yakunlangan_at IS NOT NULL) AS yakunlangan
     FROM chapters c
     LEFT JOIN user_progress up ON up.chapter_id = c.id AND up.user_id = $2
     WHERE c.book_id=$1 ORDER BY c.tartib_raqami`,
    [req.params.id, userId]
  );
  res.json(chapters);
});

// ============================================================
// book_exercises — darslikdan ajratilgan mashqlar (v10).
// chapters.matn pipeline'idan MUSTAQIL: unga tegmaydi.
// ============================================================

interface ExtractedExercise {
  exercise_number: string;
  heading_kind: "numeric" | "sub_inherited";
  xom_matn: string;
  page_physical: number;
  page_printed: number | null;
  bbox: number[] | null;
  reading_order_position: number;
  audio_markers: string[];
  page_type: string | null;
  needs_review: boolean;
  needs_review_reason: string | null;
  chapter_tartib_raqami: number | null;
  rasm_base64: string | null;
}

/** Kitobning mashqlarini BIR tranzaksiyada almashtiradi (DELETE + INSERT):
 * qayta-extraction idempotent bo'ladi, oraliq holat ko'rinmaydi.
 * `xom_matn` extractor bergan holda yoziladi — bu yerda o'zgartirilmaydi. */
/** PDF-service qaytargan base64 JPEG'larni R2'ga yuklaydi (bir vaqtda
 * cheklangan sonda — bitta kitobda yuzlab mashq bo'lishi mumkin, hammasini
 * bir zumda parallel yuborish R2/xotirani ortiqcha band qiladi). Xato
 * bo'lgan alohida rasm o'sha mashqni rasmsiz qoldiradi, butun jarayonni
 * to'xtatmaydi. Qaytadi: mashq index -> image_r2_key xaritasi. */
async function uploadExerciseImages(mashqlar: ExtractedExercise[]): Promise<Map<number, string>> {
  const natija = new Map<number, string>();
  const BATCH = 5;
  for (let i = 0; i < mashqlar.length; i += BATCH) {
    const chunk = mashqlar.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (m, j) => {
        if (!m.rasm_base64) return;
        try {
          const key = await uploadBuffer(Buffer.from(m.rasm_base64, "base64"), "image/jpeg", {
            prefix: "mashq-rasmlari/",
          });
          natija.set(i + j, key);
        } catch (err) {
          console.error(`[books] mashq rasmini yuklashda xato (sahifa ${m.page_physical}):`, err);
        }
      })
    );
  }
  return natija;
}

async function replaceBookExercises(bookId: string, mashqlar: ExtractedExercise[]): Promise<number> {
  const chapterRows = await query<{ id: string; tartib_raqami: number }>(
    `SELECT id, tartib_raqami FROM chapters WHERE book_id=$1`,
    [bookId]
  );
  const chapterIdByOrder = new Map(chapterRows.map((r) => [r.tartib_raqami, r.id]));
  const imageKeys = await uploadExerciseImages(mashqlar);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Bir vaqtda ikki marta ishga tushirilsa navbatma-navbat bajariladi
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`book_exercises:${bookId}`]);
    // Inson tasdiqlagan (tekshirilgan) yozuvlar qayta-extraction'da YO'QOLMASIN:
    // faqat sahifa + raqam + xom_matn AYNAN bir xil bo'lsa tasdiq saqlanadi.
    // Matn o'zgargan bo'lsa tasdiq yaroqsiz — yangi yozuv tekshirilmagan bo'ladi.
    const tasdiqlangan = await client.query(
      `SELECT page_physical, exercise_number, xom_matn, tekshirilgan_at
       FROM book_exercises WHERE book_id=$1 AND tekshirilgan`,
      [bookId]
    );
    const tasdiqKaliti = (page: number, raqam: string, matn: string) => `${page}|${raqam}|${matn}`;
    const tasdiqMap = new Map<string, Date | null>(
      tasdiqlangan.rows.map((r: any) => [tasdiqKaliti(r.page_physical, r.exercise_number, r.xom_matn), r.tekshirilgan_at])
    );
    await client.query(`DELETE FROM book_exercises WHERE book_id=$1`, [bookId]);
    for (let idx = 0; idx < mashqlar.length; idx++) {
      const m = mashqlar[idx];
      const kalit = tasdiqKaliti(m.page_physical, m.exercise_number, m.xom_matn);
      const oldingiTasdiq = tasdiqMap.has(kalit);
      await client.query(
        `INSERT INTO book_exercises
           (book_id, chapter_id, exercise_number, heading_kind, xom_matn,
            page_physical, page_printed, bbox, reading_order_position,
            audio_markers, page_type, needs_review, needs_review_reason,
            tekshirilgan, tekshirilgan_at, image_r2_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          bookId,
          m.chapter_tartib_raqami != null ? chapterIdByOrder.get(m.chapter_tartib_raqami) ?? null : null,
          m.exercise_number,
          m.heading_kind,
          m.xom_matn,
          m.page_physical,
          m.page_printed,
          JSON.stringify(m.bbox),
          m.reading_order_position,
          m.audio_markers,
          m.page_type,
          m.needs_review,
          m.needs_review_reason,
          oldingiTasdiq,
          oldingiTasdiq ? tasdiqMap.get(kalit) ?? null : null,
          imageKeys.get(idx) ?? null,
        ]
      );
    }
    await client.query("COMMIT");
    return mashqlar.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Kitob uchun extractor'ni ishga tushiradi (mavjud kitobni qayta ishlash
 * ham shu yerdan). Natija fonda book_exercises'ga yoziladi; tekshirish:
 * GET /books/:id/exercises. Kitob holati (`qayta_ishlash_holati`) O'ZGARMAYDI —
 * extractor xatosi kitobni "xato"ga tushirmaydi. */
booksRouter.post("/:id/exercises/extract", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });
  if (book.qayta_ishlash_holati !== "tayyor") {
    return res.status(409).json({ xato: "kitob hali qayta ishlanmagan (holati 'tayyor' emas)" });
  }

  const chapters = await query<{ tartib_raqami: number; sahifa_boshi: number; sahifa_oxiri: number | null }>(
    `SELECT tartib_raqami, sahifa_boshi, sahifa_oxiri
     FROM chapters WHERE book_id=$1 AND sahifa_boshi IS NOT NULL ORDER BY tartib_raqami`,
    [book.id]
  );

  let job_id: string;
  try {
    const file_url = await createDownloadUrl(String(book.fayl_yoli), { expiresInSec: 30 * 60 });
    ({ job_id } = await startExerciseExtraction(book.id, file_url, chapters));
  } catch (err) {
    const tafsilot = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ xato: "PDF-service'ni ishga tushirib bo'lmadi", tafsilot });
  }

  res.status(202).json({ book_id: book.id, job_id, holati: "jarayonda" });

  void (async () => {
    try {
      const natija = await waitForPdfJob(job_id, { timeoutMs: 15 * 60 * 1000 });
      if (natija.holati !== "tayyor") {
        console.error(`[books] extractor xatosi (book_id=${book.id}):`, natija.xato_matni);
        return;
      }
      const mashqlar = ((natija.natija as any)?.mashqlar ?? []) as ExtractedExercise[];
      if (mashqlar.length === 0) {
        // Mavjud yozuvlarni bo'sh natija bilan o'chirib yubormaslik uchun
        console.error(`[books] extractor 0 ta mashq qaytardi, mavjud yozuvlar saqlandi (book_id=${book.id})`);
        return;
      }
      const soni = await replaceBookExercises(book.id, mashqlar);
      console.log(`[books] book_exercises yozildi: ${soni} ta (book_id=${book.id})`);
    } catch (err) {
      console.error(`[books] mashqlarni yozishda xato (book_id=${book.id}):`, err);
    }
  })();
});

const ListExercisesQuery = z.object({
  chapter_id: z.string().uuid().optional(),
  needs_review: z.enum(["0", "1"]).optional(),
  tekshirilgan: z.enum(["0", "1"]).optional(),
});

/** Kitob mashqlari. Filtrlar: ?chapter_id=<uuid>  ?needs_review=1|0  ?tekshirilgan=1|0.
 * needs_review = extractor shubhasi; tekshirilgan = inson tasdiqlagan (ikkisi mustaqil).
 * `jami` / `needs_review_soni` / `tekshirilgan_soni` — filtrdan QAT'IY NAZAR
 * butun kitob bo'yicha; `qaytarildi` — shu javobdagi qatorlar soni. */
booksRouter.get("/:id/exercises", async (req, res) => {
  const parsed = ListExercisesQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const { chapter_id, needs_review, tekshirilgan } = parsed.data;

  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });

  const where = ["book_id = $1"];
  const params: unknown[] = [book.id];
  if (chapter_id) {
    params.push(chapter_id);
    where.push(`chapter_id = $${params.length}`);
  }
  if (needs_review) {
    params.push(needs_review === "1");
    where.push(`needs_review = $${params.length}`);
  }
  if (tekshirilgan) {
    params.push(tekshirilgan === "1");
    where.push(`tekshirilgan = $${params.length}`);
  }

  const mashqlar = await query(
    `SELECT id, chapter_id, exercise_number, heading_kind, xom_matn,
            page_physical, page_printed, bbox, reading_order_position,
            audio_markers, page_type, needs_review, needs_review_reason,
            tekshirilgan, tekshirilgan_at
     FROM book_exercises
     WHERE ${where.join(" AND ")}
     ORDER BY page_physical, reading_order_position`,
    params
  );
  const [totals] = await query<{ jami: number; needs_review_soni: number; tekshirilgan_soni: number }>(
    `SELECT count(*)::int AS jami,
            (count(*) FILTER (WHERE needs_review))::int AS needs_review_soni,
            (count(*) FILTER (WHERE tekshirilgan))::int AS tekshirilgan_soni
     FROM book_exercises WHERE book_id=$1`,
    [book.id]
  );

  res.json({
    jami: totals.jami,
    needs_review_soni: totals.needs_review_soni,
    tekshirilgan_soni: totals.tekshirilgan_soni,
    qaytarildi: mashqlar.length,
    mashqlar,
  });
});

// ============================================================
// book_pages — to'liq PDF-viewer (v14). book_exercises'dan MUSTAQIL:
// bu yerda kitobning HAR bir sahifasi to'liq JPEG sifatida.
// ============================================================

interface RenderedPage {
  page_physical: number;
  width: number;
  height: number;
  jpeg_base64: string;
}

/** Render qilingan sahifalarni R2'ga yuklaydi va book_pages'ga yozadi
 * (upsert — qayta-render eski yozuvni yangilaydi, DELETE shart emas).
 * Cheklangan parallellikda (bitta kitobda 100-200+ sahifa bo'lishi
 * mumkin) — R2/xotirani bosib qolmaslik uchun. */
async function storeRenderedPages(bookId: string, sahifalar: RenderedPage[]): Promise<number> {
  const BATCH = 4;
  let yozildi = 0;
  for (let i = 0; i < sahifalar.length; i += BATCH) {
    const chunk = sahifalar.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (p) => {
        try {
          const key = await uploadBuffer(Buffer.from(p.jpeg_base64, "base64"), "image/jpeg", {
            prefix: "kitob-sahifalari/",
          });
          await query(
            `INSERT INTO book_pages (book_id, page_physical, image_r2_key, width_px, height_px)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (book_id, page_physical)
             DO UPDATE SET image_r2_key=$3, width_px=$4, height_px=$5`,
            [bookId, p.page_physical, key, p.width, p.height]
          );
          yozildi++;
        } catch (err) {
          console.error(`[books] sahifa ${p.page_physical}ni saqlashda xato (book_id=${bookId}):`, err);
        }
      })
    );
  }
  return yozildi;
}

/** Kitobning barcha sahifasini render qilishni boshlaydi. Idempotent —
 * qayta chaqirilsa eski sahifalarni yangilaydi (o'chirmaydi), shuning
 * uchun jarayon davomida ham eski rasm ko'rsatilib turaveradi. */
booksRouter.post("/:id/pages/render", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });
  if (book.qayta_ishlash_holati !== "tayyor") {
    return res.status(409).json({ xato: "kitob hali qayta ishlanmagan (holati 'tayyor' emas)" });
  }
  if (book.sahifalar_render_holati === "jarayonda") {
    return res.status(202).json({ book_id: book.id, holati: "jarayonda", xabar: "allaqachon jarayonda" });
  }

  let job_id: string;
  try {
    const file_url = await createDownloadUrl(String(book.fayl_yoli), { expiresInSec: 30 * 60 });
    ({ job_id } = await startPageRendering(file_url, book.id));
  } catch (err) {
    const tafsilot = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ xato: "PDF-service'ni ishga tushirib bo'lmadi", tafsilot });
  }

  await query(`UPDATE books SET sahifalar_render_holati='jarayonda' WHERE id=$1`, [book.id]);
  res.status(202).json({ book_id: book.id, job_id, holati: "jarayonda" });

  void (async () => {
    try {
      // Kitob to'liq render qilinishi (150-200 sahifa, base64 JPEG) uzoq
      // vaqt olishi mumkin — timeout ataylab keng qilingan.
      const natija = await waitForPdfJob(job_id, { intervalMs: 3000, timeoutMs: 30 * 60 * 1000 });
      if (natija.holati !== "tayyor") {
        console.error(`[books] sahifa-render xatosi (book_id=${book.id}):`, natija.xato_matni);
        await query(`UPDATE books SET sahifalar_render_holati='xato' WHERE id=$1`, [book.id]);
        return;
      }
      const sahifalar = ((natija.natija as any)?.sahifalar ?? []) as RenderedPage[];
      const soni = await storeRenderedPages(book.id, sahifalar);
      await query(
        `UPDATE books SET sahifalar_render_holati='tayyor', sahifalar_soni=$2 WHERE id=$1`,
        [book.id, (natija.natija as any)?.sahifalar_soni ?? soni]
      );
      console.log(`[books] book_pages yozildi: ${soni} ta (book_id=${book.id})`);
    } catch (err) {
      console.error(`[books] sahifalarni render qilishda xato (book_id=${book.id}):`, err);
      await query(`UPDATE books SET sahifalar_render_holati='xato' WHERE id=$1`, [book.id]).catch(() => {});
    }
  })();
});

/** Renderlash holati — Mini App shu bilan pollab, progress-bar ko'rsatadi. */
booksRouter.get("/:id/pages/status", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });

  const [{ tayyor_soni }] = await query<{ tayyor_soni: number }>(
    `SELECT count(*)::int AS tayyor_soni FROM book_pages WHERE book_id=$1`,
    [book.id]
  );

  res.json({
    holati: book.sahifalar_render_holati,
    sahifalar_soni: book.sahifalar_soni,
    tayyor_soni,
  });
});

/** Sahifalar ro'yxati — lazy-load uchun oraliq bilan (`from`/`to`). Bitta
 * so'rovda ko'p sahifa (masalan butun kitob) so'ralishini oldini olish
 * uchun oraliq 30 sahifagacha cheklangan — Mini App faqat ko'rinayotgan/
 * yaqin sahifalarni so'raydi. URL'lar 2 soatga amal qiladi. */
const MAX_PAGE_RANGE = 30;
booksRouter.get("/:id/pages", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const book = await getOwnedBook(req.params.id, userId);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });

  const from = Math.max(1, Number(req.query.from ?? 1));
  const to = Math.min(from + MAX_PAGE_RANGE - 1, Number(req.query.to ?? from + MAX_PAGE_RANGE - 1));

  const rows = await query<{ page_physical: number; image_r2_key: string; width_px: number; height_px: number }>(
    `SELECT page_physical, image_r2_key, width_px, height_px
     FROM book_pages WHERE book_id=$1 AND page_physical BETWEEN $2 AND $3
     ORDER BY page_physical`,
    [book.id, from, to]
  );

  const sahifalar = await Promise.all(
    rows.map(async (r) => ({
      page_physical: r.page_physical,
      width: r.width_px,
      height: r.height_px,
      url: await createDownloadUrl(r.image_r2_key, { expiresInSec: 2 * 60 * 60 }),
    }))
  );

  res.json({ sahifalar_soni: book.sahifalar_soni, sahifalar });
});
