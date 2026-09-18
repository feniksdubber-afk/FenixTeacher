/**
 * Progress.tsx — Fenix progress tizimi (bitta dizayn tili, uchta primitiv).
 *
 *  • SpineBar      — "kitob umurtqasi": ruler kabi vertikal chiziqlar, yonib
 *                    borayotgan uchida uchqun (ember) uchadi. Kurs progressi,
 *                    fayl yuklash, kitob tahlili, mashq yuklanishi uchun.
 *                    `indeterminate` rejimida cheksiz "olov to'lqini".
 *  • ProgressRing  — bob/kurs qatorlaridagi ixcham halqa (ember→gold);
 *                    yakunlanganda yashil halqa + belgi.
 *  • StageProgress — yuklash → tahlil → tayyor bosqichli panel.
 *
 * Mavjud `.spine` (boblar indeksi) va dot-leader TOC uslubi bilan bir xil ritm.
 */
import { CSSProperties, useId } from "react";

const clamp = (n: number) => Math.min(100, Math.max(0, Number(n) || 0));

/* ------------------------------------------------------------------ */
/* SpineBar                                                            */
/* ------------------------------------------------------------------ */

interface SpineBarProps {
  value?: number; // 0..100
  indeterminate?: boolean;
  ticks?: number;
  size?: "md" | "sm" | "xs";
  label?: string;
}

export function SpineBar({ value = 0, indeterminate = false, ticks = 20, size = "md", label }: SpineBarProps) {
  const v = clamp(value);
  const pos = (v / 100) * ticks;
  const head = !indeterminate && v > 0 && v < 100 ? Math.ceil(pos) - 1 : -1;
  const majorEvery = Math.max(1, Math.round(ticks / 4));

  return (
    <div
      className={`spinebar is-${size} ${indeterminate ? "is-indeterminate" : ""} ${
        !indeterminate && v >= 100 ? "is-complete" : ""
      }`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(v)}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const lit = indeterminate ? 1 : Math.min(1, Math.max(0, pos - i));
        const style = { "--lit": lit, "--t": ticks > 1 ? i / (ticks - 1) : 0, "--i": i } as CSSProperties;
        const cls = ["spinebar-tick", size === "md" && i % majorEvery === 0 ? "is-major" : "", i === head ? "is-head" : ""]
          .filter(Boolean)
          .join(" ");
        return <span key={i} className={cls} style={style} />;
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ProgressRing                                                        */
/* ------------------------------------------------------------------ */

interface ProgressRingProps {
  value: number;
  done?: boolean;
  size?: number;
  label?: string;
}

export function ProgressRing({ value, done = false, size = 24, label }: ProgressRingProps) {
  const gid = "fxg" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const v = done ? 100 : clamp(value);
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arcStyle = { "--c": c } as CSSProperties;

  return (
    <svg
      className={`ring ${done ? "is-done" : ""} ${v > 0 && !done ? "is-lit" : ""}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${Math.round(v)}% bajarilgan`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#d9622f" />
          <stop offset="1" stopColor="#c99a4a" />
        </linearGradient>
      </defs>
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      {v > 0 && (
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={done ? undefined : `url(#${gid})`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={arcStyle}
        />
      )}
      {done && <path className="ring-check" d="M7.6 12.4l3 3 5.8-6.4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* StageProgress — yuklash → tahlil → tayyor                           */
/* ------------------------------------------------------------------ */

type Stage = "yuklash" | "tahlil" | "tayyor";
const STEPS: { k: Stage; t: string }[] = [
  { k: "yuklash", t: "Yuklash" },
  { k: "tahlil", t: "Tahlil" },
  { k: "tayyor", t: "Tayyor" },
];

interface StageProgressProps {
  stage: Stage;
  foiz?: number; // yuklash bosqichi uchun
  otdi?: number; // tahlil bosqichi uchun (soniya)
  matn: string;
  maslahat?: string;
}

export function StageProgress({ stage, foiz = 0, otdi = 0, matn, maslahat }: StageProgressProps) {
  const idx = STEPS.findIndex((s) => s.k === stage);
  const mm = Math.floor(otdi / 60);
  const ss = String(otdi % 60).padStart(2, "0");

  return (
    <div className="stage">
      <ol className="stage-steps">
        {STEPS.map((s, i) => (
          <li
            key={s.k}
            className={`stage-step ${i < idx || stage === "tayyor" ? "is-done" : ""} ${i === idx && stage !== "tayyor" ? "is-active" : ""}`}
          >
            <span className="stage-dot" />
            {s.t}
          </li>
        ))}
      </ol>

      <div className="stage-head">
        <span className="stage-text">{matn}</span>
        <span className="stage-meta">
          {stage === "yuklash" && `${Math.round(clamp(foiz))}%`}
          {stage === "tahlil" && `${mm}:${ss}`}
          {stage === "tayyor" && "✓"}
        </span>
      </div>

      <SpineBar
        ticks={32}
        value={stage === "yuklash" ? foiz : stage === "tayyor" ? 100 : 0}
        indeterminate={stage === "tahlil"}
        label={matn}
      />

      {maslahat && <p className="sub stage-hint">{maslahat}</p>}
    </div>
  );
}
