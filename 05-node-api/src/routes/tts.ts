import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { synthesizeSpeech } from "../services/tts.js";

export const ttsRouter = Router();
ttsRouter.use(telegramAuth);

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

  try {
    const audio_base64 = await synthesizeSpeech(parsed.data.matn, parsed.data.til_kodi ?? "de");
    res.json({ audio_base64, format: "mp3" });
  } catch (err) {
    // TTS sozlanmagan/ishlamagan bo'lsa 503 — bu "xato" emas,
    // frontend shunchaki ovoz tugmasini yashirishi/o'chirishi mumkin.
    res.status(503).json({
      xato: "TTS ishlamadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});
