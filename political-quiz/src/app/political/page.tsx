import Link from "next/link";

export default function PoliticalLandingPage() {
return (
<div className="container">
<header className="nav">
<div className="brand">
<span className="dot" />
<span>Pytheas Institute</span>
</div>
<nav style={{ display: "flex", gap: 14 }}>
<Link href="/" className="small">Institute</Link>
<Link href="/methodology" className="small">Methodology</Link>
<Link href="/privacy" className="small">Privacy</Link>
</nav>
</header>

<main>
<section className="grid grid2" style={{ alignItems: "start", marginTop: 18 }}>
<div>
<div className="kicker">Pytheas Political</div>
<h1 className="h1">Find where you stand — in 3 minutes.</h1>
<p className="p">
A short, neutral quiz that maps your views on two core axes: <b>Progressive ↔ Conservative</b> and <b>State ↔ Market</b>.
</p>

<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
<Link href="/quiz" className="btn btnPrimary">Start the quiz</Link>
<Link href="/methodology" className="btn">How it works</Link>
</div>

<div style={{ marginTop: 14 }} className="small">
• No account • No subscription • Full result unlock: <b>~€1 equivalent</b>
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
</main>

<footer className="footer">
<div className="small">
<Link href="/" className="small">Institute</Link>
{" · "}
<Link href="/methodology" className="small">Methodology</Link>
{" · "}
<Link href="/privacy" className="small">Privacy</Link>
</div>
</footer>
</div>
);
}
