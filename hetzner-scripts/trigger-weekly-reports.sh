#!/usr/bin/env bash
# trigger-weekly-reports.sh — Hetzner serverda host crontab orqali
# (masalan har dushanba ertalab) ishga tushiriladi. Node API
# konteyner ichida 127.0.0.1:4000ga bog'langan (DEPLOY.md, 4-band) —
# shuning uchun bu skript ham AYNAN shu serverning o'zida ishlashi
# kerak (masofadan emas), tashqariga hech qanday port ochish shart
# emas.
#
# Kerakli muhit o'zgaruvchisi: INTERNAL_SERVICE_SECRET
# (.env faylida allaqachon bor — asosiy API'dagi bilan bir xil bo'lishi shart)
#
# O'rnatish:
#   1) Bu faylni serverga ko'chiring, masalan:
#        /opt/fenixteacher/scripts/trigger-weekly-reports.sh
#   2) Ishga tushirish huquqini bering:
#        chmod +x /opt/fenixteacher/scripts/trigger-weekly-reports.sh
#   3. crontab -e (root yoki loyiha egasi foydalanuvchisi bilan) va qo'shing:
#        0 6 * * 1 /opt/fenixteacher/scripts/trigger-weekly-reports.sh >> /var/log/fenix-weekly-reports.log 2>&1
#      (har dushanba 06:00 — serverning o'z vaqt zonasi bo'yicha,
#      `timedatectl` bilan tekshiring)
#
# Log fayli o'sib ketishining oldini olish uchun logrotate qo'shish
# tavsiya etiladi (masalan /etc/logrotate.d/fenix-weekly-reports).

set -euo pipefail

# .env faylidan INTERNAL_SERVICE_SECRET'ni o'qiydi, agar muhitda
# allaqachon export qilinmagan bo'lsa (masalan crontab minimal
# muhitda ishlaydi, .env avtomatik yuklanmaydi).
ENV_FAYL="${FENIX_ENV_FAYL:-/opt/fenixteacher/05-node-api/.env}"
if [ -z "${INTERNAL_SERVICE_SECRET:-}" ] && [ -f "$ENV_FAYL" ]; then
  INTERNAL_SERVICE_SECRET=$(grep -E '^INTERNAL_SERVICE_SECRET=' "$ENV_FAYL" | tail -n1 | cut -d'=' -f2-)
fi

if [ -z "${INTERNAL_SERVICE_SECRET:-}" ]; then
  echo "[cron] $(date -Is) — INTERNAL_SERVICE_SECRET topilmadi (na muhitda, na $ENV_FAYL'da) — to'xtatildi" >&2
  exit 1
fi

API_MANZIL="${NODE_API_URL:-http://127.0.0.1:4000}"
ENDPOINT="${API_MANZIL%/}/internal/weekly-reports/generate-all"

echo "[cron] $(date -Is) — haftalik hisobotlar generatsiyasi boshlandi: $ENDPOINT"

HTTP_KOD=$(curl -sS -o /tmp/fenix-weekly-report-natija.json -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "X-Internal-Secret: $INTERNAL_SERVICE_SECRET") || {
    echo "[cron] $(date -Is) — so'rov yuborilmadi (curl xatosi)" >&2
    exit 1
  }

NATIJA=$(cat /tmp/fenix-weekly-report-natija.json 2>/dev/null || echo "{}")
echo "[cron] HTTP $HTTP_KOD — natija: $NATIJA"

if [ "$HTTP_KOD" -lt 200 ] || [ "$HTTP_KOD" -ge 300 ]; then
  echo "[cron] $(date -Is) — API xato qaytardi (HTTP $HTTP_KOD)" >&2
  exit 1
fi

# Ba'zi kurslarda alohida xato bo'lishi mumkin (masalan Claude
# vaqtincha ishlamadi) — bu butun cronni "muvaffaqiyatsiz" deb
# belgilashga arzimaydi, chunki qolgan kurslar baribir ishlangan.
# Shuning uchun bu yerda exit 1 qilinmaydi, faqat ko'rinadigan
# tarzda ogohlantiriladi (log faylida ko'rinadi).
XATO_SONI=$(echo "$NATIJA" | grep -o '"xato":[0-9]*' | head -n1 | cut -d':' -f2 || echo "0")
if [ -n "$XATO_SONI" ] && [ "$XATO_SONI" -gt 0 ] 2>/dev/null; then
  echo "[cron] OGOHLANTIRISH: $XATO_SONI ta kursda xato bo'ldi — tafsilotlar yuqoridagi JSON'da"
fi

rm -f /tmp/fenix-weekly-report-natija.json
exit 0
