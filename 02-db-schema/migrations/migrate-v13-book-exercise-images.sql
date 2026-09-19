-- FenixTeacher v12 → v13  —  mashq rasmlari (book_exercises.image_r2_key)
--
-- Nima uchun: kitob to'liq skanerlangan (OCR qatlamli), shuning uchun
-- sahifaning o'zi rasm. Har bir book_exercise uchun PDF-service o'sha
-- sahifaning tegishli qismini (bbox + padding, to'liq kenglik — yon
-- rasm/illyustratsiyani yo'qotmaslik uchun) JPEG sifatida kesib oladi,
-- Node uni R2'ga yuklaydi va shu ustunga kalitni yozadi.
--
-- image_r2_key = NULL -> hali render qilinmagan / eski extractor natijasi
-- (fallback: frontend rasmsiz ko'rsatadi, xatoga chiqmaydi).

ALTER TABLE book_exercises ADD COLUMN IF NOT EXISTS image_r2_key TEXT;

COMMENT ON COLUMN book_exercises.image_r2_key IS
  'R2''dagi mashq rasmi (sahifa bo''lagi, JPEG) kaliti. NULL bo''lishi mumkin.';
