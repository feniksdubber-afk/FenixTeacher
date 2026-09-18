import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listChapters, Chapter } from "../api/fenix";

export function ChaptersPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) return;
    listChapters(bookId)
      .then(setChapters)
      .catch((e) => setXato(e instanceof Error ? e.message : String(e)));
  }, [bookId]);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Boblar</h1>

      {xato && <p style={{ color: "#ff6b6b" }}>{xato}</p>}
      {chapters === null && !xato && <p>Yuklanmoqda...</p>}
      {chapters?.length === 0 && <p style={{ opacity: 0.7 }}>Bu kitobda bob topilmadi.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {chapters?.map((c) => (
          <Link
            key={c.id}
            to={`/chapters/${c.id}/practice`}
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--tg-theme-secondary-bg-color, #1c1c1f)",
              color: "inherit",
              textDecoration: "none",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>{c.nomi ?? `Bob ${c.tartib_raqami}`}</span>
            <span style={{ opacity: 0.6, fontSize: 13 }}>#{c.tartib_raqami}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
