/**
 * learnerProfile.ts — mashq natijasidan keyin `learner_profiles`ni
 * yangilaydi. Bosqich 1 darajasida ATAYIN oddiy heuristika: xato
 * bo'lsa `doimiy_xato_pattern[mavzu]` sanog'ini oshiradi, to'g'ri
 * bo'lsa `kuchli_tomonlar`ga qo'shadi/yangilaydi. Chuqurroq tahlil —
 * root-cause klasterlash (KK), mastery bosqichlari (FF) — Bosqich 3
 * vazifasi (ustunlar DB'da forward-compat sifatida allaqachon bor).
 */
import { query } from "../db/pool.js";

interface KuchliZaifYozuv {
  mavzu: string;
  score: number;
  updated_at: string;
}

export async function recordExerciseOutcome(params: {
  userId: string;
  courseId: string;
  mavzu: string | null;
  togrimi: boolean; // natija === 'togri'
}): Promise<void> {
  const { userId, courseId, mavzu, togrimi } = params;
  if (!mavzu) return; // mavzu aniqlanmagan bo'lsa profilni yangilash uchun asos yo'q

  const [profile] = await query<{
    id: string;
    kuchli_tomonlar: KuchliZaifYozuv[];
    zaif_tomonlar: KuchliZaifYozuv[];
    doimiy_xato_pattern: Record<string, { count: number; last_seen: string; root_cause_id: string | null }>;
  }>(
    `SELECT id, kuchli_tomonlar, zaif_tomonlar, doimiy_xato_pattern
     FROM learner_profiles WHERE user_id=$1 AND course_id=$2`,
    [userId, courseId]
  );
  if (!profile) return; // kurs yaratilganda avtomatik ochilishi kerak — himoya sifatida

  const endi = new Date().toISOString();
  let kuchli = profile.kuchli_tomonlar ?? [];
  let zaif = profile.zaif_tomonlar ?? [];
  const pattern = profile.doimiy_xato_pattern ?? {};

  if (togrimi) {
    const mavjud = kuchli.find((k) => k.mavzu === mavzu);
    if (mavjud) {
      mavjud.score = Math.min(1, mavjud.score + 0.1);
      mavjud.updated_at = endi;
    } else {
      kuchli = [...kuchli, { mavzu, score: 0.6, updated_at: endi }];
    }
    // Agar shu mavzu zaif tomonlarda bo'lsa va endi to'g'ri bajarilsa — asta pasaytiradi
    zaif = zaif
      .map((z) => (z.mavzu === mavzu ? { ...z, score: Math.max(0, z.score - 0.15) } : z))
      .filter((z) => z.score > 0.1);
  } else {
    const mavjud = zaif.find((z) => z.mavzu === mavzu);
    if (mavjud) {
      mavjud.score = Math.min(1, mavjud.score + 0.15);
      mavjud.updated_at = endi;
    } else {
      zaif = [...zaif, { mavzu, score: 0.5, updated_at: endi }];
    }

    const mavjudPattern = pattern[mavzu] ?? { count: 0, root_cause_id: null };
    pattern[mavzu] = {
      count: (mavjudPattern.count ?? 0) + 1,
      last_seen: endi,
      root_cause_id: mavjudPattern.root_cause_id ?? null,
    };
  }

  await query(
    `UPDATE learner_profiles
     SET kuchli_tomonlar=$2, zaif_tomonlar=$3, doimiy_xato_pattern=$4,
         oxirgi_yangilangan_at=now(), updated_at=now()
     WHERE id=$1`,
    [profile.id, JSON.stringify(kuchli), JSON.stringify(zaif), JSON.stringify(pattern)]
  );
}
