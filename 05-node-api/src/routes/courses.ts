/**
 * courses.ts — foydalanuvchining "bo'lim"lari (masalan "Nemis tili").
 * Kurs yaratilganda shu foydalanuvchi+kurs uchun bo'sh learner_profile
 * ham avtomatik ochiladi (schema: uq_learner_profile_user_course).
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";

export const coursesRouter = Router();
coursesRouter.use(telegramAuth);

async function currentUserId(telegramId: number): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [telegramId]
  );
  return row?.id ?? null;
}

const CreateCourseSchema = z.object({
  til_nomi: z.string().min(1),
  til_kodi: z.string().min(2).max(5),
  maqsad: z.string().optional(),
  maqsad_sana: z.string().optional(), // ISO sana
});

coursesRouter.post("/", async (req, res) => {
  const parsed = CreateCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const { til_nomi, til_kodi, maqsad, maqsad_sana } = parsed.data;

  const [course] = await query<{ id: string }>(
    `INSERT INTO courses (user_id, til_nomi, til_kodi, maqsad, maqsad_sana)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [userId, til_nomi, til_kodi, maqsad ?? null, maqsad_sana ?? null]
  );

  await query(
    `INSERT INTO learner_profiles (user_id, course_id) VALUES ($1,$2)`,
    [userId, course.id]
  );

  res.status(201).json({ id: course.id, til_nomi, til_kodi });
});

coursesRouter.get("/", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const courses = await query(
    `SELECT c.id, c.til_nomi, c.til_kodi, c.holati, c.maqsad, c.maqsad_sana, c.created_at,
     COALESCE((
       SELECT ROUND(AVG(COALESCE(up.foiz_bajarilgan, 0)))::int
       FROM books b
       JOIN chapters ch ON ch.book_id = b.id
       LEFT JOIN user_progress up ON up.chapter_id = ch.id AND up.user_id = c.user_id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL
     ), 0) AS foiz_bajarilgan,
     (SELECT COUNT(*)::int
       FROM books b JOIN chapters ch ON ch.book_id = b.id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL) AS boblar_soni,
     (SELECT COUNT(*)::int
       FROM books b
       JOIN chapters ch ON ch.book_id = b.id
       JOIN user_progress up ON up.chapter_id = ch.id AND up.user_id = c.user_id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL
         AND up.yakunlangan_at IS NOT NULL) AS yakunlangan_boblar
     FROM courses c WHERE c.user_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at`,
    [userId]
  );
  res.json(courses);
});

coursesRouter.get("/:id", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const [course] = await query(
    `SELECT c.*, lp.kuchli_tomonlar, lp.zaif_tomonlar, lp.ogrenish_uslubi_taxmin,
     COALESCE((
       SELECT ROUND(AVG(COALESCE(up.foiz_bajarilgan, 0)))::int
       FROM books b
       JOIN chapters ch ON ch.book_id = b.id
       LEFT JOIN user_progress up ON up.chapter_id = ch.id AND up.user_id = c.user_id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL
     ), 0) AS foiz_bajarilgan,
     (SELECT COUNT(*)::int
       FROM books b JOIN chapters ch ON ch.book_id = b.id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL) AS boblar_soni,
     (SELECT COUNT(*)::int
       FROM books b
       JOIN chapters ch ON ch.book_id = b.id
       JOIN user_progress up ON up.chapter_id = ch.id AND up.user_id = c.user_id
       WHERE b.course_id = c.id AND b.deleted_at IS NULL
         AND up.yakunlangan_at IS NOT NULL) AS yakunlangan_boblar
     FROM courses c
     LEFT JOIN learner_profiles lp ON lp.course_id = c.id AND lp.user_id = c.user_id
     WHERE c.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL`,
    [req.params.id, userId]
  );
  if (!course) return res.status(404).json({ xato: "kurs topilmadi" });

  const books = await query(
    `SELECT id, nomi, turi, qayta_ishlash_holati FROM books
     WHERE course_id=$1 AND deleted_at IS NULL ORDER BY created_at`,
    [req.params.id]
  );

  res.json({ ...course, books });
});
