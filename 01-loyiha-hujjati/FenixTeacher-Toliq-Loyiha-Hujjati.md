# FenixTeacher — To'liq Loyiha Hujjati

> Ushbu hujjat FenixTeacher loyihasining boshidan hozirgacha kelishilgan barcha qarorlarini, konsepsiyasini, arxitekturasini va kengaytirilgan "aqlli ustoz" imkoniyatlarini bitta joyga jamlaydi. Boshqa AI yoki jamoa a'zosiga loyihani noldan tushuntirish uchun yetarli.

---

## 1. Loyiha nima

**FenixTeacher** — Telegram Mini App (React) ko'rinishidagi, sun'iy intellekt asosidagi til o'rganish platformasi. Bot allaqachon Telegram'da ochilgan: **@FenixDeutschBot**. Hozircha faqat Nodiraning shaxsiy foydalanishi uchun (boshqa foydalanuvchilar yo'q).

Botning "shaxsi" — **Fenix**: qattiqqo'l, adolatli, adaptiv AI-ustoz. Faqat haqiqiy yutuqda maqtaydi, xato qilinsa aniq va qat'iy tushuntiradi, foydalanuvchi dangasalik qilsa (kam vaqt sarflasa, mashqlarni yuzaki bajarsa, kunlab kirmasa) buni sezib to'g'ridan-to'g'ri tanbeh beradi. Bosh direktor/ustoz/zavuch/barcha fanlar olimi kabi — hamma narsani nazorat qiladi. Shu bilan birga, foydalanuvchi haqiqatan charchagan/tushkunlikda bo'lsa, buni ham sezib, qattiqqo'llikni vaqtincha yumshatadigan **aqlli qattiqqo'l** ustoz.

Nodira — full-stack developer, Afsona platformasi (Uzbek Telegram mahsulotlari) egasi. Boshqa loyihalari: Afsona API (Node/Express/TS), AfsonaMovieBot (Python/aiogram), Afsona TV (React Mini App — video player, Watch Party, dubbing studio), Video Converter Bot, zapchast bot. **FenixTeacher shulardan mustaqil, alohida loyiha — Afsona TV'ga aralashtirilmaydi**, lekin ba'zi texnik infratuzilma (Pyrogram tajribasi, server) umumiy.

---

## 2. Asosiy kontseptsiya — "Bo'lim" tizimi

Botning yuragi. Yaxlit tuzilma:

```
Bo'lim (masalan "Nemis tili")
  ├── Materiallar ombori — foydalanuvchi bu yerga istalgancha kitob (PDF),
  │     audio (Hörverstehen), rasm, fayl tashlaydi
  ├── AI-tuzilgan dars rejasi — Fenix materiallarni o'zi tahlil qiladi:
  │     qaysi kitob (masalan Aspekte B1 Lehrbuch) qaysi kitobga
  │     (masalan Aspekte B1 Arbeitsbuch) mos kelishini, qaysi audio
  │     qaysi darsning Hören qismiga tegishli ekanini avtomatik aniqlaydi
  │     va bog'laydi
  └── Darslar — har biri: matn + mos audio + mashqlar, hammasi bir joyda

Bo'lim (masalan "Rus tili") — butunlay mustaqil, o'z materiallari bilan
Bo'lim (masalan "Ingliz tili") — xuddi shunday
```

Bitta bot ichida istalgan tilni, istalgan darslik to'plami bilan o'rganish mumkin — AI hammasini professional tarzda tashkil qiladi.

Yangi bo'lim ochilganda: Fenix foydalanuvchi bilan **suhbatlashib**, qaysi kitobdan/qay tartibda boshlashni birga hal qiladi (foydalanuvchi darajasi, maqsadiga qarab).

**Internetdan material qidirish (asosiy tamoyil):** Fenix internetdan qo'shimcha **ochiq/bepul** material (audio, qo'shimcha grammatika manbalari, rasmlar) qidirib topa oladi va o'zi yuklab qo'sha oladi. Mualliflik huquqi bilan himoyalangan asosiy darsliklarni (masalan Aspekte B1) internetdan avtomatik yuklab olish emas — bularni foydalanuvchining o'zi yuklaydi (shaxsiy foydalanish uchun).

---

## 3. To'liq funksionallik ro'yxati (asosiy)

### 3.1 Kontent bilan ishlash
- PDF darslik yuklash (matnli va skan/OCR)
- Bir nechta bog'liq kitob (Lehrbuch + Arbeitsbuch + audio) avtomatik bog'lanadi
- Kitobni avtomatik bo'limlarga (bob/dars/mavzu) ajratish
- Fenix har bir bo'limni "ustoz uslubida" tushuntiradi

