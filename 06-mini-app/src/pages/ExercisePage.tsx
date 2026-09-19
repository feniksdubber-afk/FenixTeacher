import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { SpineBar } from "../components/Progress";
import { QuestionSkeleton } from "../components/Skeleton";
import {
  generateExercise,
  submitAnswer,
  discussExercise,
  playTts,
  NewExercise,
  AnswerResult,
  DiscussionMessage,
  ExerciseTuri,
} from "../api/fenix";

function boldify(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return { __html: html };
}

const TURI_NOMI: Record<ExerciseTuri, string> = {
  tanlov: "Tanlov",
  boshliq_toldirish: "Bo'shliqni to'ldirish",
  tarjima: "Tarjima",
  gap_tuzish: "Gap tuzish",
  writing: "Yozma ish",
  error_correction: "Xatoni topish",
  teach_back: "O'rgatib ko'ring",
};

/** Baholash o'lchovlari (0..1). O'rgatish mashqida ma'nosi boshqacha (backend shunday to'ldiradi). */
function baholashNomlari(turi: ExerciseTuri): [string, string, string] {
  return turi === "teach_back"
    ? ["tushuntirish aniqligi", "misol keltirilgani", "atamalar"]
    : ["grammatika", "tabiiylik", "lug'at boyligi"];
}

const TEZ_SAVOLLAR = ["Nega shunday?", "Boshqa misol keltiring", "Oddiyroq tushuntiring"];
/** Fenix javobidan keyin chiqadigan davomiy savollar. */
const DAVOM_SAVOLLARI = ["Yana bir misol", "Oddiyroq tushuntiring", "Qoidasini qisqa ayting"];

type Msg = DiscussionMessage & { anim?: boolean };

/**
 * **qalin** belgisini React tugunlariga aylantiradi (innerHTML ishlatilmaydi).
 * `anim` bo'lsa so'zlar birin-ketin "siyoh qurib" paydo bo'ladi — Fenix xuddi
 * yozayotgandek. Umumiy davomiylik ~1.4 soniyadan oshmaydi.
 */
function Rich({ text, anim }: { text: string; anim?: boolean }) {
  const parts = text.split(/(\*\*.+?\*\*)/g).filter(Boolean);
  const total = Math.max(1, text.split(/\s+/).length);
  const step = Math.min(30, 1400 / total);
  let n = 0;
  return (
    <>
      {parts.map((p, pi) => {
        const bold = p.length > 4 && p.startsWith("**") && p.endsWith("**");
        const inner = bold ? p.slice(2, -2) : p;
        const nodes = inner.split(/(\s+)/).map((w, wi) =>
          w === "" || /^\s+$/.test(w) || !anim ? (
            w
          ) : (
            <span key={wi} className="fx-word" style={{ animationDelay: `${Math.round(n++ * step)}ms` }}>
              {w}
            </span>
          )
        );
        return bold ? <strong key={pi}>{nodes}</strong> : <span key={pi}>{nodes}</span>;
      })}
    </>
  );
}

