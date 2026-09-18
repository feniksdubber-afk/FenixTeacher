/**
 * exercises.ts — Fenixning birinchi haqiqiy "brain loop"i:
 *
 *   user action → Claude (mashq generatsiya) → foydalanuvchi javobi →
 *   Claude (tekshirish) → error_bank + learner_profile yangilanadi →
 *   ("Nega?" so'ralsa) Claude (tushuntirish, suhbat tarixi bilan)
 *
 * Har bir bosqich `contextBuilder`dan o'quvchi holatini oladi — shu
 * bilan Fenix bir xil xatoni cheksiz qayta ko'rsatib o'tirmaydi va
 * o'quvchi darajasiga moslashadi (loyiha hujjati, 7-bo'lim).
 */
import { Router } from "express";
import { z } from "zod";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { query } from "../db/pool.js";
import { callClaude } from "../services/claude.js";
import { buildLearnerContext, renderLearnerContext, pickInterleavedCandidate } from "../services/contextBuilder.js";
import { recordExerciseOutcome } from "../services/learnerProfile.js";

export const exercisesRouter = Router();
exercisesRouter.use(telegramAuth);

async function currentUserId(telegramId: number): Promise<string | null> {
  const [row] = await query<{ id: string }>(
    `SELECT id FROM users WHERE telegram_id=$1 AND deleted_at IS NULL`,
    [telegramId]
  );
  return row?.id ?? null;
}

interface ChapterRow {
  id: string;
  nomi: string | null;
  matn: string | null;
  course_id: string;
  til_nomi: string;
}

/** Bob ma'lumotini + tegishli kursni bitta so'rovda oladi, egalikni tekshirish uchun. */
async function getOwnedChapter(chapterId: string, userId: string): Promise<ChapterRow | null> {
  const [row] = await query<ChapterRow>(
    `SELECT ch.id, ch.nomi, ch.matn, c.id AS course_id, c.til_nomi
     FROM chapters ch
     JOIN books b ON b.id = ch.book_id
     JOIN courses c ON c.id = b.course_id
     WHERE ch.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL AND b.deleted_at IS NULL`,
    [chapterId, userId]
  );
  return row ?? null;
}

interface ExerciseRow {
  id: string;
  user_id: string;
  chapter_id: string | null;
  turi: string;
  savol: string;
  togri_javob: string | null;
  mavzu: string | null;
  natija: string | null;
  javob_boshlanish_at: string | null;
  course_id: string;
}

/** Mashqni + egasi kursini bitta so'rovda oladi, egalikni tekshirish uchun. */
async function getOwnedExercise(exerciseId: string, userId: string): Promise<ExerciseRow | null> {
  const [row] = await query<ExerciseRow>(
    `SELECT e.id, e.user_id, e.chapter_id, e.turi, e.savol, e.togri_javob, e.mavzu,
            e.natija, e.javob_boshlanish_at, c.id AS course_id
     FROM exercises e
     LEFT JOIN chapters ch ON ch.id = e.chapter_id
     LEFT JOIN books b ON b.id = ch.book_id
     LEFT JOIN courses c ON c.id = b.course_id
     WHERE e.id=$1 AND e.user_id=$2`,
    [exerciseId, userId]
  );
  return row ?? null;
}

