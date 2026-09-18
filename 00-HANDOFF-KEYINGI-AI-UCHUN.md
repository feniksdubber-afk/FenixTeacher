# FenixTeacher — Handoff hujjati (keyingi AI uchun)

> **YANGILANDI:** bu fayl endi `FenixTeacher-v5.zip` holatini aks
> ettiradi (avvalgi versiya faqat DB schema + PDF-service bosqichida
> to'xtagan edi — o'sha eski holat `FenixTeacher-TOLIQ-HANDOFF.zip`da
> saqlanib qolgan, lekin endi ESKIRGAN, ishlatilmasin). Shundan beri
> qo'shilgan: Node API, React Mini App, aiogram bot qatlami, va
> PDF-service'dagi ikkita muhim generalizatsiya (pastga qarang, 7-bo'lim).
> Iltimos shu hujjatni to'liq o'qib chiqing, keyin foydalanuvchi
> (Shohruxxon) bilan davom eting.

---

## 1. Loyiha nima

**FenixTeacher** — Telegram Mini App (React) ko'rinishidagi AI asosidagi
til o'rganish platformasi, bot: `@FenixDeutschBot`. Hozircha faqat
Shohruxxonning yaqinlaridan biri (Nodira) uchun shaxsiy foydalanish
mo'ljallangan, boshqa foydalanuvchilar yo'q.

Bot "shaxsi" — **Fenix**: qattiqqo'l, adolatli, adaptiv AI-ustoz.

Bu loyiha Shohruxxonning boshqa mahsuloti — AfsonaMovieBot ("Afsona TV",
Telegram film/serial striming ekotizimi) dan **mustaqil va alohida**,
lekin ba'zi texnik infratuzilma (server, Pyrogram tajribasi) umumiy.

**Muhim kontekst foydalanuvchi haqida:**
- Shohruxxon — mobil telefondan ishlaydi, bu texnik qarorlarga ta'sir qiladi
- O'zbek tilida so'zlashadi/yozadi — javoblar o'zbek tilida bo'lishi kerak
- Indie developer, Telegram-asosidagi mahsulotlar quradi

---

## 2. Asosiy kontseptsiya — "Bo'lim" tizimi

Har bir til bo'limi (course) mustaqil materiallar ombori, AI-tuzilgan dars
rejasi va darslarga ega. Bitta foydalanuvchi bir nechta til/bo'limga ega
bo'lishi mumkin.

## 3. Texnik stek (kelishilgan)

- **Node API** (Express/TypeScript) — asosiy mantiq, auth, Claude API
  chaqiruvlari, context builder
- **Python PDF-service** (FastAPI, alohida mikroservis) — PDF'dan matn/OCR
  ajratish
- **Python Telegram-fetch mikroservis** (Pyrogram/Telethon) — Telegram
  kanallardan material yig'ish
- **React Mini App** — frontend, tungi/qorong'u dizayn
- **AI:** Anthropic Claude API — Sonnet (chuqur sifat) + Haiku (tez/arzon)
  hybrid
- **TTS:** Google Cloud Text-to-Speech
- **STT:** Whisper (OpenAI)
- **Hosting:** Hetzner (Shohruxxonning mavjud serveri)
- **DB:** PostgreSQL 15+

Birinchi sinov kitobi: **Aspekte neu B1 plus** (Lehrbuch + Arbeitsbuch).

---

## 4. Bosqichlash (3 bosqich — YAKUNIY QAROR)

### Bosqich 1 — Fenix MVP+
Maqsad: bitta odam Fenix bilan real til o'rganishni boshlay olishi.
PDF→dars→mashq, Live Reader+tap-to-translate, Sonnet/Haiku hybrid,
learner profile, error bank, SM-2, interleaving, teach-back, "Nega?"
mini-dialog, comprehensible input, haftalik shartnoma, Telegram DD-1,
progress+vocabulary, TTS.

### Bosqich 2 — Fenix Teacher
Maqsad: to'liq individual tutor. Speaking, writing, pronunciation,
exam mode, diagnostika, chuqur personalizatsiya, activity monitoring,
proaktiv intervention, internet materiallari, Telegram DD-2, sifat
nazorati, bir nechta til, kuchliroq vocabulary, haftalik hisobot.

