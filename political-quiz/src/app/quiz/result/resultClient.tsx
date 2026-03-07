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
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, THEME_LABELS } from "@/lib/stats";
import { computeArchetype, computeThemes, formatPct, strengthLabel } from "@/lib/archetypes";
import Prism3D, { type PrismCorner } from "./Prism3D";

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
  } catch {}
}

function Chip({ text }: { text: string }) {
  return (
    <span className="chip">{text}</span>
  );
}

function AxisBar({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 20,
            color: "var(--accent2)",
            letterSpacing: "-0.03em",
          }}
        >
          {pct}%
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small">{left}</span>
        <span className="small">{right}</span>
      </div>
      <div className="progressWrap">
        <div className="progressBar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MapDot({ xPct, yPct }: { xPct: number; yPct: number }) {
  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Political map</div>
        <div className="small">2-axis view</div>
      </div>

      <div
        style={{
          aspectRatio: "1 / 1",
          width: "100%",
          background:
            "linear-gradient(to right, rgba(10,27,58,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,27,58,0.05) 1px, transparent 1px)",
          backgroundSize: "25% 25%",
          borderRadius: 12,
          border: "1px solid rgba(10,27,58,0.10)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Quadrant labels */}
        <div className="small" style={{ position: "absolute", top: 8, left: 10, opacity: 0.45, fontSize: 10 }}>
          State<br />+<br />Cons.
        </div>
        <div className="small" style={{ position: "absolute", top: 8, right: 10, textAlign: "right", opacity: 0.45, fontSize: 10 }}>
          State<br />+<br />Prog.
        </div>
        <div className="small" style={{ position: "absolute", bottom: 8, left: 10, opacity: 0.45, fontSize: 10 }}>
          Market<br />+<br />Cons.
        </div>
        <div className="small" style={{ position: "absolute", bottom: 8, right: 10, textAlign: "right", opacity: 0.45, fontSize: 10 }}>
          Market<br />+<br />Prog.
        </div>

        {/* Axis lines */}
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(10,27,58,0.14)" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(10,27,58,0.14)" }} />

        {/* Position dot */}
        <div
          style={{
            position: "absolute",
            left: `calc(${xPct}% - 10px)`,
            top: `calc(${100 - yPct}% - 10px)`,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "linear-gradient(135deg, var(--accent), var(--accent2))",
            boxShadow: "0 0 0 4px rgba(11,42,91,0.18), 0 6px 18px rgba(11,42,91,0.25)",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        <span className="small">← Market</span>
        <span className="small">State →</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="small">↓ Conservative</span>
        <span className="small">Progressive ↑</span>
      </div>
    </div>
  );
}

