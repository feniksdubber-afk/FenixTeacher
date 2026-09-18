import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCourse, getBook, presignUpload, registerBook, uploadFileToR2, CourseDetail } from "../api/fenix";

function kitobBelgisi(holat: string) {
  if (holat === "tayyor") return { cls: "is-active", label: "tayyor" };
  if (holat === "jarayonda") return { cls: "is-processing", label: "ishlanmoqda" };
  if (holat === "xato") return { cls: "is-error", label: "xato" };
  return { cls: "", label: holat };
}

const kutish = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * FIX (#8): backend endi POST /books'ni darhol (202) qaytaradi va
 * qayta ishlashni fonda davom ettiradi. Avval frontend faqat bitta
 * uzun `await registerBook(...)`ga tayanardi — mobil Telegram
 * WebView'da bu HTTP timeout/fon rejimiga o'tish sababli ko'pincha
 * uzilib qolardi. Endi shu yerda GET /books/:id orqali pollaymiz.
 * `bekor` — komponent unmount bo'lsa yoki foydalanuvchi boshqa
 * sahifaga o'tsa pollashni to'xtatish uchun.
 */
async function bobniKutish(
  bookId: string,
  bekor: { holat: boolean },
  intervalMs = 3000,
  maxUrinish = 200 // ~10 daqiqa (200 * 3s), backend timeout'iga mos
): Promise<{ holati: string; xato?: string | null }> {
  for (let i = 0; i < maxUrinish; i++) {
    if (bekor.holat) return { holati: "bekor_qilindi" };
    const book = await getBook(bookId);
    if (book.qayta_ishlash_holati === "tayyor" || book.qayta_ishlash_holati === "xato") {
      return { holati: book.qayta_ishlash_holati, xato: book.qayta_ishlash_xatosi };
    }
    await kutish(intervalMs);
  }
  throw new Error("Kitobni qayta ishlash holatini kutish vaqti tugadi — keyinroq tekshirib ko'ring");
}

export function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [holat, setHolat] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [draging, setDraging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bekorRef = useRef({ holat: false });

  useEffect(() => {
    bekorRef.current.holat = false;
    return () => {
      bekorRef.current.holat = true;
    };
  }, [id]);

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
      setHolat("Yuklanmoqda... 0%");
      const { file_key, upload_url } = await presignUpload(file.type);
      await uploadFileToR2(file, upload_url, (foiz) => setHolat(`Yuklanmoqda... ${foiz}%`));

      setHolat("Kitob qayta ishlanmoqda — bir necha daqiqa cho'zilishi mumkin...");
      const { book_id } = await registerBook({
        course_id: id,
        nomi: file.name,
        turi: "lehrbuch",
        file_key,
        til_kodi: course?.til_kodi ?? "de",
      });

      const natija = await bobniKutish(book_id, bekorRef.current);
      if (natija.holati === "bekor_qilindi") return;
      if (natija.holati === "xato") {
        throw new Error(natija.xato ?? "PDF qayta ishlashda xato");
      }

      setHolat("Tayyor");
      await yuklash();
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
      setHolat(null);
    }
  }

  if (!course) {
    return (
      <div className="page">
        <p className="empty">{xato ?? "Yuklanmoqda..."}</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">{course.til_nomi}</h1>
        <p className="sub">{course.holati}</p>
      </div>

      <div className="link-row">
        <button onClick={() => navigate(`/courses/${id}/vocab`)} className="text-link is-primary">
          so'z boyligi
        </button>
        <button onClick={() => navigate(`/courses/${id}/weekly-report`)} className="text-link">
          haftalik hisobot
        </button>
      </div>

      <h2 className="h2">Kitoblar</h2>

      {course.books.length === 0 && <p className="empty">Hali kitob yuklanmagan.</p>}

      {!!course.books.length && (
        <div className="toc">
          {course.books.map((b) => {
            const s = kitobBelgisi(b.qayta_ishlash_holati);
            const bosiladi = b.qayta_ishlash_holati === "tayyor";
            return (
              <button
                key={b.id}
                onClick={() => bosiladi && navigate(`/books/${b.id}/chapters`)}
                className={`toc-row ${!bosiladi ? "is-disabled" : ""}`}
              >
                <span className="toc-name">{b.nomi}</span>
                <span className="toc-leader" />
                <span className={`toc-status ${s.cls}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className={`dropzone ${draging ? "is-active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDraging(true);
        }}
        onDragLeave={() => setDraging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDraging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFileChosen(file);
        }}
      >
        <span>Yangi PDF kitob yuklash</span>
        <span className="dropzone-plus">+</span>
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

      {holat && <p className="sub" style={{ marginTop: 14 }}>{holat}</p>}
      {xato && <p className="error-text" style={{ marginTop: 14 }}>{xato}</p>}
    </div>
  );
}
