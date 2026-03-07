import Link from "next/link";

export default function PoliticalLandingPage() {
  return (
    <div className="container">
      {/* ─── Nav ─── */}
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/" className="navLink">Institute</Link>
          <Link href="/methodology" className="navLink">Methodology</Link>
          <Link href="/privacy" className="navLink">Privacy</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Start quiz →</Link>
        </nav>
      </header>

      <main>
        {/* ─── Hero ─── */}
        <section style={{ paddingTop: 44, paddingBottom: 60 }}>
          <div className="grid grid2" style={{ alignItems: "center", gap: 52 }}>
            <div>
              <div className="kicker" style={{ marginBottom: 14 }}>Pytheas Political</div>
              <h1 className="h1">
                Find where you stand —{" "}
                <span className="gradientText">in 3 minutes.</span>
              </h1>
              <p className="p" style={{ maxWidth: 480, marginBottom: 0 }}>
                A short, neutral quiz that maps your views on two core axes:{" "}
                <strong>Progressive ↔ Conservative</strong> and{" "}
                <strong>State ↔ Market</strong>.
              </p>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
                <Link href="/quiz" className="btn btnPrimary btnLg">
                  Start the quiz →
                </Link>
                <Link href="/methodology" className="btn btnLg">
                  How it works
                </Link>
              </div>

              <div style={{ marginTop: 20, display: "flex", gap: 14, flexWrap: "wrap" }}>
                {[
                  "No account",
                  "No subscription",
                  "Full result ~€1",
                ].map((t) => (
                  <span key={t} className="chip">✓ {t}</span>
                ))}
              </div>
            </div>

            {/* ─── Mini 2-axis preview ─── */}
            <div className="card" style={{ padding: 24 }}>
              <div className="kicker" style={{ marginBottom: 16 }}>What you get</div>
              <div className="grid" style={{ gap: 12 }}>
                {[
                  {
                    icon: "📍",
                    title: "Position on a 2-axis map",
                    desc: "A clear visual model that goes beyond left/right.",
                  },
                  {
                    icon: "📊",
                    title: "Percentages on both axes",
                    desc: "Readable, comparable, and shareable.",
                  },
                  {
                    icon: "🧠",
                    title: "Your political archetype",
                    desc: "One of 6 profiles with a neutral description of your thinking style.",
                  },
                  {
                    icon: "🔖",
                    title: "Theme tags",
                    desc: "Secondary themes that characterize your answer patterns.",
                  },
                ].map((item) => (
                  <FeatureRow key={item.title} icon={item.icon} title={item.title} desc={item.desc} />
                ))}
              </div>

              <hr className="divider" style={{ margin: "18px 0" }} />

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/quiz" className="btn btnPrimary" style={{ flex: 1, justifyContent: "center" }}>
                  Start now →
                </Link>
                <div className="small" style={{ flex: 1, minWidth: 120 }}>
                  12 questions · ~3 minutes · Anonymous
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Axes explainer ─── */}
        <section style={{ paddingBottom: 56 }}>
          <div className="card" style={{ padding: "32px 36px" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>The two axes</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 24 }}>
              Beyond left and right
            </h2>
            <div className="grid grid2equal" style={{ gap: 20 }}>
              <AxisCard
                color="#1a5bb8"
                label="Social axis"
                left="Conservative"
                right="Progressive"
                desc="Covers attitudes toward social change, tradition, cultural diversity, individual freedoms, and generational values."
              />
              <AxisCard
                color="#0b2a5b"
                label="Economic axis"
                left="Market"
                right="State"
                desc="Covers the role of government, regulation, redistribution, welfare, and economic freedom."
              />
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
            <Link href="/">Institute</Link>
            <span className="sep">·</span>
            <Link href="/methodology">Methodology</Link>
            <span className="sep">·</span>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: "rgba(11, 42, 91, 0.07)",
          border: "1px solid rgba(11, 42, 91, 0.09)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div className="small" style={{ marginTop: 2 }}>{desc}</div>
      </div>
    </div>
  );
}

function AxisCard({
  color,
  label,
  left,
  right,
  desc,
}: {
  color: string;
  label: string;
  left: string;
  right: string;
  desc: string;
}) {
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRadius: 14,
        border: `1px solid ${color}22`,
        background: `${color}08`,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, color, marginBottom: 10 }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <span className="chip" style={{ fontSize: 11 }}>{left}</span>
        <div
          style={{
            flex: 1,
            height: 3,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
          }}
        />
        <span className="chip" style={{ fontSize: 11 }}>{right}</span>
      </div>
      <p className="small" style={{ margin: 0, lineHeight: 1.65 }}>{desc}</p>
    </div>
  );
}
