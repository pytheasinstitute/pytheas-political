import Link from "next/link";
import ResultClient from "./resultClient";

export default function ResultPage() {
  return (
    <div className="container">
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/" className="navLink">Home</Link>
          <Link href="/methodology" className="navLink">Methodology</Link>
          <Link href="/privacy" className="navLink">Privacy</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Retake quiz →</Link>
        </nav>
      </header>

      <ResultClient />

      <footer className="footer">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="brand" style={{ fontSize: 13 }}>
            <span className="dot" style={{ width: 8, height: 8 }} />
            Pytheas Institute
          </div>
          <div className="small">
            <Link href="/">Home</Link>
            <span className="sep">·</span>
            <Link href="/quiz">Retake quiz</Link>
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
