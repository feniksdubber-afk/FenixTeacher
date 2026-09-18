import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { listDueWords, reviewWord, playTts, DueWord } from "../api/fenix";

/** Foydalanuvchi bosgan tugmani SM-2 "sifat" (0-5) qiymatiga o'giradi. */
const SIFAT_TUGMALARI: { label: string; sifat: number; bg: string }[] = [
  { label: "Unutdim", sifat: 1, bg: "#3a1d1d" },
  { label: "Qiyin edi", sifat: 3, bg: "#3a331d" },
  { label: "Oson", sifat: 5, bg: "#1d3a24" },
];

export function VocabPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [sozlar, setSozlar] = useState<DueWord[] | null>(null);
  const [indeks, setIndeks] = useState(0);
  const [ochiq, setOchiq] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [yuborilmoqda, setYuborilmoqda] = useState(false);
  const [song, setSong] = useState({ togri: 0, jami: 0 });
  const [ovozXato, setOvozXato] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    listDueWords(courseId, 30)
      .then(setSozlar)
      .catch((e) => setXato(e instanceof Error ? e.message : String(e)));
  }, [courseId]);

  const joriySoz = sozlar?.[indeks];

  async function baholash(sifat: number) {
    if (!joriySoz || yuborilmoqda) return;
    setYuborilmoqda(true);
    try {
      await reviewWord(joriySoz.id, sifat);
      setSong((s) => ({ togri: s.togri + (sifat >= 3 ? 1 : 0), jami: s.jami + 1 }));
      setOchiq(false);
      setIndeks((i) => i + 1);
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
    } finally {
      setYuborilmoqda(false);
    }
  }

  useEffect(() => {
    setOvozXato(false);
  }, [indeks]);

  async function tinglash(e: MouseEvent) {
    e.stopPropagation();
    if (!joriySoz) return;
    try {
      await playTts(joriySoz.soz);
    } catch {
      setOvozXato(true);
    }
  }

  if (xato) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "#ff6b6b" }}>{xato}</p>
      </div>
    );
  }

  if (sozlar === null) {
    return <div style={{ padding: 16 }}>Yuklanmoqda...</div>;
  }

  if (sozlar.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>So'z boyligi</h1>
        <p style={{ opacity: 0.7 }}>Hozircha takrorlash uchun so'z yo'q. Mashqlarni davom ettiring — Fenix bob matnidan yangi so'zlarni o'zi taklif qiladi.</p>
      </div>
    );
  }

  if (indeks >= sozlar.length) {
    return (
      <div style={{ padding: 16, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Tayyor!</h1>
        <p style={{ opacity: 0.7 }}>
          {sozlar.length} ta so'zdan {song.togri} tasini eslading.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22 }}>So'z boyligi</h1>
        <span style={{ opacity: 0.6, fontSize: 13 }}>
          {indeks + 1} / {sozlar.length}
        </span>
      </div>

      <div
        onClick={() => setOchiq((o) => !o)}
        style={{
          padding: "40px 16px",
          borderRadius: 16,
          background: "var(--tg-theme-secondary-bg-color, #1c1c1f)",
          textAlign: "center",
          cursor: "pointer",
          minHeight: 140,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 600 }}>{joriySoz?.soz}</span>
        {joriySoz?.soz_turi && <span style={{ opacity: 0.5, fontSize: 13 }}>{joriySoz.soz_turi}</span>}
        <button
          onClick={tinglash}
          style={{
            alignSelf: "center",
            marginTop: 4,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "inherit",
            fontSize: 16,
            cursor: "pointer",
          }}
          title="Tinglash"
        >
          🔊
        </button>
        {ovozXato && <span style={{ fontSize: 11, opacity: 0.5 }}>Ovoz hozircha sozlanmagan</span>}
        {ochiq ? (
          <span style={{ fontSize: 18, marginTop: 12, color: "var(--tg-theme-link-color, #62bcf9)" }}>
            {joriySoz?.tarjima}
          </span>
        ) : (
          <span style={{ opacity: 0.5, fontSize: 14, marginTop: 12 }}>Tarjimani ko'rish uchun bosing</span>
        )}
      </div>

      {ochiq && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {SIFAT_TUGMALARI.map((t) => (
            <button
              key={t.sifat}
              disabled={yuborilmoqda}
              onClick={() => baholash(t.sifat)}
              style={{
                flex: 1,
                padding: "12px 8px",
                borderRadius: 12,
                border: "none",
                background: t.bg,
                color: "#fff",
                opacity: yuborilmoqda ? 0.6 : 1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
