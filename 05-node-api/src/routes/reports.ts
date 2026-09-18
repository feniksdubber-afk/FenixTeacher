/**
 * reports.ts — Haftalik "shartnoma"/hisobot (loyiha hujjati, X-bo'lim):
 * har hafta boshida o'lchanadigan majburiyat tuziladi, hafta oxirida
 * Fenix (Sonnet) shu haftaning natijasini xulosalab, keyingi haftaga
 * yangi majburiyat taklif qiladi.
 *
 * Bosqich 1'da alohida cron-infratuzilma yo'q — generatsiya
 * `POST /courses/:id/weekly-report/generate` orqali qo'lda yoki
 * tashqi cron (masalan Railway scheduled job) chaqiruvi bilan
 * ishga tushiriladi. Idempotent: bir haftada bir marta chaqirilsa
 * ham, 10 marta chaqirilsa ham (ON CONFLICT DO UPDATE) natija bitta
 * qatorga yoziladi.
 */
import { Router } from "express";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { callClaude } from "../services/claude.js";

export const reportsRouter = Router();
reportsRouter.use(telegramAuth);

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

function safeJsonParse(text: string): any {
  const cleaned = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

/** Berilgan sananing haftasi boshlanadigan dushanba sanasini (UTC, YYYY-MM-DD) qaytaradi. */
function haftaBoshi(sana: Date): string {
  const kun = sana.getUTCDay(); // 0=yakshanba
  const offset = kun === 0 ? -6 : 1 - kun;
  const dushanba = new Date(sana);
  dushanba.setUTCDate(sana.getUTCDate() + offset);
  dushanba.setUTCHours(0, 0, 0, 0);
  return dushanba.toISOString().slice(0, 10);
}

export interface HaftalikHisobotNatija {
  id: string;
  hafta_boshi: string;
  jami_mashqlar: number;
  togri_foizi: number;
  vaqt_sarflangan_daq: number;
  natija_xulosa: string;
  majburiyat: { band: string; meyor: string }[];
  mustahkam_mavzular: { mavzu: string; score: number }[];
  zaif_mavzular: { mavzu: string; score: number }[];
}

/**
 * FIX v8.2: avval bu logika to'g'ridan-to'g'ri route handler ichida
 * edi — faqat Telegram foydalanuvchisi o'zi chaqirganda ishlardi.
 * Endi alohida funksiyaga ajratilgan, shu bilan Railway cron
 * (`/internal/weekly-reports/generate-all`, internal.ts) ham xuddi
 * shu logikadan HAR BIR foydalanuvchi/kurs uchun alohida-alohida
 * foydalanadi — route handler va cron endpoint orasida kod
 * takrorlanmaydi.
 *
 * `{ ok: false, reason: "no-data" }` — bu hafta mashq bo'lmagan
 * (xato emas, oddiy holat, ayniqsa cronda ko'p foydalanuvchi orasida
 * kutilgan). Haqiqiy xatolar (Claude/DB) throw qilinadi — chaqiruvchi
 * bunga 502 yoki cron log bilan javob beradi.
 */
export async function generateWeeklyReportForCourse(
  userId: string,
  courseId: string
): Promise<{ ok: true; report: HaftalikHisobotNatija } | { ok: false; reason: "no-data" }> {
  const hafta = haftaBoshi(new Date());

  const [statistika] = await query<{
    jami: string;
    togri: string;
    jami_ms: string | null;
  }>(
    `SELECT count(*)::text AS jami,
            count(*) FILTER (WHERE e.natija='togri')::text AS togri,
            COALESCE(SUM(e.javob_tezligi_ms), 0)::text AS jami_ms
     FROM exercises e
     JOIN chapters ch ON ch.id = e.chapter_id
     JOIN books b ON b.id = ch.book_id
     WHERE e.user_id=$1 AND b.course_id=$2
       AND e.created_at >= $3::date AND e.created_at < ($3::date + interval '7 days')`,
    [userId, courseId, hafta]
  );

  const [profile] = await query<{
    kuchli_tomonlar: { mavzu: string; score: number }[];
    zaif_tomonlar: { mavzu: string; score: number }[];
  }>(
    `SELECT kuchli_tomonlar, zaif_tomonlar FROM learner_profiles WHERE user_id=$1 AND course_id=$2`,
    [userId, courseId]
  );

  const jami = Number(statistika?.jami ?? 0);
  const togri = Number(statistika?.togri ?? 0);
  const vaqtDaq = Math.round(Number(statistika?.jami_ms ?? 0) / 60000);

  if (jami === 0) {
    return { ok: false, reason: "no-data" };
  }

  const mustahkam = (profile?.kuchli_tomonlar ?? []).filter((k) => k.score >= 0.6);
  const zaif = (profile?.zaif_tomonlar ?? []).filter((z) => z.score >= 0.3);

  const prompt = `Sen Fenix — qattiqqo'l, adolatli, adaptiv AI til-ustozisan.
Quyida o'quvchining shu haftadagi (${hafta} dan boshlab) natijalari:

- Jami bajarilgan mashqlar: ${jami}
- To'g'ri bajarilgan: ${togri} (${Math.round((togri / jami) * 100)}%)
- Taxminiy sarflangan vaqt: ${vaqtDaq} daqiqa
- Mustahkam mavzular: ${mustahkam.map((m) => m.mavzu).join(", ") || "hali yo'q"}
- Zaif mavzular: ${zaif.map((z) => z.mavzu).join(", ") || "hali yo'q"}

VAZIFA:
1) "natija_xulosa" — hafta natijasiga Fenix nomidan qisqa (4-6 gap),
   qattiqqo'l lekin adolatli va rag'batlantiruvchi ohangdagi xulosa yoz.
   Raqamlarni keltir, muvaffaqiyatni tan ol, lekin zaif joylarni
   yumshatmasdan aytib o't.
2) "majburiyat" — keyingi haftaga 2-3 ta ANIQ, O'LCHANADIGAN
   majburiyat/reja taklif qil (masalan "har kuni kamida 1 mashq",
   "'Perfekt' mavzusidan 5 ta qo'shimcha mashq").

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "natija_xulosa": "<matn>",
  "majburiyat": [
    { "band": "<qisqa nomi>", "meyor": "<o'lchanadigan aniq shart>" }
  ]
}`;

  const text = await callClaude({
    model: "claude-sonnet-4-6",
    maqsad: "haftalik_hisobot",
    prompt,
    maxTokens: 900,
    userId,
  });
  const natija = safeJsonParse(text) as {
    natija_xulosa: string;
    majburiyat: { band: string; meyor: string }[];
  };

  const [report] = await query<{ id: string }>(
    `INSERT INTO weekly_reports
       (user_id, course_id, hafta_boshi, majburiyat, natija_xulosa, vaqt_sarflangan_daq, mustahkam_mavzular, zaif_mavzular)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, course_id, hafta_boshi) DO UPDATE
     SET majburiyat=$4, natija_xulosa=$5, vaqt_sarflangan_daq=$6,
         mustahkam_mavzular=$7, zaif_mavzular=$8
     RETURNING id`,
    [
      userId,
      courseId,
      hafta,
      JSON.stringify(natija.majburiyat ?? []),
      natija.natija_xulosa,
      vaqtDaq,
      JSON.stringify(mustahkam),
      JSON.stringify(zaif),
    ]
  );

  return {
    ok: true,
    report: {
      id: report.id,
      hafta_boshi: hafta,
      jami_mashqlar: jami,
      togri_foizi: Math.round((togri / jami) * 100),
      vaqt_sarflangan_daq: vaqtDaq,
      natija_xulosa: natija.natija_xulosa,
      majburiyat: natija.majburiyat,
      mustahkam_mavzular: mustahkam,
      zaif_mavzular: zaif,
    },
  };
}

// ============================================================
// 1) Joriy hafta uchun hisobot generatsiya qilish (yoki yangilash)
// ============================================================

reportsRouter.post("/courses/:courseId/weekly-report/generate", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  if (!(await ownsCourse(req.params.courseId, userId))) {
    return res.status(404).json({ xato: "kurs topilmadi" });
  }

  try {
    const natija = await generateWeeklyReportForCourse(userId, req.params.courseId);
    if (!natija.ok) {
      return res.status(422).json({
        xato: "bu hafta hali mashq bajarilmagan — hisobot uchun ma'lumot yo'q",
      });
    }
    res.status(201).json(natija.report);
  } catch (err) {
    res.status(502).json({
      xato: "haftalik hisobot tuzilmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

// ============================================================
// 2) Eng so'nggi hisobotni o'qish
// ============================================================

reportsRouter.get("/courses/:courseId/weekly-report", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  if (!(await ownsCourse(req.params.courseId, userId))) {
    return res.status(404).json({ xato: "kurs topilmadi" });
  }

  const [report] = await query(
    `SELECT hafta_boshi, majburiyat, natija_xulosa, vaqt_sarflangan_daq,
            mustahkam_mavzular, zaif_mavzular, created_at
     FROM weekly_reports
     WHERE user_id=$1 AND course_id=$2
     ORDER BY hafta_boshi DESC LIMIT 1`,
    [userId, req.params.courseId]
  );

  if (!report) return res.status(404).json({ xato: "hali hisobot yo'q" });
  res.json(report);
});
