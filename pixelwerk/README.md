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
| `make_fabric_opaque` | Durchscheinenden Stoff abdecken; findet Durchscheinendes selbst, Kanten und Flecken lassen sich zum Nachbessern markieren |
| `select_subject` | Motiv oder Objekt im Rechteck auswählen, mit Strichen Teile hinzufügen oder abziehen |
| `remove_background` | Motiv freistellen, Hintergrund per Ebenenmaske ausblenden |
| `smooth_skin` | Haut glätten (Poren bleiben), eigene Ebene, optional nur im Rechteck ums Gesicht |
| `remove_area` | Gegenstände, Kabel, Flecken entfernen wie mit „Inhaltsbasiert füllen“, auf eigener Ebene |
| `adjust` | Korrekturen und Filter, z. B. Helligkeit, Auto-Verbessern, Weichzeichnen |
| `transform_image` | Zuschneiden (auch nach Seitenverhältnis), drehen, spiegeln |
| `add_text` | Text als editierbare Textebene |
| `undo`, `get_state` | Schritte zurücknehmen, Stand abfragen |

Jeder Schritt landet im Protokoll und lässt sich mit Strg+Z zurücknehmen. Nach einer Bearbeitung zeigt „Vorher zeigen“ das Bild, wie es vor der Bitte war, und „Bild speichern“ speichert das Ergebnis.

Unter dem Eingabefeld lässt sich einstellen, wer antwortet:

| Einstellung | Auswahl |
| --- | --- |
| Modell | Automatisch: Schnell, Standard (empfohlen) oder Gründlich; oder ein bestimmtes Modell: Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5 |
| Nachdenken | Standard, Wenig, Mittel, Extra |
| Ergebnis selbst prüfen | Nach einer Bearbeitung bekommt Claude das neue Bild, vergleicht es mit dem vorherigen und bessert nach (eine zweite Anfrage) |

Die Wahl merkt sich der Browser. Ist ein Modell für das Konto nicht freigeschaltet, antwortet claude.ai mit der passenden Stufe, und der Chat sagt das dazu.

Zum Bild bekommt Claude eine zweite Fassung mit einem beschrifteten Gitter alle 100 Pixel. Daran liest es Koordinaten für Auswahl und Markierungen ab. Beim Blickdicht-Machen braucht es nur einen Punkt auf dem Stoff und einen Rahmen um das Kleidungsstück; Markierungen setzt es nur, wenn danach noch etwas zu sehen ist.

Der Assistent nutzt die Fähigkeit `sample` der claude.ai-Artifacts und das Claude-Konto der Person, die die Seite ansieht. Beim ersten Mal fragt claude.ai, ob die Seite Claude benutzen und Bilder senden darf. Außerhalb von claude.ai (lokal, über `file://` oder einen eigenen Webserver) ist der Assistent nicht verfügbar, und das Bedienfeld weist darauf hin.

## Für Einsteiger

Ohne Photoshop-Kenntnisse:

- **Rundgang**: startet beim ersten Besuch, später über Hilfe › Rundgang starten.
- **Schnellstart-Bedienfeld** (rechts oder oben über „Schnellstart“): häufige Aufgaben mit einem Klick, z. B. Foto öffnen, Auto-Verbessern, Heller/dunkler, Zuschneiden, Text schreiben, Bild speichern.
- **Stoff blickdichter machen**:
  1. Den durchsichtigen Teil eines Kleidungsstücks mit dem Lasso umfahren.
  2. Die Regler öffnen sich von selbst; Stärke, Farbe des Stoffs und Stoffstruktur mit Live-Vorschau einstellen. „Linien und Muster darunter ausblenden“ entfernt schwache Kanten, etwa vom BH.
  3. Das Ergebnis liegt auf einer eigenen Ebene „Blickdicht“, das Original bleibt erhalten.

  Dünner Stoff über Haut ist eine Mischung aus beidem; wie warm eine Stelle ist, verrät, wie viel Haut darin steckt. Diesen Anteil nimmt das Verfahren zuerst heraus. Danach trennt es Licht, Körperform, Linien und Gewebe: Licht, Form, Falten und Nähte bleiben, schwache Kanten und Flecken verschwinden, das Gewebe wird gleichmäßig. Haare über dem Stoff bleiben unverändert, und wo die Auswahl mitten im Stoff endet, läuft die Änderung weich aus. Über den Claude-Assistenten geht es auch ohne Lasso.
