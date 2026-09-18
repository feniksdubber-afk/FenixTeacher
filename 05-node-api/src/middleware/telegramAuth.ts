/**
 * telegramAuth.ts — Telegram Mini App yuboradigan `initData`ni
 * tekshiradi (HMAC-SHA256, bot tokeni bilan) va `req.user`ga
 * `telegram_id`ni qo'yadi. Mini App har so'rovda `X-Telegram-Init-Data`
 * header orqali initData'ni yuboradi.
 *
 * Rasmiy tekshirish algoritmi:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * FIX (xavfsizlik auditi): ikkita muammo tuzatildi —
 *  1) `auth_date` yangiligi hech qachon tekshirilmasdi — demak bir
 *     marta ushlab olingan (yoki proksi log'ida qolgan) initData
 *     muddatsiz qayta ishlatilishi mumkin edi (replay attack).
 *     Endi `TELEGRAM_INIT_DATA_MAX_AGE_SEC` (standart: 24 soat)dan
 *     eski initData rad etiladi.
 *  2) Hash solishtirish oddiy `===` bilan edi — bu constant-time
 *     emas, timing orqali hashni bo'lak-bo'lak tiklash nazariy
 *     jihatdan mumkin. Endi `crypto.timingSafeEqual` ishlatiladi.
 */
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      telegramUser?: { id: number; username?: string };
    }
  }
}

// Telegram Mini App odatda ochilganda bir marta initData yaratadi va
// butun sessiya davomida shu bilan ishlaydi — shuning uchun juda qisqa
// TTL foydalanuvchini bezovta qiladi. 24 soat oqilona muvozanat
// (rasmiy Telegram hujjatida ham shunga yaqin qiymat tavsiya etiladi).
const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60;

function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isInitDataValid(initData: string, botToken: string): boolean {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return constantTimeEqualHex(computedHash, hash);
}

/** `auth_date` (Telegram tomonidan qo'yilgan, unix soniya) juda eski
 * bo'lsa initData'ni rad etadi — replay attack'dan himoya. */
function isAuthDateFresh(initData: string, maxAgeSec: number): boolean {
  const params = new URLSearchParams(initData);
  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) return false;

  const authDateSec = Number(authDateRaw);
  if (!Number.isFinite(authDateSec)) return false;

  const nowSec = Date.now() / 1000;
  const ageSec = nowSec - authDateSec;

  // Manfiy yosh (kelajakdagi sana) ham shubhali — soat sinxronizatsiyasi
  // uchun kichik tolerantlik (60s) beriladi, undan ortig'i rad etiladi.
  if (ageSec < -60) return false;
  return ageSec <= maxAgeSec;
}

export function telegramAuth(req: Request, res: Response, next: NextFunction) {
  const initData = req.header("X-Telegram-Init-Data");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!initData || !botToken) {
    return res.status(401).json({ xato: "initData yoki bot tokeni yo'q" });
  }

  if (!isInitDataValid(initData, botToken)) {
    return res.status(401).json({ xato: "initData yaroqsiz" });
  }

  const maxAgeSec = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC) || DEFAULT_MAX_AGE_SEC;
  if (!isAuthDateFresh(initData, maxAgeSec)) {
    return res.status(401).json({ xato: "initData muddati o'tgan, iltimos Mini App'ni qayta oching" });
  }

  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (!userRaw) {
    return res.status(401).json({ xato: "initData ichida user yo'q" });
  }

  const user = JSON.parse(userRaw) as { id: number; username?: string };
  req.telegramUser = user;
  next();
}

/**
 * internalAuth.ts o'rniga shu yerda: mikroservislar (masalan PDF-service)
 * bu API'ning ichki endpoint'lariga (masalan /internal/ai/infer-units)
 * murojaat qilganda ishlatiladi — Telegram initData emas, oddiy shared
 * secret bilan.
 */
export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const secret = req.header("X-Internal-Secret");
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret || !expected) {
    return res.status(401).json({ xato: "ichki so'rov ruxsatsiz" });
  }

  // Constant-time solishtirish (hex emas, oddiy UTF-8 secret) —
  // uzunlik oldindan oshkor bo'lmasligi uchun ikkalasini bir xil
  // uzunlikka (SHA-256 digest) keltirib solishtiramiz.
  const secretDigest = crypto.createHash("sha256").update(secret).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(secretDigest, expectedDigest)) {
    return res.status(401).json({ xato: "ichki so'rov ruxsatsiz" });
  }
  next();
}
