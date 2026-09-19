import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getBookPages,
  getBookPagesStatus,
  startBookPagesRender,
  BookPage,
  BookPagesStatus,
} from "../api/fenix";
import { useToast } from "../context/ToastContext";

/** Bir vaqtda oldindan yuklab qo'yiladigan sahifalar oynasi (joriy
 * sahifa atrofida). Katta bo'lsa mobil trafik ortadi, kichik bo'lsa
 * tez varaqlaganda "bo'sh" sahifa ko'rinadi. */
const WINDOW_BEFORE = 1;
const WINDOW_AFTER = 3;
const FETCH_CHUNK = 8; // bitta so'rovda so'raladigan sahifalar oralig'i

export function BookViewerPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [status, setStatus] = useState<BookPagesStatus | null>(null);
  const [boshlanmoqda, setBoshlanmoqda] = useState(false);
  const [joriySahifa, setJoriySahifa] = useState(1);
  const [sahifalar, setSahifalar] = useState<Map<number, BookPage>>(new Map());
  const [zoomed, setZoomed] = useState(false);
  const soralganDiapazonlar = useRef<Set<string>>(new Set());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const jamiSahifa = status?.sahifalar_soni ?? null;

  const holatniYukla = useCallback(async () => {
    if (!bookId) return;
    try {
      const s = await getBookPagesStatus(bookId);
      setStatus(s);
      return s;
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    holatniYukla();
  }, [holatniYukla]);

  // Renderlash jarayonida bo'lsa — pollab turamiz (5s), tugagach to'xtaymiz.
  useEffect(() => {
    if (status?.holati !== "jarayonda") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(holatniYukla, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status?.holati, holatniYukla]);

  const sahifalarniSora = useCallback(
    async (from: number, to: number) => {
      if (!bookId) return;
      const kalit = `${from}-${to}`;
      if (soralganDiapazonlar.current.has(kalit)) return;
      soralganDiapazonlar.current.add(kalit);
      try {
        const res = await getBookPages(bookId, from, to);
        setSahifalar((prev) => {
          const next = new Map(prev);
          for (const s of res.sahifalar) next.set(s.page_physical, s);
          return next;
        });
      } catch (e) {
        soralganDiapazonlar.current.delete(kalit); // qayta urinib ko'rish imkoni qolsin
        console.error("[BookViewerPage] sahifalarni yuklashda xato:", e);
      }
    },
    [bookId]
  );

  // Joriy sahifa o'zgarganda atrofidagi oynani (hali so'ralmagan bo'lsa) yuklaydi.
  useEffect(() => {
    if (status?.holati !== "tayyor") return;
    const from = Math.max(1, joriySahifa - WINDOW_BEFORE);
    const to = Math.min(jamiSahifa ?? from + WINDOW_AFTER, joriySahifa + WINDOW_AFTER);
    // Yaxlit FETCH_CHUNK bo'yicha so'raymiz - qo'shni sahifalarga o'tganda
    // deyarli har doim keshda topiladi, so'rovlar soni kamayadi.
    const chunkFrom = Math.max(1, Math.floor((from - 1) / FETCH_CHUNK) * FETCH_CHUNK + 1);
    const chunkTo = Math.min(jamiSahifa ?? to, chunkFrom + FETCH_CHUNK - 1);
    void sahifalarniSora(chunkFrom, chunkTo);
    if (to > chunkTo) {
      const chunkFrom2 = chunkTo + 1;
      const chunkTo2 = Math.min(jamiSahifa ?? to, chunkFrom2 + FETCH_CHUNK - 1);
      void sahifalarniSora(chunkFrom2, chunkTo2);
    }
  }, [joriySahifa, status?.holati, jamiSahifa, sahifalarniSora]);

  async function renderniBoshla() {
    if (!bookId) return;
    setBoshlanmoqda(true);
    try {
      await startBookPagesRender(bookId);
      await holatniYukla();
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    } finally {
      setBoshlanmoqda(false);
    }
  }

  // Scroll-snap konteynerdan joriy sahifani hisoblaydi (debounce bilan).
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onScroll() {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth) + 1;
      if (idx !== joriySahifa && idx >= 1 && (!jamiSahifa || idx <= jamiSahifa)) {
        setJoriySahifa(idx);
        setZoomed(false);
      }
    }, 90);
  }

  function sahifagaOt(n: number) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: (n - 1) * el.clientWidth, behavior: "smooth" });
  }

  const koringanOraliq = useMemo(() => {
    const arr: number[] = [];
    const jami = jamiSahifa ?? joriySahifa + WINDOW_AFTER;
    for (let n = Math.max(1, joriySahifa - WINDOW_BEFORE); n <= Math.min(jami, joriySahifa + WINDOW_AFTER); n++) {
      arr.push(n);
    }
    return arr;
  }, [joriySahifa, jamiSahifa]);

  return (
    <div className="page" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div className="hero" style={{ paddingLeft: 20, paddingRight: 20 }}>
        <h1 className="h1">Kitobni ko'rish</h1>
      </div>

      {!status && (
        <div className="center-note">
          <div className="spinner" style={{ margin: "40px auto" }} />
        </div>
      )}

      {status?.holati === "yoq" && (
        <div className="center-note" style={{ padding: "0 20px" }}>
          <p className="empty" style={{ margin: "0 auto 20px" }}>
            Kitob sahifalari hali rasm sifatida tayyorlanmagan. Bir martalik tayyorlov (kitob
            hajmiga qarab bir necha daqiqa) kerak bo'ladi.
          </p>
          <button onClick={renderniBoshla} disabled={boshlanmoqda} className="btn" style={{ maxWidth: 260, margin: "0 auto" }}>
            {boshlanmoqda ? "Boshlanmoqda..." : "Sahifalarni tayyorlash"}
          </button>
        </div>
      )}

      {status?.holati === "jarayonda" && (
        <div className="center-note" style={{ padding: "0 20px" }}>
          <div className="spinner" style={{ margin: "20px auto" }} />
          <p className="sub" style={{ textAlign: "center" }}>
            Tayyorlanmoqda{status.sahifalar_soni ? ` — ${status.tayyor_soni}/${status.sahifalar_soni}` : ""}...
          </p>
        </div>
      )}

      {status?.holati === "xato" && (
        <div className="center-note" style={{ padding: "0 20px" }}>
          <p className="error-text">Sahifalarni tayyorlashda xato yuz berdi.</p>
          <button onClick={renderniBoshla} disabled={boshlanmoqda} className="btn" style={{ maxWidth: 220, margin: "0 auto" }}>
            Qayta urinish
          </button>
        </div>
      )}

      {status?.holati === "tayyor" && (
        <>
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            style={{
              display: "flex",
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              width: "100%",
            }}
          >
            {koringanOraliq.map((n) => {
              const p = sahifalar.get(n);
              const buShu = n === joriySahifa;
              return (
                <div
                  key={n}
                  style={{
                    flex: "0 0 100%",
                    scrollSnapAlign: "start",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    minHeight: "50vh",
                    overflow: buShu && zoomed ? "auto" : "hidden",
                    padding: "0 8px",
                  }}
                >
                  {p ? (
                    <img
                      src={p.url}
                      alt={`${n}-sahifa`}
                      loading="lazy"
                      onDoubleClick={() => buShu && setZoomed((z) => !z)}
                      style={{
                        width: buShu && zoomed ? "200%" : "100%",
                        maxWidth: buShu && zoomed ? "none" : "100%",
                        borderRadius: 8,
                        transition: "width 0.15s ease",
                        touchAction: "manipulation",
                      }}
                    />
                  ) : (
                    <div className="spinner" style={{ margin: "80px auto" }} />
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="link-row"
            style={{ justifyContent: "space-between", alignItems: "center", padding: "14px 20px 0" }}
          >
            <button
              className="text-link"
              onClick={() => sahifagaOt(Math.max(1, joriySahifa - 1))}
              disabled={joriySahifa <= 1}
            >
              ← oldingi
            </button>
            <span className="sub">
              {joriySahifa}
              {jamiSahifa ? ` / ${jamiSahifa}` : ""}-sahifa
            </span>
            <button
              className="text-link"
              onClick={() => sahifagaOt(joriySahifa + 1)}
              disabled={!!jamiSahifa && joriySahifa >= jamiSahifa}
            >
              keyingi →
            </button>
          </div>
          <p className="sub" style={{ textAlign: "center", marginTop: 6, opacity: 0.7 }}>
            Kattalashtirish uchun ikki marta bosing
          </p>
        </>
      )}

      <div className="link-row" style={{ marginTop: 18, justifyContent: "center", paddingBottom: 20 }}>
        <button onClick={() => navigate(-1)} className="text-link">
          orqaga
        </button>
      </div>
    </div>
  );
}