- **Tipp-Leiste**: Unten im Bild erklärt sie das gewählte Werkzeug in Alltagssprache; abschaltbar unter Hilfe › Einsteiger-Tipps.
- **Erste Schritte (F1)**: kurze Anleitungen mit „Zeig’s mir“-Knöpfen.
- **Meine Bilder**: Alles, was du bearbeitest, bleibt gespeichert und lässt sich jederzeit wieder öffnen.

## Funktionen

**Ebenen**
- neue Ebene, duplizieren, löschen, umbenennen, per Ziehen anordnen
- ein-/ausblenden (Alt-Klick: nur diese Ebene)
- Deckkraft und 16 Füllmethoden
- Sperren und transparente Pixel fixieren
- Ebenenmasken: einblenden, ausblenden, aus Auswahl, deaktivieren, anwenden
- Ebenenstile: Schlagschatten, Schein nach außen, Kontur
- Ebenengruppen: Strg+G gruppiert die gewählte Ebene oder alle mit Umschalt/Strg-Klick markierten, Strg+Umschalt+G hebt die Gruppierung auf, Strg+E fügt eine Gruppe zu einer Ebene zusammen. Gruppen lassen sich auf- und zuklappen, verschachteln und haben Deckkraft, Füllmethode („Hindurchwirken“ wie in Photoshop oder eine eigene, dann wirken Einstellungsebenen nur innerhalb der Gruppe), Sichtbarkeit und Maske. Ebenen per Ziehen in eine Gruppe (auf die Mitte der Gruppenzeile) oder heraus. Verschieben und Frei transformieren wirken auf den ganzen Inhalt; Projekte und „Meine Bilder“ behalten die Gruppen.
- Auf eine Ebene reduzieren, sichtbare reduzieren, auf Hintergrundebene reduzieren

**Werkzeuge** (mit Photoshop-Kürzeln, Umschalt + Taste wechselt innerhalb der Gruppe)

| Taste | Werkzeuge |
| --- | --- |
| V | Verschieben (Auswahlinhalt schwebend, Alt dupliziert, Pfeiltasten) |
| M | Auswahlrechteck, Auswahlellipse (Umschalt/Alt/beides = hinzufügen/subtrahieren/Schnittmenge, weiche Kante, feste Größe/Verhältnis) |
| L | Lasso, Polygon-Lasso |
| W | Zauberstab (Toleranz, benachbart, alle Ebenen), Schnellauswahl (Pinsel, wächst bis zu Kanten, Alt nimmt weg), Objektauswahl (Klick auf ein Objekt mit KI, oder Rechteck darum) |
| C | Freistellen (Seitenverhältnisse, Drittel-Raster) |
| I | Pipette (1 bis 11 × 11 px, Aufnahmering) |
| J | Bereichsreparatur-Pinsel, Entfernen-Werkzeug (beide inhaltsbasiert), Reparatur-Pinsel (Alt-Klick für die Quelle), Ausbessern-Werkzeug |
| B | Pinsel (Größe, Härte, Deckkraft, Fluss, Stiftdruck), Buntstift |
| S | Kopierstempel (Alt-Klick für die Quelle, ausgerichtet, alle Ebenen) |
| Y | Protokollpinsel (malt einen gewählten Protokollschritt zurück) |
| E | Radiergummi |
| G | Verlauf (linear, radial, Winkel, reflektiert, Raute), Füllwerkzeug |
| R | Weichzeichner, Scharfzeichner, Wischfinger |
| O | Abwedler, Nachbelichter (Tiefen/Mitteltöne/Lichter) |
| P | Zeichenstift (Klick: Ecke, Ziehen: Kurve, Klick auf den ersten Punkt schließt; auf einem Pfad: Klick auf die Linie fügt einen Punkt ein, Klick auf einen Punkt löscht ihn; Alt wandelt Punkte um, Strg/⌘ verschiebt Punkte) |
| T | Text (editierbare Textebenen, Schriften, Fett/Kursiv, Ausrichtung) |
| A | Pfadauswahl (ganze Pfade verschieben, Alt kopiert), Direktauswahl (Punkte und Griffe, Rahmen wählt mehrere, Entf löscht) |
| U | Rechteck (mit Radius), Ellipse, Polygon/Stern, Linie/Pfeil – als Pixel oder als Pfad |
| H, Z | Hand, Zoom |
| Strg+T | Frei transformieren (skalieren, drehen; Umschalt: frei bzw. 15°-Schritte; Alt: von der Mitte) |
| Bearbeiten › Transformieren | Verzerren (vier Ecken frei), Perspektivisch verzerren (Ecken paarweise), Verkrümmen (4 × 4-Gitter, Bézier); Vorschau per Dreiecksgitter, Ergebnis pixelgenau ohne Nähte |

