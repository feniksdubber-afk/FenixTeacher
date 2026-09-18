# v8 → v8.2 — o'zgarishlar jurnali

Bu fayl shu zip'ga v8'dan keyin kiritilgan tuzatishlarni umumlashtiradi.
Har bir fayldagi tafsilotlar o'sha faylning ichidagi izohlarda ("v8.1
tuzatish" / "FIX v8.2" belgilari bilan) bor.

## v8.1

- **`05-node-api/src/routes/exercises.ts`**
  - Interleaving: `pickInterleavedCandidate`ga `chapter.nomi` uzatiladi (avval `null` edi)
  - Javob izolyatsiyasi: `POST /exercises/:id/answer`da asosiy baholashdan
    keyingi yon-effektlar (error_bank, learnerProfile, user_progress,
    teach-back) endi alohida try/catch'larda — biri qulasa ham
    foydalanuvchi natijasini ko'radi
  - `streak_kun` endi har muvaffaqiyatli javobdan keyin, foydalanuvchi
    vaqt zonasiga nisbatan yangilanadi
- **`05-node-api/src/services/tts.ts`**
  - `uz-UZ-Standard-A` olib tashlandi (Google bu tilni qo'llamaydi);
    noma'lum til kodida ogohlantirish bilan standart (de) ovozga o'tadi
  - In-memory cache qo'shildi (500 yozuvgacha) — bir xil (til, matn)
    uchun Google'ga qayta so'rov ketmaydi
- **`05-node-api/.env.example`** — `GOOGLE_TTS_API_KEY` qatori qo'shildi
- **`docker-compose.yml`** — `node-api` xizmatiga `GOOGLE_TTS_API_KEY`
  o'tkazilishi qo'shildi (avval `.env`da kalit bo'lsa ham konteyner
  ichiga umuman uzatilmasdi — TTS baribir ishlamas edi)
- **`06-mini-app/src/api/fenix.ts`** — `playTts` endi `data:` URI o'rniga
  Blob URL ishlatadi (iOS Safari/Telegram WebApp'da `data:` audio
  bloklanishi mumkin edi)
- **`02-db-schema/migrations/migrate-v8-weekly-reports.sql`** — faqat
  v8'dan OLDINGI sxemadan kelayotganlar uchun (`weekly_reports`ga
  `course_id` qo'shish + UNIQUE constraint tuzatish). Yangi
  o'rnatmada kerak emas.

## v8.2

- **`05-node-api/src/routes/reports.ts`** — generatsiya logikasi
  `generateWeeklyReportForCourse(userId, courseId)` funksiyasiga
  ajratildi (route va cron bir xil koddan foydalanishi uchun)
- **`05-node-api/src/routes/internal.ts`** — yangi
  `POST /internal/weekly-reports/generate-all` (internalAuth bilan
  himoyalangan): barcha faol kurslar uchun haftalik hisobot yaratadi,
  har biri mustaqil (bittasi xato bersa qolganlar davom etadi)
- **`hetzner-scripts/trigger-weekly-reports.sh`** — yangi fayl.
  Serverning o'z `cron`i orqali haftada bir marta yuqoridagi
  endpointga `curl` yuboradi. O'rnatish uchun
  `hetzner-scripts/README.md`ga qarang.

## Hali qilinmagan (Bosqich 1)

- STT (Whisper) — ovozli javob
- Telegram DD-1 — kunlik xabar
- Live Reader / tap-to-translate
- `comprehensible_input`
