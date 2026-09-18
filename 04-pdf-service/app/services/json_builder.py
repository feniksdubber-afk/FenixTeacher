"""
json_builder.py — detector, text_extractor va chapter_splitter
natijalarini birlashtirib, Node API kutayotgan yakuniy strukturaga
soladi (DB'dagi `chapters` jadvaliga to'g'ridan-to'g'ri mos).
"""

import re
import pdfplumber

from .detector import detect_document_type
from .text_extractor import extract_page_from_pdf
from .chapter_splitter import find_toc_pages, parse_toc

# ESKI YONDASHUV (olib tashlandi): PRINTED_TO_PHYSICAL_OFFSET har kitob
# uchun qo'lda tekshirilardi. ENDI: footer'dagi chop etilgan sahifa
# raqami avtomatik o'qilib, jismoniy indeks bilan solishtiriladi —
# hech qanday qo'lda ish shart emas.
_PAGE_NUM_PATTERN = re.compile(r"^\s*(\d{1,4})\s*$")


def _printed_number_on_physical_page(pdf, physical_page_idx0: int) -> int | None:
    """Sahifaning pastki ~8% zonasidagi matndan yolg'iz turgan raqamni
    (chop etilgan sahifa raqami) qidiradi."""
    page = pdf.pages[physical_page_idx0]
    footer_top = page.height * 0.92
    words = page.extract_words()
    for w in words:
        if w["top"] >= footer_top and _PAGE_NUM_PATTERN.match(w["text"]):
            return int(w["text"])
    return None


def detect_page_offset(pdf_path: str, sample_physical_pages: list[int]) -> int:
    """Bir nechta sahifada chop etilgan raqamni o'qib, offset ni
    (jismoniy_indeks - chop_etilgan_raqam) hisoblaydi. Ko'pchilik
    ovoz (mode) bilan — bitta sahifada OCR xato bo'lsa ham chidamli."""
    from collections import Counter

    offsets = []
    with pdfplumber.open(pdf_path) as pdf:
        for physical_1based in sample_physical_pages:
            idx0 = physical_1based - 1
            if idx0 < 0 or idx0 >= len(pdf.pages):
                continue
            printed = _printed_number_on_physical_page(pdf, idx0)
            if printed is not None:
                offsets.append(physical_1based - printed)

    if not offsets:
        return 0  # aniqlab bo'lmadi — offsetsiz davom etadi, xato log'ga yoziladi

    return Counter(offsets).most_common(1)[0][0]


def build_book_json(pdf_path: str, book_id: str) -> dict:
    # 1) hujjat turini aniqlash (sifat nazorati/log uchun)
    doc_type = detect_document_type(pdf_path, sample_pages=[1, 20, 60, 100, 140, 180])

    # 2) mundarijadan bo'lim xaritasi
    toc_pages = find_toc_pages(pdf_path)
    toc_entries = parse_toc(pdf_path, toc_pages)

    if not toc_entries:
        return {
            "book_id": book_id,
            "holati": "xato",
            "xato_matni": "Mundarija topilmadi — qo'lda unit sozlash yoki "
                          "boshqa chapter-aniqlash strategiyasi kerak.",
        }

    # 2.5) sahifa-offsetni avtomatik aniqlash (birinchi bir nechta
    # mundarija-yozuvi atrofidagi jismoniy sahifalarni sinab ko'radi)
    birinchi_sahifa = min(e["sahifa_boshi"] for e in toc_entries[:5])
    # jismoniy offset odatda kichik (muqova/litsenziya/mundarija tufayli,
    # kamdan-kam 10 sahifadan oshadi) — shu diapazonni sinab ko'ramiz
    taxmin_diapazon = range(birinchi_sahifa, birinchi_sahifa + 10)
    offset = detect_page_offset(pdf_path, list(taxmin_diapazon))

    # 3) har bir bo'lim uchun matn + bbox'larni yig'ish
    # FIX (#9): avval har bir sahifa uchun `extract_page(pdf_path, ...)`
    # chaqirilardi — u PDF faylni qaytadan ochib-yopardi (194 sahifalik
    # kitobda 194 marta). Endi fayl SHU YERDA bitta marta ochiladi va
    # butun bob/sahifa siklida bir xil `pdf` obyekti qayta ishlatiladi.
    chapters = []
    with pdfplumber.open(pdf_path) as pdf:
        for entry in toc_entries:
            boshi, oxiri = entry["sahifa_boshi"], entry["sahifa_oxiri"] or entry["sahifa_boshi"]
            matn_qismlari = []
            barcha_bbox = []
            xato_sahifalar = []

            for page_num in range(boshi, oxiri + 1):
                physical_page = page_num + offset
                try:
                    page_result = extract_page_from_pdf(pdf, physical_page)
                    matn_qismlari.append(page_result["matn"])
                    for bbox in page_result["bounding_boxes"]:
                        bbox["page"] = page_num  # chop etilgan sahifa raqamiga qaytariladi
                    barcha_bbox.extend(page_result["bounding_boxes"])
                except Exception as e:
                    xato_sahifalar.append({"sahifa": page_num, "xato": str(e)})

            chapters.append({
                "book_id": book_id,
                "unit_raqami": entry["unit_raqami"],
                "unit_nomi": entry["unit_nomi"],
                "turi": entry["turi"],
                "nomi": entry["nomi"],
                "sahifa_boshi": boshi,
                "sahifa_oxiri": oxiri,
                "matn": "\n\n".join(matn_qismlari),
                "bounding_boxes": barcha_bbox,
                "xato_sahifalar": xato_sahifalar or None,
            })

    return {
        "book_id": book_id,
        "holati": "tayyor",
        "hujjat_tahlili": {
            "dominant_type": doc_type["dominant_type"],
            "mixed_types": doc_type["mixed_types"],
            "aniqlangan_sahifa_offseti": offset,
        },
        "boblar_soni": len(chapters),
        "boblar": chapters,
    }
