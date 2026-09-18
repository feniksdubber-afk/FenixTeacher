/**
 * tts.ts — TTS endpoint.
 *
 * FIX (#12): avval bu endpoint uchun na rate-limit, na
 * foydalanish-logi bor edi — Claude chaqiruvlaridan farqli o'laroq
 * (ular ai_call_logs'ga yoziladi va narx kuzatiladi), har qanday
 * login qilgan foydalanuvchi cheksiz TTS so'rovi yuborishi mumkin
 * edi. Endi:
 *   1) Oddiy in-memory sliding-window rate-limit (foydalanuvchi
 *      boshiga TTS_RATE_LIMIT_MAX so'rov / TTS_RATE_LIMIT_WINDOW_MS
 *      oynada) — Bosqich 1 (bitta Node instansi) uchun yetarli;
 *      ko'p instansli deploy qilinsa Redis'ga o'tish kerak bo'ladi.
 *   2) Har bir urinish (muvaffaqiyatli yoki xato) `tts_call_logs`ga
 *      yoziladi (qarang 02-db-schema/migrations/migrate-v9-*.sql).
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { synthesizeSpeech } from "../services/tts.js";

export const ttsRouter = Router();
ttsRouter.use(telegramAuth);

async function currentUserId(telegramId: number): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [telegramId]
  );
  return row?.id ?? null;
}

const TTS_RATE_LIMIT_MAX = Number(process.env.TTS_RATE_LIMIT_MAX ?? 30);
const TTS_RATE_LIMIT_WINDOW_MS = Number(process.env.TTS_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);

// telegram_id -> shu oynadagi so'rov vaqtlari
const soroviLar = new Map<number, number[]>();

function limitOshirilganmi(telegramId: number): boolean {
  const hozir = Date.now();
  const eskisi = soroviLar.get(telegramId) ?? [];
  const yangisi = eskisi.filter((t) => hozir - t < TTS_RATE_LIMIT_WINDOW_MS);
  if (yangisi.length >= TTS_RATE_LIMIT_MAX) {
    soroviLar.set(telegramId, yangisi);
    return true;
  }
  yangisi.push(hozir);
  soroviLar.set(telegramId, yangisi);
  return false;
}

const TtsSchema = z.object({
  matn: z.string().min(1).max(500),
  til_kodi: z.string().optional(),
});

/** Har qanday matnni (mashq savoli, so'z, gap) ovozga aylantiradi. */
ttsRouter.post("/tts", async (req, res) => {
  const parsed = TtsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }

  const telegramId = req.telegramUser!.id;
  if (limitOshirilganmi(telegramId)) {
    return res.status(429).json({
      xato: "juda ko'p so'rov",
      tafsilot: `${TTS_RATE_LIMIT_MAX} ta so'rov / ${TTS_RATE_LIMIT_WINDOW_MS / 60000} daqiqa limiti oshib ketdi`,
    });
  }

  const userId = await currentUserId(telegramId);
  const tilKodi = parsed.data.til_kodi ?? "de";

  try {
    const audio_base64 = await synthesizeSpeech(parsed.data.matn, tilKodi);
    try {
      await query(
        `INSERT INTO tts_call_logs (user_id, til_kodi, matn_uzunligi, muvaffaqiyatli)
         VALUES ($1,$2,$3,true)`,
        [userId, tilKodi, parsed.data.matn.length]
      );
    } catch (logErr) {
      console.error("[tts] tts_call_logs yozishda xato:", logErr);
    }
    res.json({ audio_base64, format: "mp3" });
  } catch (err) {
    const xato_matni = err instanceof Error ? err.message : String(err);
    try {
      await query(
        `INSERT INTO tts_call_logs (user_id, til_kodi, matn_uzunligi, muvaffaqiyatli, xato_matni)
         VALUES ($1,$2,$3,false,$4)`,
        [userId, tilKodi, parsed.data.matn.length, xato_matni]
      );
    } catch (logErr) {
      console.error("[tts] tts_call_logs yozishda xato:", logErr);
    }
    // TTS sozlanmagan/ishlamagan bo'lsa 503 — bu "xato" emas,
    // frontend shunchaki ovoz tugmasini yashirishi/o'chirishi mumkin.
    res.status(503).json({
      xato: "TTS ishlamadi",
      tafsilot: xato_matni,
    });
  }
});
