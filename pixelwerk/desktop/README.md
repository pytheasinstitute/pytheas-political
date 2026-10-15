# Pixelwerk für Mac

Pixelwerk als eigenes Mac-Programm: ein Fenster mit Pixelwerk-Symbol, das die Pixelwerk-Seite auf claude.ai öffnet. Darin funktioniert „Claude fragen“ über das eigene Claude-Konto, und „Meine Bilder“ bleibt im Programm gespeichert.

## Installieren

1. Die passende Datei aus dem Release `pixelwerk-mac-v1.0.0` laden:
   - `Pixelwerk-Mac-Apple-Chip.dmg` für Macs mit M1, M2, M3 …
   - `Pixelwerk-Mac-Intel.dmg` für ältere Macs mit Intel-Prozessor

   Welcher Chip verbaut ist, steht im Apple-Menü unter „Über diesen Mac“.
2. Die DMG öffnen und Pixelwerk in „Programme“ ziehen.
3. Beim ersten Start meldet macOS, dass es das Programm nicht prüfen kann; es ist nicht bei Apple registriert. Dann unter Systemeinstellungen › Datenschutz & Sicherheit bei Pixelwerk auf „Dennoch öffnen“ klicken.
4. Im Fenster einmal bei claude.ai anmelden. Danach öffnet sich Pixelwerk von selbst.

## Was das Programm macht

- Öffnet die Pixelwerk-Seite auf claude.ai. Ist man abgemeldet, geht es erst zur Anmeldung und danach zurück.
- Anmeldung, Cookies und „Meine Bilder“ liegen im Programm-Speicher dieses Macs.
- Links zu anderen Seiten öffnen sich im normalen Browser.
- Ohne Internet erscheint eine Seite mit „Noch einmal versuchen“.
- Menüs auf Deutsch. Kürzel, die Pixelwerk selbst nutzt (⌘Z, ⌘C, ⌘M …), gehen zuerst an Pixelwerk.

## Bauen

Der Workflow `.github/workflows/pixelwerk-mac.yml` baut das Programm auf einem Mac von GitHub. Er packt es für beide Prozessoren, signiert ad hoc und startet es einmal zur Probe. Dann legt er die DMGs ans Release.

Lokal geht es mit:

```bash
cd pixelwerk/desktop
npm install
node build.mjs            # ARCHS=arm64 für nur eine Architektur
codesign --force --deep --sign - dist/Pixelwerk-darwin-arm64/Pixelwerk.app
```

Die Adresse der Pixelwerk-Seite steht oben in `main.js` (`START`).
