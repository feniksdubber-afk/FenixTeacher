"""
chapter_splitter.py — darslik uslubidagi kitoblar uchun (Aspekte va
o'xshashlar).

Muhim aniqlash: bunday kitoblarda "Kapitel N" matn ichida qidirish
ishonchsiz (faqat ilova/indeksda uchraydi). Ishonchli manba —
mundarija (Inhalt) sahifasi, unda har bir bo'lim/modul aniq sahifa
raqami bilan ko'rsatilgan.

Strategiya:
1. Mundarija sahifasi(lari)ni topadi — avval mundarija sarlavhasi
   ("Inhalt" va boshqa tillardagi ekvivalentlari) bo'yicha, topilmasa
   umumiy heuristika (ko'p qatorda "... raqam" ko'rinishi) bo'yicha.
2. Har qatorda: [turi] [nomi] .... [sahifa raqami] naqshini qidiradi
   (turi: Auftakt / Modul N / Porträt / Grammatik / Film — bu aniq
   nemis darsligi patterni). Bu pattern hech narsa topmasa, UMUMIY
   pattern ishlatiladi: "<sarlavha matni> ... <sahifa raqami>" — til
   yoki nashriyotdan qat'i nazar ishlaydi, faqat `turi` bo'sh qoladi.
3. Topilgan qatorlarni "Unit"larga guruhlash — bu qism ENDI KITOBGA
   QATTIQ KODLANMAGAN: Fenix (Claude Haiku) mundarija matnini o'qib,
   o'zi unit chegaralarini aniqlaydi (`ai_structurer.infer_units`).
   Natija kitob metama'lumoti sifatida DB'ga (`books.ai_tuzilma` yoki
   shunga o'xshash ustun) saqlanadi — har safar qayta hisoblanmaydi.
4. Natija: tartiblangan [{turi, nomi, sahifa_boshi, sahifa_oxiri}, ...]
   ro'yxati — sahifa_oxiri keyingi yozuvning sahifa_boshidan -1

FIX (#10): avval faqat SECTION_PATTERN (nemis "Aspekte"-uslubidagi
so'zlar: Auftakt/Modul/Porträt/Grammatik/Film) va faqat "Inhalt"
so'zi tekshirilardi — boshqa til/format (masalan ingliz darsligi:
"Contents"/"Unit 1"/"Chapter 3") kelsa 0 ta qator topilib, "mundarija
topilmadi" xatosi bilan butunlay ishlamay qolardi. Endi:
- `find_toc_pages` bir nechta tildagi mundarija sarlavhalarini
  taniydi (TOC_HEADER_WORDS), va agar hech biri topilmasa, umumiy
  heuristikaga o'tadi ("ko'p qatorda oxirida sahifa raqami bor
  sahifa" — nuqta-chiziqli yoki keng bo'shliqli TOC formatlariga mos
  keladi, tilga bog'liq emas).
- `parse_toc` avval aniq SECTION_PATTERN'ni sinaydi (mavjud nemis
  darsliklari uchun `turi` maydonini to'g'ri to'ldiradi), hech narsa
  topilmasa GENERIC_TOC_LINE_PATTERN'ga o'tadi (`turi` bo'sh qoladi,
  `nomi` butun sarlavha matnini oladi).
"""

import re
import pdfplumber

from .ai_structurer import infer_units

SECTION_PATTERN = re.compile(
    r"^(Auftakt|Modul\s*\d+|Porträt|Grammatik|Film)\b\s*(.*?)\s+(\d{1,3})\s*$"
)

# Mundarija sahifasini turli tillarda tanish uchun sarlavha so'zlari
# (nemis, ingliz, rus, ispan, fransuz — eng ko'p uchraydigan darslik
# tillari). Katta-kichik harfga sezgir emas.
TOC_HEADER_WORDS = [
    "Inhalt", "Inhaltsverzeichnis",          # nemis
    "Contents", "Table of Contents",          # ingliz
    "Содержание", "Оглавление",               # rus
    "Índice", "Contenido",                    # ispan
    "Sommaire", "Table des matières",         # fransuz
    "Mundarija",                              # o'zbek
]

# Umumiy (tilga bog'liq bo'lmagan) mundarija qatori: sarlavha matni,
# so'ng nuqta-chiziq (....) yoki keng bo'shliq, so'ng sahifa raqami.
# Masalan: "Unit 1: Family ......... 5" yoki "Chapter 3 - Travel   40"
GENERIC_TOC_LINE_PATTERN = re.compile(
    r"^(.{2,90}?)\s*(?:\.{2,}|\s{2,})\s*(\d{1,4})\s*$"
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


def _looks_like_toc_page(text: str, lines: list[str]) -> bool:
    """Sarlavha so'zi topilmasa ham, sahifa mundarijaga o'xshaydimi —
    umumiy heuristika: yetarlicha qator oxirida sahifa raqami bor
    (nuqta-chiziqli yoki keng bo'shliqli TOC formati)."""
    generic_hits = sum(1 for l in lines if GENERIC_TOC_LINE_PATTERN.match(l.strip()))
    # Kamida 3 ta mos qator — tasodifiy raqam bilan tugagan bitta-ikkita
    # oddiy qatordan farqlash uchun.
    return generic_hits >= 3


def find_toc_pages(pdf_path: str, max_scan_pages: int = 15) -> list[int]:
    """Mundarija sahifalarini topadi (odatda 2-8 sahifa). Avval aniq
    sarlavha so'zlari (istalgan qo'llab-quvvatlanadigan tilda) yoki
    nemis-uslubidagi SECTION_PATTERN bo'yicha, topilmasa umumiy
    "ko'p qatorda sahifa raqami" heuristikasi bo'yicha."""
    toc_pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i in range(min(max_scan_pages, len(pdf.pages))):
            text = pdf.pages[i].extract_text() or ""
            lines = text.split("\n")
            has_header = any(w.lower() in text.lower() for w in TOC_HEADER_WORDS)
            has_section = any(SECTION_PATTERN.match(l.strip()) for l in lines)
            has_generic = _looks_like_toc_page(text, lines)

            if has_header or has_generic or (toc_pages and has_section):
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
    hech narsa qattiq kodlanmagan.

    Avval aniq SECTION_PATTERN (nemis darsligi so'zlari) sinaladi —
    bu `turi`ni to'g'ri to'ldiradi (Modul/Grammatik/...). Hech narsa
    topilmasa, GENERIC_TOC_LINE_PATTERN'ga o'tiladi — bu istalgan
    til/format uchun ishlaydi, lekin `turi` bo'sh qoladi (`nomi`
    butun sarlavha matnini oladi)."""
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
        with pdfplumber.open(pdf_path) as pdf:
            for page_num in toc_pages:
                text = pdf.pages[page_num - 1].extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    if not line or line.lower() in (w.lower() for w in TOC_HEADER_WORDS):
                        continue
                    m = GENERIC_TOC_LINE_PATTERN.match(line)
                    if m:
                        nomi, sahifa = m.groups()
                        raw_rows.append({
                            "turi": None,
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
