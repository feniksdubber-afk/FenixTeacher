/**
 * upload.ts — fayl Node serveri orqali o'tmaydi. Mini App:
 *   1) POST /upload/presign { content_type } → { file_key, upload_url }
 *   2) upload_url'ga to'g'ridan-to'g'ri PUT qiladi (R2'ga)
 *   3) file_key'ni /books POST so'roviga beradi
 *
 * Sabab: PDF'lar 50-200MB bo'lishi mumkin, mobil tarmoqda faylni
 * ikki marta (client→Node→R2) o'tkazish sekin va Hetzner trafigini
 * behuda band qiladi.
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { createUploadUrl } from "../services/r2.js";

export const uploadRouter = Router();
uploadRouter.use(telegramAuth);

const PresignSchema = z.object({
  content_type: z.enum([
    "application/pdf",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "image/png",
    "image/jpeg",
  ]),
});

uploadRouter.post("/presign", async (req, res) => {
  const parsed = PresignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  try {
    const { file_key, upload_url } = await createUploadUrl(parsed.data.content_type);
    res.json({ file_key, upload_url });
  } catch (err) {
    res.status(400).json({ xato: err instanceof Error ? err.message : String(err) });
  }
});
