/**
 * exercises.ts — Fenixning "brain loop"i.
 *
 *   user action → Claude (mashq generatsiya) → foydalanuvchi javobi →
 *   Claude (tekshirish) → error_bank + learner_profile yangilanadi →
 *   ("Nega?" so'ralsa) Claude (tushuntirish, suhbat tarixi bilan)
 *
 * v11: `book_exercises` (darslikdan ajratilgan haqiqiy mashqlar) endi
 * shu oqimga ulangan — `book_exercise_id` orqali. Bob ichida navbat
 * avval haqiqiy kitob mashqlarini beradi, ular tugagach AI o'zi
 * generatsiya qiladi (`pickNextExercisePayload`).
 *
 * v12: `lesson_sessions` — haqiqiy dars tuzilishi (4 bosqich):
 *   isinish → tushuntirish → amaliyot ⇄ qayta_tushuntirish → yakun.
 *   `/chapters/:id/lesson/start` — sessiya ochadi + isinish/tushuntirish.
 *   `/lesson/:sessionId/exercises/next` — navbatdagi mashq (yoki, agar
 *   bir xil mavzuda ketma-ket 2 xato bo'lsa, to'xtash-va-tushuntirish
 *   kartasi).
 *   `/lesson/:sessionId/finish` — yakuniy xulosa.
 *
 * Har bir bosqich `contextBuilder`dan o'quvchi holatini oladi — shu
 * bilan Fenix bir xil xatoni cheksiz qayta ko'rsatib o'tirmaydi va
 * o'quvchi darajasiga moslashadi (loyiha hujjati, 7-bo'lim).
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { callClaude } from "../services/claude.js";
import { buildLearnerContext, renderLearnerContext, pickInterleavedCandidate } from "../services/contextBuilder.js";
import { recordExerciseOutcome } from "../services/learnerProfile.js";
import { createDownloadUrl } from "../services/r2.js";

export const exercisesRouter = Router();
exercisesRouter.use(telegramAuth);

async function currentUserId(telegramId: number): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [telegramId]
  );
  return row?.id ?? null;
}

interface ChapterRow {
  id: string;
  nomi: string | null;
  matn: string | null;
  course_id: string;
  til_nomi: string;
}

/** Bob ma'lumotini + tegishli kursni bitta so'rovda oladi, egalikni tekshirish uchun. */
async function getOwnedChapter(chapterId: string, userId: string): Promise<ChapterRow | null> {
  const [row] = await query<ChapterRow>(
    `SELECT ch.id, ch.nomi, ch.matn, c.id AS course_id, c.til_nomi
     FROM chapters ch
     JOIN books b ON b.id = ch.book_id
     JOIN courses c ON c.id = b.course_id
     WHERE ch.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL AND b.deleted_at IS NULL`,
    [chapterId, userId]
  );
  return row ?? null;
}

interface ExerciseRow {
  id: string;
  user_id: string;
  chapter_id: string | null;
  turi: string;
  savol: string;
  togri_javob: string | null;
  mavzu: string | null;
  natija: string | null;
  javob_boshlanish_at: string | null;
  course_id: string;
  lesson_session_id: string | null;
}

/** Mashqni + egasi kursini bitta so'rovda oladi, egalikni tekshirish uchun. */
async function getOwnedExercise(exerciseId: string, userId: string): Promise<ExerciseRow | null> {
  const [row] = await query<ExerciseRow>(
    `SELECT e.id, e.user_id, e.chapter_id, e.turi, e.savol, e.togri_javob, e.mavzu,
            e.natija, e.javob_boshlanish_at, e.lesson_session_id, c.id AS course_id
     FROM exercises e
     LEFT JOIN chapters ch ON ch.id = e.chapter_id
     LEFT JOIN books b ON b.id = ch.book_id
     LEFT JOIN courses c ON c.id = b.course_id
     WHERE e.id=$1 AND e.user_id=$2`,
    [exerciseId, userId]
  );
  return row ?? null;
}

