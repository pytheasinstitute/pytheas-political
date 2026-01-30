"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LOCALSTORAGE_UNLOCK_KEY,
  profileBlurb,
  QUESTIONS_V1,
  scoreQuiz,
  type QuizAnswers,
} from "@/lib/quiz";

function getStoredAnswers(): QuizAnswers {
  try {
    const raw = localStorage.getItem("pytheas_answers_v1");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isUnlocked(): boolean {
  try {
    return localStorage.getItem(LOCALSTORAGE_UNLOCK_KEY) === "true";
  } catch {
    return false;
  }
}

function setUnlocked(v: boolean) {
  try {
    localStorage.setItem(LOCALSTORAGE_UNLOCK_KEY, v ? "true" : "false");
  } catch {
    // ignore
  }
}

function AxisBar({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 750 }}>{label}</div>
        <div className="small">{pct}%</div>
      </div>
      <div className="small" style={{ marginTop: 6, display: "flex", justifyContent: "space-between" }}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 10,
          borderRadius: 999,
          background: "rgba(10,27,58,0.10)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: 10,
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
          }}
        />
      </div>
    </div>
  );
}

function MapDot({ xPct, yPct }: { xPct: number; yPct: number }) {
  // xPct: 0..100 (0=Market, 100=State) | yPct: 0..100 (0=Conservative, 100=Progressive)
  return (
    <div className="card" style={{ padding: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 750 }}>Political map</div>
        <div className="small">2 axes</div>
      </div>

      <div
        style={{
          marginTop: 12,
          aspectRatio: "1 / 1",
          width: "100%",
          background:
            "linear-gradient(to right, rgba(10,27,58,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,27,58,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          borderRadius: 12,
          border: "1px solid rgba(10,27,58,0.12)",
          position: "relative",
        }}
      >
        {/* center lines */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(10,27,58,0.16)" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(10,27,58,0.16)" }} />

        {/* dot */}
        <div
          style={{
            position: "absolute",
            left: `calc(${xPct}% - 8px)`,
            top: `calc(${100 - yPct}% - 8px)`,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            boxShadow: "0 8px 18px rgba(10,27,58,0.18)",
          }}
        />
      </div>

      <div className="small" style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
        <span>Market</span>
        <span>State</span>
      </div>
      <div className="small" style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span>Conservative</span>
        <span>Progressive</span>
      </div>
    </div>
  );
}

function LockedOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(7px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div className="card" style={{ padding: 16, maxWidth: 520, width: "100%" }}>
          <div className="kicker">Profile ready</div>
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 8 }}>Unlock your full result</div>
          <div className="small" style={{ marginTop: 8 }}>
            One-time unlock (~€1 equivalent). No subscription. Taxes (e.g., VAT) included where required.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {/* Placeholder for Stripe later */}
            <button className="btn btnPrimary" onClick={() => setUnlocked(true)}>
              Dev unlock
            </button>
            <Link className="btn" href="/quiz">
              Adjust answers
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResultClient() {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [unlocked, setUnlockedState] = useState(false);

  useEffect(() => {
    setAnswers(getStoredAnswers());
    setUnlockedState(isUnlocked());
  }, []);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const score = useMemo(() => scoreQuiz(answers, QUESTIONS_V1), [answers]);
  const blurb = useMemo(() => profileBlurb(score), [score]);

  useEffect(() => {
    const handler = () => setUnlockedState(isUnlocked());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  if (answeredCount < QUESTIONS_V1.length) {
    return (
      <main className="card" style={{ padding: 18 }}>
        <div className="kicker">Pytheas Political</div>
        <h1 className="h1" style={{ marginTop: 10 }}>
          Your result isn’t ready yet
        </h1>
        <p className="p">
          You’ve answered {answeredCount} of {QUESTIONS_V1.length} questions.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <Link className="btn btnPrimary" href="/quiz">
            Continue quiz
          </Link>
          <Link className="btn" href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  const fullResult = (
    <div className="grid grid2" style={{ alignItems: "start" }}>
      <div className="grid">
        <MapDot xPct={score.smPct} yPct={score.pcPct} />
        <AxisBar label="Social axis" left="Conservative" right="Progressive" pct={score.pcPct} />
        <AxisBar label="Economic axis" left="Market" right="State" pct={score.smPct} />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div className="kicker">Your profile</div>
        <div style={{ fontWeight: 850, fontSize: 22, marginTop: 8 }}>{blurb.title}</div>
        <div className="grid" style={{ marginTop: 12 }}>
          {blurb.bullets.map((b) => (
            <div key={b} className="small">
              • {b}
            </div>
          ))}
        </div>

        <p className="small" style={{ marginTop: 12 }}>
          {blurb.paragraph}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button
            className="btn"
            onClick={() => {
              setUnlocked(false);
              setUnlockedState(false);
            }}
          >
            Lock (dev)
          </button>
          <Link className="btn" href="/quiz">
            Retake
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card" style={{ padding: 18 }}>
        <div className="kicker">Pytheas Political</div>
        <h1 className="h1" style={{ fontSize: 36, marginTop: 10 }}>
          Your political profile
        </h1>
        <p className="p" style={{ marginTop: 8 }}>
          Built from 12 neutral statements across two axes. Use it for self-reflection — not as a full ideology label.
        </p>
      </section>

      {unlocked ? fullResult : <LockedOverlay>{fullResult}</LockedOverlay>}
    </main>
  );
}
