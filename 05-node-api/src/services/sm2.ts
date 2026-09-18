/**
 * sm2.ts — SuperMemo-2 algoritmi, `words` jadvalidagi takrorlash
 * navbati uchun (loyiha hujjati, 3.7-bo'lim: "So'z boyligi" moduli).
 *
 * Standart SM-2: har takrorlashda sifat bahosi (0-5) beriladi:
 *   0-2 — unutilgan (qayta boshidan, interval=1 kun)
 *   3-5 — eslangan (interval o'sadi, ease_factor sozlanadi)
 */

export interface Sm2State {
  interval_kun: number;
  ease_factor: number; // odatda 1.3–2.5+
  takrorlar_soni: number; // ketma-ket to'g'ri takrorlashlar soni (SM-2'dagi "n")
}

export interface Sm2Result extends Sm2State {
  next_review_at: Date;
}

/** `sifat` — 0 (butunlay unutilgan) dan 5 (juda oson eslangan) gacha. */
export function applySm2(oldState: Sm2State, sifat: number): Sm2Result {
  const q = Math.max(0, Math.min(5, Math.round(sifat)));

  let { interval_kun, ease_factor, takrorlar_soni } = oldState;

  // Ease factor har doim yangilanadi (standart SM-2 formulasi), 1.3'dan pastga tushmaydi
  ease_factor = Math.max(1.3, ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // Unutilgan — ketma-ketlik uziladi, ertaga qayta ko'rsatiladi
    takrorlar_soni = 0;
    interval_kun = 1;
  } else {
    takrorlar_soni += 1;
    if (takrorlar_soni === 1) {
      interval_kun = 1;
    } else if (takrorlar_soni === 2) {
      interval_kun = 6;
    } else {
      interval_kun = Math.round(interval_kun * ease_factor);
    }
  }

  const next_review_at = new Date();
  next_review_at.setDate(next_review_at.getDate() + interval_kun);

  return { interval_kun, ease_factor: Number(ease_factor.toFixed(2)), takrorlar_soni, next_review_at };
}
