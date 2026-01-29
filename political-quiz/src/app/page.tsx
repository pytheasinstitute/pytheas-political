import Link from "next/link";

export default function HomePage() {
  return (
    <div className="container">
      <header className="nav">
        <div className="brand">
          <span className="dot" />
          <span>Pytheas Institute</span>
        </div>
        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/methodology" className="small">
            Methodology
          </Link>
          <Link href="/privacy" className="small">
            Privacy
          </Link>
        </nav>
      </header>

      <main>
        <section className="grid grid2" style={{ alignItems: "start", marginTop: 18 }}>
          <div>
            <div className="kicker">Neutral political self‑reflection</div>
            <h1 className="h1">Find where you stand — in 3 minutes.</h1>
            <p className="p">
              A short, neutral quiz that maps your views on two core axes: <b>Progressive ↔ Conservative</b>
              {" "}
              and <b>State ↔ Market</b>.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
              <Link href="/quiz" className="btn btnPrimary">
                Start the quiz
              </Link>
              <Link href="/methodology" className="btn">
                How it works
              </Link>
            </div>

            <div style={{ marginTop: 14 }} className="small">
              • Anonymous • No subscription • Full result unlock: <b>€1 one‑time</b>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="kicker">What you get</div>
            <div className="grid" style={{ marginTop: 12 }}>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 700 }}>Your position on a 2‑axis map</div>
                <div className="small">A clear visual model that goes beyond left/right.</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 700 }}>Percentages on both axes</div>
                <div className="small">Readable, comparable, shareable.</div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 700 }}>A short professional profile</div>
                <div className="small">A neutral description of your political thinking style.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid3" style={{ marginTop: 18 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 750 }}>Transparent pricing</div>
            <p className="small" style={{ marginTop: 8 }}>
              You can take the quiz for free. To view the full profile, unlock once for <b>€1</b>. No
              subscription.
            </p>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 750 }}>No persuasion</div>
            <p className="small" style={{ marginTop: 8 }}>
              This isn’t party propaganda. The goal is self‑reflection and comparability.
            </p>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 750 }}>Privacy‑first</div>
            <p className="small" style={{ marginTop: 8 }}>
              No accounts. No email required. No data selling.
            </p>
          </div>
        </section>

        <section className="card" style={{ padding: 18, marginTop: 18 }}>
          <div className="kicker">FAQ</div>
          <div style={{ marginTop: 10 }} className="grid">
            <div>
              <div style={{ fontWeight: 750 }}>Is this scientific?</div>
              <div className="small">
                It’s a structured self‑reflection tool. We explain the model and its limitations on the
                methodology page.
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 750 }}>Do you store my personal data?</div>
              <div className="small">
                The quiz is designed to work without accounts. Please see the privacy page for details.
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 750 }}>Why €1?</div>
              <div className="small">
                The one‑time unlock keeps it simple: no subscriptions, and it helps keep the platform
                running.
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="small">
          <Link href="/methodology" className="small">
            Methodology
          </Link>
          {" · "}
          <Link href="/privacy" className="small">
            Privacy
          </Link>
        </div>
        <div className="small" style={{ marginTop: 8 }}>
          © {new Date().getFullYear()} Pytheas Institute (draft)
        </div>
      </footer>
    </div>
  );
}
