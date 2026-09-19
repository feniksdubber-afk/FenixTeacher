"""
page_renderer.py — PDF sahifalarini PNG/JPEG rasmga aylantiradi (PyMuPDF).

Nega kerak: Aspekte kabi kitoblar to'liq skanerlangan (OCR qatlamli) —
demak sahifaning o'zi allaqachon rasm. `exercise_extractor.py` matn
bloklarining bbox'ini (pdfplumber koordinatalarida, nuqtalarda, sahifa
yuqorisidan hisoblanadi) allaqachon biladi — shu bbox asosida shu yerda
sahifadan tegishli bo'lakni kesib olamiz. Bu yondashuv mashqning
ichidagi jadval/rasm/belgilarni HAM avtomatik qamrab oladi (chunki ular
ham xuddi shu sahifa rasmining bir qismi) — alohida "rasm aniqlash"
logikasi shart emas.

Muhim: kenglik har doim BUTUN sahifa kengligi olinadi (faqat matn
bbox'i emas) — chunki yon tomondagi rasm/belgi ko'pincha matn
qatorlaridan tashqarida joylashadi va faqat matn kengligida kesish uni
yo'qotib qo'yishi mumkin.

Bitta PDF-service so'rovi davomida bir xil sahifa bir necha marta
(bir nechta mashq bitta sahifada bo'lsa) qayta render qilinmasin deb,
pixmap kichik LRU-kesh bilan saqlanadi.
"""
from __future__ import annotations

import io

import base64
import fitz  # PyMuPDF
from PIL import Image

DEFAULT_DPI = 150          # mashq-rasm kesish uchun yetarli, biroz kattaroq DPI kelajakdagi PDF-viewer uchun ham qayta ishlatiladi
CROP_PADDING_PT = 14        # bbox usti/ostiga qo'shiladigan bo'sh joy (nuqta, 72pt = 1 dyuym)
MIN_CROP_HEIGHT_PT = 50     # juda ingichka (bir qatorli) bloklar uchun minimal balandlik
_CACHE_SIZE = 3             # bitta so'rovda saqlanadigan sahifalar soni (xotira uchun)


class PageRenderer:
    """Bitta PDF fayl uchun ishlatiladigan, chaqiruvchi tomonidan
    yopiladigan (`close()`) renderer. `with`ga o'ralmagan — chunki
    exercise_extractor bir nechta sahifa ustida davomli ishlaydi."""

    def __init__(self, pdf_path: str, dpi: int = DEFAULT_DPI):
        self.doc = fitz.open(pdf_path)
        self.dpi = dpi
        self.scale = dpi / 72.0
        self._cache: "dict[int, Image.Image]" = {}

    def _page_image(self, page_index: int) -> Image.Image:
        cached = self._cache.get(page_index)
        if cached is not None:
            return cached
        page = self.doc[page_index]
        mat = fitz.Matrix(self.scale, self.scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        self._cache[page_index] = img
        if len(self._cache) > _CACHE_SIZE:
            oldest_key = next(iter(self._cache))
            if oldest_key != page_index:
                del self._cache[oldest_key]
        return img

    def crop_bbox_jpeg_bytes(
        self, page_index: int, bbox_pt: "list[float] | None", quality: int = 82
    ) -> "bytes | None":
        """bbox_pt = [x0, top, x1, bottom], pdfplumber konventsiyasida
        (nuqtalarda, sahifa yuqorisidan). bbox yo'q bo'lsa None qaytadi —
        chaqiruvchi rasmsiz davom etadi, xatoga chiqmaydi."""
        if not bbox_pt or len(bbox_pt) != 4:
            return None
        try:
            img = self._page_image(page_index)
        except Exception:
            return None
        w, h = img.size

        top_pt = max(0.0, bbox_pt[1] - CROP_PADDING_PT)
        bottom_pt = bbox_pt[3] + CROP_PADDING_PT
        if bottom_pt - top_pt < MIN_CROP_HEIGHT_PT:
            bottom_pt = top_pt + MIN_CROP_HEIGHT_PT

        top_px = int(top_pt * self.scale)
        bottom_px = min(h, int(bottom_pt * self.scale))
        if bottom_px <= top_px:
            return None

        crop = img.crop((0, top_px, w, bottom_px))
        buf = io.BytesIO()
        crop.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()

    def full_page_jpeg_bytes(self, page_index: int, quality: int = 76) -> bytes:
        """To'liq sahifa (PDF-viewer uchun) — mashq-kesmalariga qaraganda
        pastroq quality: bu holda hajm (mobil trafik) muhimroq, chunki
        foydalanuvchi sahifani asosan umumiy ko'rish uchun ochadi."""
        img = self._page_image(page_index)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()

    def page_size_px(self, page_index: int) -> "tuple[int, int]":
        img = self._page_image(page_index)
        return img.size

    def close(self) -> None:
        self._cache.clear()
        self.doc.close()


def render_all_pages(pdf_path: str, dpi: int = 110, quality: int = 76):
    """PDF-viewer uchun: kitobning HAR bir sahifasini JPEG'ga aylantiradi.
    Generator emas, ro'yxat qaytaradi (chaqiruvchi barchasini R2'ga
    ketma-ket/partiyalab yuklaydi) — lekin sahifalar bittalab ochib-yopib
    ishlanadi, shuning uchun xotira bosimi bitta sahifa hajmi bilan
    chegaralanadi (194 sahifalik kitobda ham barqaror).
    Bitta sahifadagi xato butun kitobni to'xtatmaydi — shu sahifa
    ro'yxatdan tushib qoladi, xato alohida qaytariladi."""
    renderer = PageRenderer(pdf_path, dpi=dpi)
    natija = []
    xatolar = []
    n_pages = renderer.doc.page_count
    try:
        for idx in range(n_pages):
            try:
                w, h = renderer.page_size_px(idx)
                jpeg_bytes = renderer.full_page_jpeg_bytes(idx, quality=quality)
                natija.append({
                    'page_physical': idx + 1,
                    'width': w,
                    'height': h,
                    'jpeg_base64': base64.b64encode(jpeg_bytes).decode('ascii'),
                })
            except Exception as e:  # noqa: BLE001 - sahifa darajasida izolyatsiya
                xatolar.append({'sahifa': idx + 1, 'xato': str(e)})
            finally:
                # sahifa keshini shu yerda tozalaymiz - bittalab ishlatilgani
                # uchun keshlash foyda bermaydi, faqat xotira band qiladi
                renderer._cache.clear()
    finally:
        renderer.close()
    return {'sahifalar_soni': n_pages, 'sahifalar': natija, 'xato_sahifalar': xatolar or None}
