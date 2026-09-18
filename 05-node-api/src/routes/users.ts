/**
 * users.ts — Telegram foydalanuvchisini ro'yxatdan o'tkazish/olish.
 * Mini App ochilganda birinchi chaqiriladigan endpoint: agar user
 * yo'q bo'lsa yaratadi (upsert), bor bo'lsa oxirgi faollikni yangilaydi.
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";

export const usersRouter = Router();
usersRouter.use(telegramAuth);

interface UserRow {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  ism: string;
  joriy_daraja: string;
  streak_kun: number;
  ustoz_qattiqqolligi: number;
  vaqt_zonasi: string;
}

/** POST /users/sync — Mini App ochilganda chaqiriladi (upsert). */
const SyncSchema = z.object({
  ism: z.string().min(1),
});

usersRouter.post("/sync", async (req, res) => {
  const parsed = SyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const tgUser = req.telegramUser!;

  const [user] = await query<UserRow>(
    `INSERT INTO users (telegram_id, telegram_username, ism)
     VALUES ($1,$2,$3)
     ON CONFLICT (telegram_id) DO UPDATE
       SET telegram_username = EXCLUDED.telegram_username,
           oxirgi_faollik_at = now(),
           updated_at = now()
     RETURNING id, telegram_id, telegram_username, ism, joriy_daraja,
               streak_kun, ustoz_qattiqqolligi, vaqt_zonasi`,
    [tgUser.id, tgUser.username ?? null, parsed.data.ism]
  );

  res.json(user);
});

usersRouter.get("/me", async (req, res) => {
  const tgUser = req.telegramUser!;
  const [user] = await query<UserRow>(
    `SELECT id, telegram_id, telegram_username, ism, joriy_daraja,
            streak_kun, ustoz_qattiqqolligi, vaqt_zonasi
     FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [tgUser.id]
  );
  if (!user) return res.status(404).json({ xato: "foydalanuvchi topilmadi, avval /users/sync chaqiring" });
  res.json(user);
});

const UpdateProfileSchema = z.object({
  joriy_daraja: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  ustoz_qattiqqolligi: z.number().int().min(1).max(5).optional(),
  vaqt_zonasi: z.string().optional(),
});

usersRouter.patch("/me", async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const tgUser = req.telegramUser!;
  const fields = parsed.data;
  const keys = Object.keys(fields) as (keyof typeof fields)[];
  if (keys.length === 0) {
    return res.status(400).json({ xato: "hech qanday maydon berilmadi" });
  }

  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => fields[k]);

  const [user] = await query<UserRow>(
    `UPDATE users SET ${setClauses}, updated_at = now()
     WHERE telegram_id = $1
     RETURNING id, telegram_id, telegram_username, ism, joriy_daraja,
               streak_kun, ustoz_qattiqqolligi, vaqt_zonasi`,
    [tgUser.id, ...values]
  );
  if (!user) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  res.json(user);
});