**KI auf dem eigenen Gerät** (Bearbeiten › KI auf diesem Gerät): Motiv auswählen, die Objektauswahl und das Entfernen nutzen kleine neuronale Netze, die im Browser laufen (ONNX Runtime als WebAssembly in einem Worker). Pixelwerk fragt vor dem ersten Laden (einmalig etwa 40 bzw. 15 MB) und speichert die Modelle danach auf dem Gerät; Bilder werden nirgendwohin geschickt.
- Motiv auswählen: U²-Netp findet das Hauptmotiv, MobileSAM (Segment Anything) schneidet es genau aus, ein geführter Filter legt die Kante an Haare an.
- Objektauswahl: auf ein Objekt klicken (Umschalt fügt hinzu, Alt nimmt weg) oder ein Rechteck darum ziehen; beim Darüberfahren zeigt eine rosa Fläche, was ein Klick auswählen würde.
- Entfernen und Inhaltsbasiert füllen: MI-GAN malt einen ersten Entwurf, die Fleckensuche (PatchMatch) baut ihn aus echten Pixeln des Fotos nach, so passen Körnung und Schärfe.
- Ohne KI (ausgeschaltet oder Modelle nicht vorhanden) nimmt Pixelwerk die klassischen Verfahren. Die Modelle baut `tools/build-ai.py` in den Ordner `ai/` (siehe `ai/README.md`).

**Smartobjekte** (Ebene › Smartobjekte, Filter › Für Smartfilter konvertieren): Die Ebene behält ihr Original. Frei transformieren, Verschieben und die Bildgröße rechnen jedes Mal vom Original aus, so verliert ein Smartobjekt beim Verkleinern und wieder Vergrößern nichts. Filter auf einem Smartobjekt werden zu Smartfiltern: Sie stehen unter der Ebene, lassen sich per Auge aus- und einblenden, per Doppelklick neu einstellen und mit × löschen. „Inhalt bearbeiten“ öffnet das Original als eigenes Dokument; jede Änderung dort erscheint sofort im Smartobjekt. Datei › Platzieren legt Bilder als Smartobjekt an. Malen auf einem Smartobjekt fragt, ob eine neue Ebene angelegt oder gerastert werden soll.

**Pfade** (Fenster › Pfade, Bearbeiten › Pfade): Bézier-Pfade wie in Photoshop. Was der Zeichenstift oder ein Formwerkzeug im Modus „Pfad“ zeichnet, landet im Arbeitspfad; ein Doppelklick im Bedienfeld speichert ihn unter einem Namen. Pfad als Auswahl laden (Strg+Enter, oder Strg-Klick auf den Pfad), Arbeitspfad aus Auswahl erstellen (Umriss nachgezogen, mit Toleranz vereinfacht, runde Kurven), Pfad füllen und Pfadkontur füllen mit der Vordergrundfarbe. Bildgröße, Arbeitsfläche, Drehen und Spiegeln nehmen die Pfade mit; sie stehen im Protokoll und werden im Projekt und in „Meine Bilder“ gespeichert.

**Intelligente Auswahl**: Auswahl › Motiv sucht das Hauptmotiv (mit KI siehe oben; ohne KI GrabCut: Farbmodelle für Motiv und Hintergrund, Schnitt entlang der Kanten per Graph-Cut, grob nach fein). Auswahl › Farbbereich nimmt Farben per Klick auf oder nach Vorgabe (Rottöne … Magentatöne, Hauttöne, Lichter, Mitteltöne, Tiefen). Auswählen und maskieren (Strg+Alt+R) verbessert die Kante: Radius für Haare (geführter Filter), Abrunden, weiche Kante, Kontrast, Kante verschieben, Farben dekontaminieren, Ausgabe als Auswahl, Ebenenmaske oder neue Ebene. Ebene › Hintergrund entfernen stellt das Motiv per Ebenenmaske frei. Ohne KI rechnet Pixelwerk nur mit Farben und Kanten; bei Haaren vor ähnlich farbigem Hintergrund braucht es dann ein paar Striche mit der Schnellauswahl.

