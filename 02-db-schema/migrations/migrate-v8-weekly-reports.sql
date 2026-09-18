-- =============================================================
-- FenixTeacher v8 → v8.1  —  weekly_reports jadval migratsiyasi
-- =============================================================
--
-- QACHON KERAK:
--   Agar weekly_reports jadvali allaqachon yaratilgan bo'lsa
--   (v8 dan OLDINGI sxemadan) — bu faylni ishga tushiring.
--
-- QACHON KERAK EMAS:
--   Yangi o'rnatma bo'lsa (schema.sql to'liq qayta yaratilsa) —
--   bu fayl kerak emas, schema.sql allaqachon yangilangan.
--
-- XAVFSIZLIK:
--   * Tranzaksiya ichida — biror qadam muvaffaqiyatsiz bo'lsa
--     hammasi bekor qilinadi (rollback).
--   * Idempotent — allaqachon qilingan bo'lsa xato bermaydi.
--   * Eski ma'lumotlarni o'chirish IZOHLANGAN — tasdiqlang.
--
-- ISHLATISH:
--   psql "$DATABASE_URL" -f migrate-v8-weekly-reports.sql
-- =============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. course_id ustunini qo'shish
--    IF NOT EXISTS — allaqachon qo'shilgan bo'lsa xato bermaydi.
-- ----------------------------------------------------------------
ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS course_id UUID
    REFERENCES courses(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------
-- 2. Eski UNIQUE constraintni topib olib tashlash.
--
--    Eski sxemada constraint nomi turlicha bo'lishi mumkin:
--      weekly_reports_user_id_hafta_boshi_key  (PostgreSQL avtomatik)
--      yoki qo'lda boshqa nom berilgan bo'lishi mumkin.
--    Shuning uchun information_schema orqali dinamik topamiz.
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- course_id ni O'Z ICHIGA OLMAGAN birinchi UNIQUE constraintni topamiz
  SELECT tc.constraint_name INTO v_constraint
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'weekly_reports'
    AND tc.constraint_type = 'UNIQUE'
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.constraint_column_usage ccu
      WHERE ccu.constraint_name = tc.constraint_name
        AND ccu.column_name = 'course_id'
    )
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE weekly_reports DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'Eski constraint olib tashlandi: %', v_constraint;
  ELSE
    RAISE NOTICE 'Eski (course_id siz) constraint topilmadi — o''tkazib yuborildi.';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. Yangi to'g'ri UNIQUE index — (user_id, course_id, hafta_boshi)
--    IF NOT EXISTS — idempotent.
-- ----------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reports_user_course_hafta_key
  ON weekly_reports (user_id, course_id, hafta_boshi);

-- ----------------------------------------------------------------
-- 4. Eski qatorlar (course_id = NULL) — ixtiyoriy tozalash.
--
--    Avval ko'rish uchun:
--      SELECT count(*) FROM weekly_reports WHERE course_id IS NULL;
--
--    Kerak bo'lsa o'chirish uchun izohldan chiqaring:
-- ----------------------------------------------------------------
-- DELETE FROM weekly_reports WHERE course_id IS NULL;

-- ----------------------------------------------------------------
-- 5. Natijani tekshirish
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_idx_exists BOOLEAN;
  v_null_rows  INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'course_id'
  ) INTO v_col_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'weekly_reports'
      AND indexname = 'weekly_reports_user_course_hafta_key'
  ) INTO v_idx_exists;

  SELECT count(*) FROM weekly_reports WHERE course_id IS NULL
  INTO v_null_rows;

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'course_id ustuni mavjud  : %', v_col_exists;
  RAISE NOTICE 'Yangi UNIQUE index mavjud: %', v_idx_exists;
  RAISE NOTICE 'NULL course_id qatorlar  : % ta', v_null_rows;
  IF v_null_rows > 0 THEN
    RAISE NOTICE '  → Eslatma: NULL qatorlarni o''chirish uchun 4-qadamni izohldan chiqaring.';
  END IF;
  RAISE NOTICE '-------------------------------------------';
END $$;

COMMIT;
