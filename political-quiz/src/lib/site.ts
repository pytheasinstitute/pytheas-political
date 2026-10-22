// Central site + operator config. Everything legal-facing reads from here,
// so launching means filling in OPERATOR once (see README → Launch checklist).

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const SITE = {
  name: "Pytheas Institute",
  product: "Pytheas Political",
  url: resolveSiteUrl(),
  tagline: "A short, neutral 2-axis political profile quiz. No account, no subscription.",
};

// Operator details for the imprint (Austria: § 5 ECG, § 25 MedienG) and the
// privacy policy (GDPR Art. 13 controller). Values in [brackets] are
// placeholders and MUST be replaced before going live.
export const OPERATOR = {
  name: "[Full name or company name]",
  addressLines: ["[Street and number]", "[Postcode] [City]", "Austria"],
  email: "[contact e-mail]",
  // Optional — leave empty if not applicable.
  phone: "",
  vatId: "",
  companyRegister: "",
  tradeAuthority: "",
};

export function isPlaceholder(value: string): boolean {
  return value.trim().startsWith("[");
}

export const OPERATOR_INCOMPLETE = [
  OPERATOR.name,
  OPERATOR.email,
  ...OPERATOR.addressLines,
].some(isPlaceholder);