**Retusche** wie in Photoshop: Bereichsreparatur-Pinsel und Entfernen-Werkzeug bauen übermalte Stellen beim Loslassen aus der Umgebung neu auf. Bearbeiten › Inhaltsbasiert füllen (Strg+Umschalt+Rücktaste, auch unter Fläche füllen › Inhalt) macht das für eine Auswahl. Reparatur-Pinsel und Ausbessern-Werkzeug übernehmen die Struktur einer gewählten Stelle und passen Licht und Farbe an den Rand des Ziels an. Das Auffüllen sucht für jedes 7 × 7-Stück das ähnlichste Stück außerhalb (PatchMatch), grob nach fein, mit Farbanpassung, und gleicht die Naht zum Schluss an.

**Einstellungsebenen** wie in Photoshop: Ein Klick im Bedienfeld „Korrekturen“ (oder Ebene › Neue Einstellungsebene) legt die Korrektur als eigene Ebene an. Sie wirkt auf alles darunter, die Pixel bleiben unverändert; über ihre Maske (Malen mit Schwarz, eine Auswahl wird beim Anlegen zur Maske), Deckkraft und Füllmethode lässt sie sich begrenzen, ein Doppelklick ändert die Einstellungen. Ergebnisse unter einer Einstellungsebene werden zwischengespeichert, so bleibt Malen darüber flüssig. Alt-Klick im Bedienfeld wendet die Korrektur wie bisher direkt an.

**Korrekturen**: Helligkeit/Kontrast, Tonwertkorrektur (mit Histogramm), Gradationskurven (RGB und Einzelkanäle), Belichtung, Dynamik, Farbton/Sättigung (auch Färben), Farbbalance, Schwarzweiß, Fotofilter, Kanalmixer, Selektive Farbkorrektur, Tiefen/Lichter, Umkehren, Tontrennung, Schwellenwert, Verlaufsumsetzung, Sättigung verringern, Tonwertangleichung, Auto-Farbton/-Kontrast/-Farbe.

**Haut glätten** (Filter › Haut glätten, auch im Schnellstart): sucht Hauttöne, glättet die mittleren Frequenzen der Helligkeit kantenerhaltend, gibt einen Teil der feinen Struktur zurück (Poren bleiben) und gleicht Farbflecken aus. Ergebnis auf eigener Ebene, Stärke über die Deckkraft.

**Verflüssigen** (Filter › Verflüssigen, Strg+Umschalt+X): eigener Arbeitsbereich mit Mitziehen, Rekonstruieren, Glätten, Strudel, Zusammenziehen, Aufblasen, Maske fixieren und lösen; Größe, Dichte, Druck, Gitter- und Maskenansicht. Eine Auswahl schützt alles außerhalb. Technisch ein Verschiebungsfeld (bis ~1,5 MP), das beim OK in voller Auflösung angewendet wird (12 MP in unter einer Sekunde).

**Filter**: Camera-Raw-Filter (Strg+Umschalt+A: Weißabgleich, Belichtung, Kontrast, Lichter, Tiefen, Weiß, Schwarz, Struktur, Klarheit, Dunst entfernen, Dynamik, Sättigung), Rauschen reduzieren, Oberfläche weichzeichnen,
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
- Bild speichern als JPG (für Fotos voreingestellt, Qualität 92 %), PNG oder WebP, mit Skalierung
- Projekte mit allen Ebenen als `.pxw` speichern und wieder öffnen

**Meine Bilder** (Datei › Meine Bilder, Schnellstart oder Startbildschirm):
- Jedes geöffnete oder bearbeitete Bild bleibt mit allen Ebenen im Browser gespeichert (IndexedDB, nur auf diesem Gerät), auch nach dem Schließen. Jede Änderung wird nach einer halben Sekunde gesichert.
- Die Übersicht zeigt Vorschaubilder, das letzte Bearbeitungsdatum und die Größe; ein Klick öffnet den letzten Stand, der Papierkorb löscht ein Bild endgültig.
- Bilder, die beim Neuladen offen waren, sind danach samt Claude-Chat wieder da, etwa wenn eine neue Version von Pixelwerk erscheint.
- Schließen fragt nicht mehr nach dem Speichern, solange das Bild in „Meine Bilder“ liegt. Ohne Browser-Speicher (privates Fenster, gesperrte Website-Daten) erscheint die Frage wie gewohnt.
- Pixelwerk bittet den Browser, die Daten dauerhaft aufzubewahren (`navigator.storage.persist`).