### Bosqich 3 — Fenix Brain (EE—LL, uzoq muddatli)
"AI tutor" emas — "Learning Engine". Claude — Fenixning o'zi emas, Fenix
foydalanadigan miya vositasi. Haqiqiy "aql" quyidagilarda:
- **EE** Knowledge Graph — bilim bog'liqliklari grafigi
- **FF** Mastery Engine — 7 bosqichli mastery (recognition→real-time usage)
- **GG** Fenix Decision Engine — "hozir nima kerak?"
- **HH** Adaptive Curriculum Engine
- **II** Diagnostic Engine — "bilaman" degan gapga ko'r-ko'rona ishonmaydi
- **JJ** Teaching Strategy Memory — qaysi tushuntirish uslubi ishlayotganini kuzatadi
- **KK** Misconception/Root-Cause Engine — tarqoq xatolarni bitta ildizga bog'laydi
- **LL** Experiment & Self-Optimization Engine

**MUHIM PRINSIP:** Bosqich 1-2'da EE-LL qurilmaydi, LEKIN DB va event
arxitekturasi ularning kelajakdagi talablarini oldindan hisobga oladi
(qayta yozishga to'g'ri kelmasligi uchun). DB schema'da bu joylar
izohlangan (pastga qarang).

**Dizayn printsipi (muhim):** Fenixning maqsadi foydalanuvchini app'da
ko'proq vaqt ushlab turish emas, balki tilni samarali o'rgatish. Agar
maqsadga erta erishilsa yoki sessiya samarasiz ketayotgan bo'lsa, Fenix
buni aytib sessiyani to'xtatishni taklif qilishi kerak.

---

## 5. AI o'zi Mini App/dizaynni boshqarishi — kelishilgan model

Foydalanuvchi butun boshqaruvni (hatto dizaynni ham) AI'ga berishni
xohladi. To'liq avtonom emas — **"AI-taklif + bir tugmali tasdiqlash"**
modeli tanlandi:

```
Kuzatuv (activity_events) → Tahlil agenti (haftalik) →
Claude taklif tayyorlaydi (diff+preview) →
Telegram'da tasdiqlash kartasi (✅/❌) →
Tasdiqlansa: avtomatik commit→CI build/test→deploy (xato bo'lsa rollback)
```

Bunga mos `ai_suggestions` jadvali DB schema'ga qo'shilgan. To'liq oqim
kodi (`fenix-ai-suggestion-flow.py`) — skeleton/pseudocode, real
implementatsiya emas, lekin arxitektura aniq.

---

## 6. DB Schema — holati: PRODUCTION-READY (Bosqich 1-2 uchun)

Fayl: `fenix-db-schema.sql` — to'liq PostgreSQL DDL, quyidagilar bilan:
- Barcha jadvallar: users, learner_profiles, courses, books, chapters,
  words (SM-2), exercises, error_bank, exercise_discussions,
  activity_events, user_progress, weekly_reports,
  external_content_log, ai_call_logs, ai_suggestions
- Har birida: field/type/nullable/default/FK/unique/index/timestamp
- Bosqich 3 uchun forward-compat ustunlar tayyorlab qo'yilgan:
  `error_bank.root_cause_cluster_id`, `user_progress.mastery_bosqichi`,
  `learner_profiles.samarali_tushuntirish_uslubi`
- **Kelishilgan qarorlar:** learner_profile har bo'lim (course) uchun
  alohida; activity_events hozircha partition qilinmagan (1 foydalanuvchi
  uchun shart emas)

**Keyingi qadam DB bo'yicha:** hali real Postgres serverida ishga
tushirilmagan — buni sinab ko'rish kerak (Hetzner serverida).

---

## 7. Python PDF-service — holati: ISHLAYDI, SINOVDAN O'TDI

To'liq FastAPI mikroservis yozildi va **haqiqiy Aspekte B1 plus PDF**
faylida (194 sahifa) sinovdan muvaffaqiyatli o'tdi:
- 65 ta bob, 10 ta unit to'g'ri aniqlandi
- 0 xato, ~62 soniyada qayta ishlandi

### Fayllar (`04-pdf-service/app/` ichida):
- **`detector.py`** — sahifa turini aniqlaydi (vector_text/ocr_text/
  scanned_no_text). Aspekte B1 — butunlay `ocr_text` (Adobe Paper Capture
  OCR qatlamli skan)
