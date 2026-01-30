"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QUESTIONS_V1, type Likert, type QuizAnswers } from "@/lib/quiz";

const SCALE: { label: string; value: Likert }[] = [
  { label: "Strongly disagree", value: -2 },
  { label: "Disagree", value: -1 },
  { label: "Neutral", value: 0 },
  { label: "Agree", value: 1 },
  { label: "Strongly agree", value: 2 },
];

function getStoredAnswers(): QuizAnswers {
  try {
    const raw = localStorage.getItem("pytheas_answers_v1");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function storeAnswers(a: QuizAnswers) {
  try {
    localStorage.setItem("pytheas_answers_v1", JSON.stringify(a));
  } catch {
    // ignore
  }
}

export default function QuizClient() {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});

  useEffect(() => {
    setAnswers(getStoredAnswers());
  }, []);

  const q = QUESTIONS_V1[idx];
  const progress = Math.round(((idx + 1) / QUESTIONS_V1.length) * 100);

  const canNext = useMemo(() => answers[q.id] !== undefined, [answers, q.id]);

  function setAnswer(v: Likert) {
    const next = { ...answers, [q.id]: v };
    setAnswers(next);
    storeAnswers(next);
  }

  function next() {
    if (idx < QUESTIONS_V1.length - 1) setIdx(idx + 1);
  }

  function back() {
    if (idx > 0) setIdx(idx - 1);
  }

  function restart() {
    setIdx(0);
    setAnswers({});
    storeAnswers({});
  }

  return (
    <main className="card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="kicker">Pytheas Political</div>
        <div className="small">{idx + 1}/{QUESTIONS_V1.length}</div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "rgba(10,27,58,0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: 8,
              background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            }}
          />
        </div>
      </div>

      <h1 style={{ fontSize: 26, marginTop: 16 }}>{q.text}</h1>

      <div className="grid" style={{ marginTop: 14 }}>
        {SCALE.map((s) => {
          const active = answers[q.id] === s.value;
          return (
            <button
              key={s.value}
              className={active ? "btn btnPrimary" : "btn"}
              onClick={() => setAnswer(s.value)}
              style={{ justifyContent: "flex-start" }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="btn" onClick={back} disabled={idx === 0}>
          Back
        </button>
        {idx < QUESTIONS_V1.length - 1 ? (
          <button className="btn btnPrimary" onClick={next} disabled={!canNext}>
            Next
          </button>
        ) : (
          <Link href="/quiz/result" className="btn btnPrimary">
            See result
          </Link>
        )}
        <button className="btn" onClick={restart}>
          Restart
        </button>
      </div>

      <div style={{ marginTop: 14 }} className="small">
        Answers are stored locally on your device.
      </div>
    </main>
  );
}
