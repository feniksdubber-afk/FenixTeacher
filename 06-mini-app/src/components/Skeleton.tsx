/**
 * Skeleton.tsx — "Yuklanmoqda..." matni o'rniga sahifaning haqiqiy shaklini
 * ko'rsatuvchi qog'oz-chiziq yuklovchilari. Ichidagi issiq (ember/gold)
 * yaltirash Fenix mavzusiga mos; joylashuv haqiqiy komponentlar bilan bir xil,
 * shuning uchun ma'lumot kelganda sahifa "sakramaydi".
 */
import { CSSProperties } from "react";
import { SpineBar } from "./Progress";

interface SkelProps {
  w?: number | string;
  h?: number;
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ w = "100%", h = 12, circle = false, className = "", style }: SkelProps) {
  const css = {
    "--w": typeof w === "number" ? `${w}px` : w,
    "--h": `${h}px`,
    ...style,
  } as CSSProperties;
  return <span className={`skel ${circle ? "is-circle" : ""} ${className}`} style={css} aria-hidden="true" />;
}

const NOM_KENGLIGI = [150, 112, 176, 132, 96, 160];

/** TOC ro'yxati (kurslar / boblar / kitoblar) — haqiqiy `.toc-row` bilan bir xil ritm. */
export function TocSkeleton({
  rows = 4,
  numbered = false,
  trailing = "ring",
  spine = false,
}: {
  rows?: number;
  numbered?: boolean;
  trailing?: "ring" | "text" | "none";
  spine?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-label="Yuklanmoqda">
      {spine && (
        <div className="spine" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="spine-tick skel" style={{ height: `${14 + (i % 3) * 4}px` }} />
          ))}
        </div>
      )}
      <div className="toc">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="toc-row skel-row" aria-hidden="true">
            {numbered && <Skeleton w={18} h={12} style={{ marginRight: 10, flexShrink: 0 }} />}
            <Skeleton w={NOM_KENGLIGI[i % NOM_KENGLIGI.length]} h={14} style={{ flexShrink: 0, maxWidth: "55%" }} />
            <span className="toc-leader" />
            {trailing === "ring" && (
              <>
                <Skeleton w={24} h={24} circle style={{ flexShrink: 0 }} />
                <Skeleton w={28} h={10} style={{ flexShrink: 0 }} />
              </>
            )}
            {trailing === "text" && <Skeleton w={54} h={10} style={{ flexShrink: 0 }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sahifa sarlavhasi (h1 + sub); `progress` — kurs sahifasidagi katta progress bilan. */
export function HeroSkeleton({ progress = false }: { progress?: boolean }) {
  return (
    <div className="hero" role="status" aria-busy="true" aria-label="Yuklanmoqda">
      <Skeleton w="52%" h={30} style={{ marginBottom: 12 }} />
      <Skeleton w="28%" h={12} />
      {progress && (
        <div className="course-progress" aria-hidden="true">
          <div className="course-progress-head">
            <Skeleton w={64} h={32} />
            <Skeleton w={110} h={12} />
          </div>
          <SpineBar value={0} ticks={20} />
        </div>
      )}
    </div>
  );
}

/** So'z kartochkasi (SM-2 takrorlash) — haqiqiy kartadagi engil qiyalik bilan. */
export function CardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="card-stage" aria-hidden="true">
        <div className="skel skel-card" />
      </div>
      <div className="skel-quality" aria-hidden="true">
        <Skeleton w={70} h={14} />
        <Skeleton w={70} h={14} />
        <Skeleton w={70} h={14} />
      </div>
    </div>
  );
}

/** Haftalik hisobot: kundalik matni, hisob-kitob qatorlari, majburiyatlar. */
export function ReportSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Yuklanmoqda">
      <div aria-hidden="true">
        <Skeleton h={14} style={{ marginBottom: 10 }} />
        <Skeleton h={14} w="92%" style={{ marginBottom: 10 }} />
        <Skeleton h={14} w="64%" style={{ marginBottom: 26 }} />
        {[44, 62, 52].map((w, i) => (
          <div key={i} className="skel-ledger">
            <Skeleton w={110} h={11} />
            <span className="toc-leader" />
            <Skeleton w={`${w}%`} h={13} style={{ maxWidth: 140 }} />
          </div>
        ))}
        <Skeleton w="56%" h={18} style={{ margin: "30px 0 14px" }} />
        <Skeleton h={13} w="80%" style={{ marginBottom: 8 }} />
        <Skeleton h={11} w="48%" />
      </div>
    </div>
  );
}

/** Mashq xonasi: savol tayyorlanayotganda — savol + javob daftari shaklida. */
export function QuestionSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Fenix savol tayyorlamoqda">
      <div aria-hidden="true">
        <Skeleton w={170} h={11} style={{ marginBottom: 18 }} />
        <Skeleton h={20} style={{ marginBottom: 10 }} />
        <Skeleton h={20} w="88%" style={{ marginBottom: 10 }} />
        <Skeleton h={20} w="58%" style={{ marginBottom: 28 }} />
        <div className="skel-ruled" />
      </div>
      <p className="sub" style={{ marginTop: 16 }}>Fenix savol tayyorlamoqda...</p>
    </div>
  );
}
