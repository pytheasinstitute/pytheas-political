import type { Metadata } from "next";
import Link from "next/link";
import LegalShell from "@/components/LegalShell";
import { OPERATOR } from "@/lib/site";
import { UNLOCK_PRICE_EUR } from "@/lib/quiz";

export const metadata: Metadata = {
  title: "Terms",
};

export default function TermsPage() {
  return (
    <LegalShell kicker="Legal" title="Terms of Use and Sale">
      <h2>1. Provider</h2>
      <p className="p">
        This website is operated by {OPERATOR.name} (see <Link href="/imprint">Imprint</Link>).
        Contact: {OPERATOR.email}.
      </p>

      <h2>2. What you get</h2>
      <p className="p">
        Taking the quiz and seeing your position on the two axes is free. Optionally, you can buy a
        one-time unlock of the full result (archetype description, 3D profile, political map, theme
        tags and live comparison) for €{UNLOCK_PRICE_EUR}. The price shown is the final price. There is
        no subscription and no automatic renewal.
      </p>

      <h2>3. Contract and payment</h2>
      <p className="p">
        The contract is concluded when you complete payment on the Stripe checkout page. Payment is
        processed by Stripe; the accepted payment methods are shown there.
      </p>

      <h2>4. Delivery</h2>
      <p className="p">
        The full result is unlocked immediately after payment in the browser you paid with. The
        unlock is stored locally on that device. If you clear your browser data or switch devices,
        write to us with your payment receipt and we will help you.
      </p>

      <h2>5. Right of withdrawal</h2>
      <p className="p">
        As a consumer in the EU you generally have a 14-day right of withdrawal for contracts
        concluded online. For digital content that is not supplied on a tangible medium, this right
        expires once delivery has begun, provided you expressly agreed to immediate delivery and
        acknowledged that you thereby lose your right of withdrawal (§ 18(1)(11) FAGG; Art. 16(m)
        Directive 2011/83/EU). You give this consent with the checkbox before payment. If delivery
        fails for technical reasons, contact us and we will deliver or refund.
      </p>

      <h2>6. Nature of the result</h2>
      <p className="p">
        The quiz is a self-reflection tool. It is not a scientific, psychological or professional
        assessment and not a voting recommendation. See <Link href="/methodology">Methodology</Link>.
      </p>

      <h2>7. Liability</h2>
      <p className="p">
        We are liable without limitation for intent and gross negligence and for personal injury.
        Otherwise, liability for slight negligence is excluded to the extent permitted by law.
        Statutory warranty rights remain unaffected.
      </p>

      <h2>8. Applicable law</h2>
      <p className="p">
        Austrian law applies, excluding its conflict-of-law rules and the UN Convention on Contracts
        for the International Sale of Goods. If you are a consumer, the mandatory consumer protection
        provisions of your country of residence remain unaffected.
      </p>

      <p className="small" style={{ marginTop: 24 }}>Last updated: October 2026</p>
    </LegalShell>
  );
}
