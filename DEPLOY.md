# FenixTeacher — Hetzner'da ishga tushirish

## 1. Loyihani serverga ko'chirish

```bash
git clone <repo> fenixteacher   # yoki shu papkani SCP bilan yuklang
cd fenixteacher
cp .env.example .env
nano .env   # barcha qiymatlarni to'ldiring
```

## 2. Ishga tushirish

```bash
docker compose up -d --build
docker compose logs -f   # hammasi sog'lom ishga tushganini tekshirish
```

Tekshirish:
```bash
curl http://127.0.0.1:4000/health
curl http://127.0.0.1:8001/health
```

## 3. DB schema

Birinchi ishga tushishda Postgres konteyner `02-db-schema/fenix-db-schema.sql`
faylini avtomatik ishga tushiradi (`docker-entrypoint-initdb.d` orqali) —
qo'lda hech narsa qilish shart emas. Agar keyinroq schema o'zgarsa, bu
avtomatik qayta ishlamaydi (faqat bo'sh volume'da bir marta) — migratsiya
kerak bo'ladi (hozircha qo'lda `docker compose exec postgres psql ...`).

## 4. Tashqariga ochish (mavjud Caddy orqali)

Bu compose hech qanday portni to'g'ridan-to'g'ri tashqariga ochmaydi —
hammasi `127.0.0.1`ga bog'langan. `Caddyfile.snippet` faylidagi blokni
serverdagi umumiy Caddyfile'ga (masalan `/etc/caddy/Caddyfile`) qo'shib,
`sudo systemctl reload caddy` qiling.

## 5. Telegram bot tokeni va Mini App

`@FenixDeutschBot`ning tokeni `.env`dagi `TELEGRAM_BOT_TOKEN`ga qo'yiladi
— buni ikki narsa ishlatadi: (a) Node API — Mini App `initData`sini
tekshirish uchun, (b) `07-telegram-bot` — botning o'zi (long polling,
`/start`da Mini App tugmasini ko'rsatadi).

## 6. Mini App'ni build qilib joylash

Mini App (`06-mini-app`) alohida statik sayt sifatida joylanadi —
`docker-compose.yml` ichida emas, chunki uni har o'zgarishda qayta
konteynerizatsiya qilish shart emas:

```bash
cd 06-mini-app
cp .env.example .env   # VITE_API_BASE ni fenix-api domeningizga o'rnating
npm install
npm run build           # dist/ papkasini hosil qiladi
```

`dist/` ichidagilarni serverdagi `/var/www/fenixteacher-miniapp/dist`ga
(yoki `Caddyfile.snippet`da ko'rsatilgan yo'lga) ko'chiring, so'ng
umumiy Caddyfile'ga shu blokni qo'shib `sudo systemctl reload caddy`
qiling. **Muhim:** shu domen `.env`dagi `MINI_APP_URL` bilan bir xil
bo'lishi kerak — bot shu manzilga yo'llaydi, BotFather'da ham
(`/setmenubutton` yoki `/newapp`) xuddi shu URL ko'rsatilishi kerak,
aks holda Telegram Mini App'ni to'g'ri ochmaydi.

## 6.5 R2 bucket CORS — PDF yuklash oqimi uchun SHART

Mini App PDF faylni Node orqali emas, to'g'ridan-to'g'ri brauzerdan
R2'ga presigned URL bilan `PUT` qiladi (`06-mini-app/src/api/fenix.ts`,
`uploadFileToR2`). R2 bucket'da CORS sozlanmagan bo'lsa, brauzer bu
so'rovni **jim** rad etadi (Network tab'da CORS xatosi ko'rinadi, Node
loglarida hech narsa chiqmaydi — so'rov Node'ga umuman yetib bormaydi,
to'g'ridan-to'g'ri R2'ga ketib, u yerda bloklanadi).

Loyiha ildizida `r2-cors.json` tayyorlangan — faqat domenni to'g'irlab
qo'llash kerak:

```bash
# 1) r2-cors.json ichidagi "fenix.SIZNING-DOMENINGIZ.uz"ni haqiqiy
#    Mini App domeningizga almashtiring (MINI_APP_URL bilan bir xil
#    bo'lishi shart). localhost:5173 — lokal `npm run dev` testi uchun,
#    production'da xohlasangiz olib tashlashingiz mumkin.

# 2) R2 S3-mos API'ni qo'llaydi, shuning uchun AWS CLI yetarli:
aws s3api put-bucket-cors \
  --bucket ${R2_BUCKET} \
  --cors-configuration file://r2-cors.json \
  --endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --profile r2   # yoki AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY'ni R2 kalitlaringizga o'rnating

# 3) Tekshirish:
aws s3api get-bucket-cors \
  --bucket ${R2_BUCKET} \
  --endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com \
  --profile r2
```

Muqobil (server kerak emas): Cloudflare dashboard → R2 → bucket →
Settings → CORS Policy'ga `r2-cors.json` mazmunini qo'lda joylash.

**Eslatma:** `AllowedOrigins` — aniq domen bo'lsin (`*` emas): presigned
URL orqali shaxsiy nashr huquqi himoyalangan PDF yuklanadi, noma'lum
saytlardan so'rov qabul qilinmasligi muhim.

## 7. Botni ishga tushirish

`telegram-bot` xizmati `docker compose up -d --build`da avtomatik
ishga tushadi (5-bandda tavsiflangan asosiy compose ichida). Alohida
port ochish shart emas — long polling orqali ishlaydi. Tekshirish:

```bash
docker compose logs -f telegram-bot
```

Telegram'da botga `/start` yozib, tugma to'g'ri Mini App'ni
ochayotganini tekshiring.

## Hali qilinmagan narsalar

- Migratsiya tizimi (hozir faqat bitta initial schema)
- CI/CD (GitHub Actions) — `ai_suggestions` oqimidagi avtomatik
  deploy hali skeleton
- Backup strategiyasi (Postgres volume + R2 — ikkalasi ham hozircha
  qo'lda)
- Monitoring/log aggregatsiya
- Fenixning haqiqiy "brain loop"i (o'quv suhbat, mashq generatsiyasi,
  learner_profile yangilanishi) — Node API'da hali endpoint yo'q,
  keyingi navbatdagi asosiy ish