- **`text_extractor.py`** — matn+bounding box chiqaradi (0-1 normallashgan,
  tap-to-translate uchun). Footer (sotuvchi izi) va OCR-ikonka-artefaktlarini
  filtrlaydi (~95%+ toza, 2-5% shovqin hali qoladi — lug'at-tekshiruv bilan
  yaxshilanishi mumkin, Bosqich 2 vazifasi)
- **`chapter_splitter.py`** — MUNDARIJA-ASOSLI strategiya (matnda "Kapitel N"
  qidirish ISHONCHSIZ — faqat ilova/indeksda uchraydi). **YANGILANDI:**
  unit'larga guruhlash endi qo'lda kodlanmagan — `ai_structurer.py`
  orqali Claude Haiku mundarija matnini o'qib, unit chegaralarini o'zi
  aniqlaydi (`infer_units`, Node API'ning `POST /internal/ai/infer-units`
  orqali chaqiriladi). Node topilmasa/xato bo'lsa — fallback: hammasi
  bitta unit.
- **`json_builder.py`** — hammasini birlashtiradi. **YANGILANDI:** qo'lda
  tekshiriladigan `PRINTED_TO_PHYSICAL_OFFSET` olib tashlandi — endi
  `detect_page_offset()` sahifa footer'idagi chop etilgan raqamni
  avtomatik o'qib, jismoniy indeks bilan solishtiradi (bir nechta
  sahifada, ko'pchilik ovoz bilan xatoga chidamli). Yangi kitob
  qo'shilganda hech qanday qo'lda sozlash shart emas.
- **`ai_structurer.py`** (yangi) — yuqoridagi unit-aniqlash mantig'i,
  Node API bilan aloqa qiladi.
- **`main.py`** — FastAPI: `POST /process`, `GET /status/{job_id}`,
  `GET /health`. Background task orqali ishlaydi (in-memory job store —
  production'da Redis/DB bilan almashtirilishi kerak). Endi fayl lokal
  yo'l emas — R2 presigned GET URL sifatida keladi (Node API orqali).

### Bilib qo'yish kerak bo'lgan narsalar:
1. **PDF shifrlangan va nusxalash taqiqlangan** (copy:no) — rasmiy
   nashriyot cheklovi. Faqat **shaxsiy foydalanish** doirasida qolishi
   kerak, boshqa foydalanuvchilarga tarqatilmasligi kerak
2. Ba'zi stream'larda PDF xatoligi bor (`Missing 'endstream'`) — hozirgi
   kodda try/except bilan qoplangan, lekin boshqa kitoblarda ko'proq
   chiqishi mumkin
3. Kitobga xos qattiq kodlash endi umuman yo'q (unit'lar ham, offset
   ham avtomatik) — Aspekte B1 bilan qayta sinovdan o'tkazish hali
   qilinmagan (avvalgi hardcoded versiyada sinovdan o'tgan edi, yangi
   generalized versiyada emas) — **BU BIRINCHI TEKSHIRILISHI KERAK
   BO'LGAN NARSA** haqiqiy end-to-end sinovda.

---

## 7.5 Node API — holati: YOZILGAN, real serverda sinovdan o'TMAGAN

`05-node-api/` — Express+TypeScript, quyidagilar bilan:
- `middleware/telegramAuth.ts` — Mini App initData HMAC-SHA256 tekshiruvi
  (rasmiy Telegram algoritmi) + ichki mikroservislar uchun shared-secret
  auth (`internalAuth`)
- `routes/users.ts`, `courses.ts`, `upload.ts`, `books.ts`, `internal.ts`
- `services/claude.ts` — BARCHA Claude chaqiruvlari shu orqali o'tadi,
  `ai_call_logs`ga narx+natija yoziladi
- `services/r2.ts` — Cloudflare R2 presigned upload/download (fayl Node
  orqali oqmaydi — mobil tarmoqda katta PDF uchun muhim)
- `services/pdfService.ts` — PDF-service bilan polling orqali aloqa

