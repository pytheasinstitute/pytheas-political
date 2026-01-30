import Link from "next/link";
import ResultClient from "./resultClient";

export default function ResultPage() {
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

      <ResultClient />

      <footer className="footer">
        <div className="small">
          <Link href="/" className="small">
            Home
          </Link>
          {" · "}
          <Link href="/quiz" className="small">
            Retake quiz
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