function safeJsonParse(text: string): any {
  const cleaned = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

// ============================================================
// 1) Mashq generatsiya
// ============================================================

const TURLAR = [
  "tanlov",
  "boshliq_toldirish",
  "tarjima",
  "gap_tuzish",
  "writing",
  "error_correction",
  "teach_back",
] as const;

const GenerateSchema = z.object({
  turi: z.enum(TURLAR).optional(), // berilmasa Fenix o'zi tanlaydi
});

exercisesRouter.post("/chapters/:chapterId/exercises", async (req, res) => {
  const parsed = GenerateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const chapter = await getOwnedChapter(req.params.chapterId, userId);
  if (!chapter) return res.status(404).json({ xato: "bob topilmadi" });
  if (!chapter.matn) {
    return res.status(422).json({ xato: "bu bobda matn yo'q — PDF qayta ishlanishi tugallanmagan bo'lishi mumkin" });
  }

  const ctx = await buildLearnerContext(userId, chapter.course_id);
  const turi = parsed.data.turi ?? "boshliq_toldirish";

  // Interleaving (N): ~25% ehtimol bilan, agar mos nomzod topilsa,
  // bu mashq YANGI bob mavzusi o'rniga ESKI, hali mustahkam
  // bo'lmagan mavzu/so'zni takrorlashga bag'ishlanadi. Bob matni
  // baribir kontekst sifatida beriladi (Claude misollarni o'sha
  // tildan/darajadan tanlashi uchun), lekin savol eski mavzuga oid.
  // FIX v8.1: chapter.nomi uzatiladi (avval null edi) — shu bilan
  // pickInterleavedCandidate joriy bob mavzusini havzadan olib
  // tashlaydi va haqiqiy "eski mavzu" tanlanadi.
  const interleavedNomzod = await pickInterleavedCandidate(
    userId,
    chapter.course_id,
    chapter.nomi ?? null
  );
  const interleavedBolsinmi = interleavedNomzod !== null && Math.random() < 0.25;

  const interleavingVazifasi = interleavedBolsinmi
    ? interleavedNomzod!.turi === "mavzu"
      ? `VAZIFA: bu safar YANGI bob mavzusi EMAS — o'quvchining ilgari
qiynalgan "${interleavedNomzod!.mavzu}" mavzusini TAKRORLASH uchun
"${turi}" turidagi BITTA mashq tuz (interleaving — aralashtirilgan
takrorlash). Til va daraja bob matniga mos bo'lsin, lekin savolning
o'zi shu eski mavzuga qaratilgan bo'lsin.`
      : `VAZIFA: bu safar YANGI bob mavzusi EMAS — ilgari qo'shilgan
"${interleavedNomzod!.soz}" (${interleavedNomzod!.tarjima}) so'zini
takrorlash/mustahkamlash uchun "${turi}" turidagi BITTA mashq tuz
(interleaving). Bu so'z gap ichida tabiiy ishlatilishi kerak.`
    : `VAZIFA: shu bob matni asosida, o'quvchining zaif tomonlari va joriy
darajasiga mos "${turi}" turidagi BITTA mashq tuzib ber. Mashq bob
matnidagi haqiqiy tilga oid hodisaga (grammatika/lug'at) tayanishi
kerak — o'ylab topilgan/bobga aloqasi yo'q savol bermang.`;

  const prompt = `${renderLearnerContext(ctx)}

DARSLIK BOBI ("${chapter.nomi ?? "nomsiz"}", ${chapter.til_nomi} tili) matnidan
qism (agar uzun bo'lsa qisqartirilgan):
---
${chapter.matn.slice(0, 4000)}
---

${interleavingVazifasi}
${
    turi === "teach_back"
      ? `\n(Bu "teach_back" turi — savolni "...qoidasini/tushunchasini\no'zingizning so'zlaringiz bilan tushuntirib bering, misol bilan"\nshaklida shakllantir. "togri_javob" albatta null bo'lsin — bu ochiq\ntur.)`
      : ""
  }

Shuningdek, bob matnidan mavzuga oid 1-3 ta yangi so'z/ibora tanla
(o'quvchi darajasiga mos, juda oddiy yoki juda murakkab bo'lmasin) —
bular so'z boyligi takrorlash navbatiga qo'shiladi.${
    interleavedBolsinmi ? " (Bu safar interleaving mashqi bo'lgani uchun, agar mos so'z topilmasa bo'sh massiv qaytarsang ham bo'ladi.)" : ""
  }

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "mavzu": "<qisqa grammatik/leksik mavzu nomi, masalan 'Perfekt' yoki 'Dativ prepozitsiyalari'>",
  "savol": "<o'quvchiga ko'rsatiladigan savol/topshiriq matni>",
  "togri_javob": "<aniq to'g'ri javob, agar mashq turi ochiq (writing/teach_back) bo'lsa null qo'y>",
  "yangi_sozlar": [
    { "soz": "<asl tildagi so'z>", "tarjima": "<o'zbekcha tarjimasi>", "soz_turi": "<masalan Nomen/Verb/Adjektiv, aniq bo'lmasa null>" }
  ]
}`;

  try {
    const text = await callClaude({
      model: "claude-sonnet-4-6",
      maqsad: "mashq_generatsiya",
      prompt,
      maxTokens: 800,
      userId,
    });
    const parsedExercise = safeJsonParse(text) as {
      mavzu: string;
      savol: string;
      togri_javob: string | null;
      yangi_sozlar?: { soz: string; tarjima: string; soz_turi: string | null }[];
    };

    const [exercise] = await query<{ id: string }>(
      `INSERT INTO exercises (user_id, chapter_id, turi, savol, togri_javob, mavzu, javob_boshlanish_at, interleaved_mi)
       VALUES ($1,$2,$3,$4,$5,$6, now(), $7)
       RETURNING id`,
      [
        userId,
        chapter.id,
        turi,
        parsedExercise.savol,
        parsedExercise.togri_javob ?? null,
        parsedExercise.mavzu,
        interleavedBolsinmi,
      ]
    );

    // Bob matnidan taklif qilingan yangi so'zlarni SM-2 navbatiga qo'shadi.
    // Xato bo'lsa ham mashqning o'zi baribir yaratilgan bo'lishi kerak —
    // shuning uchun bu qism alohida try/catch bilan izolyatsiya qilingan.
    if (parsedExercise.yangi_sozlar?.length) {
      try {
        for (const s of parsedExercise.yangi_sozlar.slice(0, 3)) {
          if (!s.soz || !s.tarjima) continue;
          await query(
            `INSERT INTO words (user_id, course_id, chapter_id, soz, tarjima, soz_turi)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (user_id, course_id, soz) DO NOTHING`,
            [userId, chapter.course_id, chapter.id, s.soz, s.tarjima, s.soz_turi ?? null]
          );
        }
      } catch (sozXato) {
        console.error("[exercises] yangi so'zlarni saqlashda xato:", sozXato);
      }
    }

    // togri_javob ataylab qaytarilmaydi — javobni tekshirishdan oldin ko'rinmasin
    res.status(201).json({
      id: exercise.id,
      turi,
      savol: parsedExercise.savol,
      mavzu: parsedExercise.mavzu,
      interleaved: interleavedBolsinmi,
    });
  } catch (err) {
    res.status(502).json({
      xato: "mashq generatsiya qilinmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

// ============================================================
// 2) Javobni tekshirish
// ============================================================

const AnswerSchema = z.object({
  javob: z.string().min(1),
});

exercisesRouter.post("/exercises/:id/answer", async (req, res) => {
  const parsed = AnswerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });
  if (exercise.natija) {
    return res.status(409).json({ xato: "bu mashq allaqachon baholangan" });
  }

  const ctx = await buildLearnerContext(userId, exercise.course_id);
  const isTeachBack = exercise.turi === "teach_back";

  const baholashVazifasi = isTeachBack
    ? `VAZIFA: bu "teach_back" (o'qitib ber) mashqi — o'quvchi qoidani
o'ziga tushuntirib berdi. Grammatik xatolarga emas, TUSHUNISH
CHUQURLIGIGA baho ber: tushuntirish to'g'rimi, chuqurmi (sirtqi
yodlab olishmi yoki chindan tushunibmi), misol keltirdimi, istisno/
chegara holatlarni bilamimi. Ustoz qattiqqolligiga mos ohangda
(${ctx.ustoz_qattiqqolligi}/5) qisqa fikr-mulohaza yoz.`
    : `VAZIFA: javobni Fenix nomidan baholash. Ustoz qattiqqolligiga mos
ohangda (${ctx.ustoz_qattiqqolligi}/5) qisqa fikr-mulohaza yoz —
xatoni yashirma, lekin kamsitma, aniq nima xato ekanini tushuntir.`;

  const prompt = `${renderLearnerContext(ctx)}

MASHQ (${exercise.turi}): ${exercise.savol}
${exercise.togri_javob ? `KUTILAYOTGAN TO'G'RI JAVOB (yo'l-yo'riq sifatida, so'zma-so'z mos kelishi shart emas): ${exercise.togri_javob}` : "(bu ochiq turdagi mashq — qat'iy bitta to'g'ri javob yo'q, mazmun/grammatikaga qarab baho)"}

O'QUVCHI JAVOBI: ${parsed.data.javob}

${baholashVazifasi}

Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{
  "natija": "togri" | "notogri" | "qisman",
  "fenix_fikri": "<o'quvchiga ko'rsatiladigan qisqa fikr-mulohaza, 2-4 gap>",
  "baholash_grammatika": <0.0-1.0>,
  "baholash_tabiiylik": <0.0-1.0>,
  "baholash_lugat_boyligi": <0.0-1.0>
}${
    isTeachBack
      ? `\n\n("baholash_grammatika/tabiiylik/lugat_boyligi" maydonlari bu\nmashq turida mos ravishda "tushuntirish aniqligi", "misol\nkeltirilgani" va "atamalardan to'g'ri foydalanilgani"ni bildiradi\n— shu ma'noda to'ldir.)`
      : ""
  }`;

  // ASOSIY BAHOLASH: bu blok muvaffaqiyatsiz bo'lsa foydalanuvchi
  // haqiqatan natija ololmagan bo'ladi — shuning uchun 502 to'g'ri.
  // FIX v8.1 (izolyatsiya): bundan keyingi HAMMA narsa (error_bank,
  // learnerProfile, user_progress, streak, teach-back kuzatuv savoli)
  // yon-effekt hisoblanadi va o'z alohida try/catch'iga ega — ulardan
  // biri qulasa ham foydalanuvchi natijasini (baho, fenix_fikri)
  // baribir oladi. Avval bularning barchasi bitta try ichida edi,
  // shu sabab masalan error_bank INSERT xato bersa foydalanuvchi
  // 502 olardi va UPDATE exercises allaqachon yozilgani uchun qayta
  // urinishda 409 "allaqachon baholangan" ko'rardi — natijani hech
  // qachon ko'rmasdi.
  let baho: {
    natija: "togri" | "notogri" | "qisman";
    fenix_fikri: string;
    baholash_grammatika: number;
    baholash_tabiiylik: number;
    baholash_lugat_boyligi: number;
  };
  try {
    const text = await callClaude({
      model: "claude-sonnet-4-6",
      maqsad: "tekshirish",
      prompt,
      maxTokens: 700,
      userId,
    });
    baho = safeJsonParse(text);

    const javobTezligiMs = exercise.javob_boshlanish_at
      ? Date.now() - new Date(exercise.javob_boshlanish_at).getTime()
      : null;

    await query(
      `UPDATE exercises
       SET foydalanuvchi_javobi=$2, natija=$3, fenix_fikri=$4,
           baholash_grammatika=$5, baholash_tabiiylik=$6, baholash_lugat_boyligi=$7,
           javob_yuborilgan_at=now(), javob_tezligi_ms=$8
       WHERE id=$1`,
      [
        exercise.id,
        parsed.data.javob,
        baho.natija,
        baho.fenix_fikri,
        baho.baholash_grammatika,
        baho.baholash_tabiiylik,
        baho.baholash_lugat_boyligi,
        javobTezligiMs,
      ]
    );
  } catch (err) {
    res.status(502).json({
      xato: "javobni tekshirib bo'lmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Bu nuqtadan boshlab foydalanuvchi javobi DB'ga yozilgan va
  // baho tayyor — nima bo'lishidan qat'iy nazar res.json pastda
  // yuboriladi. Har bir yon-effekt mustaqil xato ushlaydi.
  const togrimi = baho.natija === "togri";

  if (!togrimi) {
    try {
      const xatoMatni = `"${exercise.savol}" mashqida: ${parsed.data.javob}`;

      // FIX: avval shu foydalanuvchining shu MAVZU bo'yicha oxirgi
      // xatosi bor-yo'qligini tekshiramiz (exercises.mavzu ustuni
      // aynan shu bog'lanish uchun mo'ljallangan — sxemadagi izohga
      // qarang). `xato_matni` har safar savol+javobga qarab o'zgarib
      // turadi, shuning uchun aniq matn bo'yicha solishtirish deyarli
      // hech qachon mos kelmaydi — mavzu esa barqaror kalit.
      // Topilsa — yangi qator ochish o'rniga takrorlanish_soni'ni
      // oshiramiz va qayta_korsatish_at'ni (SM-2 uslubidagi oddiy
      // o'suvchi interval bilan) yangilaymiz.
      let existing: { id: string; takrorlanish_soni: number } | undefined;
      if (exercise.mavzu) {
        [existing] = await query<{ id: string; takrorlanish_soni: number }>(
          `SELECT eb.id, eb.takrorlanish_soni
           FROM error_bank eb
           LEFT JOIN exercises e ON e.id = eb.exercise_id
           WHERE eb.user_id=$1 AND e.mavzu=$2
           ORDER BY eb.created_at DESC LIMIT 1`,
          [userId, exercise.mavzu]
        );
      }

      // Oddiy o'suvchi jadval (kun): 1, 3, 7, 14, 30 (keyin 30da to'xtaydi).
      const INTERVALLAR_KUN = [1, 3, 7, 14, 30];

      if (existing) {
        const yangiSoni = existing.takrorlanish_soni + 1;
        const intervalKun = INTERVALLAR_KUN[Math.min(yangiSoni - 1, INTERVALLAR_KUN.length - 1)];
        await query(
          `UPDATE error_bank
           SET takrorlanish_soni=$2,
               xato_matni=$3,
               exercise_id=$4,
               qayta_korsatish_at = now() + ($5 || ' days')::interval
           WHERE id=$1`,
          [existing.id, yangiSoni, xatoMatni, exercise.id, intervalKun]
        );
      } else {
        await query(
          `INSERT INTO error_bank (user_id, exercise_id, xato_matni, sabab_taxmini, qayta_korsatish_at)
           VALUES ($1,$2,$3,'aniqlanmagan', now() + interval '1 day')`,
          [userId, exercise.id, xatoMatni]
        );
      }
    } catch (err) {
      console.error("[exercises] error_bank yozishda xato:", err);
    }
  }

  try {
    await recordExerciseOutcome({
      natija: baho.natija,
      userId,
      courseId: exercise.course_id,
      mavzu: exercise.mavzu,
    });
  } catch (err) {
    console.error("[exercises] recordExerciseOutcome xato:", err);
  }

  // user_progress yangilanishi. ESLATMA: aniq "bob nechta mashqdan
  // iborat" degan meyor hozircha yo'q, shuning uchun oddiy
  // qadam-qadam evristika ishlatilgan — to'g'ri javob uchun +8%,
  // qisman uchun +5%, to'liq noto'g'ri uchun +2% (urinish ham hisobga
  // olinadi), 100%da to'xtaydi. FIX: avval "qisman" ham +2% olardi —
  // to'liq xato bilan bir xil jazolanardi. Bu real progress-bar emas,
  // taxminiy ko'rsatkich — keyinroq aniqroq meyor (masalan mashqlar
  // soni/bob) bilan almashtirish kerak bo'ladi.
  if (exercise.chapter_id) {
    try {
      const qadam = togrimi ? 8 : baho.natija === "qisman" ? 5 : 2;
      await query(
        `INSERT INTO user_progress (user_id, course_id, chapter_id, foiz_bajarilgan, boshlangan_at, yakunlangan_at)
         VALUES ($1,$2,$3, LEAST(100, $4), now(), NULL)
         ON CONFLICT (user_id, chapter_id) DO UPDATE
         SET foiz_bajarilgan = LEAST(100, user_progress.foiz_bajarilgan + $4),
             yakunlangan_at = CASE
               WHEN user_progress.foiz_bajarilgan + $4 >= 100 AND user_progress.yakunlangan_at IS NULL
               THEN now() ELSE user_progress.yakunlangan_at END,
             updated_at = now()`,
        [userId, exercise.course_id, exercise.chapter_id, qadam]
      );
    } catch (err) {
      console.error("[exercises] user_progress yangilashda xato:", err);
    }
  }

  // FIX v8.1 (streak): avval streak_kun hech qayerda yangilanmasdi.
  // Bu yerda — foydalanuvchi haqiqatan bitta mashqni yakunlagan
  // paytda — kunlik faollik hisoblanadi (o'z vaqt_zonasi bo'yicha):
  //   * oxirgi faollik BUGUN bo'lsa — streak o'zgarmaydi (kuniga
  //     bir marta hisoblanadi, ko'p mashq qilish streak'ni oshirmaydi)
  //   * oxirgi faollik KECHA bo'lsa — streak +1
  //   * aks holda (uzilish yoki birinchi marta) — streak = 1
  try {
    await query(
      `UPDATE users SET
         streak_kun = CASE
           WHEN oxirgi_faollik_at IS NULL THEN 1
           WHEN (oxirgi_faollik_at AT TIME ZONE vaqt_zonasi)::date
                = (now() AT TIME ZONE vaqt_zonasi)::date THEN streak_kun
           WHEN (oxirgi_faollik_at AT TIME ZONE vaqt_zonasi)::date
                = ((now() AT TIME ZONE vaqt_zonasi)::date - INTERVAL '1 day') THEN streak_kun + 1
           ELSE 1
         END,
         oxirgi_faollik_at = now(),
         updated_at = now()
       WHERE id=$1`,
      [userId]
    );
  } catch (err) {
    console.error("[exercises] streak_kun yangilashda xato:", err);
  }

  // Teach-back (R) chuqurlashtirish: oddiy "to'g'ri/noto'g'ri" bilan
  // to'xtamaydi — Fenix darhol (Haiku bilan, arzon) o'quvchi
  // tushuntirishining chuqurligini sinovdan o'tkazadigan BITTA
  // kuzatuv savoli tuzadi va uni "Nega?" suhbat tarixiga o'zi
  // yozib qo'yadi — o'quvchi so'ramasa ham dialog boshlab beriladi.
  let teachBackKuzatuvSavoli: string | null = null;
  if (isTeachBack) {
    try {
      const kuzatuvPrompt = `Sen Fenix — qattiqqo'l, adolatli AI til-ustozisan.
O'quvchi hozir quyidagi qoidani o'ziga tushuntirib berdi (teach-back):

MASHQ: ${exercise.savol}
O'QUVCHI TUSHUNTIRISHI: ${parsed.data.javob}
SENING BAHOING: ${baho.fenix_fikri}

VAZIFA: tushunish chuqurligini yanada sinash uchun BITTA qisqa
kuzatuv/qarshi-misol savoli tuz (masalan chegara holat, istisno,
yoki "nega aynan shunday" tipidagi savol). Faqat savol matnini yoz,
boshqa hech narsa (JSON emas, oddiy matn, 1-2 gap).`;

      const savol = await callClaude({
        model: "claude-haiku-4-5",
        maqsad: "teach_back_kuzatuv",
        prompt: kuzatuvPrompt,
        maxTokens: 200,
        userId,
      });
      teachBackKuzatuvSavoli = savol.trim();

      await query(
        `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
         VALUES ($1,$2,$3,'fenix')`,
        [exercise.id, userId, teachBackKuzatuvSavoli]
      );
    } catch (kuzatuvXato) {
      // Kuzatuv savoli chiqmasa ham asosiy baholash natijasi
      // baribir foydalanuvchiga qaytishi kerak.
      console.error("[exercises] teach-back kuzatuv savoli yaratilmadi:", kuzatuvXato);
    }
  }

  res.json({
    natija: baho.natija,
    fenix_fikri: baho.fenix_fikri,
    togri_javob: exercise.togri_javob,
    baholash: {
      grammatika: baho.baholash_grammatika,
      tabiiylik: baho.baholash_tabiiylik,
      lugat_boyligi: baho.baholash_lugat_boyligi,
    },
    teach_back_kuzatuv_savoli: teachBackKuzatuvSavoli,
  });
});

// ============================================================
// 3) "Nega?" mini-suhbat (exercise_discussions)
// ============================================================

const DiscussSchema = z.object({
  xabar: z.string().min(1),
});

exercisesRouter.post("/exercises/:id/discuss", async (req, res) => {
  const parsed = DiscussSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ xato: parsed.error.flatten() });
  }
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });

  await query(
    `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
     VALUES ($1,$2,$3,'user')`,
    [exercise.id, userId, parsed.data.xabar]
  );

  const tarix = await query<{ xabar: string; kim_yozgan: string }>(
    `SELECT xabar, kim_yozgan FROM exercise_discussions
     WHERE exercise_id=$1 ORDER BY created_at ASC LIMIT 20`,
    [exercise.id]
  );

  const suhbatMatni = tarix
    .map((m) => `${m.kim_yozgan === "user" ? "O'quvchi" : "Fenix"}: ${m.xabar}`)
    .join("\n");

  const prompt = `Sen Fenix — qattiqqo'l, adolatli, adaptiv AI til-ustozisan.
Quyidagi mashq bo'yicha o'quvchi bilan "Nega?" mini-suhbatidasan —
u nega xato/to'g'ri ekanini chuqurroq tushunmoqchi.

MASHQ: ${exercise.savol}
${exercise.togri_javob ? `TO'G'RI JAVOB: ${exercise.togri_javob}` : ""}
${exercise.mavzu ? `MAVZU: ${exercise.mavzu}` : ""}

SUHBAT TARIXI:
${suhbatMatni}

Fenix nomidan keyingi javobni yoz — qisqa (3-6 gap), aniq, sodda
tushuntirish bilan (kerak bo'lsa misol keltir). Faqat javob matnini
yoz, boshqa hech narsa (JSON emas, oddiy matn).`;

  try {
    const javob = await callClaude({
      model: "claude-haiku-4-5",
      maqsad: "nega_suhbat",
      prompt,
      maxTokens: 400,
      userId,
    });

    await query(
      `INSERT INTO exercise_discussions (exercise_id, user_id, xabar, kim_yozgan)
       VALUES ($1,$2,$3,'fenix')`,
      [exercise.id, userId, javob.trim()]
    );

    res.status(201).json({ xabar: javob.trim() });
  } catch (err) {
    res.status(502).json({
      xato: "Fenix javob bera olmadi",
      tafsilot: err instanceof Error ? err.message : String(err),
    });
  }
});

// ============================================================
// 4) Mashqni + suhbat tarixini o'qish (sahifa qayta ochilganda)
// ============================================================

exercisesRouter.get("/exercises/:id", async (req, res) => {
  const userId = await currentUserId(req.telegramUser!.id);
  if (!userId) return res.status(404).json({ xato: "foydalanuvchi topilmadi" });

  const exercise = await getOwnedExercise(req.params.id, userId);
  if (!exercise) return res.status(404).json({ xato: "mashq topilmadi" });

  const tarix = await query(
    `SELECT xabar, kim_yozgan, created_at FROM exercise_discussions
     WHERE exercise_id=$1 ORDER BY created_at ASC`,
    [exercise.id]
  );

  res.json({ ...exercise, suhbat: tarix });
});
