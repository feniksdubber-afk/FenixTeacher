-- =============================================================
-- FenixTeacher v10 → v11  —  book_exercises ↔ exercises ko'prigi
-- =============================================================
--
-- SABAB:
--   Darslikdan ajratilgan haqiqiy mashqlar (book_exercises) va
--   Claude'ning javob-tekshirish/"Nega?" oqimi (exercises) ikkita
--   ALOHIDA jadval edi — hech kim ularni bog'lamagan. Bu migratsiya
--   ikkalasini bog'laydi: har bir book_exercise faqat BIR MARTA
--   "boshlanadi" (exercises'ga ko'chib, mavjud javob/tekshirish/
--   "Nega?" logikasidan foydalanadi).
--
-- XAVFSIZLIK:
--   * Tranzaksiya ichida, idempotent (ADD COLUMN IF NOT EXISTS).
--   * Mavjud qatorlarga tegmaydi — faqat yangi bog'lovchi ustunlar.
--
-- ISHLATISH:
--   psql "$DATABASE_URL" -f migrate-v11-book-exercise-link.sql
-- =============================================================

BEGIN;

-- exercises: qaysi book_exercise'dan "boshlangan" (AI o'zi tuzgan
-- mashqlarda NULL bo'lib qoladi).
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS book_exercise_id UUID REFERENCES book_exercises(id) ON DELETE SET NULL;

-- Bitta book_exercise faqat bitta marta ishlatilishi kerak — qayta
-- berilmasligi uchun. Qisman indeks: faqat NULL bo'lmagan qiymatlar
-- orasida unikal (AI o'zi tuzgan mashqlarda book_exercise_id NULL,
-- ular cheklovga tushmaydi).
CREATE UNIQUE INDEX IF NOT EXISTS uq_exercises_book_exercise
  ON exercises (book_exercise_id) WHERE book_exercise_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercises_book_exercise ON exercises (book_exercise_id);

DO $$
DECLARE
  v_cols INTEGER;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
    WHERE table_name = 'exercises' AND column_name = 'book_exercise_id';
  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'exercises.book_exercise_id mavjud: % ustun', v_cols;
  RAISE NOTICE '-------------------------------------------';
END $$;

COMMIT;