### 3.2 "Jonli kitob" reader (muhim, murakkab qism)
- PDF sahifalari Mini App'da haqiqiy sahifa ko'rinishida render qilinadi (rasm/PDF.js)
- **Tap-to-translate**: istalgan so'z yoki gap ustiga bosilsa, o'sha joyning tarjimasi/tushuntirishi popup sifatida chiqadi
- Texnik yechim: PyMuPDF orqali har bir so'zning sahifadagi koordinatasi (bounding box) chiqariladi, frontend tap koordinatasini shu bilan solishtiradi, backend'ga so'rov yuboriladi (tez javob uchun Haiku)

### 3.3 Mashq va tekshirish
- Har bo'lim uchun avtomatik mashqlar (tanlov, bo'shliq to'ldirish, tarjima, gap tuzish)
- Javoblar darhol tekshiriladi (Sonnet), xato tushuntiriladi
- Qiyinlik darajasi natijaga moslashadi (aniq qoida: masalan ketma-ket 3 to'g'ri javobdan keyin qiyinlashtirish)

### 3.4 Talaffuz va ovoz
- TTS: **Google Cloud Text-to-Speech** (Gemini emas — alohida narsa, chalkashtirmaslik kerak)
- STT: Whisper (OpenAI) — foydalanuvchi ovozini yozib yuborsa, talaffuzni tekshiradi

### 3.5 Passiv kuzatuv (chatdan tashqari ham)
Fenix foydalanuvchi Mini App ichida nima qilayotganini **doimiy** kuzatadi — faqat AI bilan chatlashganda emas. Frontend har bir harakatni (sahifa ochish, sahifada qancha turgani, tugma bosish, mashqqa sarflangan vaqt) backend'ga "activity event" sifatida yuboradi. Fenix shu event'lar asosida:
- Dangasalik/bo'sh vaqt o'tkazishni sezadi va tanbeh beradi
- Real faollikka qarab motivatsiya/tanqid beradi

### 3.6 Progress va motivatsiya
- Umumiy progress (% kitob, daraja A1-C2)
- Streak, kunlik/haftalik statistika
- **Xatolar xazinasi**: har xato saqlanadi, spaced repetition tamoyili bilan qayta chiqariladi
- **Haftalik hisobot**: Fenix avtomatik xulosa — qancha vaqt, qaysi mavzu mustahkam/zaif, tavsiya
- **Daraja testi**: davriy AI-baholash, real darajani aniqlaydi

### 3.7 So'z boyligi (Vocabulary) moduli
- Eski "Deutsch Fenix" botining SM-2 spaced-repetition **g'oyasi** olinadi (kodi emas — sodda, bitta faylga yozilgan edi)
- PDF'dan chiqqan yangi so'zlar avtomatik shu bazaga tushadi

---

## 4. "Haqiqiy ustoz" qatlami — kengaytirilgan g'oyalar (A—DD)

Texnik reja to'liq bo'lsa ham, **haqiqiy foyda beruvchi ustoz** bo'lish uchun pedagogik chuqurlik zarur. Quyida barcha aniqlangan g'oyalar guruhlangan holda:

### 4.1 Xotira va shaxsiylashtirish
| # | G'oya | Tavsif |
|---|-------|--------|
| **A** | Foydalanuvchi profili (chinakam xotira) | Har bir suhbat, xato, yutuq — AI davriy yangilaydigan strukturaланган profilga yig'iladi: kuchli/zaif tomonlar, doimiy xatolar, o'rganish uslubi. Har bir AI chaqiruviga shu profil kontekst sifatida beriladi — Fenix "sizni eslaydi" |
| **B** | O'rganish uslubini aniqlash | Vizual/audio/yozma uslubga qarab kontent taqdim etish moslashtiriladi |
| **M** | Meta-daraja — Fenix o'z-o'zini optimallashtiradi | Qaysi tushuntirish uslubi (metafora/qoida/misol) shu foydalanuvchida yaxshi ishlashini kuzatib, strategiyasini moslashtiradi |

