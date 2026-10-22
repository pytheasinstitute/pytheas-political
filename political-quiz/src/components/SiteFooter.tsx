import Link from "next/link";
import { SITE } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="brand" style={{ fontSize: 13 }}>
          <span className="dot" style={{ width: 8, height: 8 }} />
          {SITE.name}
        </div>
        <div className="small">
          <Link href="/methodology">Methodology</Link>
          <span className="sep">·</span>
          <Link href="/privacy">Privacy</Link>
          <span className="sep">·</span>
          <Link href="/terms">Terms</Link>
          <span className="sep">·</span>
          <Link href="/imprint">Imprint</Link>
        </div>
        <div className="small">© {new Date().getFullYear()} {SITE.name}</div>
      </div>
    </footer>
  );
}
