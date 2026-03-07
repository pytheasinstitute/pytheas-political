import Link from "next/link";

export default function MethodologyPage() {
  return (
    <div className="container">
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/" className="navLink">Home</Link>
          <Link href="/privacy" className="navLink">Privacy</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Start quiz →</Link>
        </nav>
      </header>

      <main style={{ paddingBottom: 56 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* ─── Hero ─── */}
          <div style={{ paddingTop: 44, paddingBottom: 36 }}>
            <div className="kicker" style={{ marginBottom: 14 }}>Transparency</div>
            <h1 className="h1">What this quiz is<br />(and isn't)</h1>
            <p className="p" style={{ maxWidth: 540 }}>
              This is a short self-reflection tool. It estimates your position on two broad axes
              based on your responses — not a scientific diagnosis.
            </p>
          </div>

          <div className="grid" style={{ gap: 16 }}>
            {/* ─── Two axes ─── */}
            <div className="card" style={{ padding: "28px 30px" }}>
              <div className="kicker" style={{ marginBottom: 14 }}>Core concept</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
                The two axes
              </h2>
              <p className="p" style={{ marginBottom: 16 }}>
                We use two dimensions widely used in political science and public discourse:
              </p>

              <div className="grid" style={{ gap: 12 }}>
                <AxisBlock
                  color="#1a5bb8"
                  label="Progressive ↔ Conservative"
                  desc="Social change, tradition, cultural diversity, individual freedoms, and generational values."
                />
                <AxisBlock
                  color="#0b2a5b"
                  label="State ↔ Market"
                  desc="Role of government, regulation, redistribution, welfare provision, and economic freedom."
                />
              </div>
            </div>

            {/* ─── Scoring ─── */}
            <div className="card" style={{ padding: "28px 30px" }}>
              <div className="kicker" style={{ marginBottom: 14 }}>How it works</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
                Scoring
              </h2>
              <p className="p" style={{ marginBottom: 0 }}>
                Each question contributes points to one or both axes. Responses are symmetric — no
                trick questions. The result is a simple aggregate. A different set of questions
                could yield a slightly different position — this is normal and expected.
              </p>
            </div>

            {/* ─── Transparency ─── */}
            <div className="card" style={{ padding: "28px 30px" }}>
              <div className="kicker" style={{ marginBottom: 14 }}>Our commitments</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 20px" }}>
                Transparency & limitations
              </h2>
              <div className="grid" style={{ gap: 12 }}>
                {[
                  { icon: "💶", text: "No subscriptions. The full result is a one-time €1 payment." },
                  { icon: "🚫", text: "No hidden upsells. No dark patterns." },
                  { icon: "🔒", text: "We don't sell personal data. Answers stay on your device." },
                  { icon: "📐", text: "The model is a simplification. Real political views are richer than two numbers." },
                ].map((item) => (
                  <div
                    key={item.text}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      padding: "14px 16px",
                      borderRadius: 12,
                      background: "rgba(11, 42, 91, 0.04)",
                      border: "1px solid rgba(11, 42, 91, 0.08)",
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                    <p className="small" style={{ margin: 0, lineHeight: 1.65 }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── CTA ─── */}
            <div
              style={{
                padding: "24px 28px",
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(11,42,91,0.06), rgba(26,91,184,0.04))",
                border: "1px solid rgba(11,42,91,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>Ready to find your position?</div>
                <div className="small" style={{ marginTop: 4 }}>
                  12 questions · ~3 minutes · No account required
                </div>
              </div>
              <Link href="/quiz" className="btn btnPrimary btnLg">
                Start the quiz →
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="brand" style={{ fontSize: 13 }}>
            <span className="dot" style={{ width: 8, height: 8 }} />
            Pytheas Institute
          </div>
          <div className="small">
            <Link href="/">Home</Link>
            <span className="sep">·</span>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AxisBlock({ color, label, desc }: { color: string; label: string; desc: string }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        border: `1px solid ${color}20`,
        background: `${color}07`,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color, marginBottom: 8 }}>{label}</div>
      <p className="small" style={{ margin: 0, lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}