function FlameDot() {
  return (
    <svg className="msg-mark" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2c1 3-2 4-2 7 0 1.4 1.1 2.5 2.5 2.5S15 10.4 15 9c1.8 1.6 3 4 3 6.5 0 3.6-2.9 6.5-6.5 6.5S5 19.1 5 15.5c0-3 1.6-5 3-6.7C8.6 7.6 9 5.3 12 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function StampIcon({ natija }: { natija: AnswerResult["natija"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {natija === "togri" && <path d="M5 12.6l4.4 4.4L19 7.4" {...common} />}
      {natija === "qisman" && <path d="M4.5 14c2-4 4-4 5.5-1.5s3.5 2.5 5.5-1.5M5 19h14" {...common} />}
      {natija === "notogri" && <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...common} />}
    </svg>
  );
}

export function ExercisePage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [exercise, setExercise] = useState<NewExercise | null>(null);
  const [javob, setJavob] = useState("");
  const [natija, setNatija] = useState<AnswerResult | null>(null);
  const [suhbat, setSuhbat] = useState<Msg[]>([]);
  const [negaXabari, setNegaXabari] = useState("");
  const [holat, setHolat] = useState<"boshlanmagan" | "yuklanmoqda" | "javob_kutilmoqda" | "baholandi">(
    "boshlanmagan"
  );
  const [yuborilmoqda, setYuborilmoqda] = useState(false); // javob baholanmoqda
  const [oylayapti, setOylayapti] = useState(false); // Fenix "Nega?"ga javob yozmoqda
  const [raqam, setRaqam] = useState(0); // shu seansdagi mashq tartibi

  const suhbatOxiriRef = useRef<HTMLDivElement>(null);
  const foydalanuvchiYozdiRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Telefonda Enter — yangi qator (yuborish tugma bilan); kompyuterda Enter — yuborish.
  const sensorli = useMemo(() => window.matchMedia?.("(pointer: coarse)").matches ?? false, []);

  // Yozish maydoni matn uzunligiga qarab o'sadi (5 qatorgacha)
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [negaXabari]);

  useEffect(() => {
    if (!foydalanuvchiYozdiRef.current) return;
    suhbatOxiriRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [suhbat.length, oylayapti]);

  async function yangiMashq() {
    if (!chapterId) return;
    setNatija(null);
    setSuhbat([]);
    setJavob("");
    setNegaXabari("");
    foydalanuvchiYozdiRef.current = false;
    setHolat("yuklanmoqda");
    try {
      const yangi = await generateExercise(chapterId);
      setExercise(yangi);
      setRaqam((n) => n + 1);
      setHolat("javob_kutilmoqda");
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
      setHolat("boshlanmagan");
    }
  }

  async function javobniYubor() {
    if (!exercise || !javob.trim() || yuborilmoqda) return;
    setYuborilmoqda(true);
    try {
      const res = await submitAnswer(exercise.id, javob);
      setNatija(res);
      setHolat("baholandi");
      if (res.teach_back_kuzatuv_savoli) {
        setSuhbat((s) => [...s, { xabar: res.teach_back_kuzatuv_savoli!, kim_yozgan: "fenix", anim: true }]);
      }
    } catch (e) {
      toast.xato(e instanceof Error ? e.message : String(e));
    } finally {
      setYuborilmoqda(false);
    }
  }

  async function negaSora(matn?: string) {
    const mening = (matn ?? negaXabari).trim();
    if (!exercise || !mening || oylayapti) return;
    foydalanuvchiYozdiRef.current = true;
    setSuhbat((s) => [...s, { xabar: mening, kim_yozgan: "user" }]);
    setNegaXabari("");
    setOylayapti(true);
    try {
      const res = await discussExercise(exercise.id, mening);
      setSuhbat((s) => [...s, { xabar: res.xabar, kim_yozgan: "fenix", anim: true }]);
    } catch (e) {
      // Yuborilmagan xabarni qaytarib, qayta urinib ko'rish imkonini beramiz
      setSuhbat((s) => s.slice(0, -1));
      setNegaXabari(mening);
      toast.xato(e instanceof Error ? e.message : String(e));
    } finally {
      setOylayapti(false);
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

  const teachBack = exercise?.turi === "teach_back";
  const oxirgiFenix = suhbat.length > 0 && suhbat[suhbat.length - 1].kim_yozgan === "fenix";

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

      {holat === "yuklanmoqda" && <QuestionSkeleton />}

      {exercise && (holat === "javob_kutilmoqda" || holat === "baholandi") && (
        <div>
          <div className="room-meta">
            <span className="room-tag">{TURI_NOMI[exercise.turi] ?? exercise.turi}</span>
            <span className="room-topic">
              {exercise.mavzu}
              {exercise.interleaved && <span className="tag-repeat"> · takrorlash</span>}
            </span>
            <span className="room-count">{raqam}-mashq</span>
          </div>

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
                readOnly={yuborilmoqda}
                onChange={(e) => setJavob(e.target.value)}
                placeholder={teachBack ? "go'yo do'stingizga tushuntirayotgandek yozing..." : "javobingiz shu yerga..."}
                style={{ marginTop: 22 }}
              />
              {yuborilmoqda ? (
                <div className="room-busy" role="status">
                  <SpineBar indeterminate ticks={10} size="sm" label="Baholanmoqda" />
                  <span>Fenix javobingizni o'qimoqda...</span>
                </div>
              ) : (
                <button
                  onClick={javobniYubor}
                  disabled={!javob.trim()}
                  className="btn"
                  style={{ marginTop: 18, maxWidth: 220 }}
                >
                  Javobni yuborish
                </button>
              )}
            </>
          )}

          {holat === "baholandi" && natija && (
            <div className="room-result">
              {/* --- Ustoz muhri --- */}
              <div className="verdict">
                <span className={`stamp ${natijaSinfi}`} aria-hidden="true">
                  <StampIcon natija={natija.natija} />
                </span>
                <p className={`result-line ${natijaSinfi}`}>{natijaSozi}</p>
              </div>

              {/* --- Fenix fikri: chetdagi qayd --- */}
              <div className="fenix-note">
                <FlameDot />
                <p className="fenix-note-text" dangerouslySetInnerHTML={boldify(natija.fenix_fikri)} />
              </div>

              {natija.togri_javob && (
                <div className="answer-key">
                  <span className="answer-key-label">to'g'ri javob</span>
                  <p className="answer-key-text">{natija.togri_javob}</p>
                </div>
              )}

              {/* --- Ko'p qirrali baho (0..1) --- */}
              {natija.baholash && (
                <div className="score">
                  {(["grammatika", "tabiiylik", "lugat_boyligi"] as const).map((k, i) => {
                    const v = Math.min(1, Math.max(0, Number(natija.baholash[k]) || 0));
                    return (
                      <div key={k} className="score-row">
                        <span className="score-key">{baholashNomlari(exercise.turi)[i]}</span>
                        <span className="toc-leader" />
                        <SpineBar value={v * 100} ticks={10} size="sm" label={baholashNomlari(exercise.turi)[i]} />
                        <span className="score-val">{Math.round(v * 100)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* --- "Nega?" suhbati --- */}
              <section className="nega">
                <h2 className="nega-title">
                  {teachBack ? (
                    "Suhbat"
                  ) : (
                    <>
                      Nega<span className="nega-q">?</span>
                    </>
                  )}
                </h2>
                <p className="sub">
                  {teachBack
                    ? "Fenix tushunganingizni chuqurroq tekshiryapti — o'z so'zlaringiz bilan javob bering."
                    : "Tushunmagan joyingizni so'rang — Fenix sabr bilan tushuntiradi."}
                </p>

                {!teachBack && suhbat.length === 0 && (
                  <div className="nega-chips">
                    {TEZ_SAVOLLAR.map((t) => (
                      <button key={t} className="nega-chip" onClick={() => negaSora(t)} disabled={oylayapti}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {(suhbat.length > 0 || oylayapti) && (
                  <div className="thread" role="log" aria-live="polite">
                    {suhbat.map((m, i) => (
                      <div key={i} className={`msg ${m.kim_yozgan === "user" ? "is-user" : "is-fenix"}`}>
                        {m.kim_yozgan === "fenix" && (
                          <span className="msg-badge">
                            <FlameDot />
                          </span>
                        )}
                        <div className="msg-col">
                          <div className="msg-body">
                            <Rich text={m.xabar} anim={m.anim} />
                          </div>
                          {m.kim_yozgan === "fenix" && (
                            <div className="msg-tools">
                              <button
                                className="msg-tool"
                                onClick={() =>
                                  playTts(m.xabar.replace(/\*\*/g, "")).catch(() =>
                                    toast.info("Ovoz hozircha sozlanmagan")
                                  )
                                }
                              >
                                🔊 tinglash
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {oylayapti && (
                      <div className="msg is-fenix is-typing" role="status" aria-label="Fenix yozmoqda">
                        <span className="msg-badge">
                          <FlameDot />
                        </span>
                        <div className="msg-col">
                          <SpineBar indeterminate ticks={8} size="xs" />
                          <span className="typing-label">Fenix o'ylayapti...</span>
                        </div>
                      </div>
                    )}

                    {!oylayapti && !teachBack && oxirgiFenix && (
                      <div className="nega-chips is-follow">
                        {DAVOM_SAVOLLARI.map((t) => (
                          <button key={t} className="nega-chip" onClick={() => negaSora(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={suhbatOxiriRef} />
                  </div>
                )}

                <div className="composer">
                  <textarea
                    ref={composerRef}
                    className="composer-input"
                    rows={1}
                    enterKeyHint="send"
                    value={negaXabari}
                    onChange={(e) => setNegaXabari(e.target.value)}
                    placeholder={teachBack ? "javobingiz..." : "Savolingizni yozing..."}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !sensorli) {
                        e.preventDefault();
                        negaSora();
                      }
                    }}
                  />
                  <button
                    className="composer-send"
                    onClick={() => negaSora()}
                    disabled={!negaXabari.trim() || oylayapti}
                    aria-label="Yuborish"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </section>

              <button onClick={yangiMashq} className="btn" style={{ marginTop: 30 }}>
                Keyingi mashq
              </button>
              <div className="link-row" style={{ marginTop: 14, justifyContent: "center" }}>
                <button onClick={() => navigate(-1)} className="text-link">
                  boblar ro'yxatiga
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
