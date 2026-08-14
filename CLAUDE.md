# Pytheas Political — Hinweise für Claude

Zwei eigenständige Projekte in einem Repo, Standard-Branch ist `main`:

- **`political-quiz/`** — Next.js-App „Pytheas Political Profile":
  politisches Quiz mit Archetyp-Auswertung, 3D-Prisma (three.js),
  Stripe-Freischaltung (1 €) und Live-Statistiken über Upstash/Vercel KV.
- **`arcobaleno/`** — statische Website (HTML/CSS/JS) für den
  Arcobaleno Eisservice. Kein Build nötig; zum Ansehen reicht
  `npx serve arcobaleno` oder direktes Öffnen der `index.html`.

## Befehle (im Ordner `political-quiz/`)

```bash
npm install       # Abhängigkeiten
npm run dev       # Dev-Server auf http://localhost:3000
npm run lint      # ESLint
npm run build     # Produktions-Build
```

## Remote-/Cloud-Sessions

Der SessionStart-Hook (`.claude/hooks/session-start.sh`) installiert die
Abhängigkeiten automatisch. Die App **läuft komplett ohne Secrets**:

- Ohne `STRIPE_SECRET_KEY` ist die Bezahl-Freischaltung deaktiviert
  (Quiz und Ergebnis funktionieren trotzdem).
- Ohne `KV_REST_API_URL`/`KV_REST_API_TOKEN` werden keine Statistiken
  gezählt; die Ergebnisseite zeigt dann keine Live-Prozente.

Echte Schlüssel liegen ausschließlich in Vercel — niemals ins Repo
committen. Alle Variablen sind in `political-quiz/.env.example` dokumentiert.
