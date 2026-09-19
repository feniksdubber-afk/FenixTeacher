import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { HeroSkeleton, TocSkeleton } from "../components/Skeleton";
import { SpineBar, StageProgress } from "../components/Progress";
import {
  getCourse,
  getBook,
  extractBookExercises,
  getBookExercises,
  presignUpload,
  registerBook,
  uploadFileToR2,
  CourseDetail,
} from "../api/fenix";

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
  const toast = useToast();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [holat, setHolat] = useState<string | null>(null);
  // Yuklash/tahlil bosqichi: yuklashda aniq foiz bor, tahlilda backend foiz bermaydi (indeterminate)
  const [bosqich, setBosqich] = useState<null | { tur: "yuklash"; foiz: number } | { tur: "tahlil"; boshlandi: number } | { tur: "tayyor" }>(null);
  const [otdi, setOtdi] = useState(0);
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

  useEffect(() => {
    if (bosqich?.tur !== "tahlil") return;
    const t = setInterval(() => setOtdi(Math.floor((Date.now() - bosqich.boshlandi) / 1000)), 1000);
    return () => clearInterval(t);
  }, [bosqich]);

  async function yuklash() {
    if (!id) return;
    setCourse(await getCourse(id));
  }

  useEffect(() => {
    yuklash().catch((e) => setXato(String(e.message)));
  }, [id]);

  async function mashqlarniAjratish(bookId: string) {
    try {
      setHolat("Kitobdagi mashqlar ajratilmoqda...");
      setBosqich({ tur: "tahlil", boshlandi: Date.now() });
      setOtdi(0);

      const natija = await extractBookExercises(bookId);

      toast.tayyor("Mashqlarni ajratish boshlandi");


      // PDF service fonda ishlaydi.
      await kutish(10000);

      const mashqlar = await getBookExercises(bookId);


      if (mashqlar.jami > 0) {
        setHolat(
          `${mashqlar.jami} ta mashq topildi — ` +
          `${mashqlar.needs_review_soni} ta tekshirish kerak`
        );
        setBosqich({ tur: "tayyor" });
      } else {
        setHolat("Extraction hali davom etmoqda. Keyinroq tekshiring.");
        setBosqich({ tur: "tayyor" });
      }
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
      setHolat(null);
      setBosqich(null);
    }
  }

  async function handleFileChosen(file: File) {
    if (!id) return;
    try {
      setHolat("Fayl yuklanmoqda");
      setBosqich({ tur: "yuklash", foiz: 0 });
      const { file_key, upload_url } = await presignUpload(file.type);
      await uploadFileToR2(file, upload_url, (foiz) => setBosqich({ tur: "yuklash", foiz }));

      setHolat("Kitob tahlil qilinmoqda — bir necha daqiqa cho'zilishi mumkin");
      setOtdi(0);
      setBosqich({ tur: "tahlil", boshlandi: Date.now() });
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

      setHolat("Kitob tayyor — boblar ro'yxatiga o'tishingiz mumkin");
      setBosqich({ tur: "tayyor" });
      toast.tayyor("Kitob tayyor");
      await yuklash();
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
      setHolat(null);
      setBosqich(null);
    }
  }

  if (!course) {
    return (
      <div className="page">
        {xato ? (
          <p className="error-text">{xato}</p>
        ) : (
          <>
            <HeroSkeleton progress />
            <TocSkeleton rows={3} trailing="text" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">{course.til_nomi}</h1>
        <p className="sub">{course.holati}</p>
        {course.boblar_soni > 0 && (
          <div className="course-progress">
            <div className="course-progress-head">
              <span className="course-progress-num">
                {Math.round(Number(course.foiz_bajarilgan) || 0)}
                <small>%</small>
              </span>
              <span className="sub">
                {course.yakunlangan_boblar}/{course.boblar_soni} bob yakunlangan
              </span>
            </div>
            <SpineBar value={Number(course.foiz_bajarilgan)} ticks={20} label="Kurs progressi" />
          </div>
        )}
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
              <div
                key={b.id}
                className={`toc-row ${!bosiladi ? "is-disabled" : ""}`}
              >
                <button
                  type="button"
                  disabled={!bosiladi}
                  onClick={() => navigate(`/books/${b.id}/chapters`)}
                  className="toc-name"
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    margin: 0,
                    font: "inherit",
                    color: "inherit",
                    cursor: bosiladi ? "pointer" : "default",
                    textAlign: "left",
                  }}
                >
                  {b.nomi}
                </button>

                <span className="toc-leader" />

                {bosiladi && (
                  <button
                    type="button"
                    onClick={() => mashqlarniAjratish(b.id)}
                    className="text-link"
                    style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    mashqlarni ajratish
                  </button>
                )}

                <span className={`toc-status ${s.cls}`}>
                  {b.qayta_ishlash_holati === "jarayonda" && (
                    <SpineBar
                      indeterminate
                      ticks={6}
                      size="xs"
                      label="Tahlil davom etmoqda"
                    />
                  )}
                  {s.label}
                </span>
              </div>
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

      {holat && bosqich && (
        <StageProgress
          stage={bosqich.tur}
          foiz={bosqich.tur === "yuklash" ? bosqich.foiz : 0}
          otdi={otdi}
          matn={holat}
          maslahat={
            bosqich.tur === "tahlil"
              ? "Sahifadan chiqib ketsangiz ham, kitob fonda tayyorlanaveradi."
              : undefined
          }
        />
      )}
    </div>
  );
}