### 4.2 Tushuntirish va baholash sifati
| # | G'oya | Tavsif |
|---|-------|--------|
| **C** | Xato sababini taxmin qilish | Ona tili ta'siri, noto'g'ri umumlashtirish kabi sabablarga qarab, bir xil qolipdagi emas, sabab-asosli tushuntirish |
| **E** | Ko'p qirrali baholash | Grammatika, tabiiylik (native-likeness), lug'at boyligi alohida baholanadi — ayniqsa erkin yozuvda |
| **F** | "Nega?" mini-suhbat oynasi | Har bir mashq/tushuntirish elementiga bog'langan qo'shimcha savol-javob imkoniyati |
| **R** | Teach-back (o'qitib ber) | Foydalanuvchidan qoidani o'ziga tushuntirtirish — tushunish chuqurligini aniqlashning ishonchli usuli |

### 4.3 Takrorlash va mustahkamlash
| # | G'oya | Tavsif |
|---|-------|--------|
| **L** | Javob tezligi — mustahkamlik signali | To'g'ri, lekin sekin javob = "hali mustahkam emas", SM-2 intervaliga ta'sir qiladi |
| **N** | Interleaving (aralashtirilgan mashq) | Har mashq to'plamining ~20-30% qismi eski, hali mustahkamlanmagan mavzulardan iborat bo'ladi |
| **V** | Xato klasterlash | Tarqoq xatolarni bitta umumiy qoidaga birlashtirib, maxsus "tuzatish sessiyasi" taklif qilinadi |
| **W** | L1→L2 tarjima urg'usi | Passiv lug'atni faol lug'atga o'tkazish uchun qiyinroq yo'nalishga ko'proq urg'u |
| **O** | Passiv vs faol lug'at farqi | So'zni tanish va so'zni ishlata olish alohida kuzatiladi (keyingi bosqich) |
| **S** | Uyqu oldi mustahkamlash | Kun oxirida 3-5 daqiqalik "eng zaif 3 element" push-bildirishnoma orqali taklif qilinadi |

### 4.4 Kontent generatsiyasi va mashq turlari
| # | G'oya | Tavsif |
|---|-------|--------|
| **Q** | Comprehensible input (i+1) | Foydalanuvchi bilgan so'zlari + 5-10% yangi so'z nisbatida shaxsiy hikoya/dialog generatsiya qilinadi |
| **T** | Rolli o'yin / stsenariy mashqlari | Real hayotiy vaziyat (restoran, do'kon) orqali grammatika/lug'atni tabiiy kontekstda mashq qildirish |
| **U** | Shadowing | Audio jumla ikki marta eshittiriladi, foydalanuvchi ovozli takrorlaydi (STT'siz ham ishlaydi) |
| **G** | Shaxsiy hayotdan misollar | Foydalanuvchining o'z hayotidan misollar so'rab, o'sha grammatikani shu misollarda mashq qildirish |
| **K** | Tillar orasida ko'prik (transfer) | Foydalanuvchida 2+ bo'lim bo'lsa, bitta tildan olingan tushunchalar ikkinchisini tushuntirishda ishlatiladi |

### 4.5 Motivatsiya va boshqaruv
| # | G'oya | Tavsif |
|---|-------|--------|
| **D** | Proaktiv aralashuv | Fenix o'zi payqab dars rejasini dinamik moslashtiradi ("3 kundan beri xato qilyapsan, mashq qo'shdim") |
| **X** | Haftalik "shartnoma" | Har hafta boshida aniq, o'lchanadigan majburiyat tuziladi, hafta oxirida hisobot beriladi |
| **I** | Uzoq muddatli maqsad | Sertifikat/ko'chish/ish kabi maqsadga qarab dastur og'irligi moslashtiriladi |
| **J** | Emotsional holatni sezish | Charchash/tushkunlik belgilarida qattiqqo'llik vaqtincha yumshatiladi |
| **P** | Imtihon formatiga moslashtirish | Rasmiy imtihon (Goethe va h.k.) formatiga mos maxsus simulyator rejimi |

### 4.6 Ishonchlilik va infratuzilma
| # | G'oya | Tavsif |
|---|-------|--------|
| **H** | Sifat nazorati | Muhim AI javoblari uchun ikkinchi tekshiruv qatlami yoki foydalanuvchi "bu xato" deb belgilay oladigan feedback tugmasi |
| **Y** | Ko'p AI-provayder zaxira rejasi | Anthropic API ishlamay qolsa, oldindan tayyorlangan mashqlar bilan offline rejim |

### 4.7 Kontekst uzilishini bartaraf etish (arxitektura darajasida)
Har bir AI chaqiruvi alohida bo'lsa, Fenix umumiy tarixni "eslamaydi". Shu sababli **context builder** qatlami majburiy: har bir Sonnet/Haiku so'roviga foydalanuvchining joriy darajasi, so'nggi xatolari, va shu bo'limdagi progressi avtomatik qo'shiladi (batafsil — 7-bo'lim).

---

## 5. Tashqi material — internetdan va Telegram'dan avtomatik yig'ish

