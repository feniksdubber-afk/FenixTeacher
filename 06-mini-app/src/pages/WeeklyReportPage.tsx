import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { ReportSkeleton } from "../components/Skeleton";
import { getWeeklyReport, generateWeeklyReport, WeeklyReport } from "../api/fenix";

export function WeeklyReportPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const toast = useToast();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [holat, setHolat] = useState<"yuklanmoqda" | "topilmadi" | "tayyor">("yuklanmoqda");
  const [tuzilmoqda, setTuzilmoqda] = useState(false);

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
    try {
      const r = await generateWeeklyReport(courseId);
      setReport(r);
      setHolat("tayyor");
      toast.tayyor("Hisobot yangilandi");
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    } finally {
      setTuzilmoqda(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">Haftalik hisobot</h1>
        {report && <p className="sub">{report.hafta_boshi}</p>}
      </div>

      {holat === "yuklanmoqda" && <ReportSkeleton />}

      {holat === "topilmadi" && (
        <p className="empty">
          Hali hisobot yo'q. Shu hafta mashq bajargan bo'lsangiz, pastdagi tugma bilan tuzdirishingiz
          mumkin.
        </p>
      )}

      {report && (
        <div>
          {report.natija_xulosa && <p className="journal-entry">{report.natija_xulosa}</p>}

          <div className="ledger">
            {report.vaqt_sarflangan_daq !== null && (
              <div className="ledger-row">
                <span className="ledger-key">sarflangan vaqt</span>
                <span className="ledger-value">{report.vaqt_sarflangan_daq} daqiqa</span>
              </div>
            )}
            {!!report.mustahkam_mavzular?.length && (
              <div className="ledger-row">
                <span className="ledger-key topic-strong">mustahkam mavzular</span>
                <span className="ledger-value" style={{ fontSize: 14, fontStyle: "normal", fontFamily: "Inter, sans-serif", textAlign: "right" }}>
                  {report.mustahkam_mavzular.map((m) => m.mavzu).join(", ")}
                </span>
              </div>
            )}
            {!!report.zaif_mavzular?.length && (
              <div className="ledger-row">
                <span className="ledger-key topic-weak">zaif mavzular</span>
                <span className="ledger-value" style={{ fontSize: 14, fontStyle: "normal", fontFamily: "Inter, sans-serif", textAlign: "right" }}>
                  {report.zaif_mavzular.map((z) => z.mavzu).join(", ")}
                </span>
              </div>
            )}
          </div>

          {!!report.majburiyat?.length && (
            <>
              <h2 className="h2">Keyingi hafta majburiyati</h2>
              <div>
                {report.majburiyat.map((m, i) => (
                  <div key={i} className="commitment-row">
                    <strong>{m.band}</strong>
                    <div className="sub">{m.meyor}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button onClick={tuzish} disabled={tuzilmoqda} className="btn" style={{ marginTop: 26 }}>
        {tuzilmoqda ? "Tuzilmoqda..." : "Shu haftani hisobla"}
      </button>
    </div>
  );
}
