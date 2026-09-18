import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { listCourses, createCourse, Course } from "../api/fenix";

export function CoursesPage() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [yaratilmoqda, setYaratilmoqda] = useState(false);
  const [tilNomi, setTilNomi] = useState("");
  const [tilKodi, setTilKodi] = useState("de");
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    listCourses().then(setCourses).catch((e) => setXato(String(e.message)));
  }, []);

  async function handleCreate() {
    if (!tilNomi.trim()) return;
    setXato(null);
    try {
      await createCourse({ til_nomi: tilNomi, til_kodi: tilKodi });
      setTilNomi("");
      setYaratilmoqda(false);
      const yangilangan = await listCourses();
      setCourses(yangilangan);
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Bo'limlar</h1>

      {xato && <p style={{ color: "#ff6b6b" }}>{xato}</p>}

      {courses === null && <p>Yuklanmoqda...</p>}

      {courses?.length === 0 && !yaratilmoqda && (
        <p style={{ opacity: 0.7 }}>Hali bo'lim yo'q. Birinchisini boshlaymizmi?</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {courses?.map((c) => (
          <Link
            key={c.id}
            to={`/courses/${c.id}`}
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
            <span>{c.til_nomi}</span>
            <span style={{ opacity: 0.6, fontSize: 13 }}>{c.holati}</span>
          </Link>
        ))}
      </div>

      {!yaratilmoqda ? (
        <button onClick={() => setYaratilmoqda(true)} style={btnStyle}>
          + Yangi bo'lim
        </button>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            placeholder="Til nomi (masalan: Nemis tili)"
            value={tilNomi}
            onChange={(e) => setTilNomi(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Til kodi (masalan: de)"
            value={tilKodi}
            onChange={(e) => setTilKodi(e.target.value)}
            style={inputStyle}
          />
          <button onClick={handleCreate} style={btnStyle}>
            Yaratish
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle: CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: "12px",
  borderRadius: 12,
  border: "none",
  background: "var(--tg-theme-button-color, #3390ec)",
  color: "var(--tg-theme-button-text-color, #fff)",
  fontSize: 15,
};

const inputStyle: CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "transparent",
  color: "inherit",
};
