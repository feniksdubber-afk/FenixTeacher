import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listChapters, Chapter } from "../api/fenix";

const RIM = [
  "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
];

function rimRaqam(n: number): string {
  return RIM[n] ?? String(n);
}

export function ChaptersPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<number | null>(null);

  useEffect(() => {
    if (!bookId) return;
    listChapters(bookId)
      .then(setChapters)
      .catch((e) => setXato(e instanceof Error ? e.message : String(e)));
  }, [bookId]);

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">Boblar</h1>
      </div>

      {xato && <p className="error-text">{xato}</p>}
      {chapters === null && !xato && <p className="empty">Yuklanmoqda...</p>}
      {chapters?.length === 0 && <p className="empty">Bu kitobda bob topilmadi.</p>}

      {!!chapters?.length && (
        <>
          <div className="spine" role="presentation">
            {chapters.map((c, i) => (
              <span
                key={c.id}
                className={`spine-tick ${tanlangan === i ? "is-marked" : ""}`}
                style={{ height: `${14 + (i % 3) * 4}px` }}
              />
            ))}
          </div>

          <div className="toc">
            {chapters.map((c, i) => (
              <button
                key={c.id}
                onClick={() => navigate(`/chapters/${c.id}/practice`)}
                onMouseEnter={() => setTanlangan(i)}
                onMouseLeave={() => setTanlangan(null)}
                className="toc-row"
              >
                <span className="toc-num">{rimRaqam(c.tartib_raqami)}</span>
                <span className="toc-name">{c.nomi ?? `Bob ${c.tartib_raqami}`}</span>
                <span className="toc-leader" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
