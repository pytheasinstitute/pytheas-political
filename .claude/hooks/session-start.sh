#!/bin/bash
# SessionStart-Hook für Claude Code Cloud-Sessions (claude.ai/code, Handy-App).
# Installiert die Abhängigkeiten der Quiz-App, damit Build, Lint und
# Dev-Server sofort funktionieren. Idempotent — mehrfaches Ausführen ist sicher.
set -euo pipefail

# Nur in Remote-/Cloud-Sessions ausführen; lokal bleibt alles unangetastet.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/political-quiz"
npm install

echo "Remote-Setup abgeschlossen: 'npm run dev' in political-quiz/ startet die App."
