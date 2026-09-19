-- =============================================================
-- FenixTeacher v9 → v10  —  book_exercises jadvali migratsiyasi
-- =============================================================
--
-- SABAB:
--   Darslik PDF'laridan mashqlarni (exercise_extractor.py) alohida
--   jadvalda saqlash. `chapters.matn` pipeline'iga TEGILMAYDI.
--
-- QACHON KERAK:
--   Loyiha allaqachon eski sxemadan (v9 yoki undan oldin)
--   ishlayotgan bo'lsa — bu faylni ishga tushiring.
--
-- QACHON KERAK EMAS:
--   Yangi o'rnatma bo'lsa (schema.sql to'liq qayta yaratilsa) —
--   schema.sql allaqachon yangilangan.
--
-- XAVFSIZLIK:
--   * Tranzaksiya ichida.
--   * Idempotent — allaqachon qilingan bo'lsa xato bermaydi.
--   * Mavjud jadvallarga tegmaydi (faqat yangi jadval + indekslar).
--
-- ISHLATISH:
--   psql "$DATABASE_URL" -f migrate-v10-book-exercises.sql
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS book_exercises (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id                UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id             UUID REFERENCES chapters(id) ON DELETE SET NULL,
                          -- NULL: mashq hech bir bob sahifa oralig'iga tushmadi
  exercise_number        TEXT NOT NULL,          -- "1", "1a", "2b"
  heading_kind           TEXT NOT NULL
                          CHECK (heading_kind IN ('numeric','sub_inherited')),
  xom_matn               TEXT NOT NULL,          -- OCR'dan olingan xom matn; hech qachon o'zgartirilmaydi
  page_physical          INTEGER NOT NULL,       -- PDF'dagi jismoniy sahifa (1-based)
  page_printed           INTEGER,                -- chop etilgan sahifa raqami (offset bilan)
  bbox                   JSONB,                  -- [x0, top, x1, bottom], sahifa piksellarida
  reading_order_position INTEGER NOT NULL,       -- sahifa ichida tartib (0-based)
  audio_markers          TEXT[] NOT NULL DEFAULT '{}',  -- masalan {"1.3","1.4"}
  page_type              TEXT,
  needs_review           BOOLEAN NOT NULL DEFAULT false,
  needs_review_reason    TEXT,                   -- extractor shubhasi (inson ko'rishi kerakmi)
  tekshirilgan           BOOLEAN NOT NULL DEFAULT false,
                          -- inson HAQIQATAN ko'rib tasdiqlagan (needs_review'dan MUSTAQIL)
  tekshirilgan_at        TIMESTAMPTZ,
  strukturasi            JSONB,                  -- kelajak: AI + so'zma-so'z tekshiruvdan o'tgan struktura
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_book_exercises_page_order
    UNIQUE (book_id, page_physical, reading_order_position)
);
-- Lösungen bog'lash kaliti (rejalashtirilgan): (chapter_id, exercise_number) —
-- `id` emas, chunki qayta-extraction'da id o'zgaradi.
CREATE INDEX IF NOT EXISTS idx_book_exercises_chapter ON book_exercises (chapter_id, exercise_number);
CREATE INDEX IF NOT EXISTS idx_book_exercises_review ON book_exercises (book_id) WHERE needs_review;

-- Jadval eski (tekshirilgan'siz) variantda allaqachon mavjud bo'lsa:
ALTER TABLE book_exercises ADD COLUMN IF NOT EXISTS tekshirilgan BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE book_exercises ADD COLUMN IF NOT EXISTS tekshirilgan_at TIMESTAMPTZ;

DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_cols INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'book_exercises'
  ) INTO v_table_exists;
  SELECT count(*) INTO v_cols
    FROM information_schema.columns WHERE table_name = 'book_exercises';

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'book_exercises jadvali mavjud: % (ustunlar: %)', v_table_exists, v_cols;
  RAISE NOTICE '-------------------------------------------';
END $$;

COMMIT;
