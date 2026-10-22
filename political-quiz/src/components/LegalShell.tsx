import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export default function LegalShell({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container">
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/methodology" className="navLink">Methodology</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Start quiz →</Link>
        </nav>
      </header>

      <main className="card legal" style={{ padding: "28px 30px", maxWidth: 760, marginBottom: 48 }}>
        <div className="kicker">{kicker}</div>
        <h1 style={{ fontSize: 28, marginTop: 10, marginBottom: 18 }}>{title}</h1>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
