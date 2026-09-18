/**
 * internal.ts — boshqa mikroservislar (PDF-service) chaqiradigan
 * ichki endpoint'lar. `internalAuth` bilan himoyalangan (shared secret),
 * Telegram foydalanuvchisi bilan aloqasi yo'q.
 */
import { Router } from "express";
import { z } from "zod";
import { internalAuth } from "../middleware/telegramAuth.js";
import { callClaude } from "../services/claude.js";
import { query } from "../db/pool.js";
import { generateWeeklyReportForCourse } from "./reports.js";

export const internalRouter = Router();
internalRouter.use(internalAuth);

const InferUnitsSchema = z.object({
  toc_text: z.string(),
  rows: z.array(
    z.object({
      turi: z.string(),
      nomi: z.string().nullable(),
      sahifa_boshi: z.number(),
    })
  ),
});

/**
 * PDF-service'dagi ai_structurer.py o'rnini bosadi: mundarija matni +
 * qatorlarni oladi, Claude Haiku orqali unit guruhlashni qaytaradi.
 * Bu yerda bo'lishining sababi: chaqiruv ai_call_logs'ga yoziladi.
 */
internalRouter.post("/ai/infer-units", async (req, res) => {
  const parsed = InferUnitsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const { toc_text, rows } = parsed.data;

  const prompt = `Bu bir til-o'rganish darsligining mundarijasidan avtomatik
ajratib olingan qatorlar ro'yxati (turi, nomi, boshlanish sahifasi).
Xom mundarija matni ham quyida berilgan — formatni tushunish uchun.

Vazifa: shu qatorlarni kitobning "Unit"/"Kapitel"/"Modul" darajasidagi
katta bo'limlariga guruhlash. Har bir darslikda odatda har unit
"Auftakt" (yoki shunga o'xshash kirish qismi) bilan boshlanadi, keyin
"Modul 1/2", "Porträt", "Grammatik" kabi qismlar davom etadi — lekin bu
qat'iy qoida emas, kitobga qarab farq qilishi mumkin.

Xom mundarija matni:
---
${toc_text.slice(0, 6000)}
---

Aniqlangan qatorlar (JSON):
${JSON.stringify(rows, null, 2)}

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{"units": [{"raqam": 1, "nomi": "...", "boshlanish_sahifa": <int>}, ...]}`;

  try {
    const text = await callClaude({
      model: "claude-haiku-4-5",
      maqsad: "unit_aniqlash",
      prompt,
      maxTokens: 1500,
    });
    const cleaned = text.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsedUnits = JSON.parse(cleaned);
    res.json(parsedUnits);
  } catch (err) {
    // Fallback: hammasini bitta unit deb qaytaradi — PDF-service o'zi
    // ham xuddi shunday fallback'ga ega, lekin shu yerda ham qoplaymiz
    res.status(200).json({
      units: [
        {
          raqam: 1,
          nomi: "Umumiy",
          boshlanish_sahifa: rows[0]?.sahifa_boshi ?? 1,
        },
      ],
      ogohlantirish: `AI chaqiruvi muvaffaqiyatsiz, fallback ishlatildi: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }
});

// ============================================================
// FIX v8.2: Railway scheduled job shu endpointga bir haftada bir
// marta (masalan dushanba ertalab) so'rov yuboradi. Har bir faol
// kurs uchun generateWeeklyReportForCourse (reports.ts) chaqiriladi
// — foydalanuvchining o'zi tugmani bosishini kutish shart emas.
//
// Har bir kurs mustaqil ishlanadi: bittasi xato bersa (masalan
// Claude vaqtincha ishlamasa) qolganlar baribir davom etadi — bitta
// foydalanuvchi hisoboti butun cronni to'xtatmasligi kerak.
// ============================================================
internalRouter.post("/weekly-reports/generate-all", async (_req, res) => {
  const kurslar = await query<{ id: string; user_id: string }>(
    `SELECT c.id, c.user_id
     FROM courses c
     JOIN users u ON u.id = c.user_id
     WHERE c.deleted_at IS NULL AND u.deleted_at IS NULL`
  );

  const natija = {
    jami_kurslar: kurslar.length,
    yaratildi: 0,
    malumot_yoq: 0,
    xato: 0,
    xato_tafsilotlari: [] as { course_id: string; xabar: string }[],
  };

  for (const kurs of kurslar) {
    try {
      const result = await generateWeeklyReportForCourse(kurs.user_id, kurs.id);
      if (result.ok) {
        natija.yaratildi++;
      } else {
        natija.malumot_yoq++;
      }
    } catch (err) {
      natija.xato++;
      const xabar = err instanceof Error ? err.message : String(err);
      natija.xato_tafsilotlari.push({ course_id: kurs.id, xabar });
      console.error(`[weekly-reports cron] kurs ${kurs.id} uchun xato:`, err);
    }
  }

  res.json(natija);
});
