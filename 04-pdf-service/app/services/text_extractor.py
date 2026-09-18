"""
text_extractor.py — OCR-qatlamli sahifadan matn + normallashtirilgan
bounding box'larni chiqaradi (tap-to-translate uchun).

Tozalash qoidalari:
1. Sahifa footer zonasi (pastki 6%) — sotuvchi/nashriyot izi
   ("The German Bookshop...") — chapter matniga kirmaydi.
2. Ikonka-OCR-artefaktlari (masalan tinglash ikonkasi "tJ 0 '"'" QJ")
   — lug'atsiz, juda qisqa aralash belgilar — filtrlanadi.
"""

import re
import pdfplumber

FOOTER_ZONE_RATIO = 0.90  # sahifa balandligining pastki ~10%i footer hisoblanadi
# (haqiqiy o'lchov: "The German Bookshop" izi 0.926 balandlikda joylashgan)

def _is_garbage(token: str) -> bool:
    """
    Ikonka-OCR-artefaktlarini aniqlash heuristikasi.
    Sof harflardan tashqari belgilar nisbati yuqori bo'lsa — chiqarib tashlanadi.
    Bu heuristika 100% aniq emas — real nashrga tayyorlashda inson ko'zdan
    kechirishi tavsiya etiladi, lekin avtomatik oldindan tozalash uchun yetarli.
    """
    if token in _KNOWN_SHORT_WORDS:
        return False

    letters = re.findall(r"[a-zA-ZäöüßÄÖÜ]", token)
    letter_ratio = len(letters) / len(token) if token else 0

    if len(token) <= 6 and letter_ratio < 0.6:
        return True
    if len(token) <= 2 and token.isdigit():
        return True
    return False


_KNOWN_SHORT_WORDS = {
    "a", "A", "b", "B", "c", "C", "d", "D", "e", "E", "f", "F",
    "In", "im", "zu", "an", "am", "um", "ab", "es", "er", "wir",
    "1a", "1b", "2a", "2b", "3a", "3b",
}


def extract_page(pdf_path: str, page_number: int) -> dict:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_number - 1]
        page_width, page_height = page.width, page.height
        footer_top = page_height * FOOTER_ZONE_RATIO

        words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
        clean_words = []
        bounding_boxes = []
        footer_removed = 0
        garbage_removed = 0

        for w in words:
            token = w["text"]

            if w["top"] >= footer_top:
                footer_removed += 1
                continue  # footer zonasi — chapter matniga kiritilmaydi

            is_garbage = _is_garbage(token)
            if is_garbage:
                garbage_removed += 1

            bounding_boxes.append({
                "word": token,
                "page": page_number,
                "x": round(w["x0"] / page_width, 4),
                "y": round(w["top"] / page_height, 4),
                "w": round((w["x1"] - w["x0"]) / page_width, 4),
                "h": round((w["bottom"] - w["top"]) / page_height, 4),
                "shubhali_ocr": is_garbage,
            })
            if not is_garbage:
                clean_words.append(token)

        return {
            "page_number": page_number,
            "matn": " ".join(clean_words),
            "soz_soni": len(clean_words),
            "footer_soz_olib_tashlandi": footer_removed,
            "ikonka_artefakt_olib_tashlandi": garbage_removed,
            "bounding_boxes": bounding_boxes,
        }


if __name__ == "__main__":
    import sys, json
    pdf_path = sys.argv[1]
    page_number = int(sys.argv[2])
    result = extract_page(pdf_path, page_number)
    preview = dict(result)
    preview["bounding_boxes"] = result["bounding_boxes"][:5]
    preview["jami_bbox_soni"] = len(result["bounding_boxes"])
    print(json.dumps(preview, indent=2, ensure_ascii=False))
