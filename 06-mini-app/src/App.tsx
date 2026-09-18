import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CoursesPage } from "./pages/CoursesPage";
import { CoursePage } from "./pages/CoursePage";
import { ChaptersPage } from "./pages/ChaptersPage";
import { ExercisePage } from "./pages/ExercisePage";
import { VocabPage } from "./pages/VocabPage";
import { WeeklyReportPage } from "./pages/WeeklyReportPage";
import { syncUser } from "./api/fenix";

export function App() {
  const [tayyor, setTayyor] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    // Mini App ochilganda foydalanuvchini backend'ga ro'yxatdan o'tkazadi
    const tgUser = (tg as any)?.initDataUnsafe?.user;
    const ism = tgUser?.first_name ?? "Foydalanuvchi";

    syncUser(ism)
      .then(() => setTayyor(true))
      .catch((e) => setXato(e instanceof Error ? e.message : String(e)));
  }, []);

  if (xato) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: "#ff6b6b" }}>Ulanishda xato: {xato}</p>
      </div>
    );
  }

  if (!tayyor) {
    return <div style={{ padding: 16 }}>Yuklanmoqda...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CoursesPage />} />
        <Route path="/courses/:id" element={<CoursePage />} />
        <Route path="/books/:bookId/chapters" element={<ChaptersPage />} />
        <Route path="/chapters/:chapterId/practice" element={<ExercisePage />} />
        <Route path="/courses/:courseId/vocab" element={<VocabPage />} />
        <Route path="/courses/:courseId/weekly-report" element={<WeeklyReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
