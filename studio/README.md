# Pytheas Studio

Bildbearbeitung direkt im Browser – Ebenen, Auswahl- und Malwerkzeuge, Text, Korrekturen und Filter.
Reines HTML/CSS/JavaScript ohne Abhängigkeiten und ohne Build-Schritt. Bilder verlassen das Gerät nicht.

## Starten

- **Lokal:** `studio/index.html` im Browser öffnen (Doppelklick genügt), oder
  `npx serve studio` und `http://localhost:3000` aufrufen.
- **Online:** Den Ordner `studio/` auf einen beliebigen statischen Host legen (GitHub Pages, Netlify, Vercel …).

## Funktionen

| Bereich | Umfang |
|---|---|
| **Ebenen** | Neu, Duplizieren, Löschen, Umbenennen, Sichtbarkeit, Deckkraft, 16 Füllmethoden, Reihenfolge per Drag & Drop, Zusammenfügen, Auf Hintergrund reduzieren |
| **Auswahl** | Rechteck, Ellipse, Lasso, Zauberstab (Toleranz, benachbart), Neu/Hinzufügen/Subtrahieren/Schnittmenge, Alles, Umkehren, Weiche Kante, Erweitern/Verkleinern, Ebenenpixel, Auswahl verschieben |
| **Malen & Retusche** | Pinsel (Größe, Härte, Deckkraft, Stiftdruck), Radiergummi, Kopierstempel, Retusche-Pinsel (Abwedeln, Nachbelichten, Weichzeichnen, Scharfzeichnen, Schwamm), Füllwerkzeug, Verlauf (linear/radial), Pipette |
| **Text & Formen** | Bearbeitbare Textebenen (Schrift, Größe, fett/kursiv, Ausrichtung, Farbe), Rechteck, abgerundetes Rechteck, Ellipse, Linie |
| **Transformieren** | Verschieben (auch Auswahlinhalt, Pfeiltasten), Frei transformieren (Skalieren, Drehen, Spiegeln), Freistellen mit Seitenverhältnis, Bildgröße, Arbeitsfläche, Bilddrehung |
| **Korrekturen** | Helligkeit/Kontrast, Tonwertkorrektur, Farbton/Sättigung (inkl. Färben), Dynamik, Farbtemperatur, Auto-Kontrast, Sättigung verringern, Umkehren, Sepia, Schwellenwert, Tontrennung – alle mit Live-Vorschau |
| **Filter** | Gaußscher Weichzeichner (GPU, wenn verfügbar), Unscharf maskieren, Scharfzeichnen, Rauschen, Mosaik, Relief, Konturen finden, Vignette |
| **Ebenenstile** | Schlagschatten, Schein nach außen, Kontur |
| **Dateien** | Öffnen (PNG, JPEG, WebP, GIF, SVG …), Drag & Drop, Einfügen aus der Zwischenablage, Export als PNG/JPEG/WebP mit Qualität und Skalierung, Projektdatei `.pstudio` mit allen Ebenen |
| **Sicherheit** | Protokoll mit 40 Schritten (Rückgängig/Wiederholen, Klick auf Eintrag), automatische Sicherung im Browser mit Wiederherstellung nach Absturz oder Neuladen |
| **Bedienung** | Tastenkürzel wie in gewohnten Programmen (`F1` zeigt alle), Zoom mit Strg+Mausrad, Leertaste = Hand, Touch: Malen mit dem Finger, Zoomen mit zwei Fingern |

## Aufbau

```
studio/
├── index.html        Gerüst der Oberfläche
├── css/studio.css    Gestaltung (dunkles Profi-Layout, responsiv)
└── js/
    ├── util.js       DOM-, Canvas-, Farb- und Datei-Helfer
    ├── doc.js        Dokument, Ebenen, Protokoll (Copy-on-Write), Auswahlmasken
    ├── filters.js    Pixel-Algorithmen (Weichzeichner, Farbkorrekturen, Faltungen)
    ├── render.js     Zusammensetzen der Ebenen, Zoom/Ansicht, Überlagerungen
    ├── tools.js      Alle Werkzeuge und „Frei transformieren“
    ├── ui.js         Werkzeugleiste, Optionsleiste, Bedienfelder, Menüs, Dialoge
    ├── actions.js    Menübefehle (Datei, Bearbeiten, Bild, Ebene, Auswahl, Filter …)
    ├── storage.js    Automatische Sicherung (IndexedDB)
    ├── input.js      Maus/Stift/Touch, Tastatur, Drag & Drop, Zwischenablage
    └── main.js       Start
```

Jede Ebene ist eine eigene Canvas. Das Protokoll speichert Verweise auf die Ebenen-Canvas; wird eine Ebene
verändert, entsteht vorher eine Kopie (Copy-on-Write). So kostet ein Protokollschritt nur den Speicher der
tatsächlich geänderten Ebene. Für Tests und Skripte steht `window.studio` zur Verfügung.

## Grenzen

Bewusst (noch) nicht enthalten: PSD-Import/-Export, Ebenenmasken und Einstellungsebenen (Korrekturen wirken
direkt auf die Pixel), Pfade/Zeichenstift, CMYK und 16 Bit pro Kanal. Die maximale Bildgröße beträgt 8192 px
je Seite. In Chrome lässt sich `Strg+T` nicht abfangen – „Frei transformieren“ liegt daher zusätzlich auf
`Strg+Alt+T`.

Unabhängiges Projekt des Pytheas Institute, keine Verbindung zu Adobe Inc. Photoshop ist eine Marke von Adobe.
