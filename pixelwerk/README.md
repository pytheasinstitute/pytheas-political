# Pixelwerk

Pixelwerk ist eine Bildbearbeitung im Stil von Photoshop, die komplett im Browser läuft. Sie braucht keinen Build-Schritt und keine Abhängigkeiten. Die Bilder bleiben auf dem eigenen Gerät.

## Starten

`index.html` im Browser öffnen, per Doppelklick oder über einen beliebigen statischen Webserver:

```bash
npx http-server pixelwerk
```

Die App nutzt klassische `<script>`-Dateien statt ES-Modulen und funktioniert deshalb auch über `file://`.

## Claude-Assistent

Über „Claude fragen“ (oben rechts) schreibst du in Alltagssprache, was du am Bild ändern willst, etwa „Mach das Top blickdicht“ oder „Schneide es quadratisch zu“. Claude bekommt das aktuelle Bild zu sehen und bedient Pixelwerk über Werkzeuge:

| Werkzeug | Wirkung |
| --- | --- |
| `select_garment` | Kleidungsstück ab einem Punkt auf dem Stoff auswählen; Haut und Haare bleiben draußen |
| `select_area` | Auswahl per Polygon, Rechteck oder Ellipse ändern oder aufheben |
| `make_fabric_opaque` | Durchscheinenden Stoff abdecken, optional mit markierten Kanten, Flächen und geschützten Haaren |
| `adjust` | Korrekturen und Filter, z. B. Helligkeit, Auto-Verbessern, Weichzeichnen |
| `transform_image` | Zuschneiden (auch nach Seitenverhältnis), drehen, spiegeln |
| `add_text` | Text als editierbare Textebene |
| `undo`, `get_state` | Schritte zurücknehmen, Stand abfragen |

Jeder Schritt landet im Protokoll und lässt sich mit Strg+Z zurücknehmen.

Unter dem Eingabefeld lässt sich einstellen, wer antwortet:

| Einstellung | Auswahl |
| --- | --- |
| Modell | Automatisch: Schnell, Standard (empfohlen) oder Gründlich; oder ein bestimmtes Modell: Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5 |
| Nachdenken | Standard, Wenig, Mittel, Extra |
| Ergebnis selbst prüfen | Nach einer Bearbeitung bekommt Claude das neue Bild, vergleicht es mit dem vorherigen und bessert nach (eine zweite Anfrage) |

Die Wahl merkt sich der Browser. Ist ein Modell für das Konto nicht freigeschaltet, antwortet claude.ai mit der passenden Stufe, und der Chat sagt das dazu.

Zum Bild bekommt Claude eine zweite Fassung mit einem beschrifteten Gitter alle 100 Pixel. Daran liest es Koordinaten für Auswahl und Markierungen ab.

Der Assistent nutzt die Fähigkeit `sample` der claude.ai-Artifacts und das Claude-Konto der Person, die die Seite ansieht. Beim ersten Mal fragt claude.ai, ob die Seite Claude benutzen und Bilder senden darf. Außerhalb von claude.ai (lokal, über `file://` oder einen eigenen Webserver) ist der Assistent nicht verfügbar, und das Bedienfeld weist darauf hin.

## Für Einsteiger

Ohne Photoshop-Kenntnisse:

- **Rundgang**: startet beim ersten Besuch, später über Hilfe › Rundgang starten.
- **Schnellstart-Bedienfeld** (rechts oder oben über „Schnellstart“): häufige Aufgaben mit einem Klick, z. B. Foto öffnen, Auto-Verbessern, Heller/dunkler, Zuschneiden, Text schreiben, Bild speichern.
- **Stoff blickdichter machen**:
  1. Den durchsichtigen Teil eines Kleidungsstücks mit dem Lasso umfahren.
  2. Die Regler öffnen sich von selbst; Stärke, Farbe des Stoffs und Stoffstruktur mit Live-Vorschau einstellen. „Linien und Muster darunter ausblenden“ entfernt schwache Kanten, etwa vom BH.
  3. Das Ergebnis liegt auf einer eigenen Ebene „Blickdicht“, das Original bleibt erhalten.

  Das Verfahren trennt Licht, Körperform, durchscheinende Details und Gewebe. Durchscheinendes wird geglättet, Falten und Gewebe bleiben, damit das Ergebnis nicht bearbeitet aussieht. Über den Claude-Assistenten geht es auch ohne Lasso.
