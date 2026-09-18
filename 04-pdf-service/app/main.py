"""
main.py — FastAPI entrypoint.
Node API shu mikroservisga POST /process orqali murojaat qiladi (fayl
endi lokal yo'l emas, R2'dagi vaqtinchalik presigned GET URL sifatida
keladi — PDF-service R2 credential'iga umuman ega emas), keyin
GET /status/{job_id} bilan natijani so'raydi (polling).

FIX (#2): avval /process va /status/{job_id} HECH QANDAY autentifikatsiyaga
ega emas edi — INTERNAL_SERVICE_SECRET faqat CHIQUVCHI (PDF-service -> Node,
qarang ai_structurer.py) chaqiruvda ishlatilardi, kiruvchi so'rovlar esa
umuman tekshirilmasdi. Hozircha servis faqat 127.0.0.1'ga bog'langani
uchun amaliy xavf past edi, lekin bu network sozlamasiga tayanadigan
yagona himoya edi (defense-in-depth yo'q) — tarmoq sozlamasi o'zgarsa
(masalan compose'dan tashqariga port ochilsa) darhol ochiq eshikka
aylanardi: istalgan kishi ixtiyoriy `file_url`ni /process'ga yuborib
serverni o'zi tanlagan URL'ni fetch qilishga majburlashi mumkin edi
(SSRF), shuningdek boshqa foydalanuvchilarning job natijalarini
/status/{job_id} orqali o'qishi mumkin edi.

Endi `verify_internal_secret` dependency har ikkala endpoint uchun
Node'dagi `internalAuth` bilan bir xil shared-secret sxemasini
qo'llaydi (header: X-Internal-Secret, env: INTERNAL_SERVICE_SECRET),
`hmac.compare_digest` bilan constant-time solishtiradi. Agar
INTERNAL_SERVICE_SECRET o'rnatilmagan bo'lsa — repo bo'ylab qabul
qilingan konvensiyaga ko'ra (qarang ai_structurer.py) bu dev/lokal
rejim deb hisoblanadi va tekshiruv o'tkazib yuboriladi, lekin startup
paytida ochiq ogohlantirish chiqariladi.
"""

import hmac
import os
import tempfile
import urllib.request
import uuid
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel

from app.services.json_builder import build_book_json

app = FastAPI(title="FenixTeacher PDF Service")

INTERNAL_SERVICE_SECRET = os.environ.get("INTERNAL_SERVICE_SECRET", "")

if not INTERNAL_SERVICE_SECRET:
    print(
        "[main] OGOHLANTIRISH: INTERNAL_SERVICE_SECRET o'rnatilmagan — "
        "/process va /status/{job_id} HECH QANDAY autentifikatsiyasiz "
        "ochiq qoladi. Faqat lokal ishlab chiqish uchun maqbul, "
        "production'da albatta o'rnatilishi shart."
    )


def verify_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if not INTERNAL_SERVICE_SECRET:
        return  # dev rejim — yuqoridagi startup ogohlantirishga qarang
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, INTERNAL_SERVICE_SECRET):
        raise HTTPException(status_code=401, detail="ruxsat etilmagan")


# Oddiy in-memory job store — production'da Redis/DB bilan almashtiriladi
JOBS: dict[str, dict] = {}


class ProcessRequest(BaseModel):
    book_id: str
    file_url: str   # R2 presigned GET URL (vaqtinchalik, ~30 daqiqa amal qiladi)
    til_kodi: str = "de"


class ProcessResponse(BaseModel):
    job_id: str
    holati: str


@app.post("/process", response_model=ProcessResponse, dependencies=[Depends(verify_internal_secret)])
async def process_pdf(req: ProcessRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "holati": "jarayonda",
        "book_id": req.book_id,
        "boshlangan_at": datetime.now(timezone.utc).isoformat(),
        "natija": None,
    }
    background_tasks.add_task(_run_job, job_id, req.file_url, req.book_id)
    return ProcessResponse(job_id=job_id, holati="jarayonda")


@app.get("/status/{job_id}", dependencies=[Depends(verify_internal_secret)])
async def get_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job topilmadi")
    return job


def _run_job(job_id: str, file_url: str, book_id: str):
    tmp_path = None
    try:
        # R2'dan vaqtinchalik faylga yuklab olinadi — pdfplumber lokal
        # yo'l bilan ishlaydi, streaming'ni qo'llab-quvvatlamaydi
        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        urllib.request.urlretrieve(file_url, tmp_path)

        result = build_book_json(tmp_path, book_id)
        JOBS[job_id]["holati"] = result.get("holati", "tayyor")
        JOBS[job_id]["natija"] = result
        JOBS[job_id]["yakunlangan_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        JOBS[job_id]["holati"] = "xato"
        JOBS[job_id]["xato_matni"] = str(e)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)  # shaxsiy nashr huquqi himoyalangan fayl diskda qolmasin


@app.get("/health")
async def health():
    return {"holati": "ishlayapti"}
