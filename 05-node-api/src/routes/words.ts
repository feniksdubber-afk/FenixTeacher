/**
 * words.ts — So'z boyligi moduli (loyiha hujjati 3.7-bo'lim): SM-2
 * asosidagi takrorlash navbati. So'zlar ikki yo'l bilan qo'shiladi:
 *   1) Fenix o'zi — mashq generatsiya qilinganda bob matnidan mavzuga
 *      oid 1-3 so'zni taklif qiladi (`exercises.ts`dagi `yangi_sozlar`)
 *   2) Foydalanuvchi qo'lda — `POST /courses/:id/words`
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { applySm2 } from "../services/sm2.js";

export const wordsRouter = Router();
wordsRouter.use(telegramAuth);

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

const AddWordSchema = z.object({
  soz: z.string().min(1),
  tarjima: z.string().min(1),
  soz_turi: z.string().optional(),
  chapter_id: z.string().uuid().optional(),
  faol_yoki_passiv: z.enum(["passiv", "faol"]).optional(),
});

/** Yangi so'z qo'shadi. Xuddi shu (user, course, soz) bo'lsa — jim
 * o'tkazib yuboradi (mashq generatsiyasi bir xil so'zni bir necha
 * marta taklif qilishi mumkin, bu normal holat). */
wordsRouter.post("/courses/:courseId/words", async (req, res) => {
  const parsed = AddWordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  if (!(await ownsCourse(req.params.courseId, userId))) {
    return res.status(404).json({ xato: "kurs topilmadi" });
  }

  const { soz, tarjima, soz_turi, chapter_id, faol_yoki_passiv } = parsed.data;

  const [word] = await query<{ id: string }>(
    `INSERT INTO words (user_id, course_id, chapter_id, soz, tarjima, soz_turi, faol_yoki_passiv)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'passiv'))
     ON CONFLICT (user_id, course_id, soz) DO NOTHING
     RETURNING id`,
    [userId, req.params.courseId, chapter_id ?? null, soz, tarjima, soz_turi ?? null, faol_yoki_passiv ?? null]
  );

  res.status(201).json({ id: word?.id ?? null, qoshildi: !!word });
});

/** Takrorlash uchun navbatdagi so'zlar (`next_review_at <= now`). */
wordsRouter.get("/courses/:courseId/words/due", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });
  if (!(await ownsCourse(req.params.courseId, userId))) {
    return res.status(404).json({ xato: "kurs topilmadi" });
  }

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const words = await query(
    `SELECT id, soz, tarjima, soz_turi, interval_kun, ease_factor, takrorlar_soni,
            next_review_at, faol_yoki_passiv
     FROM words
     WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL AND next_review_at <= now()
     ORDER BY next_review_at ASC
     LIMIT $3`,
    [userId, req.params.courseId, limit]
  );
  res.json(words);
});

const ReviewSchema = z.object({
  sifat: z.number().int().min(0).max(5), // 0=butunlay unutilgan, 5=juda oson eslangan
});

/** Bitta so'zni ko'rib chiqib, SM-2 bo'yicha keyingi ko'rsatish
 * sanasini hisoblab yangilaydi. */
wordsRouter.post("/words/:id/review", async (req, res) => {
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const [word] = await query<{
    id: string;
    interval_kun: number;
    ease_factor: string; // NUMERIC pg orqali string qaytadi
    takrorlar_soni: number;
  }>(
    `SELECT id, interval_kun, ease_factor, takrorlar_soni FROM words
     WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [req.params.id, userId]
  );
  if (!word) return res.status(404).json({ xato: "so'z topilmadi" });

  const natija = applySm2(
    {
      interval_kun: word.interval_kun,
      ease_factor: Number(word.ease_factor),
      takrorlar_soni: word.takrorlar_soni,
    },
    parsed.data.sifat
  );

  await query(
    `UPDATE words
     SET interval_kun=$2, ease_factor=$3, takrorlar_soni=$4, next_review_at=$5, updated_at=now()
     WHERE id=$1`,
    [word.id, natija.interval_kun, natija.ease_factor, natija.takrorlar_soni, natija.next_review_at]
  );

  res.json({
    interval_kun: natija.interval_kun,
    ease_factor: natija.ease_factor,
    takrorlar_soni: natija.takrorlar_soni,
    next_review_at: natija.next_review_at,
  });
});