- **Tipp-Leiste**: Unten im Bild erklärt sie das gewählte Werkzeug in Alltagssprache; abschaltbar unter Hilfe › Einsteiger-Tipps.
- **Erste Schritte (F1)**: kurze Anleitungen mit „Zeig’s mir“-Knöpfen.

## Funktionen

**Ebenen**
- neue Ebene, duplizieren, löschen, umbenennen, per Ziehen anordnen
- ein-/ausblenden (Alt-Klick: nur diese Ebene)
- Deckkraft und 16 Füllmethoden
- Sperren und transparente Pixel fixieren
- Ebenenmasken: einblenden, ausblenden, aus Auswahl, deaktivieren, anwenden
- Ebenenstile: Schlagschatten, Schein nach außen, Kontur
- Auf eine Ebene reduzieren, sichtbare reduzieren, auf Hintergrundebene reduzieren

**Werkzeuge** (mit Photoshop-Kürzeln, Umschalt + Taste wechselt innerhalb der Gruppe)

| Taste | Werkzeuge |
| --- | --- |
| V | Verschieben (Auswahlinhalt schwebend, Alt dupliziert, Pfeiltasten) |
| M | Auswahlrechteck, Auswahlellipse (Umschalt/Alt/beides = hinzufügen/subtrahieren/Schnittmenge, weiche Kante, feste Größe/Verhältnis) |
| L | Lasso, Polygon-Lasso |
| W | Zauberstab (Toleranz, benachbart, alle Ebenen) |
| C | Freistellen (Seitenverhältnisse, Drittel-Raster) |
| I | Pipette (1 bis 11 × 11 px, Aufnahmering) |
| B | Pinsel (Größe, Härte, Deckkraft, Fluss, Stiftdruck), Buntstift |
| S | Kopierstempel (Alt-Klick für die Quelle, ausgerichtet, alle Ebenen) |
| E | Radiergummi |
| G | Verlauf (linear, radial, Winkel, reflektiert, Raute), Füllwerkzeug |
| R | Weichzeichner, Scharfzeichner, Wischfinger |
| O | Abwedler, Nachbelichter (Tiefen/Mitteltöne/Lichter) |
| T | Text (editierbare Textebenen, Schriften, Fett/Kursiv, Ausrichtung) |
| U | Rechteck (mit Radius), Ellipse, Polygon/Stern, Linie/Pfeil |
| H, Z | Hand, Zoom |
| Strg+T | Frei transformieren (skalieren, drehen; Umschalt: frei bzw. 15°-Schritte; Alt: von der Mitte) |

**Korrekturen**: Helligkeit/Kontrast, Tonwertkorrektur (mit Histogramm), Gradationskurven (RGB und Einzelkanäle), Belichtung, Dynamik, Farbton/Sättigung (auch Färben), Farbbalance, Schwarzweiß, Fotofilter, Tiefen/Lichter, Umkehren, Tontrennung, Schwellenwert, Verlaufsumsetzung, Sättigung verringern, Tonwertangleichung, Auto-Farbton/-Kontrast/-Farbe.

**Filter**:
- Gaußscher Weichzeichner, Bewegungsunschärfe
- Unscharf maskieren, Scharfzeichnen
- Rauschen hinzufügen, Median
- Mosaik, Relief, Konturen finden, Solarisation
- Strudel, Wölben, Wellen
- Wolken, Vignette, Hochpass
- „Letzter Filter“ (Strg+F)

Alle Korrekturen und Filter zeigen eine Live-Vorschau und wirken nur innerhalb der Auswahl, auch bei weicher Kante.

**Auswahl**:
- alles auswählen, aufheben, erneut auswählen, umkehren
- erweitern, verkleinern, weiche Kante, Umrandung
- Auswahl aus Ebenentransparenz (Strg-Klick auf die Miniatur)

