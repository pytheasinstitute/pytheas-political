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
<span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(10,27,58,0.14)", background: "rgba(255,255,255,0.60)", fontSize: 12, color: "rgba(10,27,58,0.82)", fontWeight: 650 }}>
{text}
</span>
);
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
<div style={{ marginTop: 10, height: 10, borderRadius: 999, background: "rgba(10,27,58,0.10)", overflow: "hidden" }}>
<div style={{ width: `${pct}%`, height: 10, background: "linear-gradient(135deg, var(--accent), var(--accent2))" }} />
</div>
</div>
);
}

function MapDot({ xPct, yPct }: { xPct: number; yPct: number }) {
return (
<div className="card" style={{ padding: 14, position: "relative", overflow: "hidden" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
<div style={{ fontWeight: 750 }}>Political map</div>
<div className="small">2 axes</div>
</div>

<div style={{ marginTop: 12, aspectRatio: "1 / 1", width: "100%", background: "linear-gradient(to right, rgba(10,27,58,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,27,58,0.06) 1px, transparent 1px)", backgroundSize: "40px 40px", borderRadius: 12, border: "1px solid rgba(10,27,58,0.12)", position: "relative" }}>
<div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(10,27,58,0.16)" }} />
<div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(10,27,58,0.16)" }} />
<div style={{ position: "absolute", left: `calc(${xPct}% - 8px)`, top: `calc(${100 - yPct}% - 8px)`, width: 16, height: 16, borderRadius: 999, background: "linear-gradient(135deg, var(--accent), var(--accent2))", boxShadow: "0 8px 18px rgba(10,27,58,0.18)" }} />
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

function LockedOverlay({ children, archetype, themes }: { children: React.ReactNode; archetype: string; themes: string[] }) {
return (
<div style={{ position: "relative" }}>
<div style={{ filter: "blur(7px)", opacity: 0.55, pointerEvents: "none", userSelect: "none" }}>{children}</div>
<div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
<div className="card" style={{ padding: 16, maxWidth: 560, width: "100%" }}>
<div className="kicker">Profile ready</div>
<div style={{ fontWeight: 850, fontSize: 20, marginTop: 8 }}>Unlock your full result</div>
<div className="small" style={{ marginTop: 10 }}>Your archetype (preview):</div>
<div style={{ fontWeight: 850, fontSize: 18, marginTop: 6 }}>{archetype}</div>
{themes.length > 0 && (
<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
{themes.map((t) => <Chip key={t} text={t} />)}
</div>
)}
<div className="small" style={{ marginTop: 12 }}>One-time unlock (~€1 equivalent). No subscription.</div>
<div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
<button
className="btn btnPrimary"
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
Unlock for €1
</button>

<Link className="btn" href="/quiz">Adjust answers</Link>
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
progressive_reformer: 0, progressive_individualist: 1, liberty_first: 2,
conservative_protector: 3, conservative_entrepreneur: 4, order_first: 5,
};
base[idxMap[archetypeKey] ?? 0] = 0.55;
const prog = score.pcPct / 100;
const state = score.smPct / 100;
base[0] += prog * 0.10; base[1] += prog * 0.10;
base[3] += (1 - prog) * 0.10; base[4] += (1 - prog) * 0.10;
base[0] += state * 0.10; base[3] += state * 0.10;
base[1] += (1 - state) * 0.10; base[4] += (1 - state) * 0.10;
return base as any;
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
await fetch("/api/stats/record", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ archetype: archetypeKey }) });
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
<main className="card" style={{ padding: 18 }}>
<div className="kicker">Pytheas Political</div>
<h1 className="h1" style={{ marginTop: 10 }}>Your result isn’t ready yet</h1>
<p className="p">You’ve answered {answeredCount} of {QUESTIONS_V1.length} questions.</p>
<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
<Link className="btn btnPrimary" href="/quiz">Continue quiz</Link>
<Link className="btn" href="/">Back to home</Link>
</div>
</main>
);
}

const fullResult = (
<div className="grid grid2" style={{ alignItems: "start" }}>
<div className="grid">
<Prism3D locked={!unlocked} corners={prismCorners} weights={prismWeights} />
<MapDot xPct={score.smPct} yPct={score.pcPct} />
<AxisBar label={`Social axis (${socialStrength})`} left="Conservative" right="Progressive" pct={score.pcPct} />
<AxisBar label={`Economic axis (${econStrength})`} left="Market" right="State" pct={score.smPct} />
</div>

<div className="grid">
<div className="card" style={{ padding: 18 }}>
<div className="kicker">Your archetype</div>
<div style={{ fontWeight: 900, fontSize: 22, marginTop: 8 }}>{ARCHETYPE_LABELS[archetypeKey]}</div>
<p className="small" style={{ marginTop: 10 }}>{ARCHETYPE_DESCRIPTIONS[archetypeKey]}</p>

{themesKeys.length > 0 && (
<div style={{ marginTop: 12 }}>
<div className="kicker">Themes</div>
<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
{themesKeys.map((t) => <Chip key={t} text={THEME_LABELS[t]} />)}
</div>
</div>
)}
</div>

{unlocked && (
<div className="card" style={{ padding: 18 }}>
<div className="kicker">Live</div>
<div style={{ fontWeight: 850, fontSize: 20, marginTop: 8 }}>How many people match you</div>
<div className="small" style={{ marginTop: 8 }}>
{livePct && liveN !== null ? (<><b>{livePct}</b> of users match your archetype (n={liveN.toLocaleString()}).</>) : (<>Loading live stats…</>)}
</div>
</div>
)}

<div className="card" style={{ padding: 18 }}>
<div className="kicker">Your profile</div>
<div style={{ fontWeight: 850, fontSize: 22, marginTop: 8 }}>{blurb.title}</div>
<div className="grid" style={{ marginTop: 12 }}>
{blurb.bullets.map((b) => <div key={b} className="small">• {b}</div>)}
</div>
<p className="small" style={{ marginTop: 12 }}>{blurb.paragraph}</p>
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
<button className="btn" onClick={() => { setUnlocked(false); setUnlockedState(false); }}>Lock (dev)</button>
<Link className="btn" href="/quiz">Retake</Link>
</div>
</div>
</div>
</div>
);

return (
<main className="grid" style={{ gap: 16 }}>
<section className="card" style={{ padding: 18 }}>
<div className="kicker">Pytheas Political</div>
<h1 className="h1" style={{ fontSize: 36, marginTop: 10 }}>Your political profile</h1>
<p className="p" style={{ marginTop: 8 }}>Built from 12 neutral statements across two axes. Use it for self-reflection — not as a full ideology label.</p>
</section>

{unlocked ? fullResult : (
<LockedOverlay archetype={ARCHETYPE_LABELS[archetypeKey]} themes={themesKeys.map((t) => THEME_LABELS[t])}>
{fullResult}
</LockedOverlay>
)}
</main>
);
}