function safeJsonParse(text: string): any {
  const cleaned = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

// ============================================================
// 1) Mashq generatsiya — umumiy yadro (to'g'ridan-to'g'ri chaqiruv
//    HAM, lesson-session ichidan chaqiruv HAM shu funksiyadan
//    foydalanadi — kod ikki joyda takrorlanmasin).
// ============================================================

const TURLAR = [
  "tanlov",
  "boshliq_toldirish",
  "tarjima",
  "gap_tuzish",
  "writing",
  "error_correction",
  "teach_back",
] as const;
type ExerciseTuri = (typeof TURLAR)[number];

interface GeneratedExercise {
  id: string;
  turi: ExerciseTuri;
  savol: string;
  mavzu: string;
  interleaved: boolean;
  manba: "ai" | "kitob";
  kitob_raqami?: string;   // masalan "1a" — darslikdagi haqiqiy mashq raqami (faqat manba="kitob")
  rasm_url?: string;       // vaqtinchalik R2 GET URL (faqat manba="kitob" va rasm mavjud bo'lsa)
}

/** AI'ning o'zi mashq tuzadigan asosiy yo'l (interleaving bilan). */
async function generateAiExercise(
  chapter: ChapterRow,
  userId: string,
  turiIn: ExerciseTuri | undefined,
  opts: { sessionId?: string | null; darsBosqichi?: string | null } = {}
): Promise<GeneratedExercise> {
  if (!chapter.matn) {
    throw Object.assign(new Error("bu bobda matn yo'q"), { status: 422 });
  }
  const ctx = await buildLearnerContext(userId, chapter.course_id);
  const turi = turiIn ?? "boshliq_toldirish";

  const interleavedNomzod = await pickInterleavedCandidate(userId, chapter.course_id, chapter.nomi ?? null);
  const interleavedBolsinmi = interleavedNomzod !== null && Math.random() < 0.25;

  const interleavingVazifasi = interleavedBolsinmi
    ? interleavedNomzod!.turi === "mavzu"
      ? `VAZIFA: bu safar YANGI bob mavzusi EMAS — o'quvchining ilgari
qiynalgan "${interleavedNomzod!.mavzu}" mavzusini TAKRORLASH uchun
"${turi}" turidagi BITTA mashq tuz (interleaving — aralashtirilgan
takrorlash). Til va daraja bob matniga mos bo'lsin, lekin savolning
o'zi shu eski mavzuga qaratilgan bo'lsin.`
      : `VAZIFA: bu safar YANGI bob mavzusi EMAS — ilgari qo'shilgan
"${interleavedNomzod!.soz}" (${interleavedNomzod!.tarjima}) so'zini
takrorlash/mustahkamlash uchun "${turi}" turidagi BITTA mashq tuz
(interleaving). Bu so'z gap ichida tabiiy ishlatilishi kerak.`
    : `VAZIFA: shu bob matni asosida, o'quvchining zaif tomonlari va joriy
darajasiga mos "${turi}" turidagi BITTA mashq tuzib ber. Mashq bob
matnidagi haqiqiy tilga oid hodisaga (grammatika/lug'at) tayanishi
kerak — o'ylab topilgan/bobga aloqasi yo'q savol bermang.`;

  const prompt = `${renderLearnerContext(ctx)}

DARSLIK BOBI ("${chapter.nomi ?? "nomsiz"}", ${chapter.til_nomi} tili) matnidan
qism (agar uzun bo'lsa qisqartirilgan):
---
${chapter.matn.slice(0, 4000)}
---

${interleavingVazifasi}
${
    turi === "teach_back"
      ? `\n(Bu "teach_back" turi — savolni "...qoidasini/tushunchasini\no'zingizning so'zlaringiz bilan tushuntirib bering, misol bilan"\nshaklida shakllantir. "togri_javob" albatta null bo'lsin — bu ochiq\ntur.)`
      : ""
  }

Shuningdek, bob matnidan mavzuga oid 1-3 ta yangi so'z/ibora tanla
(o'quvchi darajasiga mos, juda oddiy yoki juda murakkab bo'lmasin) —
bular so'z boyligi takrorlash navbatiga qo'shiladi.${
    interleavedBolsinmi ? " (Bu safar interleaving mashqi bo'lgani uchun, agar mos so'z topilmasa bo'sh massiv qaytarsang ham bo'ladi.)" : ""
  }

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "mavzu": "<qisqa grammatik/leksik mavzu nomi, masalan 'Perfekt' yoki 'Dativ prepozitsiyalari'>",
  "savol": "<o'quvchiga ko'rsatiladigan savol/topshiriq matni>",
  "togri_javob": "<aniq to'g'ri javob, agar mashq turi ochiq (writing/teach_back) bo'lsa null qo'y>",
  "yangi_sozlar": [
    { "soz": "<asl tildagi so'z>", "tarjima": "<o'zbekcha tarjimasi>", "soz_turi": "<masalan Nomen/Verb/Adjektiv, aniq bo'lmasa null>" }
  ]
}`;

  const text = await callClaude({
    model: "claude-sonnet-4-6",
    maqsad: "mashq_generatsiya",
    prompt,
    maxTokens: 800,
    userId,
  });
  const parsedExercise = safeJsonParse(text) as {
    mavzu: string;
    savol: string;
    togri_javob: string | null;
    yangi_sozlar?: { soz: string; tarjima: string; soz_turi: string | null }[];
  };

  const [exercise] = await query<{ id: string }>(
    `INSERT INTO exercises
       (user_id, chapter_id, turi, savol, togri_javob, mavzu, javob_boshlanish_at,
        interleaved_mi, lesson_session_id, dars_bosqichi)
     VALUES ($1,$2,$3,$4,$5,$6, now(), $7,$8,$9)
     RETURNING id`,
    [
      userId,
      chapter.id,
      turi,
      parsedExercise.savol,
      parsedExercise.togri_javob ?? null,
      parsedExercise.mavzu,
      interleavedBolsinmi,
      opts.sessionId ?? null,
      opts.darsBosqichi ?? null,
    ]
  );

  if (parsedExercise.yangi_sozlar?.length) {
    try {
      for (const s of parsedExercise.yangi_sozlar.slice(0, 3)) {
        if (!s.soz || !s.tarjima) continue;
        await query(
          `INSERT INTO words (user_id, course_id, chapter_id, soz, tarjima, soz_turi)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (user_id, course_id, soz) DO NOTHING`,
          [userId, chapter.course_id, chapter.id, s.soz, s.tarjima, s.soz_turi ?? null]
        );
      }
    } catch (sozXato) {
      console.error("[exercises] yangi so'zlarni saqlashda xato:", sozXato);
    }
  }

  return {
    id: exercise.id,
    turi,
    savol: parsedExercise.savol,
    mavzu: parsedExercise.mavzu,
    interleaved: interleavedBolsinmi,
    manba: "ai",
  };
}

interface BookExerciseRow {
  id: string;
  exercise_number: string;
  xom_matn: string;
  page_physical: number;
  image_r2_key: string | null;
}

/** Bobning hali "boshlanmagan" (exercises'ga ko'chirilmagan), inson
 * shubha bildirmagan (needs_review=false) navbatdagi haqiqiy kitob
 * mashqini oladi — sahifa/tartib bo'yicha. Topilmasa null. */
async function getNextUnusedBookExercise(chapterId: string): Promise<BookExerciseRow | null> {
  const [row] = await query<BookExerciseRow>(
    `SELECT be.id, be.exercise_number, be.xom_matn, be.page_physical, be.image_r2_key
     FROM book_exercises be
     LEFT JOIN exercises e ON e.book_exercise_id = be.id
     WHERE be.chapter_id = $1 AND be.needs_review = false AND e.id IS NULL
     ORDER BY be.page_physical, be.reading_order_position
     LIMIT 1`,
    [chapterId]
  );
  return row ?? null;
}

/** Haqiqiy kitob mashqini (xom OCR matni) Claude yordamida formatlab,
 * `exercises`ga bitta yozuv sifatida kiritadi — shu bilan mavjud
 * javob-tekshirish/"Nega?" logikasi hech narsa o'zgarmasdan ishlaydi. */
async function startBookExercise(
  bookExercise: BookExerciseRow,
  chapter: ChapterRow,
  userId: string,
  opts: { sessionId?: string | null; darsBosqichi?: string | null } = {}
): Promise<GeneratedExercise> {
  const ctx = await buildLearnerContext(userId, chapter.course_id);

  const prompt = `${renderLearnerContext(ctx)}

Bu — darslikning ${bookExercise.page_physical}-sahifasidan OCR orqali
ajratib olingan HAQIQIY mashq (raqami: ${bookExercise.exercise_number}),
xom matn quyidagicha (OCR chalkashligi bo'lishi mumkin):
---
${bookExercise.xom_matn.slice(0, 2000)}
---

VAZIFA: shu xom matnni o'quvchiga ko'rsatsa bo'ladigan tarzda
formatla — OCR shovqinini tozala, agar mashq turi aniq bo'lsa
(${TURLAR.join("/")}) shulardan eng mosini tanla (aniq bo'lmasa
"boshliq_toldirish"), va iloji bo'lsa to'g'ri javobni chiqar. Mazmunni
O'ZGARTIRMA — faqat original mashqni tushunarli ko'rinishga kelting.

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "turi": "<${TURLAR.join("|")}>",
  "mavzu": "<qisqa grammatik/leksik mavzu nomi>",
  "savol": "<o'quvchiga ko'rsatiladigan, tozalangan savol/topshiriq matni>",
  "togri_javob": "<aniqlash mumkin bo'lsa to'g'ri javob, bo'lmasa null>"
}`;

  const text = await callClaude({
    model: "claude-sonnet-4-6",
    maqsad: "kitob_mashqini_formatlash",
    prompt,
    maxTokens: 700,
    userId,
  });
  const parsed = safeJsonParse(text) as {
    turi: string;
    mavzu: string;
    savol: string;
    togri_javob: string | null;
  };
  const turi: ExerciseTuri = (TURLAR as readonly string[]).includes(parsed.turi)
    ? (parsed.turi as ExerciseTuri)
    : "boshliq_toldirish";

  const [exercise] = await query<{ id: string }>(
    `INSERT INTO exercises
       (user_id, chapter_id, turi, savol, togri_javob, mavzu, javob_boshlanish_at,
        book_exercise_id, lesson_session_id, dars_bosqichi)
     VALUES ($1,$2,$3,$4,$5,$6, now(), $7,$8,$9)
     RETURNING id`,
    [
      userId,
      chapter.id,
      turi,
      parsed.savol,
      parsed.togri_javob ?? null,
      parsed.mavzu,
      bookExercise.id,
      opts.sessionId ?? null,
      opts.darsBosqichi ?? null,
    ]
  );

  let rasm_url: string | undefined;
  if (bookExercise.image_r2_key) {
    try {
      rasm_url = await createDownloadUrl(bookExercise.image_r2_key, { expiresInSec: 60 * 60 });
    } catch (err) {
      // Rasm URL'ini generatsiya qilib bo'lmasa ham mashqning o'zi ishlashda davom etadi
      console.error(`[exercises] mashq rasmi uchun URL yaratib bo'lmadi (book_exercise=${bookExercise.id}):`, err);
    }
  }

  return {
    id: exercise.id,
    turi,
    savol: parsed.savol,
    mavzu: parsed.mavzu,
    interleaved: false,
    manba: "kitob",
    kitob_raqami: bookExercise.exercise_number,
    rasm_url,
  };
}

