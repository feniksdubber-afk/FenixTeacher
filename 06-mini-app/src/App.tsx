import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CoursesPage } from "./pages/CoursesPage";
import { CoursePage } from "./pages/CoursePage";
import { ChaptersPage } from "./pages/ChaptersPage";
import { ExercisePage } from "./pages/ExercisePage";
import { VocabPage } from "./pages/VocabPage";
import { WeeklyReportPage } from "./pages/WeeklyReportPage";
import { syncUser, FenixUser } from "./api/fenix";
import { UserContext } from "./context/UserContext";
import { ToastProvider } from "./context/ToastContext";
import { TelegramBackButton } from "./components/TelegramBackButton";

function FlameMark() {
  return (
    <svg
      className="flame-glow"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2c1 3-2 4-2 7 0 1.4 1.1 2.5 2.5 2.5S15 10.4 15 9c1.8 1.6 3 4 3 6.5 0 3.6-2.9 6.5-6.5 6.5S5 19.1 5 15.5c0-3 1.6-5 3-6.7C8.6 7.6 9 5.3 12 2z"
        fill="#d9622f"
      />
    </svg>
  );
}

/** Ilova birinchi marta ochilganda, bir martagina ko'rinadigan
 *  "sahifa ochilishi" o'tishi. Har bir navigatsiyada emas — faqat shu yerda. */
function OpeningCurtain({ done }: { done: boolean }) {
  return <div className={`curtain ${done ? "curtain-gone" : ""}`} aria-hidden="true" />;
}

export function App() {
  const [tayyor, setTayyor] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [user, setUser] = useState<FenixUser | null>(null);
  const [pardaKetdi, setPardaKetdi] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const tgUser = (tg as any)?.initDataUnsafe?.user;
    const ism = tgUser?.first_name ?? "Foydalanuvchi";

    syncUser(ism)
      .then((u) => {
        setUser(u);
        setTayyor(true);
        // Parda bir muddat ko'ringandan keyin ochiladi — mazmun ortidan
        // shoshilmasdan, lekin foydalanuvchini ushlab turmasdan.
        requestAnimationFrame(() => setTimeout(() => setPardaKetdi(true), 120));
      })
      .catch((e) => setXato(e instanceof Error ? e.message : String(e)));
  }, []);

  if (xato) {
    return (
      <div className="page">
        <p className="error-text">Ulanishda xato: {xato}</p>
      </div>
    );
  }

  if (!tayyor) {
    return (
      <div className="page center-note">
        <div className="spinner" style={{ margin: "60px auto 0" }} />
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      <ToastProvider>
      <OpeningCurtain done={pardaKetdi} />
      <BrowserRouter>
        <TelegramBackButton />
        <div className="topbar">
          <FlameMark />
          <span className="wordmark">
            Fenix<span className="wordmark-dot">.</span>
          </span>
          {!!user?.streak_kun && <span className="streak-tag">{user.streak_kun}-kun</span>}
        </div>
        <Routes>
          <Route path="/" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CoursePage />} />
          <Route path="/books/:bookId/chapters" element={<ChaptersPage />} />
          <Route path="/chapters/:chapterId/practice" element={<ExercisePage />} />
          <Route path="/courses/:courseId/vocab" element={<VocabPage />} />
          <Route path="/courses/:courseId/weekly-report" element={<WeeklyReportPage />} />
        </Routes>
      </BrowserRouter>
      </ToastProvider>
    </UserContext.Provider>
  );
}
