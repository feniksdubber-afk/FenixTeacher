# FenixTeacher PDF Service

Ishga tushirish:
```
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Sinov:
```
curl -X POST http://localhost:8001/process \
  -H "Content-Type: application/json" \
  -d '{"book_id": "aspekte-b1-plus", "file_path": "/yol/Aspekte_neu_B1__LB.pdf"}'

curl http://localhost:8001/status/{job_id}
```

## Muhim eslatmalar
- `json_builder.py`dagi `PRINTED_TO_PHYSICAL_OFFSET` — har bir kitob uchun
  alohida tekshirilishi kerak (chop etilgan sahifa raqami PDF jismoniy
  sahifasidan farq qiladi, old muqova/mundarija sahifalari tufayli).
- `chapter_splitter.py`dagi `ASPEKTE_B1_UNITS` va `ASPEKTE_B1_UNIT_START_PAGES`
  — hozircha faqat Aspekte B1 plus uchun qattiq kodlangan. Yangi kitob
  qo'shilganda bu ro'yxat DB'dagi `books`/`chapters` orqali dinamik
  bo'lishi kerak (Bosqich 2 vazifasi).
- Bitta kitob (194 sahifa) qayta ishlanishi ~60 soniya oladi — bu sinxron
  test vaqti; production'da background_tasks orqali async ishlaydi.
