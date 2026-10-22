import type { Metadata } from "next";
import LegalShell from "@/components/LegalShell";
import { OPERATOR, OPERATOR_INCOMPLETE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Imprint",
};

export default function ImprintPage() {
  return (
    <LegalShell kicker="Legal" title="Imprint">
      {OPERATOR_INCOMPLETE && (
        <div className="legalNotice" role="note">
          Operator details are not filled in yet. Edit <code>OPERATOR</code> in{" "}
          <code>src/lib/site.ts</code> before going live.
        </div>
      )}

      <h2>Media owner and service provider</h2>
      <p className="p">
        {OPERATOR.name}
        {OPERATOR.addressLines.map((line) => (
          <span key={line}>
            <br />
            {line}
          </span>
        ))}
      </p>

      <h2>Contact</h2>
      <p className="p">
        E-mail: {OPERATOR.email}
        {OPERATOR.phone && (
          <>
            <br />
            Phone: {OPERATOR.phone}
          </>
        )}
      </p>

      {(OPERATOR.vatId || OPERATOR.companyRegister || OPERATOR.tradeAuthority) && (
        <>
          <h2>Company details</h2>
          <p className="p">
            {OPERATOR.vatId && <>VAT ID: {OPERATOR.vatId}<br /></>}
            {OPERATOR.companyRegister && <>Company register: {OPERATOR.companyRegister}<br /></>}
            {OPERATOR.tradeAuthority && <>Supervisory / trade authority: {OPERATOR.tradeAuthority}</>}
          </p>
        </>
      )}

      <h2>Basic direction of this website</h2>
      <p className="p">
        Provision of short, neutral self-reflection quizzes and related information. This site does
        not promote any political party, candidate or campaign.
      </p>

      <p className="small" style={{ marginTop: 24 }}>
        Information pursuant to § 5 E-Commerce Act (ECG) and § 25 Media Act (MedienG), Austria.
      </p>
    </LegalShell>
  );
}
