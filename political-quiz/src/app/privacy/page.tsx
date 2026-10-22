import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";
import { OPERATOR } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <LegalShell kicker="Privacy" title="Privacy Policy">
      <p className="p">
        This quiz works without an account. You never have to enter your name or e-mail address to
        get a result. This policy explains which data is processed anyway, why, and what your rights
        are (Art. 13 GDPR).
      </p>

      <h2>Controller</h2>
      <p className="p">
        {OPERATOR.name}
        {OPERATOR.addressLines.map((line) => (
          <span key={line}>
            <br />
            {line}
          </span>
        ))}
        <br />
        E-mail: {OPERATOR.email}
      </p>

      <h2>Your quiz answers stay on your device</h2>
      <p className="p">
        Your answers and your result are calculated in your browser and saved in its local storage
        (<code>localStorage</code>) so you can continue later. They are not sent to our servers. We
        store these entries:
      </p>
      <ul className="p">
        <li><code>pytheas_answers_v1</code> — your answers</li>
        <li><code>pytheas_unlock_v1</code> — whether you unlocked the full result</li>
        <li><code>pytheas_stats_recorded_v1</code> — whether your archetype was already counted</li>
      </ul>
      <p className="p">
        You can delete them at any time by clearing this site&apos;s data in your browser settings.
        We do not set cookies and do not use analytics, tracking pixels or advertising.
      </p>

      <h2>Anonymous archetype statistics</h2>
      <p className="p">
        After unlocking, your browser sends only the name of your archetype (for example
        &quot;Pragmatic Centrist&quot;) to our server once, so we can show how common each archetype
        is. We store nothing but running totals per archetype — no answers, no IP address, no
        identifier. The counters are kept with our database provider Upstash, Inc. Legal basis:
        legitimate interest in showing comparison figures (Art. 6(1)(f) GDPR).
      </p>

      <h2>Payment</h2>
      <p className="p">
        If you buy the full result, payment is handled by Stripe Payments Europe, Ltd., 1 Grand
        Canal Street Lower, Dublin 2, Ireland. You enter your payment details directly on
        Stripe&apos;s checkout page; we never see your card details. We only receive the information
        whether the payment succeeded. Stripe processes your data to execute the payment and to meet
        its legal obligations (Art. 6(1)(b) and (c) GDPR); see{" "}
        <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">
          stripe.com/privacy
        </a>
        . Stripe&apos;s checkout page may set its own cookies.
      </p>

      <h2>Hosting</h2>
      <p className="p">
        This website is hosted by Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. When
        you open a page, technically necessary data (IP address, time, requested page, browser type)
        is processed in server logs to deliver the site and keep it secure (Art. 6(1)(f) GDPR).
        Transfers to the USA are based on the EU-U.S. Data Privacy Framework and/or Standard
        Contractual Clauses.
      </p>

      <h2>Fonts</h2>
      <p className="p">
        All fonts are served from this website itself. No requests are made to Google Fonts or
        other font services.
      </p>

      <h2>Your rights</h2>
      <p className="p">
        You have the right to access, rectification, erasure, restriction of processing, data
        portability and objection. Write to {OPERATOR.email}. You can also lodge a complaint with a
        supervisory authority — in Austria the Datenschutzbehörde (
        <a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).
      </p>

      <p className="small" style={{ marginTop: 24 }}>
        Last updated: October 2026 · See also our <Link href="/terms">Terms</Link> and{" "}
        <Link href="/imprint">Imprint</Link>.
      </p>
    </LegalShell>
  );
}
