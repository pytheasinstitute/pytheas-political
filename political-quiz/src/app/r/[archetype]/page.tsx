import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteFooter from "@/components/SiteFooter";
import { ARCHETYPE_DESCRIPTIONS, ARCHETYPE_LABELS, type ArchetypeKey } from "@/lib/stats";

// Landing page behind every shared result link: shows the sharer's archetype
// and turns the visitor into the next quiz taker.

type Props = { params: Promise<{ archetype: string }> };

function toKey(archetype: string): ArchetypeKey | null {
  return archetype in ARCHETYPE_LABELS ? (archetype as ArchetypeKey) : null;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(ARCHETYPE_LABELS).map((archetype) => ({ archetype }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = toKey((await params).archetype);
  if (!key) return {};
  const title = `I'm a ${ARCHETYPE_LABELS[key]} — where do you stand?`;
  return {
    title,
    description: ARCHETYPE_DESCRIPTIONS[key],
    openGraph: { title, description: ARCHETYPE_DESCRIPTIONS[key] },
    twitter: { card: "summary_large_image", title, description: ARCHETYPE_DESCRIPTIONS[key] },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const key = toKey((await params).archetype);
  if (!key) notFound();

  return (
    <div className="container">
      <header className="nav">
        <Link href="/" className="brand">
          <span className="dot" />
          Pytheas Institute
        </Link>
        <nav className="navLinks">
          <Link href="/political" className="navLink">About</Link>
          <Link href="/quiz" className="navLink navLinkPrimary">Start quiz →</Link>
        </nav>
      </header>

      <main style={{ paddingTop: 32, paddingBottom: 56 }}>
        <div className="card card-elevated" style={{ padding: "34px 36px", maxWidth: 640, margin: "0 auto" }}>
          <div className="kicker" style={{ marginBottom: 12 }}>A friend shared their result</div>
          <h1 className="h1" style={{ fontSize: 40, margin: "0 0 12px" }}>
            {ARCHETYPE_LABELS[key]}
          </h1>
          <p className="p" style={{ marginTop: 0 }}>{ARCHETYPE_DESCRIPTIONS[key]}</p>

          <div
            style={{
              marginTop: 22,
              padding: "16px 18px",
              borderRadius: 12,
              background: "linear-gradient(135deg, rgba(11,42,91,0.06), rgba(26,91,184,0.04))",
              border: "1px solid rgba(11,42,91,0.10)",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>Where do you stand?</div>
            <p className="small" style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
              12 neutral statements, about 3 minutes. No account, answers stay on your device.
            </p>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <Link href="/quiz" className="btn btnPrimary btnLg">
              Take the quiz →
            </Link>
            <Link href="/methodology" className="btn btnLg">
              How it works
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