**Bilib qo'yish kerak bo'lgan narsa:** `books.ts`dagi `POST /books`
PDF qayta ishlanishini **sinxron kutadi** (`waitForPdfJob`, timeout
10 daqiqa) — bitta foydalanuvchi uchun MVP darajasida yetarli, lekin
Express so'rovini uzoq band qiladi. Foydalanuvchi ko'paysa yoki UX
muhim bo'lsa — webhook/polling'ga (frontend'dan) o'tish kerak.

## 7.6 React Mini App — holati: YOZILGAN, build/deploy qilinmagan

`06-mini-app/` — Vite+React+TypeScript, sahifalar: `CoursesPage`
(bo'limlar ro'yxati+yaratish), `CoursePage` (kitoblar+PDF yuklash).
Telegram WebApp SDK'dan foydalanadi (`window.Telegram.WebApp`),
initData har so'rovga header sifatida qo'shiladi. Hali qurilmagan:
o'quv/suhbat ekrani (Fenix bilan darс), chunki Node API'da hali
mos endpoint yo'q (7.7'ga qarang). Dizayn — minimal, Telegram theme
o'zgaruvchilaridan foydalanadi (`--tg-theme-*`), "tungi/qorong'u
o'ziga xos dizayn" talabi hali to'liq bajarilmagan — bu ataylab
keyinga qoldirilgan (funksional qatlam birinchi).

## 7.7 Telegram bot (aiogram) — holati: YOZILGAN, minimal

`07-telegram-bot/` — atayin tor qamrovli: `/start` (Mini App tugmasi),
`/holat` (Node API health tekshiruvi), boshqa har qanday matnga
Mini App'ga yo'naltiruvchi javob. Long polling (webhook emas — sabab
kod izohida). Butun o'quv suhbati Mini App'da bo'lishi rejalashtirilgan,
bot faqat "eshik".

---

## 8. Hali qurilmagan narsalar (ishlab chiqish tartibida)

