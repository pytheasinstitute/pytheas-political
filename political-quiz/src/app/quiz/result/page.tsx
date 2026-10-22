import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
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

      <SiteFooter />
    </div>
  );
}
