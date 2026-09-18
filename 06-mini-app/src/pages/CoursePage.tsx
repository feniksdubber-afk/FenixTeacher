import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCourse, presignUpload, registerBook, uploadFileToR2, CourseDetail } from "../api/fenix";

export function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [holat, setHolat] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function yuklash() {
    if (!id) return;
    setCourse(await getCourse(id));
  }

  useEffect(() => {
    yuklash().catch((e) => setXato(String(e.message)));
  }, [id]);

  async function handleFileChosen(file: File) {
    if (!id) return;
    setXato(null);
    try {
      setHolat("Yuklanmoqda...");
      const { file_key, upload_url } = await presignUpload(file.type);
      await uploadFileToR2(file, upload_url);

      setHolat("Kitob qayta ishlanmoqda — bu bir necha daqiqa cho'zilishi mumkin...");
      const natija = await registerBook({
        course_id: id,
        nomi: file.name,
        turi: "lehrbuch",
        file_key,
        til_kodi: course?.til_kodi ?? "de",
      });

      setHolat(`Tayyor: ${natija.boblar_soni} bob aniqlandi`);
      await yuklash();
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
      setHolat(null);
    }
  }

  if (!course) return <div style={{ padding: 16 }}>{xato ?? "Yuklanmoqda..."}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22 }}>{course.til_nomi}</h1>
      <p style={{ opacity: 0.6, fontSize: 13 }}>{course.holati}</p>

      <button
        onClick={() => navigate(`/courses/${id}/vocab`)}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: "1px solid var(--tg-theme-button-color, #3390ec)",
          background: "transparent",
          color: "var(--tg-theme-button-color, #3390ec)",
        }}
      >
        So'z boyligini ko'rib chiqish
      </button>

      <button
        onClick={() => navigate(`/courses/${id}/weekly-report`)}
        style={{
          marginTop: 8,
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "transparent",
          color: "inherit",
        }}
      >
        Haftalik hisobot
      </button>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Kitoblar</h2>
      {course.books.length === 0 && <p style={{ opacity: 0.7 }}>Hali kitob yuklanmagan.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {course.books.map((b) => (
          <div
            key={b.id}
            onClick={() => b.qayta_ishlash_holati === "tayyor" && navigate(`/books/${b.id}/chapters`)}
            style={{
              padding: 12,
              borderRadius: 10,
              background: "var(--tg-theme-secondary-bg-color, #1c1c1f)",
              display: "flex",
              justifyContent: "space-between",
              cursor: b.qayta_ishlash_holati === "tayyor" ? "pointer" : "default",
            }}
          >
            <span>{b.nomi}</span>
            <span style={{ opacity: 0.6, fontSize: 13 }}>{b.qayta_ishlash_holati}</span>
          </div>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileChosen(file);
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: "none",
          background: "var(--tg-theme-button-color, #3390ec)",
          color: "var(--tg-theme-button-text-color, #fff)",
        }}
      >
        + PDF kitob yuklash
      </button>

      {holat && <p style={{ marginTop: 12, opacity: 0.8 }}>{holat}</p>}
      {xato && <p style={{ marginTop: 12, color: "#ff6b6b" }}>{xato}</p>}
    </div>
  );
}