**Oberfläche**:
- Protokoll mit bis zu 50 Schritten; Ebenen, die sich nicht geändert haben, teilen ihren Speicher
- Navigator, Histogramm, Farbfelder, Farbwähler
- Pixelraster ab 800 %
- dunkles und helles Design
- Touch-Gesten (zwei Finger zoomen und verschieben)
- Bedienfelder als Overlay auf schmalen Bildschirmen; am Handy als Fenster von unten, das Bild bleibt darüber sichtbar

Alle Kürzel stehen unter **Hilfe › Tastaturbefehle**. Manche, etwa Strg+N, Strg+T und Strg+W, behält der Browser für sich. Dafür gibt es Alternativen wie Strg+Alt+N und Strg+Alt+T.

## Aufbau

```
pixelwerk/
  index.html          Oberfläche (Menüleiste, Optionsleiste, Werkzeuge, Arbeitsfläche, Bedienfelder)
  css/app.css         Gestaltung (Design-Tokens, dunkel/hell)
  js/core.js          Namensraum PW, Hilfsfunktionen, Farbumrechnung, Event-Bus, Werkzeugregister
  js/layer.js         Ebene: Pixel, Maske, Text, Stile, Serialisierung
  js/selection.js     Auswahlmaske, Kombinieren, Distanzfeld (Erweitern/Verkleinern), Ameisenlinie
  js/paths.js         Pfade: Bézier-Modell, Pfad ↔ Auswahl (Umriss nachziehen, vereinfachen, glätten), Anzeige
  js/smartobj.js      Smartobjekte: Original + Platzierung (Matrix), verlustfreies Neuzeichnen, Smartfilter, Inhalt bearbeiten
  js/document.js      Dokument: Ebenenstapel, Compositing mit Füllmethoden/Stilen, Geometrie, Protokoll
  js/filters.js       Korrekturen und Filter auf ImageData, Live-Vorschau-Sitzung
  js/view.js          Zoom, Verschieben, Darstellung, Eingaben (Maus, Stift, Touch)
  js/tools/*.js       Werkzeuge (Malen, Retusche, Auswahl, Verschieben, Füllen, Text, Formen, Freistellen, Transformieren)
  js/segment.js       Segmentierung: Graph-Cut (Boykov–Kolmogorov), GrabCut, geführter Filter
  js/inpaint.js       Inhaltsbasiert füllen (PatchMatch über mehrere Auflösungen, Farbanpassung, optional nach KI-Entwurf) und Membran-Angleichung
  js/ai.js            KI auf dem Gerät: ONNX Runtime im Worker, Modelle laden und zwischenspeichern, Motiv, Segment Anything, MI-GAN
  ai/                 die gepackten Modelle (von tools/build-ai.py erzeugt, nicht eingecheckt)
  tools/build-ai.py   holt die Modelle von npm, speichert die Gewichte als float16 und teilt sie in Textstücke
  js/app.js           App-Zustand: Dokumente, aktives Werkzeug, Farben, Protokoll-Einträge
  js/commands.js      Befehle hinter Menüs und Kürzeln
  js/actions.js       Aktionsregister → Menüs, Tastaturkürzel, Hilfe
  js/ui/*.js          Bedienelemente, Dialoge, Menüs/Leisten, Bedienfelder, Icons
  js/io.js            Öffnen, Platzieren, Einfügen, Drag & Drop, Projekt speichern, Export
  js/fabric.js        „Stoff blickdichter machen“: Entmischen nach Farbwärme, Frequenztrennung, Haarschutz, Zonen, Kleidungsauswahl
  js/ui/guide.js      Einsteigerhilfe: Rundgang, Tipp-Leiste, Schnellstart, Erste Schritte
  js/ui/assistant.js  Claude-Assistent: Chat, Bildanhang, Werkzeuge für Claude
  js/library.js       „Meine Bilder“: alle Bilder im Browser speichern, offene nach dem Neuladen zurückholen
  js/main.js          Start und Beispieldokument
  desktop/            Pixelwerk als Mac-Programm (Electron-Fenster für die claude.ai-Seite), siehe desktop/README.md
```
