import { api } from "./client";

export interface Course {
  id: string;
  til_nomi: string;
  til_kodi: string;
  holati: string;
  maqsad: string | null;
  maqsad_sana: string | null;
  created_at: string;
  // Kurs darajasidagi umumiy progress (barcha boblar o'rtachasi)
  foiz_bajarilgan: number;
  boblar_soni: number;
  yakunlangan_boblar: number;
}

export interface Book {
  id: string;
  nomi: string;
  turi: string;
  qayta_ishlash_holati: string;
}

export interface CourseDetail extends Course {
  kuchli_tomonlar: unknown[];
  zaif_tomonlar: unknown[];
  ogrenish_uslubi_taxmin: string;
  books: Book[];
}

export interface FenixUser {
  id: string;
  telegram_id: number;
  ism: string;
  joriy_daraja: string;
  streak_kun: number;
  ustoz_qattiqqolligi: number;
}

export const syncUser = (ism: string) => api.post<FenixUser>("/users/sync", { ism });
export const getMe = () => api.get<FenixUser>("/users/me");

export const listCourses = () => api.get<Course[]>("/courses");
export const getCourse = (id: string) => api.get<CourseDetail>(`/courses/${id}`);
export const createCourse = (data: { til_nomi: string; til_kodi: string; maqsad?: string }) =>
  api.post<{ id: string }>("/courses", data);

export const presignUpload = (content_type: string) =>
  api.post<{ file_key: string; upload_url: string }>("/upload/presign", { content_type });

export const registerBook = (data: {
  course_id: string;
  nomi: string;
  turi: "lehrbuch" | "arbeitsbuch" | "audio" | "qoshimcha";
  file_key: string;
  til_kodi?: string;
}) => api.post<{ book_id: string; holati: string }>("/books", data);

/** FIX (#8): kitob registratsiyasi endi darhol qaytadi (202,
 * holati='jarayonda') — qayta ishlash fonda davom etadi. Frontend
 * shu funksiya bilan holatni pollab, tayyor/xato bo'lguncha kutadi. */

export interface BookExercise {
  id: string;
  chapter_id: string | null;
  exercise_number: string;
  heading_kind: "numeric" | "sub_inherited";
  xom_matn: string;
  page_physical: number;
  page_printed: number | null;
  bbox: number[] | null;
  reading_order_position: number;
  audio_markers: string[];
  page_type: string | null;
  needs_review: boolean;
  needs_review_reason: string | null;
  tekshirilgan: boolean;
  tekshirilgan_at: string | null;
}

export interface BookExercisesResult {
  jami: number;
  needs_review_soni: number;
  tekshirilgan_soni: number;
  qaytarildi: number;
  mashqlar: BookExercise[];
}

export const extractBookExercises = (bookId: string) =>
  api.post<{ book_id: string; job_id: string; holati: string }>(
    `/books/${bookId}/exercises/extract`
  );

export const getBookExercises = (bookId: string) =>
  api.get<BookExercisesResult>(`/books/${bookId}/exercises`);

export const getBook = (bookId: string) =>
  api.get<{ id: string; qayta_ishlash_holati: string; qayta_ishlash_xatosi: string | null }>(
    `/books/${bookId}`
  );

/**
 * Fayl to'g'ridan-to'g'ri R2'ga presigned URL orqali yuklanadi (Node'ni
 * band qilmaydi). fetch() yuklash progressini bermaydi, shuning uchun
 * XMLHttpRequest ishlatiladi — onProgress orqali foizni kuzatish mumkin.
 */
export function uploadFileToR2(
  file: File,
  upload_url: string,
  onProgress?: (foiz: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload_url);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 yuklash xatosi: HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("R2 yuklash xatosi: tarmoq muammosi")));
    xhr.addEventListener("timeout", () => reject(new Error("R2 yuklash xatosi: vaqt tugadi")));

    xhr.send(file);
  });
}

// ---- Brain loop: boblar, mashqlar, "Nega?" suhbat ----

export interface Chapter {
  id: string;
  nomi: string | null;
  tartib_raqami: number;
  sahifa_boshi: number | null;
  sahifa_oxiri: number | null;
  // FIX (#progress-bar): backend endi shu ikkalasini ham qaytaradi
  // (avval user_progress hisoblanardi-yu hech qayerda ko'rsatilmasdi).
  foiz_bajarilgan: number;
  yakunlangan: boolean;
}

export const listChapters = (bookId: string) => api.get<Chapter[]>(`/books/${bookId}/chapters`);

export type ExerciseTuri =
  | "tanlov"
  | "boshliq_toldirish"
  | "tarjima"
  | "gap_tuzish"
  | "writing"
  | "error_correction"
  | "teach_back";

export interface NewExercise {
  id: string;
  turi: ExerciseTuri;
  savol: string;
  mavzu: string;
  interleaved?: boolean;
  manba?: "ai" | "kitob"; // "kitob" — darslikdan olingan haqiqiy mashq
}

export const generateExercise = (chapterId: string, turi?: ExerciseTuri) =>
  api.post<NewExercise>(`/chapters/${chapterId}/exercises`, turi ? { turi } : {});

// ---- Dars sessiyasi (lesson session) — isinish → tushuntirish →
// amaliyot ⇄ qayta_tushuntirish → yakun ----

export type LessonHolat = "isinish" | "tushuntirish" | "amaliyot" | "qayta_tushuntirish" | "yakunlandi";

export interface LessonStart {
  session_id: string;
  holat: LessonHolat;
  tushuntirish_matni: string | null;
  mashqlar_soni: number;
  davom_etilmoqda: boolean;
}

export const startLesson = (chapterId: string) =>
  api.post<LessonStart>(`/chapters/${chapterId}/lesson/start`);

