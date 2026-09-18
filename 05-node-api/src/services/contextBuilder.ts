/**
 * contextBuilder.ts — Fenixning "miyasi" uchun kontekst yig'uvchi.
 *
 * Har bir Claude chaqiruvidan oldin (mashq generatsiya, tekshirish,
 * "Nega?" suhbat) shu modul o'quvchi haqidagi tarqoq ma'lumotlarni
 * (users, learner_profiles, error_bank) bitta izchil matn blokiga
 * yig'adi — prompt shu blok bilan boshlanadi. Loyiha hujjatidagi
 * "Context Builder" (7-bo'lim) shu yerda amalga oshadi (Bosqich 1
 * darajasida — oddiy SQL yig'indisi, Bosqich 3'da Knowledge Graph
 * bilan almashtiriladi).
 */
import { query } from "../db/pool.js";

export interface LearnerContext {
  ism: string;
  joriy_daraja: string;
  ustoz_qattiqqolligi: number; // 1 (yumshoq) — 5 (qattiq)
  kuchli_tomonlar: unknown[];
  zaif_tomonlar: unknown[];
  doimiy_xato_pattern: Record<string, { count: number; last_seen: string }>;
  eng_takrorlangan_xatolar: { xato_matni: string; takrorlanish_soni: number }[];
}

export async function buildLearnerContext(
  userId: string,
  courseId: string
): Promise<LearnerContext> {
  const [user] = await query<{
    ism: string;
    joriy_daraja: string;
    ustoz_qattiqqolligi: number;
  }>(`SELECT ism, joriy_daraja, ustoz_qattiqqolligi FROM users WHERE id=$1`, [userId]);

  const [profile] = await query<{
    kuchli_tomonlar: unknown[];
    zaif_tomonlar: unknown[];
    doimiy_xato_pattern: Record<string, { count: number; last_seen: string }>;
  }>(
    `SELECT kuchli_tomonlar, zaif_tomonlar, doimiy_xato_pattern
     FROM learner_profiles WHERE user_id=$1 AND course_id=$2`,
    [userId, courseId]
  );

  const eng_takrorlangan_xatolar = await query<{
    xato_matni: string;
    takrorlanish_soni: number;
  }>(
    `SELECT xato_matni, takrorlanish_soni FROM error_bank
     WHERE user_id=$1 ORDER BY takrorlanish_soni DESC, created_at DESC LIMIT 5`,
    [userId]
  );

  return {
    ism: user?.ism ?? "Foydalanuvchi",
    joriy_daraja: user?.joriy_daraja ?? "A1",
    ustoz_qattiqqolligi: user?.ustoz_qattiqqolligi ?? 3,
    kuchli_tomonlar: profile?.kuchli_tomonlar ?? [],
    zaif_tomonlar: profile?.zaif_tomonlar ?? [],
    doimiy_xato_pattern: profile?.doimiy_xato_pattern ?? {},
    eng_takrorlangan_xatolar,
  };
}

/** Kontekstni Claude prompt'iga qo'shsa bo'ladigan matn blokiga aylantiradi. */
export function renderLearnerContext(ctx: LearnerContext): string {
  const zaifXatolar = ctx.eng_takrorlangan_xatolar.length
    ? ctx.eng_takrorlangan_xatolar
        .map((e) => `"${e.xato_matni}" (${e.takrorlanish_soni} marta)`)
        .join("; ")
    : "hali yo'q";

  const xatoPatternlari = Object.keys(ctx.doimiy_xato_pattern).length
    ? Object.entries(ctx.doimiy_xato_pattern)
        .map(([mavzu, m]) => `${mavzu} (${m.count} marta)`)
        .join(", ")
    : "hali aniqlanmagan";

  return `O'QUVCHI HAQIDA (Fenix uchun kontekst):
- Ism: ${ctx.ism}
- Joriy daraja: ${ctx.joriy_daraja}
- Ustoz qattiqqolligi (1=yumshoq, 5=qattiq): ${ctx.ustoz_qattiqqolligi}
- Kuchli tomonlar: ${JSON.stringify(ctx.kuchli_tomonlar)}
- Zaif tomonlar: ${JSON.stringify(ctx.zaif_tomonlar)}
- Doimiy takrorlanadigan xato mavzulari: ${xatoPatternlari}
- Eng ko'p takrorlangan aniq xatolar: ${zaifXatolar}

Fenix shaxsi: qattiqqo'l, adolatli, adaptiv AI-ustoz. Xatoni yashirmaydi,
lekin kamsitmaydi. Yuqoridagi zaif tomonlar/xato patternlarni
imkon qadar hisobga ol — bir xil xatoni qayta-qayta ko'rsatib
o'tirma, aksincha o'quvchi buni allaqachon bilishini nazarda tut va
chuqurroq boraver.`;
}

// ============================================================
// Interleaving (N): mashqlarning ~20-30% qismi eski, hali
// mustahkamlanmagan mavzu/so'zlardan iborat bo'ladi (loyiha
// hujjati, 3.5/N-bo'lim). Alohida jadval kerak emas — mavjud
// `learner_profiles.zaif_tomonlar` va `words`dan tanlanadi.
// ============================================================

export type InterleavedCandidate =
  | { turi: "mavzu"; mavzu: string }
  | { turi: "soz"; soz: string; tarjima: string };

/** Joriy bobning mavzusi bilan bir xil bo'lmagan, hali mustahkam
 * bo'lmagan bitta eski mavzu yoki so'zni tasodifiy tanlaydi.
 * Nomzod topilmasa `null` qaytaradi — chaqiruvchi shunda oddiy
 * (interleaving'siz) mashqqa qaytishi kerak. */
export async function pickInterleavedCandidate(
  userId: string,
  courseId: string,
  joriyMavzuHint?: string | null
): Promise<InterleavedCandidate | null> {
  const [profile] = await query<{
    zaif_tomonlar: { mavzu: string; score: number }[];
  }>(`SELECT zaif_tomonlar FROM learner_profiles WHERE user_id=$1 AND course_id=$2`, [
    userId,
    courseId,
  ]);

  const mavzuNomzodlari = (profile?.zaif_tomonlar ?? [])
    .filter((z) => z.mavzu && z.mavzu !== joriyMavzuHint)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Hali kam takrorlangan (takrorlar_soni<3) so'zlar — yangi
  // qo'shilgan/hali yaxshi mustahkamlanmagan so'zlar.
  const sozNomzodlari = await query<{ soz: string; tarjima: string }>(
    `SELECT soz, tarjima FROM words
     WHERE user_id=$1 AND course_id=$2 AND deleted_at IS NULL AND takrorlar_soni < 3
     ORDER BY next_review_at ASC LIMIT 5`,
    [userId, courseId]
  );

  const havza: InterleavedCandidate[] = [
    ...mavzuNomzodlari.map((z) => ({ turi: "mavzu" as const, mavzu: z.mavzu })),
    ...sozNomzodlari.map((s) => ({ turi: "soz" as const, soz: s.soz, tarjima: s.tarjima })),
  ];

  if (havza.length === 0) return null;
  return havza[Math.floor(Math.random() * havza.length)];
}