function LockedOverlay({
  children,
  archetype,
  themes,
}: {
  children: React.ReactNode;
  archetype: string;
  themes: string[];
}) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(6px)", opacity: 0.50, pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
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
        <div
          className="card"
          style={{
            padding: "28px 30px",
            maxWidth: 520,
            width: "100%",
            boxShadow: "0 32px 80px rgba(11,42,91,0.22)",
          }}
        >
          <div className="kicker" style={{ marginBottom: 10 }}>Profile ready</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Unlock your full result
          </h2>

          <div className="small" style={{ marginBottom: 14 }}>
            Your archetype preview:
          </div>

          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(11,42,91,0.06), rgba(26,91,184,0.04))",
              border: "1px solid rgba(11,42,91,0.10)",
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>{archetype}</div>
            {themes.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {themes.map((t) => <Chip key={t} text={t} />)}
              </div>
            )}
          </div>

          <div className="small" style={{ marginBottom: 18 }}>
            One-time unlock (~€1 equivalent). No subscription. No account required.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn btnPrimary btnLg"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={async () => {
                const res = await fetch("/api/create-checkout-session", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ origin: window.location.origin }),
                });
                const json = await res.json();
                if (json?.url) window.location.href = json.url;
              }}
            >
              🔓 Unlock for €1
            </button>
            <Link className="btn" href="/quiz" style={{ padding: "14px 20px" }}>
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

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    const wantsUnlock = url.searchParams.get("unlock") === "1";
    if (!sessionId || !wantsUnlock) return;

    (async () => {
      const res = await fetch("/api/verify-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (json?.paid) {
        setUnlocked(true);
        setUnlockedState(true);
      }
    })();
  }, []);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const score = useMemo(() => scoreQuiz(answers, QUESTIONS_V1), [answers]);
  const archetypeKey = useMemo(() => computeArchetype(score), [score]);
  const themesKeys = useMemo(() => computeThemes(answers), [answers]);
  const socialStrength = useMemo(() => strengthLabel(score.pcPct), [score.pcPct]);
  const econStrength = useMemo(() => strengthLabel(score.smPct), [score.smPct]);
  const blurb = useMemo(() => profileBlurb(score), [score]);

  const prismCorners = [
    { key: "progressive_reformer", label: "Progressive Reformer", color: "#1BA6A6" },
    { key: "progressive_individualist", label: "Progressive Individualist", color: "#2F6FED" },
    { key: "liberty_first", label: "Liberty-first", color: "#7A4DFF" },
    { key: "conservative_protector", label: "Conservative Protector", color: "#C89B2C" },
    { key: "conservative_entrepreneur", label: "Conservative Entrepreneur", color: "#E46B2E" },
    { key: "order_first", label: "Order-first", color: "#C23B4A" },
  ] as unknown as [PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner, PrismCorner];

  const prismWeights = useMemo(() => {
    const base = [0.08, 0.08, 0.08, 0.08, 0.08, 0.08];
    const idxMap: Record<string, number> = {
      progressive_reformer: 0,
      progressive_individualist: 1,
      liberty_first: 2,
      conservative_protector: 3,
      conservative_entrepreneur: 4,
      order_first: 5,
    };
    base[idxMap[archetypeKey] ?? 0] = 0.55;
    const prog = score.pcPct / 100;
    const state = score.smPct / 100;
    base[0] += prog * 0.10; base[1] += prog * 0.10;
    base[3] += (1 - prog) * 0.10; base[4] += (1 - prog) * 0.10;
    base[0] += state * 0.10; base[3] += state * 0.10;
    base[1] += (1 - state) * 0.10; base[4] += (1 - state) * 0.10;
    return base as unknown as Parameters<typeof Prism3D>[0]["weights"];
  }, [archetypeKey, score.pcPct, score.smPct]);

  const [livePct, setLivePct] = useState<string | null>(null);
  const [liveN, setLiveN] = useState<number | null>(null);

  useEffect(() => {
    const handler = () => setUnlockedState(isUnlocked());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      await fetch("/api/stats/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archetype: archetypeKey }),
      });
      const res = await fetch(`/api/stats/archetype?archetype=${archetypeKey}`);
      const json = await res.json();
      if (json?.ok && typeof json.total === "number" && typeof json.share === "number") {
        setLiveN(json.total);
        setLivePct(formatPct(json.share, json.total));
      }
    })();
  }, [unlocked, archetypeKey]);

  if (answeredCount < QUESTIONS_V1.length) {
    return (
      <main style={{ paddingBottom: 48 }}>
        <div className="card" style={{ padding: "32px 36px", maxWidth: 560 }}>
          <div className="kicker" style={{ marginBottom: 12 }}>Pytheas Political</div>
          <h1 className="h1" style={{ marginTop: 0, fontSize: 32 }}>Your result isn't ready yet</h1>
          <p className="p">
            You've answered <strong>{answeredCount}</strong> of{" "}
            <strong>{QUESTIONS_V1.length}</strong> questions.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
            <Link className="btn btnPrimary btnLg" href="/quiz">
              Continue quiz →
            </Link>
            <Link className="btn btnLg" href="/">
              Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const fullResult = (
    <div className="grid grid2" style={{ alignItems: "start" }}>
      {/* ─── Left: visuals ─── */}
      <div className="grid">
        <Prism3D locked={!unlocked} corners={prismCorners} weights={prismWeights} />
        <MapDot xPct={score.smPct} yPct={score.pcPct} />
        <AxisBar
          label={`Social axis — ${socialStrength}`}
          left="Conservative"
          right="Progressive"
          pct={score.pcPct}
        />
        <AxisBar
          label={`Economic axis — ${econStrength}`}
          left="Market"
          right="State"
          pct={score.smPct}
        />
      </div>

      {/* ─── Right: text cards ─── */}
      <div className="grid">
        <div className="card" style={{ padding: "22px 24px" }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Your archetype</div>
          <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: "-0.02em" }}>
            {ARCHETYPE_LABELS[archetypeKey]}
          </div>
          <p className="small" style={{ marginTop: 10, lineHeight: 1.65 }}>
            {ARCHETYPE_DESCRIPTIONS[archetypeKey]}
          </p>

          {themesKeys.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="kicker" style={{ marginBottom: 10 }}>Theme tags</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {themesKeys.map((t) => (
                  <Chip key={t} text={THEME_LABELS[t]} />
                ))}
              </div>
            </div>
          )}
        </div>

        {unlocked && (
          <div className="card" style={{ padding: "22px 24px" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>Live comparison</div>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>
              How many people match you
            </div>
            <div className="small" style={{ marginTop: 10 }}>
              {livePct && liveN !== null ? (
                <>
                  <strong style={{ fontSize: 15, color: "var(--accent2)" }}>{livePct}</strong> of
                  users share your archetype (n={liveN.toLocaleString()}).
                </>
              ) : (
                "Loading live stats…"
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: "22px 24px" }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Your profile</div>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.02em" }}>
            {blurb.title}
          </div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {blurb.bullets.map((b) => (
              <div
                key={b}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--accent2)", fontWeight: 700, fontSize: 13, marginTop: 1, flexShrink: 0 }}>
                  →
                </span>
                <span className="small" style={{ lineHeight: 1.6 }}>{b}</span>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 14, lineHeight: 1.65 }}>{blurb.paragraph}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <button
              className="btn"
              onClick={() => {
                setUnlocked(false);
                setUnlockedState(false);
              }}
              style={{ fontSize: 12 }}
            >
              Lock (dev)
            </button>
            <Link className="btn btnPrimary" href="/quiz">
              Retake quiz →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main style={{ paddingBottom: 48 }}>
      {/* ─── Result hero ─── */}
      <div className="card" style={{ padding: "28px 32px", marginBottom: 20 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>Pytheas Political</div>
        <h1 className="h1" style={{ fontSize: 36, margin: "0 0 10px" }}>
          Your political profile
        </h1>
        <p className="p" style={{ margin: 0 }}>
          Built from {QUESTIONS_V1.length} neutral statements across two axes. Use this for
          self-reflection — not as a definitive ideology label.
        </p>
      </div>

      {unlocked ? (
        fullResult
      ) : (
        <LockedOverlay
          archetype={ARCHETYPE_LABELS[archetypeKey]}
          themes={themesKeys.map((t) => THEME_LABELS[t])}
        >
          {fullResult}
        </LockedOverlay>
      )}
    </main>
  );
}
