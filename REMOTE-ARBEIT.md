# Remote arbeiten — von Handy, Tablet oder jedem Browser

Dieses Projekt ist für **Claude Code Cloud-Sessions** eingerichtet. Das
heißt: Du kannst von überall daran arbeiten — dein Mac muss **nicht**
laufen. Die Session läuft in einem Container in der Cloud, direkt auf dem
GitHub-Stand des Projekts.

## So startest du

1. **Claude-App (iPhone/iPad)** öffnen oder im Browser **claude.ai/code**
   aufrufen.
2. Neue Session starten und als Repository
   **pytheasinstitute/pytheas-political** auswählen.
3. Auftrag einfach auf Deutsch schreiben, z. B.
   *„Ändere die Farben auf der Quiz-Ergebnisseite"* oder
   *„Zeig mir die Arcobaleno-Seite als Screenshot."*

Beim Start installiert die Session automatisch alle Abhängigkeiten — das
übernimmt der Hook in `.claude/hooks/session-start.sh`. Du musst nichts
vorbereiten.

## Was in der Cloud-Session möglich ist

- Quiz-App bauen, starten und **Screenshots ansehen** (einfach danach fragen)
- Texte, Design, Funktionen ändern; Lint und Build laufen lassen
- Änderungen committen, pushen und als **Pull Request** anlegen

## Was du wissen solltest

- Die Quiz-App läuft in der Cloud-Session **ohne echte Secrets**: die
  Stripe-Bezahlung und die Live-Statistiken sind dort deaktiviert, alles
  andere funktioniert normal. Echte Schlüssel bleiben in Vercel.
- Änderungen, die nur im Container liegen und nicht gepusht wurden, gehen
  beim Ende der Session verloren — deshalb am Ende immer pushen lassen.
