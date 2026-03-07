import Link from "next/link";

export default function InstituteHomePage() {
  return (
    <div className="container">
      {/* ─── Nav ─── */}
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/methodology" className="navLink">Methodology</Link>
          <Link href="/privacy" className="navLink">Privacy</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Start quiz →</Link>
        </nav>
      </header>

      <main>
        {/* ─── Hero ─── */}
        <section style={{ paddingTop: 48, paddingBottom: 56 }}>
          <div className="heroBadge">
            <span className="pulse" />
            Self-reflection tools — not persuasion
          </div>

          <div className="grid grid2" style={{ alignItems: "center", gap: 48 }}>
            <div>
              <h1 className="h1">
                Clean, credible{" "}
                <span className="gradientText">self‑reflection</span>{" "}
                tools.
              </h1>
              <p className="p" style={{ maxWidth: 480 }}>
                Short, serious quizzes designed for clarity and comparability —
                without persuasion, propaganda, or subscriptions.
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
                <Link href="/political" className="btn btnPrimary btnLg">
                  Explore Pytheas Political
                </Link>
                <Link href="/methodology" className="btn btnLg">
                  Our methodology
                </Link>
              </div>

              <div style={{ marginTop: 20, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {["No account", "No subscription", "~€1 one-time unlock"].map((t) => (
                  <span key={t} className="chip">✓ {t}</span>
                ))}
              </div>
            </div>

            {/* ─── Stats sidebar ─── */}
            <div className="grid" style={{ gap: 14 }}>
              <div className="card" style={{ padding: "20px 22px" }}>
                <div className="kicker">Available now</div>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                  <QuizCard
                    name="Pytheas Political"
                    desc="Two-axis political self-reflection: Progressive ↔ Conservative, State ↔ Market."
                    href="/political"
                    quizHref="/quiz"
                    available
                  />
                  <QuizCard
                    name="More quizzes"
                    desc="Coming soon. Pytheas is designed to expand beyond politics."
                    href="#"
                    quizHref="#"
                    available={false}
                  />
                </div>
              </div>

              <div className="grid grid2equal" style={{ gap: 12 }}>
                <StatCard num="12" label="Questions" />
                <StatCard num="3 min" label="To complete" />
                <StatCard num="6" label="Archetypes" />
                <StatCard num="2" label="Political axes" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── How it works ─── */}
        <section style={{ paddingBottom: 56 }}>
          <div className="card" style={{ padding: "32px 36px" }}>
            <div className="kicker">How it works</div>
            <h2 className="h2" style={{ marginTop: 10, marginBottom: 32, fontSize: 26 }}>
              Three simple steps
            </h2>
            <div className="grid grid3" style={{ gap: 24 }}>
              {[
                {
                  icon: "📋",
                  step: "01",
                  title: "Answer 12 statements",
                  desc: "Rate each on a 5-point scale. No trick questions — every response is symmetric.",
                },
                {
                  icon: "📍",
                  step: "02",
                  title: "See your position",
                  desc: "Instantly get your coordinates on two core political axes.",
                },
                {
                  icon: "🔓",
                  step: "03",
                  title: "Unlock full profile",
                  desc: "One-time payment (~€1). Get your archetype, themes, and a detailed profile.",
                },
              ].map((item) => (
                <div key={item.step} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="iconCircle">{item.icon}</div>
                    <div className="kicker" style={{ fontSize: 10 }}>Step {item.step}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{item.title}</div>
                  <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="brand" style={{ fontSize: 13 }}>
            <span className="dot" style={{ width: 8, height: 8 }} />
            Pytheas Institute
          </div>
          <div className="small">
            <Link href="/methodology">Methodology</Link>
            <span className="sep">·</span>
            <Link href="/privacy">Privacy</Link>
          </div>
          <div className="small">© {new Date().getFullYear()} Pytheas Institute</div>
        </div>
      </footer>
    </div>
  );
}

function QuizCard({
  name,
  desc,
  href,
  quizHref,
  available,
}: {
  name: string;
  desc: string;
  href: string;
  quizHref: string;
  available: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "16px 18px",
        opacity: available ? 1 : 0.7,
        transition: "opacity 200ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{name}</div>
        {available ? (
          <span className="chip" style={{ background: "rgba(34, 197, 94, 0.10)", borderColor: "rgba(34, 197, 94, 0.20)", color: "#15803d" }}>
            Live
          </span>
        ) : (
          <span className="chip">Soon</span>
        )}
      </div>
      <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>{desc}</p>
      {available && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <Link href={href} className="btn" style={{ fontSize: 13, padding: "8px 14px" }}>Learn more</Link>
          <Link href={quizHref} className="btn btnPrimary" style={{ fontSize: 13, padding: "8px 14px" }}>Start →</Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ num, label }: { num: string; label: string }) {
  return (
    <div className="card" style={{ padding: "18px 20px", textAlign: "center" }}>
      <div className="statNum">{num}</div>
      <div className="small" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