### 5.1 Ochiq internetdan material qidirish
| # | Funksiya | Tavsif |
|---|----------|--------|
| **Z** | Fenixning o'z-o'zidan web-qidiruv orqali material topishi | Faqat oldindan whitelist qilingan ochiq litsenziyali manbalar (masalan Deutsche Welle "Nicos Weg", davlat ta'lim resurslari). Topilgan material avtomatik yuklanmaydi — Fenix tahlil qilib, foydalanuvchiga bitta tugma bilan tasdiqlash uchun taklif qiladi |
| **AA** | Ochiq litsenziyali video/audio'dan material yasash | Rasmiy/ochiq litsenziyali YouTube kanallaridan subtitr chiqarib, tinglab-tushunish mashqi va yangi lug'at yaratish |
| **BB** | Darslik bo'shliqlarini avtomatik to'ldirish | Fenix bobda kam misol borligini sezsa, internetdan qo'shimcha tushuntirish/misol topib biriktiradi |
| **CC** | Imtihon formati yangilanishlarini kuzatish | Foydalanuvchi maqsadi rasmiy imtihon bo'lsa, format o'zgarishlariga qarab dastur rejasi moslashtiriladi |

### 5.2 Telegram kanal integratsiyasi (DD)

Bu funksiya ikkita aniq ajratilgan rejimga bo'linadi — bu foydalanuvchi bilan aniq kelishilgan muhim detal:

**DD-1 — Bitta post rejimi (default xatti-harakat)**
- Foydalanuvchi bitta post havolasini yuboradi, masalan: `t.me/DeutschSaida/673`, va so'raydi: "Fenix, shu faylni ko'rchi, bizga keraklimi?"
- Fenix **faqat o'sha bitta postni** oladi (matn + biriktirilgan fayl, agar bo'lsa) — butun kanalga tegmaydi
- Post Haiku orqali tez tasniflanadi: `{turi: pdf/audio/matn/rasm, mavzu_taxmini, daraja_taxmini, tegishli_bolim}`
- Fenix javob beradi: mos keladimi, qaysi bo'limga qo'shish mumkinligi, va tasdiqlash so'raydi
- Tasdiqlansa: fayl yuklab olinadi → PDF-service orqali qayta ishlanadi → tegishli bo'limga joylashtiriladi → lug'at bazasi yangilanadi