export interface LessonNextMashq {
  tur: "mashq";
  exercise: NewExercise;
  mashqlar_soni: number;
  yakunlashni_taklif_qil: boolean;
}
export interface LessonNextQaytaTushuntirish {
  tur: "qayta_tushuntirish";
  mavzu: string;
  matn: string;
}
export type LessonNext = LessonNextMashq | LessonNextQaytaTushuntirish;

export const nextLessonExercise = (sessionId: string) =>
  api.post<LessonNext>(`/lesson/${sessionId}/exercises/next`);

export interface LessonFinish {
  xulosa_matni: string;
  mashqlar_soni: number;
  togri_soni: number;
  mavzular: string[];
}

export const finishLesson = (sessionId: string) => api.post<LessonFinish>(`/lesson/${sessionId}/finish`);

export interface AnswerResult {
  natija: "togri" | "notogri" | "qisman";
  fenix_fikri: string;
  togri_javob: string | null;
  baholash: { grammatika: number; tabiiylik: number; lugat_boyligi: number };
  teach_back_kuzatuv_savoli?: string | null;
}

export const submitAnswer = (exerciseId: string, javob: string) =>
  api.post<AnswerResult>(`/exercises/${exerciseId}/answer`, { javob });

export interface DiscussionMessage {
  xabar: string;
  kim_yozgan: "user" | "fenix";
  created_at?: string;
}

export const discussExercise = (exerciseId: string, xabar: string) =>
  api.post<{ xabar: string }>(`/exercises/${exerciseId}/discuss`, { xabar });

export const getExercise = (exerciseId: string) =>
  api.get<{
    id: string;
    turi: ExerciseTuri;
    savol: string;
    mavzu: string | null;
    natija: string | null;
    fenix_fikri: string | null;
    togri_javob: string | null;
    suhbat: DiscussionMessage[];
  }>(`/exercises/${exerciseId}`);

// ---- So'z boyligi: SM-2 takrorlash navbati ----

export interface DueWord {
  id: string;
  soz: string;
  tarjima: string;
  soz_turi: string | null;
  interval_kun: number;
  ease_factor: number;
  takrorlar_soni: number;
  next_review_at: string;
  faol_yoki_passiv: "passiv" | "faol" | null;
}

export const listDueWords = (courseId: string, limit?: number) =>
  api.get<DueWord[]>(`/courses/${courseId}/words/due${limit ? `?limit=${limit}` : ""}`);

export interface Sm2ReviewResult {
  interval_kun: number;
  ease_factor: number;
  takrorlar_soni: number;
  next_review_at: string;
}

export const reviewWord = (wordId: string, sifat: number) =>
  api.post<Sm2ReviewResult>(`/words/${wordId}/review`, { sifat });

export const addWord = (
  courseId: string,
  data: {
    soz: string;
    tarjima: string;
    soz_turi?: string;
    chapter_id?: string;
    faol_yoki_passiv?: "passiv" | "faol";
  }
) => api.post<{ id: string | null; qoshildi: boolean }>(`/courses/${courseId}/words`, data);

// ---- TTS (Google Cloud Text-to-Speech) ----

export const synthesizeSpeech = (matn: string, til_kodi?: string) =>
  api.post<{ audio_base64: string; format: string }>("/tts", { matn, til_kodi });

/**
 * base64 MP3'ni darhol ijro etadi.
 *
 * v8.1 tuzatish: `new Audio("data:audio/mp3;base64,…")` — iOS Safari va
 * Telegram WebApp'da `data:` URI ko'pincha bloklanadi yoki silent xato
 * beradi. Blob URL yondashuvi barcha platformalarda ishonchli ishlaydi:
 *   1. base64 → Uint8Array → Blob
 *   2. createObjectURL → Audio
 *   3. ended/error — voqealar bilan revokeObjectURL
 *
 * TTS sozlanmagan/xato bo'lsa xatoni chaqiruvchiga qaytaradi —
 * ovoz tugmasi ixtiyoriy narsa, oqimni buzmasligi kerak.
 */
export async function playTts(matn: string, til_kodi?: string): Promise<void> {
  const { audio_base64 } = await synthesizeSpeech(matn, til_kodi);

  // base64 → binary Uint8Array → Blob → object URL
  const bytes = Uint8Array.from(atob(audio_base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "audio/mp3" });
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);

  // URL'ni ozod qilish — Audio buffer o'zida saqlab oladi, shuning
  // uchun ended/error kelmagunicha revokeObjectURL chaqirilmaydi.
  const cleanup = () => URL.revokeObjectURL(url);
  audio.addEventListener("ended", cleanup, { once: true });
  audio.addEventListener("error", cleanup, { once: true });

  // play() iOS'da foydalanuvchi harakati (gesture) kontekstida
  // bo'lmasa ishlamasligi mumkin — bu cheklov brauzerdan keladi,
  // biz emas. Tugma onClick'dan chaqirilgani sababli odatda o'tadi.
  await audio.play();
}

// ---- Haftalik hisobot/shartnoma (X) ----

export interface WeeklyReport {
  hafta_boshi: string;
  majburiyat: { band: string; meyor: string }[] | null;
  natija_xulosa: string | null;
  vaqt_sarflangan_daq: number | null;
  mustahkam_mavzular: { mavzu: string; score: number }[];
  zaif_mavzular: { mavzu: string; score: number }[];
  created_at: string;
}

export const getWeeklyReport = (courseId: string) =>
  api.get<WeeklyReport>(`/courses/${courseId}/weekly-report`);

export const generateWeeklyReport = (courseId: string) =>
  api.post<
    WeeklyReport & { id: string; jami_mashqlar: number; togri_foizi: number }
  >(`/courses/${courseId}/weekly-report/generate`);