1. ~~DB schema~~ ✅ tayyor
2. ~~Python PDF-service~~ ✅ tayyor (generalized, Aspekte bilan qayta sinov kerak)
3. ~~Node API~~ ✅ yozilgan, real serverda sinalmagan
4. ~~React Mini App~~ ✅ yozilgan (bo'lim/kitob qismi), o'quv ekrani yo'q
5. ~~Telegram bot qatlami (aiogram)~~ ✅ minimal, "eshik" darajasida
6. **Fenixning birinchi haqiqiy "brain loop"i — KEYINGI ASOSIY ISH:**
   ```
   user action → result → error/progress → learner profile →
   context builder → Claude → Fenix response → new learning data
   ```
   ✅ **Yozildi** (`05-node-api/src/services/contextBuilder.ts`,
   `learnerProfile.ts`, `routes/exercises.ts`):
   - `POST /chapters/:chapterId/exercises` — bob matni + o'quvchi
     konteksti (kuchli/zaif tomonlar, doimiy xato pattern, eng ko'p
     takrorlangan xatolar) asosida Sonnet mashq tuzadi
   - `POST /exercises/:id/answer` — Sonnet javobni baholaydi (natija,
     fenix_fikri, 3 xil skor), `error_bank`ga yozadi, `learner_profiles`ni
     yangilaydi (`recordExerciseOutcome` — oddiy heuristika, Bosqich 3'da
     KK/FF bilan almashtiriladi)
   - `POST /exercises/:id/discuss` — "Nega?" mini-suhbat (Haiku, arzon —
     tez-tez chaqiriladi), `exercise_discussions`ga yozadi
   - `GET /exercises/:id` — sahifa qayta ochilganda holatni tiklash
   - `GET /books/:id/chapters` (books.ts'ga qo'shildi) — bob tanlash uchun
   - DB schema: `exercises`ga `mavzu` va `fenix_fikri` ustunlari qo'shildi
   - Mini App: `ChaptersPage.tsx`, `ExercisePage.tsx` (generatsiya → javob
     → baho → "Nega?" chat → keyingi mashq), `CoursePage.tsx`da tayyor
     kitob endi boblarga olib boradi

   **Hali qilinmagan qismi:** interleaving (N), teach-back/mini-dialog
   chuqurroq shakli, haftalik shartnoma (X), TTS. Real Claude API kaliti
   bilan hali sinalmagan (faqat kod darajasida yozilgan, aylantirib
   ko'rilmagan).

7bis. **SM-2 so'z boyligi + user_progress ulandi** (bundan oldingi
   sessiyada "qilindi" deb yozilgan edi, lekin AI limiti tugab, kodga
   kirmay qolgan ekan — bu sessiyada tekshirilib, haqiqatda ulandi):
   - `services/sm2.ts` — standart SM-2 algoritmi (`applySm2`)
   - `routes/words.ts` — 3 endpoint: `POST /courses/:id/words` (qo'lda
     so'z qo'shish), `GET /courses/:id/words/due` (takrorlash navbati),
     `POST /words/:id/review` (SM-2 bo'yicha baholash)
   - `index.ts`ga `wordsRouter` ulandi
   - `routes/exercises.ts`: mashq generatsiya promptiga `yangi_sozlar`
     (1-3 ta) so'raladi va `words` jadvaliga yoziladi; `POST
     /exercises/:id/answer`da endi `user_progress` ham yangilanadi
     (ESLATMA: bu **taxminiy evristika** — to'g'ri javob +8%, boshqa
     holat +2%, 100%da to'xtaydi; aniq "bob X ta mashqdan iborat" degan
     meyor hali yo'q, keyinroq aniqlashtirish kerak)
   - Mini App: `VocabPage.tsx` (flashcard uslubida SM-2 ko'rib chiqish),
     `CoursePage.tsx`dan tugma bilan ochiladi
   - **Hali sinalmagan** — real DB/API bilan aylantirib ko'rilmagan

7ter. **N (interleaving), R (teach-back chuqurlashtirish), X (haftalik
   hisobot), TTS to'liq qo'shildi** (shu sessiyada):
   - **N — Interleaving:** `services/contextBuilder.ts`da
     `pickInterleavedCandidate()` — `learner_profiles.zaif_tomonlar`
     va kam takrorlangan (`takrorlar_soni<3`) `words`dan tasodifiy
     bitta nomzod tanlaydi. `routes/exercises.ts`da mashq
     generatsiyasida ~25% ehtimol bilan (agar nomzod bo'lsa) shu
     eski mavzu/so'zga qaratilgan mashq tuziladi, `exercises.
     interleaved_mi=true` deb belgilanadi va frontendga
     `interleaved: true` qaytadi (ExercisePage'da "🔁 Takrorlash"
     belgisi ko'rinadi). ESLATMA: bu ehtimoliy (probabilistic)
     yondashuv — spetsifikatsiyadagi "~20-30%" talabini taxminan
     qondiradi, lekin aniq foiz nazorati yo'q (masalan oxirgi N ta
     mashqning aniq X foizi interleaved bo'lishini kafolatlamaydi).
   - **R — Teach-back chuqurlashtirish:** `teach_back` turi uchun
     baholash prompti endi grammatikaga emas, TUSHUNISH CHUQURLIGIGA
     qaratilgan. Baholashdan keyin avtomatik (Haiku bilan) BITTA
     kuzatuv/qarshi-misol savoli generatsiya qilinadi va
     `exercise_discussions`ga Fenix nomidan yoziladi — foydalanuvchi
     "Nega?" deb so'ramasa ham dialog o'zi boshlanadi. Frontendda
     `AnswerResult.teach_back_kuzatuv_savoli` orqali darhol suhbatga
     qo'shiladi.
   - **X — Haftalik hisobot:** yangi `routes/reports.ts` —
     `POST /courses/:id/weekly-report/generate` (shu haftaning
     `exercises`/`learner_profiles`dan statistikasini yig'ib, Sonnet
     orqali xulosa+keyingi hafta majburiyatini yozadi, `weekly_reports`ga
     upsert qiladi) va `GET /courses/:id/weekly-report` (oxirgisini
     o'qiydi). **DB SXEMA O'ZGARDI:** `weekly_reports`ga `course_id`
     ustuni qo'shildi (eski sxemada yo'q edi — bitta userda bir nechta
     kurs bo'lsa hisobot ajratilmagan bo'lardi), UNIQUE constraint
     endi `(user_id, course_id, hafta_boshi)`. Agar bazada eski
     jadval allaqachon bo'lsa, real migratsiya kerak (`ALTER TABLE
     weekly_reports ADD COLUMN course_id ...`), bu fayl faqat DDL'ni
     yangiladi. Mini App: `WeeklyReportPage.tsx`, `CoursePage`dan
     tugma bilan ochiladi.
   - **TTS:** yangi `services/tts.ts` (Google Cloud TTS REST API,
     `GOOGLE_TTS_API_KEY` kerak) va `routes/tts.ts` (`POST /tts`).
     Mini App: `VocabPage`dagi so'z kartochkasida 🔊 tugmasi
     (`playTts()` — base64 MP3'ni to'g'ridan-to'g'ri ijro etadi).
     **MUHIM — HALI SINALMAGAN:** bu muhitda Google Cloud kredensial
     yo'q, shuning uchun haqiqiy audio bilan bir marta ham
     tekshirilmagan — faqat Google'ning rasmiy REST hujjatiga asosan
     yozilgan. Ishga tushirishdan oldin haqiqiy `GOOGLE_TTS_API_KEY`
     bilan sinash SHART.
   - Barcha yangi/o'zgargan backend fayl `tsc --noEmit` bilan
     sintaksis/tur xatosiz ekani tekshirildi (real `node_modules`
     bo'lmagani uchun faqat express/pg turlariga oid "implicit any"
     ogohlantirishlari qoldi — bular eski fayllarda ham bir xil).

   **Hali qilinmagan/aniqlashtirish kerak bo'lgan qism:** `user_progress`
   evristikasi (7bis) hamon taxminiy; interleaving foizi qattiq
   nazoratsiz; weekly-report generatsiyasi cron bilan avtomatlashtirilmagan
   (hozircha faqat qo'lda/tugma bilan chaqiriladi); TTS sinalmagan.
7. Hetzner serverida real docker compose bilan ishga tushirish va
   to'liq zanjirni sinash (PDF yuklash → Mini App → bot)
8. Mini App'ning production build+Caddy orqali joylanishi (DEPLOY.md
   6-bo'limida yo'riqnoma bor, lekin hali bajarilmagan)
9. AI-suggestion oqimining real implementatsiyasi (hozir faqat skeleton)
10. Migratsiya tizimi, CI/CD, backup, monitoring (barchasi qo'lda/yo'q)

---

## 9. Fayllar ro'yxati (shu zip ichida)

```
00-HANDOFF-KEYINGI-AI-UCHUN.md          ← shu fayl
01-loyiha-hujjati/
  FenixTeacher-Toliq-Loyiha-Hujjati.md  ← to'liq loyiha spetsifikatsiyasi (14 bo'lim, ESKI — 12-bo'limdagi "hozirgi holat" endi noto'g'ri, shu handoff faylga ishoning)
02-db-schema/
  fenix-db-schema.sql                   ← to'liq PostgreSQL DDL
03-ai-suggestion-flow/
  fenix-ai-suggestion-flow.py           ← AI-taklif+tasdiqlash oqimi (skeleton)
04-pdf-service/                         ← FastAPI, generalized (kitobga xos qattiq kod yo'q)
05-node-api/                            ← Express+TS, yangi
06-mini-app/                            ← React+Vite, yangi
07-telegram-bot/                        ← aiogram, yangi, minimal
DEPLOY.md                               ← Hetzner deploy yo'riqnomasi (bot+mini-app bosqichlari bilan yangilangan)
docker-compose.yml                      ← postgres+pdf-service+node-api+telegram-bot
Caddyfile.snippet                       ← api + mini-app statik hosting bloklari
```

---

## 10. Foydalanuvchi bilan muloqot uslubi (muhim)

- O'zbek tilida yozing
- Shohruxxon texnik jihatdan bilimli — chuqur muhandislik tafsilotlarini
  tushunadi va qadrlaydi
- U halol, real cheklovlar va xatolarni ochiq aytishni qadrlaydi (oldingi
  suhbatda OCR shovqini, sahifa-offset xatosi kabi muammolar yashirilmadi,
  aksincha aniq tushuntirilib tuzatildi) — shu uslubni davom ettiring
- Ambitsiyalarini qo'llab-quvvatlang, lekin scope creep xavfi bo'lsa
  ochiq ayting (masalan EE-LL'ni MVP bilan birga qurish taklif qilinganda,
  bosqichlashtirish tavsiya qilindi va qabul qilindi)
- Ko'pincha qisqa tasdiqlovchi javoblar beradi ("aha", "ha") — bunday
  paytda eng mantiqiy keyingi qadamni tanlab davom eting, ortiqcha
  aniqlashtiruvchi savol bermang, agar chindan ham muhim tarmoqlanish
  nuqtasi bo'lmasa
- **MUHIM:** "qildim" deb yozishdan oldin kodni haqiqatan faylga
  yozganingizga va bog'laganingizga (masalan router `index.ts`ga
  ulanganiga) ishonch hosil qiling — bir marta AI limiti tugab,
  "user_progress + SM-2 ulandi" deb yozilgan-u, aslida kod loyihaga
  kirmay qolgan, keyingi sessiyada aniqlangan
