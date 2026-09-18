-- =============================================================
-- FenixTeacher v8.1 → v9  —  tts_call_logs jadvali migratsiyasi
-- =============================================================
--
-- SABAB (audit #12):
--   TTS (Edge TTS) chaqiruvlari hech qayerda hisobga olinmasdi —
--   Claude chaqiruvlari ai_call_logs'ga yozilib narx nazorat
--   qilinardi, TTS uchun esa na log, na rate-limit bor edi.
--
-- QACHON KERAK:
--   Loyiha allaqachon eski sxemadan (v8.1 yoki undan oldin)
--   ishlayotgan bo'lsa — bu faylni ishga tushiring.
--
-- QACHON KERAK EMAS:
--   Yangi o'rnatma bo'lsa (schema.sql to'liq qayta yaratilsa) —
--   bu fayl kerak emas, schema.sql allaqachon yangilangan.
--
-- XAVFSIZLIK:
--   * Tranzaksiya ichida.
--   * Idempotent — allaqachon qilingan bo'lsa xato bermaydi.
--
-- ISHLATISH:
--   psql "$DATABASE_URL" -f migrate-v9-tts-call-logs.sql
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tts_call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  til_kodi        TEXT NOT NULL,
  matn_uzunligi   INTEGER NOT NULL,
  muvaffaqiyatli  BOOLEAN NOT NULL DEFAULT true,
  xato_matni      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tts_call_logs_user_created
  ON tts_call_logs (user_id, created_at DESC);

DO $$
DECLARE
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'tts_call_logs'
  ) INTO v_table_exists;

  RAISE NOTICE '-------------------------------------------';
  RAISE NOTICE 'tts_call_logs jadvali mavjud: %', v_table_exists;
  RAISE NOTICE '-------------------------------------------';
END $$;

COMMIT;
