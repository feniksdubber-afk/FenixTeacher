import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { TocSkeleton } from "../components/Skeleton";
import { ProgressRing } from "../components/Progress";
import { listCourses, createCourse, Course } from "../api/fenix";

function holatBelgisi(holati: string) {
  if (holati === "faol" || holati === "active") return "is-active";
  return "";
}

export function CoursesPage() {
  const navigate = useNavigate();
  const toast = useToast();
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
    try {
      await createCourse({ til_nomi: tilNomi, til_kodi: tilKodi });
      toast.tayyor(`"${tilNomi.trim()}" qo'shildi`);
      setTilNomi("");
      setYaratilmoqda(false);
      const yangilangan = await listCourses();
      setCourses(yangilangan);
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">O'qiyotgan tillaringiz</h1>
      </div>

      {xato && <p className="error-text">{xato}</p>}
      {courses === null && !xato && <TocSkeleton rows={3} />}

      {courses?.length === 0 && !yaratilmoqda && (
        <p className="empty">Hali bo'lim ochilmagan. Birinchi tilni shu yerdan boshlaysiz.</p>
      )}

      {!!courses?.length && (
        <div className="toc">
          {courses.map((c) => (
            <button key={c.id} onClick={() => navigate(`/courses/${c.id}`)} className="toc-row">
              <span className="toc-name">{c.til_nomi}</span>
              <span className="toc-leader" />
              {c.boblar_soni > 0 ? (
                <span className="toc-progress">
                  <ProgressRing value={c.foiz_bajarilgan} done={c.foiz_bajarilgan >= 100} />
                  <span className="toc-progress-label">{Math.round(Number(c.foiz_bajarilgan) || 0)}%</span>
                </span>
              ) : (
                <span className={`toc-status ${holatBelgisi(c.holati)}`}>{c.holati}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {!yaratilmoqda ? (
        <div className="link-row" style={{ marginTop: 22 }}>
          <button onClick={() => setYaratilmoqda(true)} className="text-link is-primary">
            + yangi til qo'shish
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 24 }}>
          <input
            className="input"
            placeholder="Til nomi, masalan: Nemis tili"
            value={tilNomi}
            onChange={(e) => setTilNomi(e.target.value)}
            autoFocus
            style={{ marginBottom: 14 }}
          />
          <input
            className="input"
            placeholder="Til kodi, masalan: de"
            value={tilKodi}
            onChange={(e) => setTilKodi(e.target.value)}
            style={{ marginBottom: 18 }}
          />
          <div className="link-row">
            <button onClick={handleCreate} className="text-link is-primary">
              qo'shish
            </button>
            <button onClick={() => setYaratilmoqda(false)} className="text-link">
              bekor qilish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
