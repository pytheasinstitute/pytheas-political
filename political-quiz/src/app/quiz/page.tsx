import Link from "next/link";

export default function QuizPage() {
  return (
    <div className="container">
      <header className="nav">
        <div className="brand">
          <span className="dot" />
          <span>Political Profile</span>
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

      <main className="card" style={{ padding: 22 }}>
        <div className="kicker">Quiz</div>
        <h1 style={{ fontSize: 28, marginTop: 10 }}>Coming next</h1>
        <p className="p">
          Next step: 12 questions, 2 axes, and a transparent €1 one‑time unlock for the full result.
        </p>
        <p className="small">
          For now this is a placeholder route so we can design the landing + trust pages first.
        </p>
      </main>

      <footer className="footer">
        <div className="small">
          <Link href="/" className="small">
            Home
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
