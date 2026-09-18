"""
detector.py — PDF sahifa turini aniqlaydi:
  - "vector_text": haqiqiy vektor matn (odatiy PDF)
  - "ocr_text": skanerlangan rasm + Adobe/boshqa OCR qatlami (bizning holat)
  - "scanned_no_text": skanerlangan, matn qatlami umuman yo'q (Tesseract shart)

Aniqlash mantig'i:
  1. Sahifada raster image bor-yo'qligini tekshiradi (pdfplumber .images)
  2. Agar rasm bor VA matn ham bor → OCR qatlamli deb hisoblaydi
  3. Agar rasm bor VA matn yo'q/juda kam → Tesseract kerak
  4. Agar rasm yo'q VA matn bor → toza vektor matn
"""

import pdfplumber


def detect_page_type(pdf_path: str, page_number: int) -> dict:
    """page_number — 1-based."""
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_number - 1]

        try:
            text = page.extract_text() or ""
        except Exception as e:
            text = ""
            extract_error = str(e)
        else:
            extract_error = None

        has_images = len(page.images) > 0
        text_len = len(text.strip())

        if has_images and text_len > 30:
            page_type = "ocr_text"
        elif has_images and text_len <= 30:
            page_type = "scanned_no_text"
        elif not has_images and text_len > 30:
            page_type = "vector_text"
        else:
            page_type = "unknown"

        return {
            "page_number": page_number,
            "page_type": page_type,
            "has_images": has_images,
            "text_char_count": text_len,
            "extract_error": extract_error,
            "text_sample": text[:200],
        }


def detect_document_type(pdf_path: str, sample_pages: list[int]) -> dict:
    """Bir nechta sahifada sinab, umumiy xulosa chiqaradi."""
    results = [detect_page_type(pdf_path, p) for p in sample_pages]
    types_found = {r["page_type"] for r in results}
    errors = [r for r in results if r["extract_error"]]

    return {
        "sample_results": results,
        "dominant_type": max(types_found, key=lambda t: sum(1 for r in results if r["page_type"] == t)),
        "mixed_types": len(types_found) > 1,
        "pages_with_errors": [r["page_number"] for r in errors],
    }


if __name__ == "__main__":
    import sys, json
    pdf_path = sys.argv[1]
    pages = [int(p) for p in sys.argv[2:]] if len(sys.argv) > 2 else [1, 10, 50, 100, 150]
    result = detect_document_type(pdf_path, pages)
    print(json.dumps(result, indent=2, ensure_ascii=False))
