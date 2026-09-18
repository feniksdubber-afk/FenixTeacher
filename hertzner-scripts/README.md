# FenixTeacher v8.2 — Haftalik hisobot uchun cron (Hetzner)

Loyihadagi joylashuvga mos struktura:

```
fenix-v8.2-weekly-cron/
├── backend/
│   └── routes/
│       ├── reports.ts   → 05-node-api/src/routes/ (almashtiring)
│       └── internal.ts  → 05-node-api/src/routes/ (almashtiring)
└── hetzner/
    └── trigger-weekly-reports.sh  → serverga (masalan /opt/fenixteacher/scripts/)
```

## Nima o'zgardi

### `reports.ts`
Avval generatsiya logikasi to'g'ridan-to'g'ri
`POST /courses/:id/weekly-report/generate` route handleri ichida edi —
faqat foydalanuvchining o'zi Mini App orqali chaqirganda ishlardi.

Endi bu logika `generateWeeklyReportForCourse(userId, courseId)` deb
nomlangan alohida funksiyaga chiqarilgan. Route handler o'zi
o'zgarmadi (xuddi shu javoblar: 404/422/502/201) — u endi shu
funksiyani chaqiradi, xolos. Bu ajratish kerak edi, chunki endi bu
funksiyadan ikkinchi joy — cron endpoint — ham foydalanadi, kod
takrorlanmasligi uchun.

### `internal.ts`
Yangi endpoint qo'shildi: **`POST /internal/weekly-reports/generate-all`**
(`internalAuth` bilan himoyalangan — `X-Internal-Secret` header,
Telegram initData bilan aloqasi yo'q, DEPLOY.md'dagi boshqa ichki
endpointlar bilan bir xil naqsh). Bu:

1. Barcha faol (`deleted_at IS NULL`) kurs + foydalanuvchi juftligini oladi
2. Har biri uchun `generateWeeklyReportForCourse`ni alohida-alohida chaqiradi
3. Har bir kurs mustaqil: bittasida xato bo'lsa (masalan Claude
   vaqtincha ishlamasa) faqat log qilinadi va **keyingi kursga o'tiladi**
   — bitta foydalanuvchi butun cronni to'xtatmaydi
4. Yakunda hisobot qaytaradi: `{ jami_kurslar, yaratildi, malumot_yoq, xato, xato_tafsilotlari }`

`malumot_yoq` — bu hafta hech qanday mashq qilmagan foydalanuvchilar
uchun kutilgan holat (xato emas, oddiy statistika).

### `hetzner/trigger-weekly-reports.sh`
Node API allaqachon serverning o'zida, `127.0.0.1:4000`ga bog'langan
(DEPLOY.md, 4-band) — shuning uchun Railway kabi alohida xizmat/tashqi
tetikchi shart emas. Bu oddiy bash skript endpointga bitta `curl`
so'rovi yuboradi, natijani log qiladi va host'ning oddiy `cron`i
orqali ishga tushiriladi.

## O'rnatish (Hetzner, qadam-baqadam)

1. Skriptni serverga ko'chiring:
   ```bash
   mkdir -p /opt/fenixteacher/scripts
   # trigger-weekly-reports.sh'ni shu papkaga qo'ying
   chmod +x /opt/fenixteacher/scripts/trigger-weekly-reports.sh
   ```

2. Agar loyiha `/opt/fenixteacher`dan boshqa joyda bo'lsa, skript
   ichidagi `.env` yo'lini moslang (yoki `FENIX_ENV_FAYL` muhit
   o'zgaruvchisi bilan crontab'da ko'rsating) — skript
   `INTERNAL_SERVICE_SECRET`ni avtomatik shu yerdan o'qiydi, qo'lda
   nusxa ko'chirish shart emas.

3. Qo'lda bir marta sinab ko'ring:
   ```bash
   /opt/fenixteacher/scripts/trigger-weekly-reports.sh
   ```
   Chiqishida `[cron] HTTP 200 — natija: {...}` ko'rinishi kerak.

4. `crontab -e` (loyiha qaysi foydalanuvchi ostida ishlasa, o'sha
   bilan — root bo'lishi shart emas) va qo'shing:
   ```
   0 6 * * 1 /opt/fenixteacher/scripts/trigger-weekly-reports.sh >> /var/log/fenix-weekly-reports.log 2>&1
   ```
   (har dushanba 06:00 — bu serverning **o'z** vaqt zonasi bo'yicha;
   `timedatectl` bilan tekshiring, kerak bo'lsa soatni moslang.)

5. Log fayli cheksiz o'smasligi uchun `/etc/logrotate.d/fenix-weekly-reports`
   qo'shish tavsiya etiladi:
   ```
   /var/log/fenix-weekly-reports.log {
     weekly
     rotate 8
     compress
     missingok
     notifempty
   }
   ```

## Eslatma

- Bu cron **hamma faol kurs** uchun ishlaydi, foydalanuvchi sonidan
  qat'iy nazar — ko'p foydalanuvchi bo'lsa Claude so'rovlari
  ketma-ket (sequential) yuboriladi, umumiy vaqt cho'zilishi mumkin.
  Hozirgi bosqich (bitta sinov foydalanuvchisi — Nodira) uchun bu
  muammo emas.
- Docker Compose'ni qayta ishga tushirish shart emas — faqat
  `exercises.ts`/`internal.ts`/`reports.ts` yangilangandan keyin
  odatdagidek `docker compose up -d --build` qilinadi, cron esa
  konteynerdan tashqarida, oddiy host darajasida ishlaydi.
