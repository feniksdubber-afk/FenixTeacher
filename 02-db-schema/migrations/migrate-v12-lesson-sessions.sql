-- =============================================================
-- FenixTeacher v11 → v12  —  lesson_sessions: chinakam "dars" tuzilishi
-- =============================================================
--
-- SABAB:
--   Avvalgi oqim shunchaki savol→javob→baho ketma-ketligi edi —
--   mashq qildirish, lekin DARS emas. Haqiqiy ustoz: (1) mashqdan
--   OLDIN tushuntiradi, (2) bir xil xatoni ko'rsa to'xtab qayta
--   tushuntiradi, (3) dars oxirida xulosa beradi.
--
--   lesson_sessions — shu 4 bosqichli state machine'ni saqlaydi:
--   isinish → tushuntirish → amaliyot ⇄ qayta_tushuntirish → yakun.
--
-- XAVFSIZLIK:
--   * Tranzaksiya ichida, idempotent.
--   * Mavjud jadvallarga faqat qo'shimcha ustun (ALTER ... ADD COLUMN).
--
-- ISHLATISH:
--   psql "$DATABASE_URL" -f migrate-v12-lesson-sessions.sql
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS lesson_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id                UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  holat                     TEXT NOT NULL DEFAULT 'isinish'
                             CHECK (holat IN
                               ('isinish','tushuntirish','amaliyot','qayta_tushuntirish','yakunlandi')),
  tushuntirish_matni        TEXT,       -- Claude bergan mini-dars matni (2-bosqich)
  -- Amaliyot davomida "ketma-ket xato" kuzatuvi — real ustoz kabi
  -- bir xil mavzuda ikkinchi marta yiqilsa to'xtab qayta tushuntirish
  -- uchun. Sessiya ICHIDA hisoblanadi (learner_profiles'dagi umumiy
  -- tarix bilan aralashtirilmaydi — bu "shu darsda hozir" signali).
  joriy_mavzu               TEXT,
  ketma_ket_notogri_soni    INTEGER NOT NULL DEFAULT 0,
  qayta_tushuntirilgan_mavzular TEXT[] NOT NULL DEFAULT '{}',
                             -- shu mavzu uchun qayta-tushuntirish
                             -- allaqachon berilgan — ikkinchi marta
                             -- bermaslik uchun (spam qilmaslik)
  mashqlar_soni             INTEGER NOT NULL DEFAULT 0,
  xulosa_matni              TEXT,       -- yakun bosqichida Claude yozadi
  boshlangan_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  tugagan_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Bir foydalanuvchi bir bobda bir vaqtda faqat BITTA faol
-- (yakunlanmagan) sessiyaga ega bo'lishi kerak — qisman indeks bilan
-- (tugagan_at IS NULL bo'lgan qatorlar orasida user+chapter unikal):
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_sessions_one_active
  ON lesson_sessions (user_id, chapter_id) WHERE tugagan_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_user ON lesson_sessions (user_id, chapter_id, boshlangan_at DESC);

-- exercises: qaysi dars-sessiyaga va qaysi bosqichga tegishli.
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS lesson_session_id UUID REFERENCES lesson_sessions(id) ON DELETE SET NULL;
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS dars_bosqichi TEXT
    CHECK (dars_bosqichi IN ('isinish','tushuntirish','amaliyot','qayta_tushuntirish'));

CREATE INDEX IF NOT EXISTS idx_exercises_lesson_session ON exercises (lesson_session_id);

COMMIT;