**Bild**:
- Bildgröße, Arbeitsfläche (mit Anker)
- Drehen, Spiegeln
- Freistellen auf die Auswahl, transparente Ränder zuschneiden

**Datei und Zwischenablage**:
- mehrere Dokumente in Tabs
- Öffnen und Platzieren per Dialog, Drag & Drop oder Strg+V
- Kopieren, auf eine Ebene reduziert kopieren, Ausschneiden, Einfügen
- Export als PNG, JPEG oder WebP (mit Qualität und Skalierung)
- Projekte mit allen Ebenen als `.pxw` speichern und wieder öffnen

**Automatische Sicherung**:
- Offene Bilder mit allen Ebenen und der Claude-Chat werden laufend im Browser gespeichert (IndexedDB, nur auf diesem Gerät).
- Nach dem Neuladen, etwa wenn eine neue Version von Pixelwerk erscheint, sind sie von selbst wieder da.
- Schließt man ein Bild, verschwindet es auch aus der Sicherung.
- Ohne Browser-Speicher (privates Fenster, gesperrte Website-Daten) läuft alles wie gehabt, nur ohne Sicherung.

**Oberfläche**:
- Protokoll mit bis zu 50 Schritten; Ebenen, die sich nicht geändert haben, teilen ihren Speicher
- Navigator, Histogramm, Farbfelder, Farbwähler
- Pixelraster ab 800 %
- dunkles und helles Design
- Touch-Gesten (zwei Finger zoomen und verschieben)
- Bedienfelder als Overlay auf schmalen Bildschirmen

Alle Kürzel stehen unter **Hilfe › Tastaturbefehle**. Manche, etwa Strg+N, Strg+T und Strg+W, behält der Browser für sich. Dafür gibt es Alternativen wie Strg+Alt+N und Strg+Alt+T.

## Aufbau

```
pixelwerk/
  index.html          Oberfläche (Menüleiste, Optionsleiste, Werkzeuge, Arbeitsfläche, Bedienfelder)
  css/app.css         Gestaltung (Design-Tokens, dunkel/hell)
  js/core.js          Namensraum PW, Hilfsfunktionen, Farbumrechnung, Event-Bus, Werkzeugregister
  js/layer.js         Ebene: Pixel, Maske, Text, Stile, Serialisierung
  js/selection.js     Auswahlmaske, Kombinieren, Distanzfeld (Erweitern/Verkleinern), Ameisenlinie
  js/document.js      Dokument: Ebenenstapel, Compositing mit Füllmethoden/Stilen, Geometrie, Protokoll
  js/filters.js       Korrekturen und Filter auf ImageData, Live-Vorschau-Sitzung
  js/view.js          Zoom, Verschieben, Darstellung, Eingaben (Maus, Stift, Touch)
  js/tools/*.js       Werkzeuge (Malen, Auswahl, Verschieben, Füllen, Text, Formen, Freistellen, Transformieren)
  js/app.js           App-Zustand: Dokumente, aktives Werkzeug, Farben, Protokoll-Einträge
  js/commands.js      Befehle hinter Menüs und Kürzeln
  js/actions.js       Aktionsregister → Menüs, Tastaturkürzel, Hilfe
  js/ui/*.js          Bedienelemente, Dialoge, Menüs/Leisten, Bedienfelder, Icons
  js/io.js            Öffnen, Platzieren, Einfügen, Drag & Drop, Projekt speichern, Export
  js/fabric.js        „Stoff blickdichter machen“: Frequenztrennung, Zonen, Kleidungsauswahl, eigene Ebene
  js/ui/guide.js      Einsteigerhilfe: Rundgang, Tipp-Leiste, Schnellstart, Erste Schritte
  js/ui/assistant.js  Claude-Assistent: Chat, Bildanhang, Werkzeuge für Claude
  js/autosave.js      Automatische Sicherung offener Bilder und des Chats im Browser
  js/main.js          Start und Beispieldokument
```
