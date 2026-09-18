import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useParams } from "react-router-dom";
import { listDueWords, reviewWord, playTts, DueWord } from "../api/fenix";

/** Foydalanuvchi bosgan tugmani SM-2 "sifat" (0-5) qiymatiga o'giradi. */
const SIFAT_TUGMALARI: { label: string; sifat: number; cls: string }[] = [
  { label: "unutdim", sifat: 1, cls: "q-hard" },
  { label: "qiyin edi", sifat: 3, cls: "q-mid" },
  { label: "oson", sifat: 5, cls: "q-easy" },
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
      <div className="page">
        <p className="error-text">{xato}</p>
      </div>
    );
  }

  if (sozlar === null) {
    return (
      <div className="page">
        <p className="empty">Yuklanmoqda...</p>
      </div>
    );
  }

  if (sozlar.length === 0) {
    return (
      <div className="page">
        <div className="hero">
          <h1 className="h1">So'z boyligi</h1>
        </div>
        <div className="ash-note">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3v3M12 3c-3 2-5 4-5 8a5 5 0 0010 0c0-4-2-6-5-8z" stroke="#5a4d3d" strokeWidth="1.2" />
            <circle cx="6" cy="18" r="0.6" fill="#5a4d3d" />
            <circle cx="17" cy="19" r="0.8" fill="#5a4d3d" />
            <circle cx="10" cy="20" r="0.5" fill="#5a4d3d" />
          </svg>
          <p className="empty">
            Hozircha takrorlash uchun so'z yo'q. Mashqlarni davom ettiring — Fenix bob matnidan yangi
            so'zlarni o'zi taklif qiladi.
          </p>
        </div>
      </div>
    );
  }

  if (indeks >= sozlar.length) {
    const foiz = sozlar.length ? Math.round((song.togri / sozlar.length) * 100) : 0;
    return (
      <div className="page center-note">
        <h1 className="h1">Tayyor.</h1>
        <p className="empty" style={{ margin: "0 auto" }}>
          {sozlar.length} ta so'zdan {song.togri} tasini eslading — {foiz}%.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 className="h1" style={{ marginBottom: 0 }}>
          So'z boyligi
        </h1>
        <span className="sub">
          {indeks + 1} / {sozlar.length}
        </span>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(indeks / sozlar.length) * 100}%` }} />
      </div>

      <div className="card-stage">
        <div className="flip-scene" onClick={() => setOchiq((o) => !o)}>
          <div className={`flip-card ${ochiq ? "is-flipped" : ""}`}>
            <div className="index-card flip-front">
              <span className="index-card-term">{joriySoz?.soz}</span>
              {joriySoz?.soz_turi && <span className="index-card-type">{joriySoz.soz_turi}</span>}
              <span className="index-card-hint">bosing — tarjima ko'rinadi</span>
              <button onClick={tinglash} className="sound-btn" title="Tinglash">
                🔊
              </button>
            </div>
            <div className="index-card flip-back">
              <span className="index-card-translation index-card-translation-big">{joriySoz?.tarjima}</span>
              <span className="index-card-hint">yana bosing — orqaga</span>
            </div>
          </div>
        </div>
      </div>
      {ovozXato && <span className="sound-warn">Ovoz hozircha sozlanmagan</span>}

      {ochiq && (
        <div className="quality-row">
          {SIFAT_TUGMALARI.map((t) => (
            <button
              key={t.sifat}
              disabled={yuborilmoqda}
              onClick={() => baholash(t.sifat)}
              className={`quality-btn ${t.cls}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
