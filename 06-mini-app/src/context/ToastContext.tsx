/**
 * ToastContext.tsx — qisqa muddatli xabarlar ("qog'oz yorliq" uslubida).
 *
 *   const toast = useToast();
 *   toast.xato("Server javob bermadi");
 *   toast.tayyor("Kitob tayyor");
 *   toast.info("Ovoz hozircha sozlanmagan");
 *
 * Xususiyatlari:
 *  • pastda chiqadi (bosh barmoq yetadigan joy), bosilsa yopiladi
 *  • pastki "kuyayotgan fitil" chizig'i qancha vaqt qolganini ko'rsatadi
 *  • bir vaqtda ko'pi bilan 3 ta; bir xil xabar takrorlansa — bittaga birlashadi
 *  • Telegram haptic (titrash) qo'llab-quvvatlanadi
 *  • Provider tashqarisida chaqirilsa ham ilova qulamaydi (no-op)
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Tur = "xato" | "tayyor" | "info";

interface ToastItem {
  id: number;
  tur: Tur;
  matn: string;
  ms: number;
  yopilmoqda?: boolean;
}

interface ToastOpts {
  ms?: number;
}

export interface ToastApi {
  xato: (matn: string, opts?: ToastOpts) => void;
  tayyor: (matn: string, opts?: ToastOpts) => void;
  info: (matn: string, opts?: ToastOpts) => void;
}

const NOOP: ToastApi = { xato() {}, tayyor() {}, info() {} };
const ToastContext = createContext<ToastApi>(NOOP);
export const useToast = () => useContext(ToastContext);

const MAX_TOAST = 3;
const CHIQISH_MS = 220;
const STANDART_MS: Record<Tur, number> = { xato: 6000, tayyor: 3500, info: 4000 };

function haptic(tur: Tur) {
  if (tur === "info") return;
  try {
    (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred(tur === "xato" ? "error" : "success");
  } catch {
    /* haptic mavjud bo'lmasa — jim o'tamiz */
  }
}

function ToastIcon({ tur }: { tur: Tur }) {
  if (tur === "tayyor") {
    return (
      <svg className="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7.8 12.4l3 3 5.4-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tur === "xato") {
    return (
      <svg className="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.5v5.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="12" cy="16.4" r="1.15" fill="currentColor" />
      </svg>
    );
  }
  // info — Fenix olovi
  return (
    <svg className="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2c1 3-2 4-2 7 0 1.4 1.1 2.5 2.5 2.5S15 10.4 15 9c1.8 1.6 3 4 3 6.5 0 3.6-2.9 6.5-6.5 6.5S5 19.1 5 15.5c0-3 1.6-5 3-6.7C8.6 7.6 9 5.3 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, number>());

  const yop = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.map((x) => (x.id === id ? { ...x, yopilmoqda: true } : x)));
    window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), CHIQISH_MS);
  }, []);

  const korsat = useCallback(
    (tur: Tur, matn: string, opts?: ToastOpts) => {
      const ms = opts?.ms ?? STANDART_MS[tur];
      const id = ++idRef.current;
      setItems((list) => {
        // Bir xil xabar takrorlansa — eskisi o'rniga yangisi (fitil qaytadan yonadi)
        const qolgan = list.filter((x) => !(x.tur === tur && x.matn === matn));
        return [...qolgan, { id, tur, matn, ms }].slice(-MAX_TOAST);
      });
      timers.current.set(id, window.setTimeout(() => yop(id), ms));
      haptic(tur);
    },
    [yop]
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((h) => window.clearTimeout(h));
      t.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      xato: (m, o) => korsat("xato", m, o),
      tayyor: (m, o) => korsat("tayyor", m, o),
      info: (m, o) => korsat("info", m, o),
    }),
    [korsat]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast is-${t.tur} ${t.yopilmoqda ? "is-leaving" : ""}`}
            role={t.tur === "xato" ? "alert" : "status"}
            onClick={() => yop(t.id)}
          >
            <ToastIcon tur={t.tur} />
            <p className="toast-text">{t.matn}</p>
            <span className="toast-fuse" style={{ animationDuration: `${t.ms}ms` }} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
