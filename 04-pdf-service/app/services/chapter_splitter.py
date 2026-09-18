"""
chapter_splitter.py — darslik uslubidagi kitoblar uchun (Aspekte va
o'xshashlar).

Muhim aniqlash: bunday kitoblarda "Kapitel N" matn ichida qidirish
ishonchsiz (faqat ilova/indeksda uchraydi). Ishonchli manba —
mundarija (Inhalt) sahifasi, unda har bir bo'lim/modul aniq sahifa
raqami bilan ko'rsatilgan.

Strategiya:
1. "Inhalt" so'zi joylashgan sahifadan boshlab mundarijani o'qiydi
2. Har qatorda: [turi] [nomi] .... [sahifa raqami] naqshini qidiradi
   (turi: Auftakt / Modul N / Porträt / Grammatik / Film)
3. Topilgan qatorlarni "Unit"larga guruhlash — bu qism ENDI KITOBGA
   QATTIQ KODLANMAGAN: Fenix (Claude Haiku) mundarija matnini o'qib,
   o'zi unit chegaralarini aniqlaydi (`ai_structurer.infer_units`).
   Natija kitob metama'lumoti sifatida DB'ga (`books.ai_tuzilma` yoki
   shunga o'xshash ustun) saqlanadi — har safar qayta hisoblanmaydi.
4. Natija: tartiblangan [{turi, nomi, sahifa_boshi, sahifa_oxiri}, ...]
   ro'yxati — sahifa_oxiri keyingi yozuvning sahifa_boshidan -1
"""

import re
import pdfplumber

from .ai_structurer import infer_units

SECTION_PATTERN = re.compile(
    r"^(Auftakt|Modul\s*\d+|Porträt|Grammatik|Film)\b\s*(.*?)\s+(\d{1,3})\s*$"
)


def _unit_for_page(page: int, units: list[dict]) -> dict:
    """Sahifa raqamiga qarab qaysi unit'ga tegishli ekanini aniqlaydi.
    `units` — ai_structurer.infer_units() natijasi:
    [{"raqam":1,"nomi":"...","boshlanish_sahifa":8}, ...], sahifa
    bo'yicha o'sish tartibida."""
    unit = units[0]
    for u in units:
        if page >= u["boshlanish_sahifa"]:
            unit = u
    return unit


def find_toc_pages(pdf_path: str, max_scan_pages: int = 15) -> list[int]:
    """'Inhalt' so'zi bor sahifalarni topadi (mundarija odatda 2-8 sahifa).
    Har qatorni alohida tekshiradi (regex ^ chegarasi sahifa emas, qator
    boshini bildiradi)."""
    toc_pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i in range(min(max_scan_pages, len(pdf.pages))):
            text = pdf.pages[i].extract_text() or ""
            lines = text.split("\n")
            has_inhalt = "Inhalt" in text
            has_section = any(SECTION_PATTERN.match(l.strip()) for l in lines)

            if has_inhalt or (toc_pages and has_section):
                toc_pages.append(i + 1)
            elif toc_pages:
                break
    return toc_pages


def _raw_toc_text(pdf_path: str, toc_pages: list[int]) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join(pdf.pages[p - 1].extract_text() or "" for p in toc_pages)


def parse_toc(pdf_path: str, toc_pages: list[int]) -> list[dict]:
    """Mundarijani o'qib, [{turi, nomi, sahifa_boshi}, ...] chiqaradi,
    so'ng Fenix (AI) shu ro'yxatni unit'larga guruhlaydi — kitobga xos
    hech narsa qattiq kodlanmagan."""
    raw_rows = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num in toc_pages:
            text = pdf.pages[page_num - 1].extract_text() or ""
            for line in text.split("\n"):
                line = line.strip()
                m = SECTION_PATTERN.match(line)
                if m:
                    turi, nomi, sahifa = m.groups()
                    raw_rows.append({
                        "turi": turi.strip(),
                        "nomi": nomi.strip() or None,
                        "sahifa_boshi": int(sahifa),
                    })

    if not raw_rows:
        return []

    # Fenix mundarija matnini o'qib, unit chegaralarini aniqlaydi
    toc_text = _raw_toc_text(pdf_path, toc_pages)
    units = infer_units(toc_text, raw_rows)

    entries = []
    for row in raw_rows:
        unit = _unit_for_page(row["sahifa_boshi"], units)
        entries.append({
            "unit_raqami": unit["raqam"],
            "unit_nomi": unit["nomi"],
            "turi": row["turi"],
            "nomi": row["nomi"],
            "sahifa_boshi": row["sahifa_boshi"],
        })

    # sahifa_oxiri ni to'ldirish: keyingi yozuvning boshigacha
    for i, e in enumerate(entries):
        e["sahifa_oxiri"] = (entries[i + 1]["sahifa_boshi"] - 1) if i + 1 < len(entries) else None

    return entries


if __name__ == "__main__":
    import sys, json
    pdf_path = sys.argv[1]
    toc_pages = find_toc_pages(pdf_path)
    entries = parse_toc(pdf_path, toc_pages)
    print(json.dumps({"toc_pages_found": toc_pages, "entries": entries[:25], "jami": len(entries)},
                      indent=2, ensure_ascii=False))