**DD-2 — To'liq kanal rejimi (faqat aniq buyruq bilan ishga tushadi)**
- Faqat foydalanuvchi ochiq-oydin so'ragandagina faollashadi: masalan "kanalni to'liq o'rgan" degan aniq buyruq
- Backend (Pyrogram/Telethon orqali — Video Converter Bot infratuzilmasiga o'xshash alohida mikroservis) kanaldagi postlarni skanerlaydi
- Faqat **ochiq (public) kanal** yoki foydalanuvchi a'zo/admin bo'lgan kanal skanerlanishi mumkin
- Har bir post Haiku orqali tasniflanadi, faqat joriy bo'limga mos keladiganlar ajratiladi
- Natija ro'yxat ko'rinishida taqdim etiladi: "47 tadan 8 tasi Nemis-B1 bo'limingizga mos — qaysilarini qo'shayin?" — ommaviy tasdiqlash, har biriga alohida tugma emas
- Tasdiqlangandan so'ng: yuklash → qayta ishlash → bo'limga joylashtirish → lug'at yangilanishi
- Mualliflik huquqi bilan himoyalangan bo'lishi mumkin bo'lgan materiallarga aniq ogohlantirish ko'rsatiladi ("shaxsiy foydalanish uchun saqlanmoqda")
- Katta kanallar uchun sana oralig'i yoki so'nggi N-post chegarasi qo'llaniladi (token va vaqtni tejash uchun)

> **Muhim qoida:** Aynan qaysi rejim ishga tushishi — bitta havola берилиши (DD-1) yoki aniq "to'liq o'rgan" buyrug'i (DD-2) — bilan belgilanadi. Fenix hech qachon oddiy bitta havoladan butun kanalni o'z-o'zicha skanerlamaydi.

---

## 6. Texnik arxitektura

```
Telegram (@FenixDeutschBot, aiogram/Python)
        ↓ ochadi
Mini App (React + TypeScript, tungi/qorong'u dizayn, o'ziga xos uslub)
        ↓
Node API (Express/TypeScript) — asosiy mantiq:
  - auth, foydalanuvchi, bo'lim/kurs boshqaruvi
  - Claude API chaqiruvlari (Sonnet/Haiku)
  - Context builder — har bir AI so'roviga learner_profile,
    so'nggi xatolar, boshqa tillar konteksti qo'shiladi
  - progress, activity events, xatolar bazasi
  - TTS (Google Cloud TTS) va STT (Whisper) orkestratsiyasi
  - Web-qidiruv/web-fetch tool (Z, AA, BB, CC uchun)
        ↓ (faqat PDF yuklanganda/parse kerak bo'lganda)
Python PDF-service (FastAPI, alohida mikroservis)
  - pdfplumber / PyMuPDF — matn ajratish
  - Tesseract — skan sahifalar uchun OCR (nemis tili paketi)
  - Har bir so'zning sahifadagi koordinatasi (bounding box) — tap-to-translate uchun
  - Natija: toza matn + bo'limlarga bo'lingan JSON qaytaradi
        ↓ (faqat Telegram kanal so'rovi bo'lganda)
Telegram-fetch mikroservis (Pyrogram/Telethon, Python)
  - DD-1: bitta post ID orqali xabarni fetch qiladi
  - DD-2: butun kanalni skanerlaydi (faqat aniq buyruqda)
```

**Nega shu bo'linish:** Bot qatlami (aiogram), PDF-service va Telegram-fetch mikroservisi Python'da — chunki Nodiraning shu stekda tajribasi bor (AfsonaMovieBot, Video Converter Bot) va PDF/OCR/Telegram kutubxonalari Python ekotizimida ancha pishiq. Asosiy API Node/Express'da — Afsona API bilan bir xil stek, kelajakda integratsiya qilish oson.

### AI model tanlovi (narxni tejash uchun hybrid)
- **Claude Sonnet**: tushuntirish, mashq generatsiya, javob tekshirish, xato tahlili, haftalik hisobot (chuqur sifat kerak bo'lgan joylar)
- **Claude Haiku**: tez tap-to-translate so'rovlari, Telegram post/kanal tasniflash (juda qisqa, sifat farqi sezilmaydi, narx tejaladi)

---

## 7. AI so'rovlar arxitekturasi — Context Builder

Fenixning "aqlli" bo'lishining markazi — har bir AI chaqiruvi izolyatsiyada emas, balki quyidagi kontekst bilan boyitiladi:

```
buildLearnerContext(userId) → {
  learner_profile: {
    kuchli_tomonlar,
    zaif_tomonlar,
    doimiy_xato_pattern,
    ogrenish_uslubi_taxmin
  },
  joriy_bob_konteksti: { mavzu, daraja },
  songgi_xatolar: [oxirgi 3-5 ta error_bank yozuvi, sabab_taxmini bilan],
  boshqa_tillar: [agar foydalanuvchida 2+ bo'lim bo'lsa — K punkti uchun]
}
```

Bu funksiya Node API'da alohida modul sifatida joylashadi va **har** Sonnet/Haiku chaqiruvidan oldin ishga tushadi.

### Asosiy prompt turlari
1. **Tushuntirish prompti** — xato sababini taxmin qilish bilan (C)
2. **Mashq generatsiya prompti** — interleaving qoidasi bilan (N), kerak bo'lsa comprehensible input rejimida (Q)
3. **Javob tekshirish prompti** — ko'p qirrali baholash formatida qaytaradi (E):
   `{togri_notogri, grammatika_bahosi, tabiiylik_bahosi, lugat_bahosi, sabab_taxmini}`
4. **"Nega?" mini-suhbat prompti** (F) — bitta exercise/tushuntirishga bog'langan qisqa dialog konteksti bilan
5. **Telegram post/kanal tasniflash prompti** (DD-1/DD-2) — Haiku, tez javob: `{turi, mavzu_taxmini, daraja_taxmini, tegishli_bolim}`

---

## 8. To'liq DB sxemasi

```
users
  id, telegram_id, ism, joriy_daraja (A1-C2), streak, royxatdan_otgan_sana,
  ustoz_qattiqqolligi_sozlamasi

learner_profile
  id, user_id,
  kuchli_tomonlar (json),
  zaif_tomonlar (json),
  doimiy_xato_pattern (json — masalan "dativ/akkuzativ": count, last_seen),
  ogrenish_uslubi_taxmin (matn: "vizual" / "audio" / "yozma" / "aniqlanmagan"),
  oxirgi_yangilangan_sana

courses (bo'limlar)
  id, user_id, til_nomi, holati

books
  id, course_id, turi (Lehrbuch/Arbeitsbuch/audio), fayl_yoli, boglangan_kitob_id,
  manba (yuklangan / internet / telegram_kanal)

chapters
  id, book_id, matn, sahifa_oralig'i, tartib_raqami

words
  id, user_id, so'z, tarjima, interval, ease_factor, next_review,
  faol_yoki_passiv (default: "passiv")

exercises
  id, chapter_id, turi, savol, javob, natija,
  baholash_grammatika, baholash_tabiiylik, baholash_lugat_boyligi

error_bank
  id, user_id, xato_matni,
  sabab_taxmini (ona_tili_tasiri / notogri_umumlashtirish / etibirsizlik),
  qayta_korsatish_sanasi, javob_tezligi_ms

exercise_discussions
  id, exercise_id, user_id, xabar, kim_yozgan (user/fenix), vaqt

activity_events
  id, user_id, turi, vaqt, davomiyligi

user_progress
  id, user_id, course_id, chapter_id, foiz_bajarilgan

external_content_log
  id, user_id, manba (internet/telegram), manba_havolasi,
  holati (taklif_qilingan / tasdiqlangan / rad_etilgan),
  mualliflik_huquqi_ogohlantirishi (bool)
```

**Interleaving (N) uchun:** alohida jadval kerak emas — mashq generatsiya so'rovida `error_bank` va `words`'dan "hali mustahkam bo'lmagan, lekin joriy mavzu bo'lmagan" elementlar tanlab qo'shiladi (~20-30%).

**Transfer/ko'prik (K) uchun:** `courses` jadvalidagi boshqa tillar ro'yxati mashq generatsiya promptiga kontekst sifatida beriladi.

**Tashqi material (Z, AA, DD) uchun:** `external_content_log` — har bir taklif qilingan/tasdiqlangan/rad etilgan material va uning manbasi kuzatiladi, mualliflik huquqi ogohlantirishi bilan birga.

---

## 9. Infratuzilma va xizmatlar (kelishilgan)

- **Hosting**: Hetzner (Nodiraning mavjud serveri, boshqa Afsona loyihalari ham shu yerda)
- **TTS**: Google Cloud Text-to-Speech (Gemini emas!)
- **STT**: Whisper (OpenAI API)
- **AI**: Anthropic Claude API (pay-as-you-go, balansga $5-10 qo'yiladi, ishlatilgan miqdorga yarasha yechiladi; API konsolida oylik limit qo'yish mumkin)
- **Telegram bot**: @FenixDeutschBot (allaqachon @BotFather orqali ochilgan)
- **Telegram fetch**: Pyrogram/Telethon (Video Converter Bot infratuzilmasiga o'xshash)
- **Dizayn**: o'ziga xos, tungi/qorong'u (dark) rejim, "akademik/kitob" emas — alohida o'ziga xos uslub

### Taxminiy xarajat (faqat 1 foydalanuvchi, kuniga 30-45 daq faollik)
- Hybrid Sonnet+Haiku bilan: **~$8-25/oy** (asosan Sonnet ulushiga qarab)
- Faqat Sonnet bilan (hamma joyda): **~$25-60/oy**
- TTS/STT xarajatlari ustiga qo'shiladi (odatda kichik, $1-10/oy oralig'ida)

---

## 10. Mavjud (eski) material — Deutsch-Fenix-main.zip

Nodira avval oddiy so'z boyligi boti yozgan: bitta faylga (bot.py, ~100KB) yozilgan, aiogram asosida, SM-2 spaced repetition, nested kategoriyalar, bulk import, multiple-choice testlar, DeepL/Claude API integratsiyasi bor edi. Bu juda sodda va FenixTeacher darajasiga yetmaydi — **kodi qayta ishlatilmaydi**, faqat SM-2 spaced-repetition **g'oyasi** yangi, to'g'ri arxitekturaga modul sifatida ko'chiriladi.

---

## 11. Ishlab chiqish bosqichlari (3 bosqich)

> Yakuniy qaror: loyiha 3 aniq bosqichga bo'lingan — har biri o'z ichida yakunlangan, keyingisi avvalgisining real foydalanish tajribasiga tayanadi. Bosqich 3 (Fenix Brain) haqida to'liq ma'lumot — 13-bo'limda.

### Bosqich 1 — Fenix MVP+ (birinchi ishga tushirish)
**Asos:**
- Bitta bo'lim (Nemis tili), bitta kitob juftligi (Aspekte neu B1 plus)
- PDF yuklash, matn ajratish, avtomatik bo'limlarga bo'lish
- Jonli kitob reader + tap-to-translate (Haiku)
- Avtomatik mashqlar + tekshirish (Sonnet)
- Asosiy progress, so'z boyligi + SM-2, TTS

**Qo'shilgan "aqlli ustoz" qatlami (arzon, katta ta'sir):**
- **A** — learner_profile (xotira) — boshidanoq arxitekturaga singdirilishi shart
- **C** — xato sababini taxmin qilib tushuntirish
- **E** — ko'p qirrali baholash
- **F** — "nega?" mini-suhbat oynasi
- **K** — tillar orasida ko'prik
- **L** — javob tezligi SM-2 signali sifatida
- **N** — interleaved practice
- **Q** — comprehensible input generatsiyasi
- **R** — teach-back
- **V** — xato klasterlash
- **X** — haftalik shartnoma
- **DD-1** — Telegram bitta post rejimi

### Bosqich 2 — Fenix Teacher (chuqurlashtirish)
Maqsad: Fenix oddiy darslik yordamchisi emas, to'liq individual tutor bo'lishi.
- **B, D, G, H, I, J, M, O, P** — chuqurroq shaxsiylashtirish va sifat nazorati
- **S, T, U, W, Y** — qo'shimcha mashq turlari va ishonchlilik
- **Z, AA, BB, CC** — ochiq internetdan material yig'ish
- **DD-2** — Telegram to'liq kanal skaneri
- Passiv kuzatuv (activity events / dangasalik tanbehi) va proaktiv intervensiya
- Xatolar xazinasi UI + haftalik hisobot ekrani
- Daraja testi va diagnostika
- Bir nechta til/bo'lim bir vaqtda boshqaruvi
- STT (talaffuz tekshirish/pronunciation)
- Erkin suhbat rejimi (speaking), yozma ish tekshirish (writing)
- Imtihon rejimi (exam mode, masalan Goethe formatiga moslashtirish)

### Ishlab chiqish tartibi (texnik)
1. Python PDF-service — matn ajratish, bo'limlarga bo'lish, bounding box
2. Node API asosi — auth, courses/books/chapters CRUD
3. Context builder + learner_profile — boshidanoq singdirish
4. Mashq generatsiya + tekshirish — E, C, N qoidalari bilan
5. Jonli kitob reader + tap-to-translate
6. So'z boyligi + SM-2 (L bilan)
7. "Nega?" mini-suhbat (F)
8. TTS integratsiyasi
9. Telegram bitta-post integratsiyasi (DD-1)
10. Sinov: Aspekte B1 plus bilan to'liq oqim
11. Bosqich 2 funksiyalari

---

## 12. Hozirgi holat — nima hal qilingan, nima hali yo'q

**Hal qilingan:**
- Umumiy kontseptsiya, "bo'lim" tizimi, barcha asosiy funksionallik
- Kengaytirilgan "aqlli ustoz" g'oyalari (A—DD) va ularning MVP+/Bosqich 2 taqsimoti
- Texnik stek (Node + Python PDF-service + Python Telegram-fetch + React Mini App)
- AI model tanlovi (Sonnet+Haiku hybrid) va context builder arxitekturasi
- To'liq DB sxemasi (asosiy + kengaytirilgan jadvallar)
- Hosting (Hetzner), TTS (Google Cloud TTS), bot yaratilgan (@FenixDeutschBot)
- Dizayn yo'nalishi (dark/tungi, o'ziga xos)
- Telegram kanal integratsiyasining ikki aniq rejimi (DD-1 bitta post, DD-2 to'liq kanal)

**Hali hal qilinmagan / davom ettirish kerak:**
1. To'liq yakuniy DB maydonlari (fields) darajasida tasdiqlash
2. PDF-service va Telegram-fetch mikroservislarining aniq API kontraktlari, endpoint'lar
3. Node API endpoint ro'yxati (to'liq loyihalashtirilmagan)
4. Mini App wireframe/ekranlar ro'yxati
5. Tap-to-translate PDF koordinata-matching mexanizmining kod darajasidagi implementatsiyasi
6. `learner_profile` yangilanish chastotasi (har mashqdanmi, kunlik jamlanmami)
7. Ko'p qirrali baholash (E) natijalarining foydalanuvchiga taqdim etilish formati
8. Interleaving nisbati (N) — qattiq belgilanadimi yoki moslashuvchanmi
9. Z/AA uchun whitelist manbalar ro'yxati va uni tasdiqlash jarayoni
10. Telegram-fetch mikroservisining joylashuvi — alohida serverdami yoki AfsonaMovieBot serverida
11. Birinchi sinov kitobi: **Aspekte neu B1 plus** (Lehrbuch + Arbeitsbuch bog'lanishi shu misolda sinaladi)

## 13. Fenix 2.0 — Bosqich 3: Fenix Brain

Texnik reja (Bosqich 1-2) to'liq bo'lsa ham, Fenixni haqiqiy shaxsiy til maktabi darajasiga olib chiqish uchun yakuniy qatlam kerak: **Fenix "AI tutor" emas, "Learning Engine" bo'lishi kerak.**

**Asosiy prinsip:** ko'proq AI funksiyasi = aqlliroq ustoz degani emas. Fenixning kuchi uning **qaror qabul qilish tizimida** bo'ladi. Claude — Fenixning o'zi emas, Fenix foydalanadigan miya vositasi xolos. Fenixning haqiqiy "aqli" quyidagi tizimlarda yashaydi:

```
                  FENIX
                    │
            ┌───────▼───────┐
            │  FENIX BRAIN  │
            │               │
            │ What next?    │
            │ Why?          │
            │ How difficult?│
            │ Review or new?│
            │ Explain/test? │
            └───────┬───────┘
                    │
         ┌──────────┼──────────┐
         ↓          ↓          ↓
     Knowledge   Learner    History
       Graph      Model      Events
         │          │          │
         └──────────┼──────────┘
                    ↓
                Claude
```

### 13.1 Yangi modullar (EE—LL)

| # | Modul | Tavsif |
|---|-------|--------|
| **EE** | Knowledge Graph | Grammatik/leksik bilimlar orasidagi bog'liqlik grafigi (masalan Dativ → Verben mit Dativ → helfen/gefallen/gehören). Bitta xato boshqa bog'liq bilimga ta'sirini ko'rsatadi |
| **FF** | Mastery Engine | Bilimni bir nechta sharoitda alohida baholaydi: Recognition → Controlled exercise → Recall → Translation → Free writing → Conversation → Real-time usage. Testda yuqori ball = mastery emas |
| **GG** | Fenix Decision Engine | "Hozir nima kerak?" — kuchli/zaif tomonlarga qarab kunlik/haftalik rejani real vaqtda hal qiladi (masalan vaqtni review/yangi mavzu/vocabulary orasida taqsimlaydi) |
| **HH** | Adaptive Curriculum Engine | Dastur tuzilishi qat'iy emas — natijalarga qarab dinamik moslashadi |
| **II** | Diagnostic Engine | Foydalanuvchi "bilaman" desa ham ko'r-ko'rona ishonmaydi — bir necha kontekstda tekshirib, deklarativ bilim va amaliy ko'nikma farqini aniqlaydi |
| **JJ** | Teaching Strategy Memory | Qaysi tushuntirish uslubi (qoida/misol/dialog) shu foydalanuvchida yaxshi ishlashini kuzatib, profilga yozadi (M g'oyasining kuchaytirilgani) |
| **KK** | Misconception/Root-Cause Engine | Tarqoq ko'rinuvchi xatolarni bitta ildiz muammoga bog'laydi (masalan 20 ta xatoning 14 tasi bitta qoidaga borib taqaladi) va o'sha ildizni davolaydi |
| **LL** | Experiment & Self-Optimization Engine | Fenix turli tushuntirish usullarini sinab, natijalarni solishtirib, samaraliroq strategiyani tanlaydi |

### 13.2 Fenix School Mode (Bosqich 3 doirasida)

To'garak o'rnini bosa oladigan haftalik tuzilma — lekin qotib qolmaydi, natijalarga qarab o'zgaradi:

- **Dushanba** — yangi mavzu + tushuntirish + controlled exercises
- **Seshanba** — vocabulary + listening + eski xatolar
- **Chorshanba** — grammar application + speaking
- **Payshanba** — reading + writing
- **Juma** — mixed practice
- **Shanba** — haftalik test
- **Yakshanba** — Fenix diagnostikasi + keyingi hafta rejasi

### 13.3 Knowledge Graph strategiyasi — bosqichma-bosqich

Boshida butun tilni grafga aylantirish shart emas. Faqat 1-2 ta muhim "tugun" bilan boshlanadi, masalan:

```
Dativ
 │
 ├── bestimmten Artikel
 │     ├── dem
 │     └── der
 │
 ├── Verben mit Dativ
 │     ├── helfen
 │     ├── gefallen
 │     └── gehören
 │
 └── Präpositionen
       ├── mit
       ├── nach
       └── von
```

Ishlasa, asta-sekin boshqa tugunlarga kengaytiriladi.

### 13.4 Nega alohida bosqich

EE-LL — chuqur muhandislik ishi (knowledge graph qurish, mastery hisoblash, decision engine). Bularni MVP+ bilan birga boshlash loyihani cho'zib, tugamaydigan holga keltirishi mumkin. Shuning uchun Bosqich 3 faqat Bosqich 1-2 real foydalanishda (Nodiraning o'zida) sinovdan o'tgach, qaysi joylarni chuqurlashtirish kerakligi aniq bo'lgach boshlanadi.

**Yakuniy maqsad (bitta jumlada):** Fenix foydalanuvchiga "dars beradigan AI" emas, balki foydalanuvchining til o'rganish jarayonini boshidan oxirigacha boshqaradigan shaxsiy o'qituvchi bo'ladi.

---

## 14. Keyingi qadam

Yuqoridagi 12-bo'limdagi ochiq savollarni ketma-ket hal qilib, so'ng Python PDF-service'dan qurishni boshlash — kelishilgan ishlab chiqish tartibiga muvofiq (11-bo'lim). Bosqich 3 (Fenix Brain, 13-bo'lim) — Bosqich 1-2 real foydalanish natijalari asosida keyinroq boshlanadi.
