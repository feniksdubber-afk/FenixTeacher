import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getWeeklyReport, generateWeeklyReport, WeeklyReport } from "../api/fenix";

export function WeeklyReportPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [holat, setHolat] = useState<"yuklanmoqda" | "topilmadi" | "tayyor">("yuklanmoqda");
  const [tuzilmoqda, setTuzilmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    getWeeklyReport(courseId)
      .then((r) => {
        setReport(r);
        setHolat("tayyor");
      })
      .catch(() => setHolat("topilmadi"));
  }, [courseId]);

  async function tuzish() {
    if (!courseId) return;
    setTuzilmoqda(true);
    setXato(null);
    try {
      const r = await generateWeeklyReport(courseId);
      setReport(r);
      setHolat("tayyor");
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
    } finally {
      setTuzilmoqda(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>Haftalik hisobot</h1>

      {holat === "yuklanmoqda" && <p>Yuklanmoqda...</p>}

      {holat === "topilmadi" && (
        <p style={{ opacity: 0.7 }}>Hali hisobot yo'q. Shu hafta mashq bajargan bo'lsangiz, quyidagi tugma bilan tuzdirishingiz mumkin.</p>
      )}

      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ opacity: 0.6, fontSize: 13 }}>Hafta: {report.hafta_boshi}</p>

          {report.natija_xulosa && (
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: "var(--tg-theme-secondary-bg-color, #1c1c1f)",
                lineHeight: 1.5,
              }}
            >
              {report.natija_xulosa}
            </div>
          )}

          {report.vaqt_sarflangan_daq !== null && (
            <p style={{ fontSize: 13, opacity: 0.7 }}>Sarflangan vaqt: ~{report.vaqt_sarflangan_daq} daqiqa</p>
          )}

          {!!report.majburiyat?.length && (
            <div>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>Keyingi hafta majburiyati</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {report.majburiyat.map((m, i) => (
                  <div key={i} style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.05)" }}>
                    <strong>{m.band}</strong>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>{m.meyor}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!report.mustahkam_mavzular?.length && (
            <p style={{ fontSize: 13 }}>
              <span style={{ color: "#4caf50" }}>Mustahkam:</span>{" "}
              {report.mustahkam_mavzular.map((m) => m.mavzu).join(", ")}
            </p>
          )}
          {!!report.zaif_mavzular?.length && (
            <p style={{ fontSize: 13 }}>
              <span style={{ color: "#ff6b6b" }}>Zaif:</span> {report.zaif_mavzular.map((z) => z.mavzu).join(", ")}
            </p>
          )}
        </div>
      )}

      {xato && <p style={{ color: "#ff6b6b", marginTop: 12 }}>{xato}</p>}

      <button
        onClick={tuzish}
        disabled={tuzilmoqda}
        style={{
          marginTop: 20,
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: "none",
          background: "var(--tg-theme-button-color, #3390ec)",
          color: "var(--tg-theme-button-text-color, #fff)",
          opacity: tuzilmoqda ? 0.6 : 1,
        }}
      >
        {tuzilmoqda ? "Tuzilmoqda..." : "Shu haftani hisobla"}
      </button>
    </div>
  );
}
