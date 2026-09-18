"""
ai_structurer.py — kitobga xos narsalarni endi qo'lda kodlash o'rniga
Fenix (Claude Haiku) o'zi aniqlaydi.

`infer_units()` — mundarija matnini o'qib, [{turi,nomi,sahifa_boshi}]
qatorlarini "Unit"larga guruhlaydi (avval ASPEKTE_B1_UNITS qo'lda
yozilgan edi — endi har qanday kitob uchun ishlaydi).

Natija Node API orqali `books` jadvaliga (masalan `ai_tuzilma JSONB`
ustuniga) saqlanishi kerak — bir marta hisoblanadi, keyin qayta
ishlatiladi (har `/process` chaqiruvida AI'ga qayta murojaat qilinmaydi).

Chaqiruv Node API'ning `POST /internal/ai/infer-units` endpoint'i orqali
o'tadi (PDF-service to'g'ridan-to'g'ri Anthropic'ga chaqirmaydi) — sababi
barcha Claude chaqiruvlari `ai_call_logs` jadvaliga Node orqali yoziladi.
Node ishlamasa/topilmasa — fallback: hammasi bitta unit.
"""

import json
import os
import urllib.request
import urllib.error

NODE_API_URL = os.environ.get("NODE_API_URL", "http://localhost:4000")
INTERNAL_SERVICE_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", "")


def _fallback_single_unit(raw_rows: list[dict]) -> list[dict]:
    """Node API ishlamasa/xato bo'lsa — hamma narsani bitta unit deb
    belgilaydi. Kamida ishlaydigan holat, lekin unit-darajasidagi
    guruhlash yo'qoladi — shuning uchun bu faqat fallback, doimiy yechim
    emas."""
    boshlanish = raw_rows[0]["sahifa_boshi"] if raw_rows else 1
    return [{"raqam": 1, "nomi": "Umumiy", "boshlanish_sahifa": boshlanish}]


def infer_units(toc_text: str, raw_rows: list[dict]) -> list[dict]:
    """Mundarija qatorlarini unit'larga guruhlaydi. Natija sahifa
    bo'yicha o'sish tartibida bo'ladi (`_unit_for_page` shunga tayanadi)."""
    if not raw_rows:
        return []

    if not INTERNAL_SERVICE_SECRET:
        return _fallback_single_unit(raw_rows)

    payload = json.dumps({
        "toc_text": toc_text.strip()[:6000],
        "rows": raw_rows,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{NODE_API_URL}/internal/ai/infer-units",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Internal-Secret": INTERNAL_SERVICE_SECRET,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            parsed = json.loads(resp.read().decode("utf-8"))
        units = parsed["units"]
        units.sort(key=lambda u: u["boshlanish_sahifa"])
        return units
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError):
        # Node API topilmadi/xato javob berdi — jarayon to'xtamasin
        return _fallback_single_unit(raw_rows)
