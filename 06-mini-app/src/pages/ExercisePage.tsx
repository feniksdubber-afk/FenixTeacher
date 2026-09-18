import { useState } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { SpineBar } from "../components/Progress";
import {
  generateExercise,
  submitAnswer,
  discussExercise,
  playTts,
  NewExercise,
  AnswerResult,
  DiscussionMessage,
} from "../api/fenix";

function boldify(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return { __html: html };
}

export function ExercisePage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const toast = useToast();

  const [exercise, setExercise] = useState<NewExercise | null>(null);
  const [javob, setJavob] = useState("");
  const [natija, setNatija] = useState<AnswerResult | null>(null);
  const [suhbat, setSuhbat] = useState<DiscussionMessage[]>([]);
  const [negaXabari, setNegaXabari] = useState("");
  const [holat, setHolat] = useState<"boshlanmagan" | "yuklanmoqda" | "javob_kutilmoqda" | "baholandi">(
    "boshlanmagan"
  );

  async function yangiMashq() {
    if (!chapterId) return;
    setNatija(null);
    setSuhbat([]);
    setJavob("");
    setHolat("yuklanmoqda");
    try {
      const yangi = await generateExercise(chapterId);
      setExercise(yangi);
      setHolat("javob_kutilmoqda");
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
      setHolat("boshlanmagan");
    }
  }

  async function javobniYubor() {
    if (!exercise || !javob.trim()) return;
    try {
      const res = await submitAnswer(exercise.id, javob);
      setNatija(res);
      setHolat("baholandi");
      if (res.teach_back_kuzatuv_savoli) {
        setSuhbat((s) => [...s, { xabar: res.teach_back_kuzatuv_savoli!, kim_yozgan: "fenix" }]);
      }
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    }
  }

  async function negaSora() {
    if (!exercise || !negaXabari.trim()) return;
    const mening = negaXabari.trim();
    setSuhbat((s) => [...s, { xabar: mening, kim_yozgan: "user" }]);
    setNegaXabari("");
    try {
      const res = await discussExercise(exercise.id, mening);
      setSuhbat((s) => [...s, { xabar: res.xabar, kim_yozgan: "fenix" }]);
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    }
  }

  const natijaSinfi =
    natija?.natija === "togri"
      ? "result-togri"
      : natija?.natija === "qisman"
      ? "result-qisman"
      : "result-notogri";

  const natijaSozi =
    natija?.natija === "togri" ? "To'g'ri." : natija?.natija === "qisman" ? "Qisman to'g'ri." : "Noto'g'ri.";

  return (
    <div className="page">
      <div className="hero">
        <h1 className="h1">Mashq</h1>
      </div>

      {holat === "boshlanmagan" && (
        <div className="center-note">
          <p className="empty" style={{ margin: "0 auto 20px" }}>
            Fenix bob matnidan savol tayyorlaydi. Boshlashga tayyor bo'lganingizda bosing.
          </p>
          <button onClick={yangiMashq} className="btn" style={{ maxWidth: 220, margin: "0 auto" }}>
            Mashqni boshlash
          </button>
        </div>
      )}

      {holat === "yuklanmoqda" && (
        <div className="center-note">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <SpineBar indeterminate ticks={14} size="sm" label="Savol tayyorlanmoqda" />
          </div>
          <p className="sub">Fenix savol tayyorlamoqda...</p>
        </div>
      )}

      {exercise && (holat === "javob_kutilmoqda" || holat === "baholandi") && (
        <div>
          <p className="topic-line">
            {exercise.mavzu}
            {exercise.interleaved && <span className="tag-repeat"> · takrorlash</span>}
          </p>
          <p className="question-text">
            <span className="question-mark">&ldquo;</span>
            {exercise.savol}
            <button onClick={() => playTts(exercise.savol).catch(() => {})} className="inline-sound" title="Tinglash">
              🔊
            </button>
          </p>

          {holat === "javob_kutilmoqda" && (
            <>
              <textarea
                className="ruled"
                value={javob}
                onChange={(e) => setJavob(e.target.value)}
                placeholder="javobingiz shu yerga..."
                style={{ marginTop: 22 }}
              />
              <button onClick={javobniYubor} className="btn" style={{ marginTop: 18, maxWidth: 220 }}>
                Javobni yuborish
              </button>
            </>
          )}

          {holat === "baholandi" && natija && (
            <div style={{ marginTop: 22 }}>
              <p className={`result-line ${natijaSinfi}`}>{natijaSozi}</p>
              <p
                  style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}
                  dangerouslySetInnerHTML={boldify(natija.fenix_fikri)}
                />
              {natija.togri_javob && <p className="sub" style={{ marginTop: 8 }}>To'g'ri javob: {natija.togri_javob}</p>}

              <div className="divider" />

              <p className="sub" style={{ marginBottom: 10 }}>
                Tushunmagan joyi bo'lsa so'rang — &ldquo;Nega?&rdquo;
              </p>

              {suhbat.length > 0 && (
                <div className="chat-list">
                  {suhbat.map((m, i) => (
                    <div key={i} className={`chat-line ${m.kim_yozgan === "user" ? "is-user" : ""}`}>
                      <div
                        className={`chat-bubble ${m.kim_yozgan === "user" ? "chat-user" : "chat-fenix"}`}
                        dangerouslySetInnerHTML={boldify(m.xabar)}
                      />
                    </div>
                  ))}
                </div>
              )}

              <input
                className="input"
                value={negaXabari}
                onChange={(e) => setNegaXabari(e.target.value)}
                placeholder="Nega shunday?"
                onKeyDown={(e) => e.key === "Enter" && negaSora()}
              />

              <button onClick={yangiMashq} className="btn" style={{ marginTop: 28 }}>
                Keyingi mashq
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
