# Pytheas Political — 2-axis political profile quiz

12 neutral statements → position on two axes (Progressive ↔ Conservative, State ↔ Market) →
archetype. The axes are free; the full result (archetype description, 3D prism, map, live
comparison) unlocks for a one-time €1 via Stripe Checkout. No accounts — answers stay in the
browser's `localStorage`.

**Status: feature-complete (v1). Ready to deploy.** New features only after real users and real
numbers — see "After launch" below.

## Stack

Next.js 16 (App Router) · React 19 · Stripe Checkout · Upstash Redis (optional stats) ·
react-three-fiber for the result prism · Inter self-hosted via `@fontsource-variable/inter`.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional — the quiz works without any keys
npm run dev                  # http://localhost:3000
npm run build && npm run lint
```

Without `STRIPE_SECRET_KEY` the unlock button shows "Payment is temporarily unavailable".
Without the KV variables the live comparison card is hidden.

## Launch checklist (only you can do these)

1. **Imprint data** — fill in `OPERATOR` in `src/lib/site.ts` (name, address, e-mail; VAT ID /
   company register only if you have them). Until then `/imprint` shows a red warning.
2. **Stripe** — create/verify the account, copy the live secret key (`sk_live_…`).
   No products or webhooks needed: the €1 price is created on the fly per checkout.
3. **Vercel** — import this repo, set **Root Directory = `political-quiz`**, add the env vars from
   `.env.example`, deploy.
4. **Upstash Redis** (optional) — Vercel → Storage → Upstash for Redis → connect to the project.
   This injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
5. **Domain** — connect it in Vercel. Set `NEXT_PUBLIC_SITE_URL` if you use more than one domain.
6. **Smoke test on production** — take the quiz, pay €1 with a real card, check the unlock, then
   refund yourself in the Stripe dashboard. Paste a `/r/<archetype>` link into WhatsApp to see
   the preview card.

## How it is built for sharing

- Every result has a **Share** button (native share sheet on phones, copy-link on desktop).
- Shared links point to `/r/<archetype>` — a landing page with the friend's archetype, its own
  social preview image (`/r/<archetype>/opengraph-image`) and a "Take the quiz" call to action.
- The home page has its own preview image (`src/app/opengraph-image.tsx`), plus `sitemap.xml`
  and `robots.txt`.

## Legal pages

`/imprint`, `/privacy`, `/terms` read operator data from `src/lib/site.ts`. The checkout requires
an explicit checkbox (immediate delivery + loss of withdrawal right for digital content, § 18
FAGG); the server rejects checkouts without it and stores the consent timestamp in Stripe
metadata. Have the texts reviewed if you expand beyond the €1 unlock.

## After launch (not before)

Ideas, intentionally parked: more quizzes on the institute hub, German translation, a
webhook-based unlock that survives device changes, A/B test of the price. Decide based on
traffic and conversion data.
