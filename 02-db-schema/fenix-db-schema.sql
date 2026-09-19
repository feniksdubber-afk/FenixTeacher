-- ============================================================
-- FenixTeacher — Production DB Schema (PostgreSQL 15+)
-- Bosqich 1-2 uchun to'liq, Bosqich 3 (EE-LL: Knowledge Graph,
-- Mastery Engine) uchun forward-compatible qilib loyihalangan.
-- ============================================================

-- Barcha jadvallarda: created_at / updated_at standart,
-- soft-delete kerak bo'lgan joylarda deleted_at (nullable).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ============================================================
-- 1. USERS & PROFIL
-- ============================================================

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id         BIGINT NOT NULL,
  telegram_username   TEXT,
  ism                 TEXT NOT NULL,
  joriy_daraja        TEXT NOT NULL DEFAULT 'A1'
                        CHECK (joriy_daraja IN ('A1','A2','B1','B2','C1','C2')),
  streak_kun          INTEGER NOT NULL DEFAULT 0,
  streak_oxirgi_sana  DATE,
  ustoz_qattiqqolligi INTEGER NOT NULL DEFAULT 3
                        CHECK (ustoz_qattiqqolligi BETWEEN 1 AND 5),
  -- Bosqich 3 uchun forward-compat: session boundary aniqlash uchun
  vaqt_zonasi         TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  royxatdan_otgan_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  oxirgi_faollik_at   TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_users_telegram_id UNIQUE (telegram_id)
);
CREATE INDEX idx_users_telegram_id ON users (telegram_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------

CREATE TABLE learner_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id                 UUID, -- FK courses(id) — pastda qo'shiladi (forward ref)
  kuchli_tomonlar           JSONB NOT NULL DEFAULT '[]',
    -- [{ "mavzu": "Perfekt", "score": 0.9, "updated_at": "..." }]
  zaif_tomonlar             JSONB NOT NULL DEFAULT '[]',
    -- xuddi shu struktura
  doimiy_xato_pattern       JSONB NOT NULL DEFAULT '{}',
    -- { "dativ_akkuzativ": { "count": 14, "last_seen": "...", "root_cause_id": null } }
  ogrenish_uslubi_taxmin    TEXT NOT NULL DEFAULT 'aniqlanmagan'
                              CHECK (ogrenish_uslubi_taxmin IN
                                ('vizual','audio','yozma','aniqlanmagan')),
  -- Bosqich 3 (JJ — Teaching Strategy Memory) uchun forward-compat ustun:
  samarali_tushuntirish_uslubi JSONB NOT NULL DEFAULT '{}',
    -- { "qoida": 0.4, "misol": 0.7, "dialog": 0.8 } — samaradorlik skorlari
  yangilanish_chastotasi_kunlik BOOLEAN NOT NULL DEFAULT true,
    -- true = kunlik jamlanma, false = har mashqdan keyin real-time
  oxirgi_yangilangan_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_learner_profile_user_course UNIQUE (user_id, course_id)
);
CREATE INDEX idx_learner_profiles_user ON learner_profiles (user_id);

-- ============================================================
-- 2. BO'LIM / KURS / KITOB / BOB
-- ============================================================

CREATE TABLE courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  til_nomi     TEXT NOT NULL,          -- "Nemis tili"
  til_kodi     TEXT NOT NULL,          -- ISO 639-1: "de"
  holati       TEXT NOT NULL DEFAULT 'faol'
                 CHECK (holati IN ('faol','pauza','yakunlangan','arxivlangan')),
  maqsad       TEXT,                    -- I: "sertifikat" / "ko'chish" / "ish" / null
  maqsad_sana  DATE,                    -- masalan Goethe imtihon sanasi (P uchun)
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_courses_user ON courses (user_id) WHERE deleted_at IS NULL;

ALTER TABLE learner_profiles
  ADD CONSTRAINT fk_learner_profiles_course
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;

-- ------------------------------------------------------------

