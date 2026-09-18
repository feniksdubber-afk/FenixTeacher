/**
 * books.ts — kitob ro'yxatga olish va PDF-service bilan qayta ishlash
 * oqimi. Fayl R2'da yotadi (`upload.ts` orqali presign qilinib
 * yuklangan) — bu yerga faqat `file_key` keladi, u yerdan PDF-service
 * uchun vaqtinchalik presigned GET URL generatsiya qilinadi.
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { startPdfProcessing, waitForPdfJob } from "../services/pdfService.js";
import { createDownloadUrl } from "../services/r2.js";

export const booksRouter = Router();
booksRouter.use(telegramAuth);

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
 * 3) PDF-service'ga /process chaqiradi, natijani kutadi
 * 4) chapters jadvaliga yozadi
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

  const [book] = await query<{ id: string }>(
    `INSERT INTO books (course_id, nomi, turi, fayl_yoli, qayta_ishlash_holati)
     VALUES ($1,$2,$3,$4,'jarayonda') RETURNING id`,
    [course_id, nomi, turi, file_key]
  );

  try {
    const file_url = await createDownloadUrl(file_key, { expiresInSec: 30 * 60 });
    const { job_id } = await startPdfProcessing(book.id, file_url, til_kodi);
    const natija = await waitForPdfJob(job_id, { timeoutMs: 10 * 60 * 1000 });

    if (natija.holati !== "tayyor") {
      await query(
        `UPDATE books SET qayta_ishlash_holati='xato', qayta_ishlash_xatosi=$2 WHERE id=$1`,
        [book.id, String(natija.xato_matni ?? "noma'lum xato")]
      );
      return res.status(502).json({ xato: "PDF qayta ishlash muvaffaqiyatsiz", natija });
    }

    const boblar = (natija.natija as any)?.boblar ?? [];
    for (const [i, bob] of boblar.entries()) {
      await query(
        `INSERT INTO chapters (book_id, nomi, matn, sahifa_boshi, sahifa_oxiri, tartib_raqami, bounding_boxes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          book.id,
          `${bob.unit_nomi} — ${bob.turi}${bob.nomi ? ": " + bob.nomi : ""}`,
          bob.matn,
          bob.sahifa_boshi,
          bob.sahifa_oxiri,
          i + 1,
          JSON.stringify(bob.bounding_boxes ?? []),
        ]
      );
    }

    await query(`UPDATE books SET qayta_ishlash_holati='tayyor' WHERE id=$1`, [book.id]);

    res.status(201).json({ book_id: book.id, boblar_soni: boblar.length });
  } catch (err) {
    const xato_matni = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE books SET qayta_ishlash_holati='xato', qayta_ishlash_xatosi=$2 WHERE id=$1`,
      [book.id, xato_matni]
    );
    res.status(500).json({ xato: xato_matni });
  }
});

booksRouter.get("/:id", async (req, res) => {
  const [book] = await query(`SELECT * FROM books WHERE id=$1`, [req.params.id]);
  if (!book) return res.status(404).json({ xato: "kitob topilmadi" });
  res.json(book);
});

/** Kitobning boblari — Mini App'da o'quvchi qaysi bobda mashq
 * qilishni tanlashi uchun (matn o'zi bu yerda qaytarilmaydi, faqat
 * ro'yxat — matn hajmi katta bo'lishi mumkin). */
booksRouter.get("/:id/chapters", async (req, res) => {
  const chapters = await query(
    `SELECT id, nomi, tartib_raqami, sahifa_boshi, sahifa_oxiri
     FROM chapters WHERE book_id=$1 ORDER BY tartib_raqami`,
    [req.params.id]
  );
  res.json(chapters);
});
