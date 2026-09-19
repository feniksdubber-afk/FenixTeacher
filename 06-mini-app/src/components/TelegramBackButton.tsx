/**
 * TelegramBackButton.tsx — Telegram'ning native "Orqaga" tugmasini router bilan
 * bog'laydi. Bosh sahifada (kurslar ro'yxati) yashirin; boshqa hamma sahifada
 * ko'rinadi va bir qadam orqaga qaytaradi.
 *
 * Agar sahifa to'g'ridan-to'g'ri ochilgan bo'lsa (tarixda orqaga yo'l yo'q) —
 * mini-app yopilib ketmasligi uchun mantiqiy "ota" sahifaga o'tadi.
 * Telegram tashqarisida (brauzerda) hech narsa qilmaydi.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Tarix bo'sh bo'lganda qaytiladigan mantiqiy ota-sahifa. */
function otaSahifa(pathname: string): string {
  const m = pathname.match(/^\/courses\/([^/]+)\/(vocab|weekly-report)$/);
  return m ? `/courses/${m[1]}` : "/";
}

export function TelegramBackButton() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const bb = tg?.BackButton;
    // BackButton Bot API 6.1+ da mavjud
    if (!bb || (tg?.isVersionAtLeast && !tg.isVersionAtLeast("6.1"))) return;

    if (pathname === "/") {
      bb.hide();
      return;
    }

    const orqaga = () => {
      // react-router (BrowserRouter) har yozuvga `idx` qo'yadi: 0 — ilova ichidagi birinchi sahifa
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) navigate(-1);
      else navigate(otaSahifa(pathname), { replace: true });
    };

    bb.show();
    bb.onClick(orqaga);
    return () => bb.offClick(orqaga);
  }, [pathname, navigate]);

  return null;
}
