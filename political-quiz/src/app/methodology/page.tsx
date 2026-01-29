import Link from "next/link";

export default function MethodologyPage() {
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
          <Link href="/privacy" className="small">
            Privacy
          </Link>
          <Link href="/quiz" className="small">
            Start quiz
          </Link>
        </nav>
      </header>

      <main className="card" style={{ padding: 22 }}>
        <div className="kicker">Methodology</div>
        <h1 style={{ fontSize: 28, marginTop: 10 }}>What this quiz is (and isn’t)</h1>
        <p className="p">
          This is a short self‑reflection tool. It estimates your position on two broad axes based on
          your responses. It is not a scientific diagnosis, and it does not tell you which party to vote
          for.
        </p>

        <hr style={{ borderColor: "rgba(255,255,255,0.10)", margin: "18px 0" }} />

        <h2 style={{ fontSize: 18, marginBottom: 8 }}>The two axes</h2>
        <p className="p">
          We use two high‑level dimensions often used in political science and public discourse:
        </p>
        <ul className="p" style={{ paddingLeft: 18 }}>
          <li>
            <b>Progressive ↔ Conservative</b> (social change, tradition, cultural preferences)
          </li>
          <li>
            <b>State ↔ Market</b> (role of government, regulation, redistribution, economic freedom)
          </li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 16, marginBottom: 8 }}>How scoring works</h2>
        <p className="p">
          Each question contributes points to one or both axes. Responses are symmetric (no “trick”
          questions), and the result is a simple aggregate. A different set of questions could yield a
          slightly different position—this is normal.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 16, marginBottom: 8 }}>Transparency & limitations</h2>
        <ul className="p" style={{ paddingLeft: 18 }}>
          <li>No subscriptions. The full result is unlocked with a one‑time €1 payment.</li>
          <li>No hidden upsells.</li>
          <li>We don’t sell personal data.</li>
          <li>
            The model is a simplification. Real political views are richer than two numbers.
          </li>
        </ul>
      </main>

      <footer className="footer">
        <div className="small">
          <Link href="/" className="small">
            Home
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
