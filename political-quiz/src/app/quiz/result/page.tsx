"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function getUnlock(): boolean {
  try {
    return localStorage.getItem(LOCALSTORAGE_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export default function ResultPage() {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = useMemo(() => scoreQuiz(answers, QUESTIONS_V1), [answers]);
  const prof = useMemo(() => profileBlurb(score), [score]);

  useEffect(() => {
    setAnswers(getStoredAnswers());
    setUnlocked(getUnlock());
  }, []);

  useEffect(() => {
    // If coming back from Stripe with session_id, verify server-side.
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const unlock = params.get("unlock");
    if (!sessionId || unlock !== "1") return;

    let cancelled = false;
    (async () => {
      try {
        setVerifying(true);
        setError(null);
        const res = await fetch("/api/verify-checkout-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || "Verification failed");
        if (data.paid) {
          localStorage.setItem(LOCALSTORAGE_UNLOCK_KEY, "1");
          if (!cancelled) setUnlocked(true);
        } else {
          throw new Error("Payment not completed");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not verify payment");
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalAnswered = Object.keys(answers || {}).length;
  const complete = totalAnswered >= QUESTIONS_V1.length;

  async function startCheckout() {
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Checkout failed");
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Could not start checkout");
    }
  }

  return (
    <div className="container">
      <header className="nav">
        <div className="brand">
          <span className="dot" />
          <span>Pytheas Institute</span>
        </div>
        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/" className="small">
            Home
          </Link>
          <Link href="/methodology" className="small">
            Methodology
          </Link>
          <Link href="/privacy" className="small">
            Privacy
          </Link>
        </nav>
      </header>

      <main className="card" style={{ padding: 22 }}>
        <div className="kicker">Result</div>
        <h1 style={{ fontSize: 28, marginTop: 10 }}>Your political profile</h1>

        {!complete && (
          <p className="small" style={{ marginTop: 10 }}>
            Note: You have answered {totalAnswered}/{QUESTIONS_V1.length} questions. Your result may be
            incomplete.
          </p>
        )}

        <div style={{ marginTop: 16 }} className="card">
          <div style={{ padding: 16 }}>
            <div style={{ fontWeight: 750, fontSize: 18 }}>{prof.title}</div>
            <div className="small" style={{ marginTop: 8 }}>
              {prof.bullets.map((b) => (
                <div key={b}>• {b}</div>
              ))}
            </div>

            <div style={{ marginTop: 14 }} className="small">
              <b>Preview:</b> {prof.paragraph}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }} className="grid" >
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 750 }}>Full profile (unlocks for €1)</div>
            <div className="small" style={{ marginTop: 8 }}>
              Deeper interpretation, strengths & blind spots, and a short professional summary.
            </div>

            {!unlocked ? (
              <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button className="btn btnPrimary" onClick={startCheckout} disabled={verifying}>
                  {verifying ? "Verifying…" : "Unlock full result (€1)"}
                </button>
                <Link href="/quiz" className="btn">
                  Retake quiz
                </Link>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div className="small">✅ Unlocked on this device.</div>
                <div style={{ marginTop: 10 }} className="p">
                  <b>Full profile:</b> You tend to balance {score.pcPct}% Progressive instincts with {100 - score.pcPct}%
                  Conservative instincts, and you prefer {score.smPct}% State involvement versus {100 - score.smPct}%
                  Market reliance. In practice, this often shows up as a preference for {score.pcPct >= 50 ? "reform" : "stability"} and {score.smPct >= 50 ? "regulated systems" : "voluntary exchange"}.
                </div>
              </div>
            )}

            {error && (
              <div className="small" style={{ marginTop: 12, color: "#ffb4b4" }}>
                {error}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 750 }}>Share</div>
            <div className="small" style={{ marginTop: 8 }}>
              (v1) Sharing graphics will be added later.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }} className="small">
          Payments: one-time unlock via Stripe. Unlock is stored on this device.
        </div>
      </main>

      <footer className="footer">
        <div className="small">
          <Link href="/quiz" className="small">
            Quiz
          </Link>
          {" · "}
          <Link href="/methodology" className="small">
            Methodology
          </Link>
          {" · "}
          <Link href="/privacy" className="small">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
