import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="container">
      <header className="nav">
        <div className="brand">
          <span className="dot" />
          <span>Political Profile</span>
        </div>
        <nav style={{ display: "flex", gap: 14 }}>
          <Link href="/" className="small">
            Home
          </Link>
          <Link href="/methodology" className="small">
            Methodology
          </Link>
          <Link href="/quiz" className="small">
            Start quiz
          </Link>
        </nav>
      </header>

      <main className="card" style={{ padding: 22 }}>
        <div className="kicker">Privacy</div>
        <h1 style={{ fontSize: 28, marginTop: 10 }}>Privacy-first by default</h1>
        <p className="p">
          This project is designed to work without accounts. You don’t need to create a profile or enter
          your email to get a result.
        </p>

        <h2 style={{ fontSize: 18, marginTop: 16, marginBottom: 8 }}>What we collect</h2>
        <ul className="p" style={{ paddingLeft: 18 }}>
          <li>Anonymous quiz responses (for generating your result).</li>
          <li>Anonymous event analytics (to improve the experience). (Planned)</li>
        </ul>

        <h2 style={{ fontSize: 18, marginTop: 16, marginBottom: 8 }}>What we don’t do</h2>
        <ul className="p" style={{ paddingLeft: 18 }}>
          <li>No subscription billing.</li>
          <li>No selling of personal data.</li>
          <li>No targeted political persuasion.</li>
        </ul>

        <p className="small">
          Note: This is an early draft. If you deploy publicly, you’ll want a proper legal privacy policy
          tailored to your jurisdiction.
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
        </div>
      </footer>
    </div>
  );
}
