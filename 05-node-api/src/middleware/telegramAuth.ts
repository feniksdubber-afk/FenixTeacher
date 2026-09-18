/**
 * telegramAuth.ts — Telegram Mini App yuboradigan `initData`ni
 * tekshiradi (HMAC-SHA256, bot tokeni bilan) va `req.user`ga
 * `telegram_id`ni qo'yadi. Mini App har so'rovda `X-Telegram-Init-Data`
 * header orqali initData'ni yuboradi.
 *
 * Rasmiy tekshirish algoritmi:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
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

  return computedHash === hash;
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
  if (!secret || secret !== process.env.INTERNAL_SERVICE_SECRET) {
    return res.status(401).json({ xato: "ichki so'rov ruxsatsiz" });
  }
  next();
}
