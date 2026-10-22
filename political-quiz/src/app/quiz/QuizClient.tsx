"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import {
  LOCALSTORAGE_ANSWERS_KEY,
  parseAnswers,
  QUESTIONS_V1,
  type Likert,
  type QuizAnswers,
} from "@/lib/quiz";
import { useStoredString, writeStored } from "@/lib/storage";

const SCALE: { label: string; value: Likert; icon: string }[] = [
  { label: "Strongly disagree", value: -2, icon: "✕✕" },
  { label: "Disagree", value: -1, icon: "✕" },
  { label: "Neutral", value: 0, icon: "—" },
  { label: "Agree", value: 1, icon: "✓" },
  { label: "Strongly agree", value: 2, icon: "✓✓" },
];

function storeAnswers(a: QuizAnswers) {
  writeStored(LOCALSTORAGE_ANSWERS_KEY, JSON.stringify(a));
}

export default function QuizClient() {
  const [idx, setIdx] = useState(0);
  const rawAnswers = useStoredString(LOCALSTORAGE_ANSWERS_KEY);
  const answers = useMemo(() => parseAnswers(rawAnswers), [rawAnswers]);

  const q = QUESTIONS_V1[idx];
  const progress = Math.round(((idx + 1) / QUESTIONS_V1.length) * 100);
  const canNext = useMemo(() => answers[q.id] !== undefined, [answers, q.id]);
  const answeredTotal = Object.keys(answers).length;

  function setAnswer(v: Likert) {
    storeAnswers({ ...answers, [q.id]: v });
  }

  function next() {
    if (idx < QUESTIONS_V1.length - 1) setIdx(idx + 1);
  }

  function back() {
    if (idx > 0) setIdx(idx - 1);
  }

  function restart() {
    setIdx(0);
    storeAnswers({});
  }

  return (
    <div className="container">
      {/* ─── Nav ─── */}
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/political" className="navLink">About</Link>
          <Link href="/methodology" className="navLink">Methodology</Link>
        </nav>
      </header>

      <main style={{ paddingBottom: 48 }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          {/* ─── Progress header ─── */}
          <div className="card" style={{ padding: "22px 26px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="kicker">Pytheas Political</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="small">
                  Question <strong style={{ color: "var(--text)" }}>{idx + 1}</strong> of {QUESTIONS_V1.length}
                </div>
                {answeredTotal > 0 && (
                  <span className="chip" style={{ fontSize: 11 }}>
                    {answeredTotal} answered
                  </span>
                )}
              </div>
            </div>

            <div className="progressWrap">
              <div className="progressBar" style={{ width: `${progress}%` }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <div className="small">0%</div>
              <div className="small">{progress}% complete</div>
              <div className="small">100%</div>
            </div>
          </div>

          {/* ─── Question card ─── */}
          <div className="card card-elevated" style={{ padding: "28px 30px" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.40, letterSpacing: "-0.01em", margin: "0 0 24px" }}>
              {q.text}
            </h1>

            <div className="grid" style={{ gap: 10 }}>
              {SCALE.map((s) => {
                const active = answers[q.id] === s.value;
                return (
                  <button
                    key={s.value}
                    className={`answerBtn${active ? " active" : ""}`}
                    onClick={() => setAnswer(s.value)}
                  >
                    <span className="answerDot" />
                    <span style={{ flex: 1 }}>{s.label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        opacity: active ? 0.8 : 0.35,
                        letterSpacing: "0.05em",
                        fontFamily: "monospace",
                      }}
                    >
                      {s.icon}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" onClick={back} disabled={idx === 0}>
                  ← Back
                </button>
                <button className="btn" onClick={restart} style={{ fontSize: 13 }}>
                  Restart
                </button>
              </div>

              {idx < QUESTIONS_V1.length - 1 ? (
                <button className="btn btnPrimary" onClick={next} disabled={!canNext}>
                  Next →
                </button>
              ) : (
                <Link href="/quiz/result" className="btn btnPrimary">
                  See my result →
                </Link>
              )}
            </div>

            <div style={{ marginTop: 16 }} className="small">
              🔒 Answers are stored locally on your device only.
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
