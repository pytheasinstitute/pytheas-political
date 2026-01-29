import Link from "next/link";
import QuizClient from "./QuizClient";

export default function QuizPage() {
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

      <QuizClient />

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