/** Navbatdagi mashqni tanlaydi: avval bobning ishlatilmagan haqiqiy
 * kitob mashqi, topilmasa AI generatsiyasi. */
async function pickNextExercisePayload(
  chapter: ChapterRow,
  userId: string,
  opts: { sessionId?: string | null; darsBosqichi?: string | null } = {}
): Promise<GeneratedExercise> {
  const bookExercise = await getNextUnusedBookExercise(chapter.id);
  if (bookExercise) {
    return startBookExercise(bookExercise, chapter, userId, opts);
  }
  return generateAiExercise(chapter, userId, undefined, opts);
}

const GenerateSchema = z.object({
  turi: z.enum(TURLAR).optional(), // berilmasa Fenix o'zi tanlaydi
});

/** To'g'ridan-to'g'ri generatsiya (sessiyasiz) — eski xatti-harakat
 * saqlanadi (masalan qo'lda bitta mashq turi so'ralsa). */
exercisesRouter.post("/chapters/:chapterId/exercises", async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const chapter = await getOwnedChapter(req.params.chapterId, userId);
  if (!chapter) return res.status(404).json({ xato: "bob topilmadi" });

  try {
    const result = await generateAiExercise(chapter, userId, parsed.data.turi);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err?.status ?? 502).json({
      xato: err?.status ? err.message : "mashq generatsiya qilinmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

// ============================================================
// 1.5) Dars sessiyasi (v12) — isinish → tushuntirish → amaliyot ⇄
//      qayta_tushuntirish → yakun
// ============================================================

interface LessonSessionRow {
  id: string;
  user_id: string;
  chapter_id: string;
  holat: "isinish" | "tushuntirish" | "amaliyot" | "qayta_tushuntirish" | "yakunlandi";
  joriy_mavzu: string | null;
  ketma_ket_notogri_soni: number;
  qayta_tushuntirilgan_mavzular: string[];
  mashqlar_soni: number;
  tushuntirish_matni: string | null;
}

async function getOwnedSession(sessionId: string, userId: string): Promise<LessonSessionRow | null> {
  const [row] = await query<LessonSessionRow>(
    `SELECT id, user_id, chapter_id, holat, joriy_mavzu, ketma_ket_notogri_soni,
            qayta_tushuntirilgan_mavzular, mashqlar_soni, tushuntirish_matni
     FROM lesson_sessions WHERE id=$1 AND user_id=$2`,
    [sessionId, userId]
  );
  return row ?? null;
}

/** Bobda dars boshlaydi: agar allaqachon faol (tugallanmagan) sessiya
 * bo'lsa — o'shani qaytaradi (davom ettirish), aks holda yangisini
 * ochadi va isinish+mini-tushuntirishni Claude'dan so'raydi. */
exercisesRouter.post("/chapters/:chapterId/lesson/start", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const chapter = await getOwnedChapter(req.params.chapterId, userId);
  if (!chapter) return res.status(404).json({ xato: "bob topilmadi" });

  const [faol] = await query<LessonSessionRow>(
    `SELECT id, user_id, chapter_id, holat, joriy_mavzu, ketma_ket_notogri_soni,
            qayta_tushuntirilgan_mavzular, mashqlar_soni, tushuntirish_matni
     FROM lesson_sessions WHERE user_id=$1 AND chapter_id=$2 AND tugagan_at IS NULL`,
    [userId, chapter.id]
  );
  if (faol) {
    return res.json({
      session_id: faol.id,
      holat: faol.holat,
      tushuntirish_matni: faol.tushuntirish_matni,
      mashqlar_soni: faol.mashqlar_soni,
      davom_etilmoqda: true,
    });
  }

  // Isinish uchun ma'lumot: takrorlash navbatidagi so'zlar soni +
  // eng ko'p takrorlangan xato (agar bo'lsa).
  const [duewords] = await query<{ soni: number }>(
    `SELECT count(*)::int AS soni FROM words
     WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL AND next_review_at <= now()`,
    [userId, chapter.course_id]
  );
  const [engKopXato] = await query<{ xato_matni: string; takrorlanish_soni: number }>(
    `SELECT xato_matni, takrorlanish_soni FROM error_bank
     WHERE user_id=$1 ORDER BY takrorlanish_soni DESC, created_at DESC LIMIT 1`,
    [userId]
  );

  const ctx = await buildLearnerContext(userId, chapter.course_id);
  const prompt = `${renderLearnerContext(ctx)}

DARSLIK BOBI: "${chapter.nomi ?? "nomsiz"}" (${chapter.til_nomi} tili).
Bob matnidan qism:
---
${(chapter.matn ?? "").slice(0, 3000)}
---

ISINISH KONTEKSTI: takrorlash navbatida ${duewords?.soni ?? 0} ta so'z bor.
${
    engKopXato
      ? `Eng ko'p takrorlangan xato: "${engKopXato.xato_matni}" (${engKopXato.takrorlanish_soni} marta).`
      : "Hali qayd etilgan takroriy xato yo'q."
  }

VAZIFA: haqiqiy ustoz kabi darsni boshla — DARS BOSHLASH matnini yoz,
ikki qismdan iborat:
1. **Qisqa isinish** (1-2 gap): agar takrorlash navbatida so'z bo'lsa
   yoki takroriy xato bo'lsa, shuni eslatib o'tib, tayyorlab qo'y
   (savol shart emas — shunchaki "eslaymizmi" ohangida).
2. **Mini-tushuntirish** (3-5 gap, 1 ta aniq misol bilan): shu bobning
   ASOSIY qoidasi/mavzusini, mashqlardan OLDIN, tushuntirib ber.
   Oxirida bitta yengil tekshiruv-savoli bilan yakunla (masalan
   "Tayyor bo'lsangiz, mashqni boshlaymiz").

Faqat matnni yoz (Markdown **qalin** ishlatsa bo'ladi), JSON EMAS,
boshqa hech narsa qo'shma.`;

  let tushuntirishMatni: string;
  try {
    tushuntirishMatni = (
      await callClaude({
        model: "claude-sonnet-4-6",
        maqsad: "dars_kirish",
        prompt,
        maxTokens: 500,
        userId,
      })
    ).trim();
  } catch (err) {
    return res.status(502).json({
      xato: "dars boshlanmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }

  const [session] = await query<{ id: string }>(
    `INSERT INTO lesson_sessions (user_id, chapter_id, holat, tushuntirish_matni)
     VALUES ($1,$2,'amaliyot',$3)
     RETURNING id`,
    [userId, chapter.id, tushuntirishMatni]
  );

  res.status(201).json({
    session_id: session.id,
    holat: "amaliyot",
    tushuntirish_matni: tushuntirishMatni,
    mashqlar_soni: 0,
    davom_etilmoqda: false,
  });
});

const YAKUNLASH_MASHQ_SONI = 6; // shuncha mashqdan keyin frontend yakunlashni taklif qiladi

/** Navbatdagi mashqni (yoki to'xtash-va-tushuntirish kartasini) qaytaradi. */
exercisesRouter.post("/lesson/:sessionId/exercises/next", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const session = await getOwnedSession(req.params.sessionId, userId);
  if (!session) return res.status(404).json({ xato: "dars sessiyasi topilmadi" });
  if (session.holat === "yakunlandi") {
    return res.status(409).json({ xato: "bu dars sessiyasi allaqachon yakunlangan" });
  }

  const chapter = await getOwnedChapter(session.chapter_id, userId);
  if (!chapter) return res.status(404).json({ xato: "bob topilmadi" });

  // Ketma-ket 2 marta bir xil mavzuda xato — to'xtash-va-tushuntirish,
  // lekin shu mavzu uchun sessiya davomida faqat BIR MARTA (spam qilmaslik uchun).
  const qaytaKerakmi =
    session.ketma_ket_notogri_soni >= 2 &&
    !!session.joriy_mavzu &&
    !session.qayta_tushuntirilgan_mavzular.includes(session.joriy_mavzu);

  if (qaytaKerakmi) {
    const ctx = await buildLearnerContext(userId, chapter.course_id);
    const prompt = `${renderLearnerContext(ctx)}

O'quvchi shu darsda "${session.joriy_mavzu}" mavzusida ketma-ket 2
marta xato qildi. Haqiqiy ustoz kabi to'xta va shu mavzuni QAYTA,
boshqacha (avvalgidan soddaroq/boshqa burchakdan) tushuntir — 3-5 gap,
kamida 1 ta yangi/aniqroq misol bilan. Ohang qattiqqo'l lekin
kamsitmaydigan bo'lsin (ustoz qattiqqolligi: ${ctx.ustoz_qattiqqolligi}/5).
Oxirida o'quvchini davom ettirishga taklif qil.

Faqat matnni yoz, JSON emas, boshqa hech narsa qo'shma.`;

    let matn: string;
    try {
      matn = (
        await callClaude({ model: "claude-sonnet-4-6", maqsad: "qayta_tushuntirish", prompt, maxTokens: 450, userId })
      ).trim();
    } catch (err) {
      return res.status(502).json({
        xato: "qayta tushuntirish tayyorlanmadi",
        tafsilot: err instanceof Error ? err.message : String(err),
      });
    }

    await query(
      `UPDATE lesson_sessions
       SET holat='qayta_tushuntirish',
           qayta_tushuntirilgan_mavzular = array_append(qayta_tushuntirilgan_mavzular, $2),
           ketma_ket_notogri_soni = 0,
           updated_at = now()
       WHERE id=$1`,
      [session.id, session.joriy_mavzu]
    );

    return res.json({ tur: "qayta_tushuntirish", mavzu: session.joriy_mavzu, matn });
  }

  // Oddiy holat: navbatdagi mashq (kitobdan yoki AI'dan).
  if (session.holat !== "amaliyot") {
    await query(`UPDATE lesson_sessions SET holat='amaliyot', updated_at=now() WHERE id=$1`, [session.id]);
  }

  try {
    const exercise = await pickNextExercisePayload(chapter, userId, {
      sessionId: session.id,
      darsBosqichi: "amaliyot",
    });
    await query(`UPDATE lesson_sessions SET mashqlar_soni = mashqlar_soni + 1, updated_at = now() WHERE id=$1`, [
      session.id,
    ]);
    res.status(201).json({
      tur: "mashq",
      exercise,
      mashqlar_soni: session.mashqlar_soni + 1,
      yakunlashni_taklif_qil: session.mashqlar_soni + 1 >= YAKUNLASH_MASHQ_SONI,
    });
  } catch (err: any) {
    res.status(err?.status ?? 502).json({
      xato: err?.status ? err.message : "mashq tayyorlanmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Darsni yakunlaydi — qisqa xulosa (Claude) + progress. Sessiya
 * "yakunlandi" holatiga o'tadi, boshqa mashq berilmaydi (yangi
 * `/lesson/start` chaqirilsa yangi sessiya ochiladi). */
exercisesRouter.post("/lesson/:sessionId/finish", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const session = await getOwnedSession(req.params.sessionId, userId);
  if (!session) return res.status(404).json({ xato: "dars sessiyasi topilmadi" });
  if (session.holat === "yakunlandi") {
    return res.status(409).json({ xato: "bu dars sessiyasi allaqachon yakunlangan" });
  }

  const chapter = await getOwnedChapter(session.chapter_id, userId);
  if (!chapter) return res.status(404).json({ xato: "bob topilmadi" });

  const natijalar = await query<{ natija: string; mavzu: string | null }>(
    `SELECT natija, mavzu FROM exercises WHERE lesson_session_id=$1 AND natija IS NOT NULL`,
    [session.id]
  );
  const togriSoni = natijalar.filter((r) => r.natija === "togri").length;
  const mavzular = [...new Set(natijalar.map((r) => r.mavzu).filter(Boolean))];

  const ctx = await buildLearnerContext(userId, chapter.course_id);
  const prompt = `${renderLearnerContext(ctx)}

Dars tugadi: "${chapter.nomi ?? "nomsiz"}" bobida ${natijalar.length} ta
mashq bajarildi, shundan ${togriSoni} tasi to'g'ri. Mavzular:
${mavzular.length ? mavzular.join(", ") : "aniqlanmagan"}.
${
    session.qayta_tushuntirilgan_mavzular.length
      ? `Qayta tushuntirilgan mavzular (hali mustahkam emas bo'lishi mumkin): ${session.qayta_tushuntirilgan_mavzular.join(", ")}.`
      : ""
  }

VAZIFA: 60 soniyalik dars xulosasini yoz (3-5 gap): "bugun nima
o'rgandik" + agar hali mustahkam bo'lmagan mavzu bo'lsa shuni aytib
o't. Qisqa, iliq, lekin qattiqqo'l Fenix ohangida. Faqat matnni yoz,
JSON emas.`;

  let xulosa: string;
  try {
    xulosa = (
      await callClaude({ model: "claude-haiku-4-5", maqsad: "dars_yakuni", prompt, maxTokens: 350, userId })
    ).trim();
  } catch (err) {
    return res.status(502).json({
      xato: "xulosa tayyorlanmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }

  await query(
    `UPDATE lesson_sessions
     SET holat='yakunlandi', xulosa_matni=$2, tugagan_at=now(), updated_at=now()
     WHERE id=$1`,
    [session.id, xulosa]
  );

  res.json({
    xulosa_matni: xulosa,
    mashqlar_soni: natijalar.length,
    togri_soni: togriSoni,
    mavzular,
  });
});

// ============================================================
// 2) Javobni tekshirish
// ============================================================

const AnswerSchema = z.object({
  javob: z.string().min(1),
});

exercisesRouter.post("/exercises/:id/answer", async (req, res) => {
  const parsed = AnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });
  if (exercise.natija) {
    return res.status(409).json({ xato: "bu mashq allaqachon baholangan" });
  }

  const ctx = await buildLearnerContext(userId, exercise.course_id);
  const isTeachBack = exercise.turi === "teach_back";

  const baholashVazifasi = isTeachBack
    ? `VAZIFA: bu "teach_back" (o'qitib ber) mashqi — o'quvchi qoidani
o'ziga tushuntirib berdi. Grammatik xatolarga emas, TUSHUNISH
CHUQURLIGIGA baho ber: tushuntirish to'g'rimi, chuqurmi (sirtqi
yodlab olishmi yoki chindan tushunibmi), misol keltirdimi, istisno/
chegara holatlarni bilamimi. Ustoz qattiqqolligiga mos ohangda
(${ctx.ustoz_qattiqqolligi}/5) qisqa fikr-mulohaza yoz.`
    : `VAZIFA: javobni Fenix nomidan baholash. Ustoz qattiqqolligiga mos
ohangda (${ctx.ustoz_qattiqqolligi}/5) qisqa fikr-mulohaza yoz —
xatoni yashirma, lekin kamsitma, aniq nima xato ekanini tushuntir.`;

  const prompt = `${renderLearnerContext(ctx)}

MASHQ (${exercise.turi}): ${exercise.savol}
${exercise.togri_javob ? `KUTILAYOTGAN TO'G'RI JAVOB (yo'l-yo'riq sifatida, so'zma-so'z mos kelishi shart emas): ${exercise.togri_javob}` : "(bu ochiq turdagi mashq — qat'iy bitta to'g'ri javob yo'q, mazmun/grammatikaga qarab baho)"}

O'QUVCHI JAVOBI: ${parsed.data.javob}

${baholashVazifasi}

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "natija": "togri" | "notogri" | "qisman",
  "fenix_fikri": "<o'quvchiga ko'rsatiladigan qisqa fikr-mulohaza, 2-4 gap>",
  "baholash_grammatika": <0.0-1.0>,
  "baholash_tabiiylik": <0.0-1.0>,
  "baholash_lugat_boyligi": <0.0-1.0>
}${
    isTeachBack
      ? `\n\n("baholash_grammatika/tabiiylik/lugat_boyligi" maydonlari bu\nmashq turida mos ravishda "tushuntirish aniqligi", "misol\nkeltirilgani" va "atamalardan to'g'ri foydalanilgani"ni bildiradi\n— shu ma'noda to'ldir.)`
      : ""
  }`;

  let baho: {
    natija: "togri" | "notogri" | "qisman";
    fenix_fikri: string;
    baholash_grammatika: number;
    baholash_tabiiylik: number;
    baholash_lugat_boyligi: number;
  };
  try {
    const text = await callClaude({
      model: "claude-sonnet-4-6",
      maqsad: "tekshirish",
      prompt,
      maxTokens: 700,
      userId,
    });
    baho = safeJsonParse(text);

    const javobTezligiMs = exercise.javob_boshlanish_at
      ? Date.now() - new Date(exercise.javob_boshlanish_at).getTime()
      : null;

    await query(
      `UPDATE exercises
       SET foydalanuvchi_javobi=$2, natija=$3, fenix_fikri=$4,
           baholash_grammatika=$5, baholash_tabiiylik=$6, baholash_lugat_boyligi=$7,
           javob_yuborilgan_at=now(), javob_tezligi_ms=$8
       WHERE id=$1`,
      [
        exercise.id,
        parsed.data.javob,
        baho.natija,
        baho.fenix_fikri,
        baho.baholash_grammatika,
        baho.baholash_tabiiylik,
        baho.baholash_lugat_boyligi,
        javobTezligiMs,
      ]
    );
  } catch (err) {
    res.status(502).json({
      xato: "javobni tekshirib bo'lmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const togrimi = baho.natija === "togri";

  if (!togrimi) {
    try {
      const xatoMatni = `"${exercise.savol}" mashqida: ${parsed.data.javob}`;
      let existing: { id: string; takrorlanish_soni: number } | undefined;
      if (exercise.mavzu) {
        [existing] = await query<{ id: string; takrorlanish_soni: number }>(
          `SELECT eb.id, eb.takrorlanish_soni
           FROM error_bank eb
           LEFT JOIN exercises e ON e.id = eb.exercise_id
           WHERE eb.user_id=$1 AND e.mavzu=$2
           ORDER BY eb.created_at DESC LIMIT 1`,
          [userId, exercise.mavzu]
        );
      }

      const INTERVALLAR_KUN = [1, 3, 7, 14, 30];

      if (existing) {
        const yangiSoni = existing.takrorlanish_soni + 1;
        const intervalKun = INTERVALLAR_KUN[Math.min(yangiSoni - 1, INTERVALLAR_KUN.length - 1)];
        await query(
          `UPDATE error_bank
           SET takrorlanish_soni=$2,
               xato_matni=$3,
               exercise_id=$4,
               qayta_korsatish_at = now() + ($5 || ' days')::interval
           WHERE id=$1`,
          [existing.id, yangiSoni, xatoMatni, exercise.id, intervalKun]
        );
      } else {
        await query(
          `INSERT INTO error_bank (user_id, exercise_id, xato_matni, sabab_taxmini, qayta_korsatish_at)
           VALUES ($1,$2,$3,'aniqlanmagan', now() + interval '1 day')`,
          [userId, exercise.id, xatoMatni]
        );
      }
    } catch (err) {
      console.error("[exercises] error_bank yozishda xato:", err);
    }
  }

  try {
    await recordExerciseOutcome({
      natija: baho.natija,
      userId,
      courseId: exercise.course_id,
      mavzu: exercise.mavzu,
    });
  } catch (err) {
    console.error("[exercises] recordExerciseOutcome xato:", err);
  }

  if (exercise.chapter_id) {
    try {
      const qadam = togrimi ? 8 : baho.natija === "qisman" ? 5 : 2;
      await query(
        `INSERT INTO user_progress (user_id, course_id, chapter_id, foiz_bajarilgan, boshlangan_at, yakunlangan_at)
         VALUES ($1,$2,$3, LEAST(100, $4), now(), NULL)
         ON CONFLICT (user_id, chapter_id) DO UPDATE
         SET foiz_bajarilgan = LEAST(100, user_progress.foiz_bajarilgan + $4),
             yakunlangan_at = CASE
               WHEN user_progress.foiz_bajarilgan + $4 >= 100 AND user_progress.yakunlangan_at IS NULL
               THEN now() ELSE user_progress.yakunlangan_at END,
             updated_at = now()`,
        [userId, exercise.course_id, exercise.chapter_id, qadam]
      );
    } catch (err) {
      console.error("[exercises] user_progress yangilashda xato:", err);
    }
  }

  try {
    await query(
      `UPDATE users SET
         streak_kun = CASE
           WHEN oxirgi_faollik_at IS NULL THEN 1
           WHEN (oxirgi_faollik_at AT TIME ZONE vaqt_zonasi)::date
                = (now() AT TIME ZONE vaqt_zonasi)::date THEN streak_kun
           WHEN (oxirgi_faollik_at AT TIME ZONE vaqt_zonasi)::date
                = ((now() AT TIME ZONE vaqt_zonasi)::date - INTERVAL '1 day') THEN streak_kun + 1
           ELSE 1
         END,
         oxirgi_faollik_at = now(),
         updated_at = now()
       WHERE id=$1`,
      [userId]
    );
  } catch (err) {
    console.error("[exercises] streak_kun yangilashda xato:", err);
  }

  // v12: lesson_session ketma-ket xato hisoblagichini yangilash —
  // real ustoz kabi bir xil mavzuda ikkinchi marta yiqilsa to'xtash
  // uchun signal (/lesson/:id/exercises/next shu counterni tekshiradi).
  if (exercise.lesson_session_id) {
    try {
      if (togrimi) {
        await query(
          `UPDATE lesson_sessions
           SET ketma_ket_notogri_soni = 0, updated_at = now()
           WHERE id = $1`,
          [exercise.lesson_session_id]
        );
      } else {
        await query(
          `UPDATE lesson_sessions
           SET ketma_ket_notogri_soni = ketma_ket_notogri_soni + 1,
               joriy_mavzu = COALESCE($2, joriy_mavzu),
               updated_at = now()
           WHERE id = $1`,
          [exercise.lesson_session_id, exercise.mavzu]
        );
      }
    } catch (err) {
      console.error("[exercises] lesson_session counter yangilashda xato:", err);
    }
  }

  let teachBackKuzatuvSavoli: string | null = null;
  if (isTeachBack) {
    try {
      const kuzatuvPrompt = `Sen Fenix — qattiqqo'l, adolatli AI til-ustozisan.
O'quvchi hozir quyidagi qoidani o'ziga tushuntirib berdi (teach-back):

MASHQ: ${exercise.savol}
O'QUVCHI TUSHUNTIRISHI: ${parsed.data.javob}
SENING BAHOING: ${baho.fenix_fikri}

VAZIFA: tushunish chuqurligini yanada sinash uchun BITTA qisqa
kuzatuv/qarshi-misol savoli tuz (masalan chegara holat, istisno,
yoki "nega aynan shunday" tipidagi savol). Faqat savol matnini yoz,
boshqa hech narsa (JSON emas, oddiy matn, 1-2 gap).`;

      const savol = await callClaude({
        model: "claude-haiku-4-5",
        maqsad: "teach_back_kuzatuv",
        prompt: kuzatuvPrompt,
        maxTokens: 200,
        userId,
      });
      teachBackKuzatuvSavoli = savol.trim();

      await query(
        `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
         VALUES ($1,$2,$3,'fenix')`,
        [exercise.id, userId, teachBackKuzatuvSavoli]
      );
    } catch (kuzatuvXato) {
      console.error("[exercises] teach-back kuzatuv savoli yaratilmadi:", kuzatuvXato);
    }
  }

  res.json({
    natija: baho.natija,
    fenix_fikri: baho.fenix_fikri,
    togri_javob: exercise.togri_javob,
    baholash: {
      grammatika: baho.baholash_grammatika,
      tabiiylik: baho.baholash_tabiiylik,
      lugat_boyligi: baho.baholash_lugat_boyligi,
    },
    teach_back_kuzatuv_savoli: teachBackKuzatuvSavoli,
  });
});

// ============================================================
// 3) "Nega?" mini-suhbat (exercise_discussions)
// ============================================================

const DiscussSchema = z.object({
  xabar: z.string().min(1),
});

exercisesRouter.post("/exercises/:id/discuss", async (req, res) => {
  const parsed = DiscussSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });

  await query(
    `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
     VALUES ($1,$2,$3,'user')`,
    [exercise.id, userId, parsed.data.xabar]
  );

  const tarix = await query<{ xabar: string; kim_yozgan: string }>(
    `SELECT xabar, kim_yozgan FROM exercise_discussions
     WHERE exercise_id=$1 ORDER BY created_at ASC LIMIT 20`,
    [exercise.id]
  );

  const suhbatMatni = tarix
    .map((m) => `${m.kim_yozgan === "user" ? "O'quvchi" : "Fenix"}: ${m.xabar}`)
    .join("\n");

  const prompt = `Sen Fenix — qattiqqo'l, adolatli, adaptiv AI til-ustozisan.
Quyidagi mashq bo'yicha o'quvchi bilan "Nega?" mini-suhbatidasan —
u nega xato/to'g'ri ekanini chuqurroq tushunmoqchi.

MASHQ: ${exercise.savol}
${exercise.togri_javob ? `TO'G'RI JAVOB: ${exercise.togri_javob}` : ""}
${exercise.mavzu ? `MAVZU: ${exercise.mavzu}` : ""}

SUHBAT TARIXI:
${suhbatMatni}

Fenix nomidan keyingi javobni yoz — qisqa (3-6 gap), aniq, sodda
tushuntirish bilan (kerak bo'lsa misol keltir). Faqat javob matnini
yoz, boshqa hech narsa (JSON emas, oddiy matn).`;

  try {
    const javob = await callClaude({
      model: "claude-haiku-4-5",
      maqsad: "nega_suhbat",
      prompt,
      maxTokens: 400,
      userId,
    });

    await query(
      `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
       VALUES ($1,$2,$3,'fenix')`,
      [exercise.id, userId, javob.trim()]
    );

    res.status(201).json({ xabar: javob.trim() });
  } catch (err) {
    res.status(502).json({
      xato: "Fenix javob bera olmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

// ============================================================
// 4) Mashqni + suhbat tarixini o'qish (sahifa qayta ochilganda)
// ============================================================

exercisesRouter.get("/exercises/:id", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });

  const tarix = await query(
    `SELECT xabar, kim_yozgan, created_at FROM exercise_discussions
     WHERE exercise_id=$1 ORDER BY created_at ASC`,
    [exercise.id]
  );

  res.json({ ...exercise, suhbat: tarix });
});
