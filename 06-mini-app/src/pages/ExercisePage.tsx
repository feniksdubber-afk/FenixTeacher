import { useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import {
  generateExercise,
  submitAnswer,
  discussExercise,
  NewExercise,
  AnswerResult,
  DiscussionMessage,
} from "../api/fenix";

export function ExercisePage() {
  const { chapterId } = useParams<{ chapterId: string }>();

  const [exercise, setExercise] = useState<NewExercise | null>(null);
  const [javob, setJavob] = useState("");
  const [natija, setNatija] = useState<AnswerResult | null>(null);
  const [suhbat, setSuhbat] = useState<DiscussionMessage[]>([]);
  const [negaXabari, setNegaXabari] = useState("");
  const [holat, setHolat] = useState<"boshlanmagan" | "yuklanmoqda" | "javob_kutilmoqda" | "baholandi">(
    "boshlanmagan"
  );
  const [xato, setXato] = useState<string | null>(null);

  async function yangiMashq() {
    if (!chapterId) return;
    setXato(null);
    setNatija(null);
    setSuhbat([]);
    setJavob("");
    setHolat("yuklanmoqda");
    try {
      const yangi = await generateExercise(chapterId);
      setExercise(yangi);
      setHolat("javob_kutilmoqda");
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
      setHolat("boshlanmagan");
    }
  }

  async function javobniYubor() {
    if (!exercise || !javob.trim()) return;
    setXato(null);
    try {
      const res = await submitAnswer(exercise.id, javob);
      setNatija(res);
      setHolat("baholandi");
      if (res.teach_back_kuzatuv_savoli) {
        setSuhbat((s) => [...s, { xabar: res.teach_back_kuzatuv_savoli!, kim_yozgan: "fenix" }]);
      }
    } catch (e) {
      setXato(e instanceof Error ? e.message : String(e));
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
      setXato(e instanceof Error ? e.message : String(e));
    }
  }

  const natijaRangi =
    natija?.natija === "togri" ? "#4caf50" : natija?.natija === "qisman" ? "#e0a800" : "#ff6b6b";

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Fenix bilan mashq</h1>

      {xato && <p style={{ color: "#ff6b6b" }}>{xato}</p>}

      {holat === "boshlanmagan" && (
        <button onClick={yangiMashq} style={btnStyle}>
          Mashqni boshlash
        </button>
      )}

      {holat === "yuklanmoqda" && <p>Fenix mashq tayyorlamoqda...</p>}

      {exercise && (holat === "javob_kutilmoqda" || holat === "baholandi") && (
        <div style={{ marginTop: 8 }}>
          <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 4 }}>
            Mavzu: {exercise.mavzu}
            {exercise.interleaved && (
              <span
                style={{
                  marginLeft: 8,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#2a2a1c",
                  color: "#e0c040",
                  fontSize: 11,
                }}
              >
                🔁 Takrorlash
              </span>
            )}
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.5 }}>{exercise.savol}</p>

          {holat === "javob_kutilmoqda" && (
            <>
              <textarea
                value={javob}
                onChange={(e) => setJavob(e.target.value)}
                placeholder="Javobingizni shu yerga yozing..."
                style={{ ...inputStyle, width: "100%", minHeight: 80, marginTop: 12, resize: "vertical" }}
              />
              <button onClick={javobniYubor} style={btnStyle}>
                Javobni yuborish
              </button>
            </>
          )}

          {holat === "baholandi" && natija && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: natijaRangi, fontWeight: 600 }}>
                {natija.natija === "togri" ? "To'g'ri!" : natija.natija === "qisman" ? "Qisman to'g'ri" : "Noto'g'ri"}
              </p>
              <p style={{ marginTop: 6 }}>{natija.fenix_fikri}</p>
              {natija.togri_javob && (
                <p style={{ opacity: 0.7, fontSize: 14, marginTop: 6 }}>
                  To'g'ri javob: {natija.togri_javob}
                </p>
              )}

              <div style={{ marginTop: 20 }}>
                <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>
                  Tushunmagan joyi bo'lsa Fenixdan so'rang ("Nega?"):
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                  {suhbat.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.kim_yozgan === "user" ? "flex-end" : "flex-start",
                        background:
                          m.kim_yozgan === "user"
                            ? "var(--tg-theme-button-color, #3390ec)"
                            : "var(--tg-theme-secondary-bg-color, #1c1c1f)",
                        color: m.kim_yozgan === "user" ? "var(--tg-theme-button-text-color, #fff)" : "inherit",
                        padding: "8px 12px",
                        borderRadius: 10,
                        maxWidth: "85%",
                      }}
                    >
                      {m.xabar}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={negaXabari}
                    onChange={(e) => setNegaXabari(e.target.value)}
                    placeholder="Nega shunday?"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={(e) => e.key === "Enter" && negaSora()}
                  />
                  <button onClick={negaSora} style={{ ...btnStyle, marginTop: 0, width: "auto", padding: "0 16px" }}>
                    Yuborish
                  </button>
                </div>
              </div>

              <button onClick={yangiMashq} style={{ ...btnStyle, marginTop: 24 }}>
                Keyingi mashq
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: "12px",
  borderRadius: 12,
  border: "none",
  background: "var(--tg-theme-button-color, #3390ec)",
  color: "var(--tg-theme-button-text-color, #fff)",
  fontSize: 15,
};

const inputStyle: CSSProperties = {
  padding: "12px",
  borderRadius: 10,
  border: "1px solid #333",
  background: "transparent",
  color: "inherit",
};
