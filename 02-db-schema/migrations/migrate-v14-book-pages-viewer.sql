-- FenixTeacher v13 → v14  —  to'liq PDF-viewer (book_pages)
--
-- Har bir kitob sahifasi uchun bitta yozuv: R2'dagi JPEG kaliti + o'lcham
-- (piksellarda — frontend aspect-ratio uchun ishlatadi, tasvir
-- yuklanmagunча joy egallab turish uchun). `mashq-rasmlari` (book_exercises.
-- image_r2_key) bilan BOG'LIQ EMAS — u yerda faqat mashqqa tegishli
-- kesma, bu yerda kitobning haqiqiy sahifasi to'liq holda.

CREATE TABLE IF NOT EXISTS book_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id           UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_physical     INTEGER NOT NULL,   -- PDF'dagi jismoniy sahifa (1-based)
  image_r2_key      TEXT NOT NULL,
  width_px          INTEGER NOT NULL,
  height_px         INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_book_pages_book_page UNIQUE (book_id, page_physical)
);
CREATE INDEX IF NOT EXISTS idx_book_pages_book ON book_pages (book_id, page_physical);

-- Kitob qachon (va qaysi DPI/quality bilan) render qilinganini bilish uchun —
-- qayta-render kerakligini tekshirish va progress-bar ko'rsatish uchun ishlatiladi.
ALTER TABLE books ADD COLUMN IF NOT EXISTS sahifalar_render_holati TEXT
  CHECK (sahifalar_render_holati IN ('yoq','jarayonda','tayyor','xato'))
  NOT NULL DEFAULT 'yoq';
ALTER TABLE books ADD COLUMN IF NOT EXISTS sahifalar_soni INTEGER;
