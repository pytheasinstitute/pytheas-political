import Link from "next/link";

export default function InstituteHomePage() {
return (
<div className="container">
<header className="nav">
<div className="brand">
<span className="dot" />
<span>Pytheas Institute</span>
</div>
<nav style={{ display: "flex", gap: 14 }}>
<Link href="/methodology" className="small">Methodology</Link>
<Link href="/privacy" className="small">Privacy</Link>
</nav>
</header>

<main>
<section className="grid grid2" style={{ alignItems: "start", marginTop: 18 }}>
<div>
<div className="kicker">A home for clean, credible self‑reflection tools</div>
<h1 className="h1">Pytheas Institute</h1>
<p className="p">
Short, serious quizzes designed for clarity and comparability — without persuasion, propaganda, or subscriptions.
</p>

<div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
<Link href="/political" className="btn btnPrimary">Explore Pytheas Political</Link>
<Link href="/methodology" className="btn">Our methodology</Link>
</div>

<div style={{ marginTop: 14 }} className="small">
Launching with <b>Pytheas Political</b>. More quizzes coming.
</div>
</div>

<div className="card" style={{ padding: 18 }}>
<div className="kicker">Available quizzes</div>
<div className="grid" style={{ marginTop: 12 }}>
<div className="card" style={{ padding: 14 }}>
<div style={{ fontWeight: 800, fontSize: 18 }}>Pytheas Political</div>
<div className="small" style={{ marginTop: 8 }}>
Two-axis political self-reflection (Progressive–Conservative, State–Market).
</div>
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
<Link href="/political" className="btn btnPrimary">Open</Link>
<Link href="/quiz" className="btn">Start quiz</Link>
</div>
</div>
<div className="card" style={{ padding: 14, opacity: 0.8 }}>
<div style={{ fontWeight: 800, fontSize: 18 }}>More quizzes</div>
<div className="small" style={{ marginTop: 8 }}>
Coming soon. Pytheas is designed to expand beyond politics.
</div>
</div>
</div>
</div>
</section>
</main>

<footer className="footer">
<div className="small">
<Link href="/methodology" className="small">Methodology</Link>
{" · "}
<Link href="/privacy" className="small">Privacy</Link>
</div>
<div className="small" style={{ marginTop: 8 }}>
© {new Date().getFullYear()} Pytheas Institute
</div>
</footer>
</div>
);
}