CREATE TABLE books (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  nomi              TEXT NOT NULL,               -- "Aspekte neu B1 plus"
  turi              TEXT NOT NULL
                      CHECK (turi IN ('lehrbuch','arbeitsbuch','audio','qoshimcha')),
  fayl_yoli         TEXT NOT NULL,                -- storage path/URL
  fayl_hash         TEXT,                          -- duplikat aniqlash uchun (sha256)
  boglangan_kitob_id UUID REFERENCES books(id) ON DELETE SET NULL,
                      -- Lehrbuch <-> Arbeitsbuch bog'lanishi
  manba             TEXT NOT NULL DEFAULT 'yuklangan'
                      CHECK (manba IN ('yuklangan','internet','telegram_kanal')),
  qayta_ishlash_holati TEXT NOT NULL DEFAULT 'kutilmoqda'
                      CHECK (qayta_ishlash_holati IN
                        ('kutilmoqda','jarayonda','tayyor','xato')),
  qayta_ishlash_xatosi TEXT,             -- xato bo'lsa log matni
  sahifalar_render_holati TEXT NOT NULL DEFAULT 'yoq'
                      CHECK (sahifalar_render_holati IN ('yoq','jarayonda','tayyor','xato')),
                      -- (v14) PDF-viewer uchun sahifalarni JPEG'ga render qilish holati
  sahifalar_soni    INTEGER,            -- (v14) render tugagach to'ldiriladi
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_course ON books (course_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_books_linked ON books (boglangan_kitob_id);

-- ------------------------------------------------------------

CREATE TABLE chapters (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id        UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  nomi           TEXT,                   -- "Kapitel 4 — Beruf und Alltag"
  matn           TEXT,                   -- ajratilgan toza matn
  sahifa_boshi   INTEGER,
  sahifa_oxiri   INTEGER,
  tartib_raqami  INTEGER NOT NULL,
  bounding_boxes JSONB,                  -- [{ "word": "..", "page": 3, "x":.., "y":.., "w":.., "h":.. }]
  audio_book_id  UUID REFERENCES books(id) ON DELETE SET NULL,
                  -- tegishli Hörverstehen audio (agar bor bo'lsa)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_chapters_book_order UNIQUE (book_id, tartib_raqami)
);
CREATE INDEX idx_chapters_book ON chapters (book_id);

-- ------------------------------------------------------------
-- book_exercises: darslikdan avtomatik ajratilgan mashqlar (extractor
-- natijasi). `chapters.matn` pipeline'idan MUSTAQIL — unga tegmaydi.
-- Asosiy printsip: xom_matn o'zgarmaydi; ishonchsiz aniqlash
-- o'chirilmaydi, needs_review=true bilan belgilanadi. (migrate-v10)
-- ------------------------------------------------------------

CREATE TABLE book_exercises (
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
  image_r2_key           TEXT,                   -- (v13) sahifa bo'lagi JPEG, R2 kaliti; NULL = hali yo'q
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_book_exercises_page_order
    UNIQUE (book_id, page_physical, reading_order_position)
);
-- Lösungen bog'lash kaliti (rejalashtirilgan): (chapter_id, exercise_number) —
-- `id` emas, chunki qayta-extraction'da id o'zgaradi.
CREATE INDEX idx_book_exercises_chapter ON book_exercises (chapter_id, exercise_number);
CREATE INDEX idx_book_exercises_review ON book_exercises (book_id) WHERE needs_review;

-- ------------------------------------------------------------
-- book_pages: to'liq PDF-viewer uchun, kitobning HAR bir sahifasi
-- JPEG sifatida (v14). book_exercises.image_r2_key'dan MUSTAQIL —
-- u yerda faqat mashqqa tegishli kesma, bu yerda to'liq sahifa.
-- ------------------------------------------------------------

CREATE TABLE book_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id           UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_physical     INTEGER NOT NULL,
  image_r2_key      TEXT NOT NULL,
  width_px          INTEGER NOT NULL,
  height_px         INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_book_pages_book_page UNIQUE (book_id, page_physical)
);
CREATE INDEX idx_book_pages_book ON book_pages (book_id, page_physical);

-- ============================================================
-- 3. SO'Z BOYLIGI (Vocabulary + SM-2)
-- ============================================================

CREATE TABLE words (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id       UUID REFERENCES chapters(id) ON DELETE SET NULL,
  soz              TEXT NOT NULL,
  tarjima          TEXT NOT NULL,
  soz_turi         TEXT,                 -- "Nomen/Verb/Adjektiv" va h.k.
  -- SM-2 maydonlari:
  interval_kun     INTEGER NOT NULL DEFAULT 1,
  ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.50,
  takrorlar_soni   INTEGER NOT NULL DEFAULT 0,
  next_review_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O passiv/faol lug'at farqi uchun:
  faol_yoki_passiv TEXT NOT NULL DEFAULT 'passiv'
                     CHECK (faol_yoki_passiv IN ('passiv','faol')),
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_words_user_course_soz UNIQUE (user_id, course_id, soz)
);
CREATE INDEX idx_words_review_queue ON words (user_id, next_review_at)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 4. MASHQLAR VA BAHOLASH
-- ============================================================

CREATE TABLE exercises (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id             UUID REFERENCES chapters(id) ON DELETE SET NULL,
  turi                   TEXT NOT NULL
                           CHECK (turi IN
                             ('tanlov','boshliq_toldirish','tarjima','gap_tuzish',
                              'listening','reading','writing','speaking',
                              'error_correction','teach_back','role_play')),
  savol                  TEXT NOT NULL,
  togri_javob            TEXT,
  foydalanuvchi_javobi   TEXT,
  mavzu                  TEXT,            -- masalan "Perfekt", "Dativ/Akkusativ" — error_bank/learner_profile bog'lash uchun
  fenix_fikri            TEXT,            -- AI tekshiruvidan keyingi qisqa fikr-mulohaza (foydalanuvchiga ko'rsatiladi)
  natija                 TEXT
                           CHECK (natija IN ('togri','notogri','qisman','baholanmagan')),
  -- E — ko'p qirrali baholash:
  baholash_grammatika    NUMERIC(3,2),   -- 0.00–1.00
  baholash_tabiiylik     NUMERIC(3,2),
  baholash_lugat_boyligi NUMERIC(3,2),
  -- L — javob tezligi:
  javob_boshlanish_at    TIMESTAMPTZ,
  javob_yuborilgan_at    TIMESTAMPTZ,
  javob_tezligi_ms       INTEGER,
  -- N — interleaving belgisi:
  interleaved_mi         BOOLEAN NOT NULL DEFAULT false,
  -- v11: darslikdan ajratilgan haqiqiy mashq bilan bog'lanish (AI
  -- o'zi tuzgan mashqlarda NULL).
  book_exercise_id       UUID REFERENCES book_exercises(id) ON DELETE SET NULL,
  -- v12: qaysi dars-sessiyaga va bosqichga tegishli.
  lesson_session_id      UUID, -- FK lesson_sessions'ga pastda qo'shiladi (jadval tartibi uchun)
  dars_bosqichi          TEXT
                           CHECK (dars_bosqichi IN
                             ('isinish','tushuntirish','amaliyot','qayta_tushuntirish')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercises_user_created ON exercises (user_id, created_at DESC);
CREATE INDEX idx_exercises_chapter ON exercises (chapter_id);
CREATE UNIQUE INDEX uq_exercises_book_exercise
  ON exercises (book_exercise_id) WHERE book_exercise_id IS NOT NULL;
CREATE INDEX idx_exercises_book_exercise ON exercises (book_exercise_id);

-- v12: lesson_sessions — chinakam "dars" tuzilishi (4 bosqich):
-- isinish → tushuntirish → amaliyot ⇄ qayta_tushuntirish → yakun.
CREATE TABLE lesson_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id                UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  holat                     TEXT NOT NULL DEFAULT 'isinish'
                             CHECK (holat IN
                               ('isinish','tushuntirish','amaliyot','qayta_tushuntirish','yakunlandi')),
  tushuntirish_matni        TEXT,
  joriy_mavzu               TEXT,
  ketma_ket_notogri_soni    INTEGER NOT NULL DEFAULT 0,
  qayta_tushuntirilgan_mavzular TEXT[] NOT NULL DEFAULT '{}',
  mashqlar_soni             INTEGER NOT NULL DEFAULT 0,
  xulosa_matni              TEXT,
  boshlangan_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  tugagan_at                TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_lesson_sessions_one_active
  ON lesson_sessions (user_id, chapter_id) WHERE tugagan_at IS NULL;
CREATE INDEX idx_lesson_sessions_user ON lesson_sessions (user_id, chapter_id, boshlangan_at DESC);

ALTER TABLE exercises
  ADD CONSTRAINT fk_exercises_lesson_session
  FOREIGN KEY (lesson_session_id) REFERENCES lesson_sessions(id) ON DELETE SET NULL;
CREATE INDEX idx_exercises_lesson_session ON exercises (lesson_session_id);

-- ------------------------------------------------------------

CREATE TABLE error_bank (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id          UUID REFERENCES exercises(id) ON DELETE SET NULL,
  xato_matni           TEXT NOT NULL,
  sabab_taxmini        TEXT
                         CHECK (sabab_taxmini IN
                           ('ona_tili_tasiri','notogri_umumlashtirish','etibirsizlik','aniqlanmagan')),
  -- KK (Bosqich 3) uchun forward-compat: root-cause klasterlash
  root_cause_cluster_id UUID,           -- Bosqich 3'da error_clusters(id) ga FK bo'ladi
  takrorlanish_soni    INTEGER NOT NULL DEFAULT 1,
  qayta_korsatish_at   TIMESTAMPTZ,      -- SM-2 uslubida qayta ko'rsatish
  javob_tezligi_ms     INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_error_bank_user ON error_bank (user_id, created_at DESC);
CREATE INDEX idx_error_bank_review_queue ON error_bank (user_id, qayta_korsatish_at);

-- ------------------------------------------------------------

CREATE TABLE exercise_discussions (  -- F: "Nega?" mini-suhbat
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id  UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xabar        TEXT NOT NULL,
  kim_yozgan   TEXT NOT NULL CHECK (kim_yozgan IN ('user','fenix')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercise_discussions_exercise ON exercise_discussions (exercise_id, created_at);

-- ============================================================
-- 5. FAOLLIK KUZATUVI (Passiv monitoring)
-- ============================================================

CREATE TABLE activity_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turi         TEXT NOT NULL,   -- "sahifa_ochish","tugma_bosish","mashq_bajarish","sessiya_boshi","sessiya_oxiri"
  metadata     JSONB NOT NULL DEFAULT '{}',
  davomiyligi_ms INTEGER,
  vaqt         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Hozircha 1 foydalanuvchi uchun oddiy jadval yetarli. Kelajakda
-- foydalanuvchilar soni oshsa, oylik partition (masalan
-- activity_events_2026_09) qo'shish mumkin — hozircha shart emas.
CREATE INDEX idx_activity_events_user_vaqt ON activity_events (user_id, vaqt DESC);

-- ============================================================
-- 6. PROGRESS
-- ============================================================

CREATE TABLE user_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id         UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  chapter_id        UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  foiz_bajarilgan   NUMERIC(5,2) NOT NULL DEFAULT 0
                      CHECK (foiz_bajarilgan BETWEEN 0 AND 100),
  -- FF (Bosqich 3) uchun forward-compat mastery ustunlari:
  mastery_bosqichi  TEXT NOT NULL DEFAULT 'recognition'
                      CHECK (mastery_bosqichi IN
                        ('recognition','controlled','recall','translation',
                         'free_writing','conversation','real_time')),
  boshlangan_at     TIMESTAMPTZ,
  yakunlangan_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_user_progress UNIQUE (user_id, chapter_id)
);
CREATE INDEX idx_user_progress_user_course ON user_progress (user_id, course_id);

-- ------------------------------------------------------------

CREATE TABLE weekly_reports (  -- X: haftalik shartnoma/hisobot
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hafta_boshi         DATE NOT NULL,
  majburiyat          JSONB,        -- hafta boshida tuzilgan reja
  natija_xulosa       TEXT,          -- hafta oxiri Fenix xulosasi
  vaqt_sarflangan_daq INTEGER,
  mustahkam_mavzular  JSONB DEFAULT '[]',
  zaif_mavzular       JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_weekly_reports_user_course_week UNIQUE (user_id, course_id, hafta_boshi)
);

-- ============================================================
-- 7. TASHQI MATERIAL (Z, AA, BB, CC, DD)
-- ============================================================

CREATE TABLE external_content_log (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id                 UUID REFERENCES courses(id) ON DELETE SET NULL,
  manba                     TEXT NOT NULL CHECK (manba IN ('internet','telegram')),
  manba_havolasi            TEXT NOT NULL,
  holati                    TEXT NOT NULL DEFAULT 'taklif_qilingan'
                              CHECK (holati IN ('taklif_qilingan','tasdiqlangan','rad_etilgan')),
  mualliflik_huquqi_ogohlantirishi BOOLEAN NOT NULL DEFAULT false,
  ai_tasnif                 JSONB,   -- { "turi":"pdf","mavzu_taxmini":"..","daraja_taxmini":"B1" }
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  hal_qilingan_at            TIMESTAMPTZ
);
CREATE INDEX idx_external_content_user ON external_content_log (user_id, created_at DESC);

-- ============================================================
-- 8. AI QO'NG'IROQLARI LOGI (narx nazorati + xatoliklarni kuzatish uchun)
-- ============================================================

CREATE TABLE ai_call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  model           TEXT NOT NULL,          -- "claude-sonnet-4-6" / "claude-haiku-..."
  maqsad          TEXT NOT NULL,          -- "tushuntirish","mashq_generatsiya","tekshirish","tasniflash",...
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  narxi_usd       NUMERIC(8,5),
  muvaffaqiyatli  BOOLEAN NOT NULL DEFAULT true,
  xato_matni      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_call_logs_user_created ON ai_call_logs (user_id, created_at DESC);

-- ------------------------------------------------------------
-- 8.1 TTS QO'NG'IROQLARI LOGI
-- ------------------------------------------------------------
-- FIX (#12): avval TTS chaqiruvlari HECH QAYERDA hisobga
-- olinmasdi — Claude chaqiruvlari `ai_call_logs`ga yozilib narx
-- nazorat qilinardi, lekin TTS (Edge TTS, o'zi bepul bo'lsa-da)
-- uchun na log, na rate-limit bor edi: har qanday login qilgan
-- foydalanuvchi cheksiz miqdorda so'rov yuborishi mumkin edi.
-- Rate-limiting'ning o'zi (05-node-api/src/routes/tts.ts) hozircha
-- oddiy in-memory sliding-window bilan amalga oshirilgan (Bosqich 1
-- uchun yetarli — ko'p instansli deploy'da Redis'ga o'tish kerak
-- bo'ladi), lekin har bir urinish shu jadvalga ham yoziladi —
-- keyinchalik suiiste'molni tahlil qilish/kuzatish uchun.
CREATE TABLE tts_call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  til_kodi        TEXT NOT NULL,
  matn_uzunligi   INTEGER NOT NULL,       -- belgilar soni (matnning o'zi saqlanmaydi)
  muvaffaqiyatli  BOOLEAN NOT NULL DEFAULT true,
  xato_matni      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tts_call_logs_user_created ON tts_call_logs (user_id, created_at DESC);

-- ============================================================
-- 9. AI TAKLIFLARI (AI-proposal + bir tugmali tasdiqlash oqimi)
-- ============================================================

CREATE TABLE ai_suggestions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turi              TEXT NOT NULL
                      CHECK (turi IN ('matn','dizayn','layout','logika','db_schema')),
  xavf_darajasi     TEXT NOT NULL DEFAULT 'xavfsiz'
                      CHECK (xavf_darajasi IN ('xavfsiz','xavfli')),
                      -- xavfsiz: matn/rang/spacing/tugma joylashuvi
                      -- xavfli: DB schema, to'lov, auth — albatta tasdiqlash shart
  sabab             TEXT NOT NULL,       -- "Bu tugma 80% hollarda bosilmayapti"
  asos_statistika   JSONB,               -- taklifga asos bo'lgan metrikalar
  diff_matni        TEXT NOT NULL,       -- git diff/patch
  preview_url        TEXT,                -- preview screenshot/link
  holati            TEXT NOT NULL DEFAULT 'kutilmoqda'
                      CHECK (holati IN ('kutilmoqda','tasdiqlangan','rad_etilgan','deploy_qilindi','xato')),
  telegram_message_id BIGINT,             -- tasdiqlash tugmasi joylashgan xabar
  commit_hash       TEXT,                 -- deploy qilingandan keyin to'ldiriladi
  xato_matni        TEXT,                 -- deploy muvaffaqiyatsiz bo'lsa
  qaror_qabul_at    TIMESTAMPTZ,
  deploy_qilingan_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_suggestions_holati ON ai_suggestions (holati, created_at DESC);

-- ============================================================
-- - Barcha "user_id" FK'lar ON DELETE CASCADE — foydalanuvchi o'chirilsa,
--   shaxsiy ma'lumotlari ham o'chadi (GDPR-uslub tozalik).
-- - "books"/"courses" kabi kontent jadvallari soft-delete (deleted_at) —
--   tasodifiy o'chirishdan qaytarish imkoni uchun.
-- - "activity_events" va "ai_call_logs" — append-only, hech qachon UPDATE
--   qilinmaydi; hozircha 1 foydalanuvchi uchun partition shart emas,
--   foydalanuvchilar soni sezilarli oshsa qo'shiladi.
-- - Bosqich 3 (EE-LL) uchun kelajakda qo'shiladigan jadvallar:
--     knowledge_nodes, knowledge_edges (EE)
--     mastery_snapshots (FF)
--     error_clusters (KK — error_bank.root_cause_cluster_id shu yerga FK bo'ladi)
--     teaching_strategy_log (JJ)
--   Yuqoridagi ustunlar (root_cause_cluster_id, mastery_bosqichi,
--   samarali_tushuntirish_uslubi) shu jadvallar bilan bog'lanish uchun
--   oldindan tayyorlab qo'yilgan.
-- ============================================================
