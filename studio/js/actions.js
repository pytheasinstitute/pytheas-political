'use strict';
/* Pytheas Studio — Menübefehle */

const hasSelection = () => !!app.doc.selection;

/* ---------- Datei ---------- */

function confirmDiscard() {
  if (!app.dirty) return true;
  return confirm('Nicht gespeicherte Änderungen gehen verloren. Fortfahren?');
}

function dlgNew() {
  const presets = [
    ['custom', 'Benutzerdefiniert'],
    ['1920x1080', 'Full HD – 1920 × 1080'],
    ['1280x720', 'HD – 1280 × 720'],
    ['3840x2160', '4K – 3840 × 2160'],
    ['1080x1080', 'Instagram-Beitrag – 1080 × 1080'],
    ['1080x1350', 'Instagram hoch – 1080 × 1350'],
    ['1080x1920', 'Story / Reel – 1080 × 1920'],
    ['1200x630', 'Link-Vorschau – 1200 × 630'],
    ['1500x500', 'X/Twitter-Header – 1500 × 500'],
    ['2480x3508', 'A4 hoch, 300 ppi – 2480 × 3508'],
    ['3508x2480', 'A4 quer, 300 ppi – 3508 × 2480'],
  ];
  openDialog({
    title: 'Neues Dokument',
    fields: [
      { key: 'preset', type: 'select', label: 'Vorgabe', options: presets, value: 'custom' },
      { key: 'w', type: 'number', label: 'Breite', min: 1, max: MAX_SIZE, unit: 'px', value: app.doc.width },
      { key: 'h', type: 'number', label: 'Höhe', min: 1, max: MAX_SIZE, unit: 'px', value: app.doc.height },
      { key: 'bg', type: 'select', label: 'Hintergrund', options: [['white', 'Weiß'], ['black', 'Schwarz'], ['bgcolor', 'Hintergrundfarbe'], ['transparent', 'Transparent']], value: 'white' },
    ],
    okLabel: 'Erstellen',
    onInput(v, key, set) {
      if (key === 'preset' && v.preset !== 'custom') {
        const [w, h] = v.preset.split('x').map(Number);
        set('w', w);
        set('h', h);
      } else if (key === 'w' || key === 'h') set('preset', 'custom');
    },
    onOk(v) {
      if (!confirmDiscard()) return false;
      const fill = { white: '#ffffff', black: '#000000', bgcolor: app.bg, transparent: null }[v.bg];
      newDocument(v.w, v.h, fill);
    },
  });
}

function openCanvasAsDocument(c, name) {
  let src = c;
  if (c.width > MAX_SIZE || c.height > MAX_SIZE) {
    const s = Math.min(MAX_SIZE / c.width, MAX_SIZE / c.height);
    src = resizeCanvas(c, c.width * s, c.height * s);
    toast(`Das Bild wurde auf ${src.width} × ${src.height} px verkleinert.`);
  }
  app.layerCounter = 1;
  const l = makeLayer('Hintergrund', src.width, src.height);
  ctxOf(l.canvas).drawImage(src, 0, 0);
  setDocument({ width: src.width, height: src.height, layers: [l], active: 0, selection: null, name: baseName(name) }, 'Öffnen');
}

function placeCanvas(c, name, pos) {
  finishInteractions();
  const d = app.doc;
  let src = c;
  const s = Math.min(1, d.width / c.width, d.height / c.height);
  if (s < 1 && !pos) src = resizeCanvas(c, c.width * s, c.height * s);
  const l = addLayer(name || nextLayerName());
  const x = pos ? pos.x : Math.round((d.width - src.width) / 2);
  const y = pos ? pos.y : Math.round((d.height - src.height) / 2);
  ctxOf(l.canvas).drawImage(src, x, y);
  commit(pos ? 'Einfügen' : 'Platzieren');
}

async function openFile(file, asLayer = false) {
  try {
    if (/\.pstudio$/i.test(file.name) || file.type === 'application/json') {
      if (!confirmDiscard()) return;
      await loadProject(await file.text(), file.name);
      return;
    }
    const img = await loadImage(file);
    const c = imageToCanvas(img);
    if (asLayer) placeCanvas(c, baseName(file.name));
    else {
      if (!confirmDiscard()) return;
      openCanvasAsDocument(c, file.name);
    }
  } catch (err) {
    toast(`„${file.name}“ konnte nicht geöffnet werden: ${err.message}`, 'error');
  }
}

async function saveProject() {
  const d = app.doc;
  const data = {
    app: 'pytheas-studio',
    version: 1,
    width: d.width,
    height: d.height,
    active: d.active,
    layers: d.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blend: l.blend,
      text: l.text,
      image: l.canvas.toDataURL('image/png'),
    })),
  };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${d.name || 'Unbenannt'}.pstudio`);
  app.dirty = false;
  afterChange();
  toast('Projekt gespeichert (.pstudio – enthält alle Ebenen).');
}

function sanitizeText(t) {
  if (!t || typeof t !== 'object' || typeof t.text !== 'string') return null;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  return {
    text: t.text.slice(0, 10000),
    x: num(t.x, 0),
    y: num(t.y, 0),
    size: clamp(num(t.size, 48), 1, 2000),
    family: typeof t.family === 'string' ? t.family.slice(0, 60) : 'Arial',
    bold: !!t.bold,
    italic: !!t.italic,
    align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'left',
    color: isHexColor(t.color) ? t.color : '#000000',
  };
}

async function layersFromData(list, w, h, source) {
  const layers = [];
  for (const m of list) {
    const l = makeLayer(String(m.name || 'Ebene').slice(0, 60), w, h);
    l.visible = m.visible !== false;
    l.opacity = clamp(typeof m.opacity === 'number' ? m.opacity : 1, 0, 1);
    l.blend = BLEND_MODES.some((b) => b[0] === m.blend) ? m.blend : 'source-over';
    l.text = sanitizeText(m.text);
    const src = source(m);
    if (src) ctxOf(l.canvas).drawImage(await loadImage(src), 0, 0);
    layers.push(l);
  }
  return layers;
}

async function loadProject(text, fileName) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Datei ist beschädigt');
  }
  if (!data || data.app !== 'pytheas-studio' || !Array.isArray(data.layers) || !data.layers.length) throw new Error('Kein gültiges Pytheas-Studio-Projekt');
  const w = clamp(Math.round(+data.width) || 1, 1, MAX_SIZE);
  const h = clamp(Math.round(+data.height) || 1, 1, MAX_SIZE);
  const layers = await layersFromData(data.layers, w, h, (m) => (typeof m.image === 'string' && m.image.startsWith('data:image/') ? m.image : null));
  app.layerCounter = layers.length + 1;
  setDocument({ width: w, height: h, layers, active: clamp(data.active | 0, 0, layers.length - 1), selection: null, name: baseName(fileName) }, 'Projekt öffnen');
}

function dlgExport() {
  const d = app.doc;
  const info = (v) => `Ergebnis: ${Math.max(1, Math.round((d.width * v.scale) / 100))} × ${Math.max(1, Math.round((d.height * v.scale) / 100))} px`;
  openDialog({
    title: 'Exportieren als …',
    fields: [
      { key: 'format', type: 'select', label: 'Format', options: [['png', 'PNG – verlustfrei, mit Transparenz'], ['jpeg', 'JPEG – Fotos, kleine Dateien'], ['webp', 'WebP – modern, klein']], value: 'png' },
      { key: 'quality', type: 'range', label: 'Qualität', min: 10, max: 100, value: 90, unit: '%' },
      { key: 'scale', type: 'range', label: 'Größe', min: 5, max: 400, value: 100, unit: '%' },
      { key: 'name', type: 'text', label: 'Dateiname', value: d.name || 'Bild' },
      { key: 'info', type: 'note', value: info({ scale: 100 }) },
    ],
    okLabel: 'Exportieren',
    onInput(v, key, set) {
      if (key === 'scale') set('info', info(v));
    },
    async onOk(v) {
      let c = flattenCanvas();
      if (v.scale !== 100) c = resizeCanvas(c, (d.width * v.scale) / 100, (d.height * v.scale) / 100);
      if (v.format === 'jpeg') {
        const t = createCanvas(c.width, c.height);
        const g = ctxOf(t);
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, t.width, t.height);
        g.drawImage(c, 0, 0);
        c = t;
      }
      const blob = await canvasToBlob(c, 'image/' + v.format, v.quality / 100);
      // manche Browser (Safari) können kein WebP erzeugen und liefern PNG – Endung danach richten
      const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp' }[blob.type] || 'png';
      if (blob.type !== 'image/' + v.format) toast(`${v.format.toUpperCase()} wird von diesem Browser nicht unterstützt – als PNG exportiert.`);
      downloadBlob(blob, `${(v.name || 'Bild').replace(/[\\/:*?"<>|]+/g, '_')}.${ext}`);
      if (blob.type === 'image/' + v.format) toast(`Exportiert: ${c.width} × ${c.height} px, ${(blob.size / 1024).toFixed(0)} KB`);
    },
  });
}

/* ---------- Bearbeiten ---------- */

function selectionContent() {
  const L = activeLayer();
  const sel = app.doc.selection;
  const src = sel ? maskedCopy(L.canvas) : L.canvas;
  const b = sel ? sel.bounds : alphaBounds(src);
  if (!b) return null;
  return { canvas: cropCanvas(src, b.x, b.y, b.w, b.h), x: b.x, y: b.y };
}

async function copyToSystemClipboard(canvas) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) return;
    const blob = await canvasToBlob(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    /* Systemzwischenablage nicht erlaubt – interne Zwischenablage reicht */
  }
}

function copy(merged = false) {
  let clip;
  if (merged) {
    const flat = flattenCanvas();
    const sel = app.doc.selection;
    const src = sel ? clipCopy(flat, sel) : flat;
    const b = sel ? sel.bounds : { x: 0, y: 0, w: flat.width, h: flat.height };
    clip = { canvas: cropCanvas(src, b.x, b.y, b.w, b.h), x: b.x, y: b.y };
  } else clip = selectionContent();
  if (!clip) {
    toast('Nichts zum Kopieren – der Bereich ist leer.');
    return false;
  }
  app.clipboard = clip;
  copyToSystemClipboard(clip.canvas);
  toast(`Kopiert (${clip.canvas.width} × ${clip.canvas.height} px)`);
  return true;
}

function clipCopy(canvas, sel) {
  const c = cloneCanvas(canvas);
  const g = ctxOf(c);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(sel.mask, 0, 0);
  return c;
}

function cut() {
  if (!copy()) return;
  const L = pixelTarget();
  if (!L) return;
  const g = editable(L);
  if (app.doc.selection) {
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(app.doc.selection.mask, 0, 0);
    g.globalCompositeOperation = 'source-over';
  } else g.clearRect(0, 0, app.doc.width, app.doc.height);
  rasterizeText(L);
  commit('Ausschneiden');
}

function pasteInternal() {
  const c = app.clipboard;
  if (!c) {
    toast('Die Zwischenablage ist leer.');
    return;
  }
  placeCanvas(c.canvas, nextLayerName(), { x: c.x, y: c.y });
}

async function pasteFromMenu() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) return pasteBlob(await it.getType(type));
      }
    }
  } catch {
    /* kein Zugriff – interne Zwischenablage verwenden */
  }
  pasteInternal();
}

async function pasteBlob(blob) {
  const img = await loadImage(blob);
  const c = imageToCanvas(img);
  const internal = app.clipboard;
  if (internal && internal.canvas.width === c.width && internal.canvas.height === c.height) return pasteInternal();
  placeCanvas(c, nextLayerName());
}

function fillWith(color, label) {
  const L = pixelTarget();
  if (!L) return;
  const d = app.doc;
  const f = createCanvas(d.width, d.height);
  const g = ctxOf(f);
  g.fillStyle = color;
  g.fillRect(0, 0, d.width, d.height);
  if (d.selection) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(d.selection.mask, 0, 0);
  }
  editable(L).drawImage(f, 0, 0);
  rasterizeText(L);
  commit(label);
}

function clearArea() {
  const sel = app.doc.selection;
  if (!sel) {
    toast('Keine Auswahl – zum Löschen erst einen Bereich auswählen.');
    return;
  }
  const L = pixelTarget();
  if (!L) return;
  const g = editable(L);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(sel.mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  rasterizeText(L);
  commit('Löschen');
}

function dlgStrokeSelection() {
  const sel = app.doc.selection;
  if (!sel) return toast('Bitte zuerst eine Auswahl erstellen.');
  openDialog({
    title: 'Kontur füllen',
    fields: [
      { key: 'width', type: 'range', label: 'Breite', min: 1, max: 100, value: 4, unit: 'px' },
      { key: 'color', type: 'color', label: 'Farbe', value: app.fg },
      { key: 'pos', type: 'select', label: 'Position', options: [['inside', 'Innen'], ['center', 'Mitte'], ['outside', 'Außen']], value: 'center' },
    ],
    onOk(v) {
      const L = pixelTarget();
      if (!L) return;
      const bits = maskBits(sel.mask);
      const w = sel.mask.width, h = sel.mask.height;
      const inner = distanceField(bits.map((b) => 1 - b), w, h);
      const outer = distanceField(bits, w, h);
      const id = new ImageData(w, h);
      const { r, g, b } = hexToRgb(v.color);
      const half = v.width / 2;
      for (let i = 0; i < bits.length; i++) {
        // vorzeichenbehafteter Abstand zur Auswahlkante: innen negativ, außen positiv
        const sd = bits[i] ? -inner[i] + 0.5 : outer[i] - 0.5;
        let a;
        if (v.pos === 'inside') a = sd <= 0 ? clamp(v.width + sd + 0.5, 0, 1) : 0;
        else if (v.pos === 'outside') a = sd >= 0 ? clamp(v.width - sd + 0.5, 0, 1) : 0;
        else a = clamp(half - Math.abs(sd) + 0.5, 0, 1);
        if (a > 0) {
          const j = i * 4;
          id.data[j] = r;
          id.data[j + 1] = g;
          id.data[j + 2] = b;
          id.data[j + 3] = a * 255;
        }
      }
      editable(L).drawImage(canvasFromImageData(id), 0, 0);
      rasterizeText(L);
      commit('Kontur füllen');
    },
  });
}

/* ---------- Bild: Korrekturen & Filter ---------- */

// Dialog mit Live-Vorschau: render(Ebenen-Canvas, Werte) liefert das Ergebnis als Canvas
function liveDialog(title, fields, render, { histName = title, clip = true } = {}) {
  const L = pixelTarget();
  if (!L) return;
  const idx = app.doc.active;
  const src = L.canvas;
  let result = null;
  let previewOn = true;
  const compute = (vals) => {
    const out = render(src, vals);
    result = clip ? clipToSelection(src, out) : out;
    app.preview = { index: idx, canvas: result, mode: 'replace' };
    requestRender();
  };
  const run = debounce(compute, 35);
  openDialog({
    title,
    fields: [...fields, { key: '__preview', type: 'check', text: 'Vorschau', value: true }],
    dim: false,
    onInput(v, key) {
      if (key === '__preview') {
        previewOn = v.__preview;
        if (!previewOn) {
          run.cancel();
          app.preview = null;
          requestRender();
          return;
        }
      }
      if (previewOn) run({ ...v });
    },
    onOk(v) {
      run.cancel();
      compute(v);
      L.canvas = result;
      rasterizeText(L);
      app.preview = null;
      commit(histName);
    },
    onCancel() {
      run.cancel();
      app.preview = null;
      requestRender();
    },
  });
  compute(Object.fromEntries(fields.map((f) => [f.key, f.value])));
}

// Pixelfilter fn(ImageData, Werte) als render-Funktion; die Ausgangspixel werden einmal gelesen
function pixelRender(fn) {
  let base = null;
  return (src, vals) => {
    if (!base) base = readPixels(src);
    const id = copyImageData(base);
    fn(id, vals);
    return canvasFromImageData(id);
  };
}

function adjust(title, fields, fn, histName = title) {
  liveDialog(title, fields, pixelRender(fn), { histName });
}

function instant(fn, histName) {
  const L = pixelTarget();
  if (!L) return;
  const id = readPixels(L.canvas);
  fn(id);
  L.canvas = clipToSelection(L.canvas, canvasFromImageData(id));
  rasterizeText(L);
  commit(histName);
}

const dlgBrightness = () =>
  adjust('Helligkeit/Kontrast', [
    { key: 'brightness', type: 'range', label: 'Helligkeit', min: -150, max: 150, value: 0 },
    { key: 'contrast', type: 'range', label: 'Kontrast', min: -100, max: 100, value: 0 },
  ], Filters.brightnessContrast);

const dlgLevels = () =>
  adjust('Tonwertkorrektur', [
    { key: 'inBlack', type: 'range', label: 'Tiefen (Eingabe)', min: 0, max: 253, value: 0 },
    { key: 'gamma', type: 'range', label: 'Mitteltöne (Gamma)', min: 0.1, max: 5, step: 0.01, value: 1 },
    { key: 'inWhite', type: 'range', label: 'Lichter (Eingabe)', min: 2, max: 255, value: 255 },
    { key: 'outBlack', type: 'range', label: 'Tiefen (Ausgabe)', min: 0, max: 255, value: 0 },
    { key: 'outWhite', type: 'range', label: 'Lichter (Ausgabe)', min: 0, max: 255, value: 255 },
  ], Filters.levels);

const dlgHueSat = () =>
  adjust('Farbton/Sättigung', [
    { key: 'hue', type: 'range', label: 'Farbton', min: -180, max: 180, value: 0, unit: '°' },
    { key: 'saturation', type: 'range', label: 'Sättigung', min: -100, max: 100, value: 0 },
    { key: 'lightness', type: 'range', label: 'Helligkeit', min: -100, max: 100, value: 0 },
    { key: 'colorize', type: 'check', label: '', text: 'Färben', value: false },
  ], Filters.hueSaturation);

const dlgVibrance = () =>
  adjust('Dynamik', [{ key: 'amount', type: 'range', label: 'Dynamik', min: -100, max: 100, value: 30 }], Filters.vibrance);

const dlgTemperature = () =>
  adjust('Farbtemperatur', [
    { key: 'temp', type: 'range', label: 'Temperatur', min: -100, max: 100, value: 20 },
    { key: 'tint', type: 'range', label: 'Tönung', min: -100, max: 100, value: 0 },
  ], Filters.temperature);

const dlgThreshold = () =>
  adjust('Schwellenwert', [{ key: 'level', type: 'range', label: 'Schwellenwert', min: 1, max: 255, value: 128 }], Filters.threshold);

const dlgPosterize = () =>
  adjust('Tontrennung', [{ key: 'levels', type: 'range', label: 'Stufen', min: 2, max: 32, value: 4 }], Filters.posterize);

const dlgBlur = () =>
  liveDialog('Gaußscher Weichzeichner', [{ key: 'radius', type: 'range', label: 'Radius', min: 0.5, max: 100, step: 0.5, value: 4, unit: 'px' }], (src, v) => gaussianBlurCanvas(src, v.radius));

function dlgUnsharp() {
  let base = null;
  liveDialog('Unscharf maskieren', [
    { key: 'amount', type: 'range', label: 'Stärke', min: 1, max: 500, value: 100, unit: '%' },
    { key: 'radius', type: 'range', label: 'Radius', min: 0.5, max: 50, step: 0.5, value: 2, unit: 'px' },
    { key: 'threshold', type: 'range', label: 'Schwellenwert', min: 0, max: 255, value: 0 },
  ], (src, v) => {
    if (!base) base = readPixels(src);
    const id = copyImageData(base);
    Filters.unsharpMask(id, v, readPixels(gaussianBlurCanvas(src, v.radius)).data);
    return canvasFromImageData(id);
  });
}

const dlgNoise = () =>
  adjust('Rauschen hinzufügen', [
    { key: 'amount', type: 'range', label: 'Stärke', min: 1, max: 100, value: 15, unit: '%' },
    { key: 'mono', type: 'check', label: '', text: 'Monochromatisch', value: true },
  ], Filters.addNoise);

const dlgPixelate = () =>
  adjust('Mosaikeffekt', [{ key: 'size', type: 'range', label: 'Zellengröße', min: 2, max: 200, value: 12, unit: 'px' }], Filters.pixelate);

const dlgEmboss = () =>
  adjust('Relief', [{ key: 'strength', type: 'range', label: 'Stärke', min: 0.2, max: 5, step: 0.1, value: 1 }], Filters.emboss);

const dlgVignette = () =>
  adjust('Vignette', [
    { key: 'amount', type: 'range', label: 'Stärke', min: 0, max: 100, value: 60, unit: '%' },
    { key: 'size', type: 'range', label: 'Innenbereich', min: 0, max: 95, value: 40, unit: '%' },
  ], Filters.vignette);

/* ---------- Bild: Größe & Drehung ---------- */

function dlgImageSize() {
  const d = app.doc;
  const ratio = d.width / d.height;
  openDialog({
    title: 'Bildgröße',
    fields: [
      { key: 'w', type: 'number', label: 'Breite', min: 1, max: MAX_SIZE, value: d.width, unit: 'px' },
      { key: 'h', type: 'number', label: 'Höhe', min: 1, max: MAX_SIZE, value: d.height, unit: 'px' },
      { key: 'pct', type: 'number', label: 'Skalierung', min: 1, max: 1000, value: 100, unit: '%' },
      { key: 'keep', type: 'check', label: '', text: 'Proportionen beibehalten', value: true },
    ],
    onInput(v, key, set) {
      if (key === 'pct') {
        set('w', Math.max(1, Math.round((d.width * v.pct) / 100)));
        set('h', Math.max(1, Math.round((d.height * v.pct) / 100)));
      } else if (v.keep && key === 'w') set('h', Math.max(1, Math.round(v.w / ratio)));
      else if (v.keep && key === 'h') set('w', Math.max(1, Math.round(v.h * ratio)));
    },
    onOk(v) {
      if (v.w === d.width && v.h === d.height) return;
      resizeImage(v.w, v.h);
    },
  });
}

function dlgCanvasSize() {
  const d = app.doc;
  openDialog({
    title: 'Arbeitsfläche',
    fields: [
      { key: 'w', type: 'number', label: 'Breite', min: 1, max: MAX_SIZE, value: d.width, unit: 'px' },
      { key: 'h', type: 'number', label: 'Höhe', min: 1, max: MAX_SIZE, value: d.height, unit: 'px' },
      { key: 'anchor', type: 'anchor', label: 'Anker', value: '0.5,0.5' },
      { key: 'fill', type: 'select', label: 'Erweiterung', options: [['transparent', 'Transparent'], ['bg', 'Hintergrundfarbe'], ['white', 'Weiß'], ['black', 'Schwarz']], value: 'transparent' },
    ],
    onOk(v) {
      if (v.w === d.width && v.h === d.height) return;
      const [ax, ay] = v.anchor.split(',').map(Number);
      const fill = { transparent: null, bg: app.bg, white: '#ffffff', black: '#000000' }[v.fill];
      resizeCanvasArea(v.w, v.h, ax, ay, fill);
    },
  });
}

function cropToSelection() {
  const sel = app.doc.selection;
  if (!sel) return toast('Bitte zuerst eine Auswahl erstellen.');
  const b = sel.bounds;
  cropDocument(b.x, b.y, b.w, b.h);
}

function trimTransparent() {
  const b = alphaBounds(flattenCanvas());
  if (!b) return toast('Das Bild ist vollständig transparent.');
  if (b.w === app.doc.width && b.h === app.doc.height) return toast('Es gibt keine transparenten Ränder.');
  cropDocument(b.x, b.y, b.w, b.h, 'Zuschneiden');
}

/* ---------- Ebene ---------- */

function dlgRenameLayer() {
  const l = activeLayer();
  openDialog({
    title: 'Ebene umbenennen',
    fields: [{ key: 'name', type: 'text', label: 'Name', value: l.name }],
    onOk(v) {
      const name = v.name.trim();
      if (name) setLayerProp(app.doc.active, 'name', name.slice(0, 60), 'Ebene umbenennen');
    },
  });
}

function layerStyleDialog(title, fields, render) {
  liveDialog(title, fields, render, { clip: false });
}

function dlgDropShadow() {
  layerStyleDialog('Schlagschatten', [
    { key: 'color', type: 'color', label: 'Farbe', value: '#000000' },
    { key: 'opacity', type: 'range', label: 'Deckkraft', min: 0, max: 100, value: 60, unit: '%' },
    { key: 'angle', type: 'range', label: 'Winkel', min: -180, max: 180, value: 120, unit: '°' },
    { key: 'distance', type: 'range', label: 'Distanz', min: 0, max: 200, value: 12, unit: 'px' },
    { key: 'size', type: 'range', label: 'Größe', min: 0, max: 150, value: 16, unit: 'px' },
  ], (src, v) => {
    const c = createCanvas(src.width, src.height);
    const g = ctxOf(c);
    const rad = (v.angle * Math.PI) / 180;
    g.shadowColor = rgba(v.color, v.opacity / 100);
    g.shadowBlur = v.size;
    g.shadowOffsetX = -Math.cos(rad) * v.distance;
    g.shadowOffsetY = Math.sin(rad) * v.distance;
    g.drawImage(src, 0, 0);
    return c;
  });
}

function dlgOuterGlow() {
  layerStyleDialog('Schein nach außen', [
    { key: 'color', type: 'color', label: 'Farbe', value: '#ffd54a' },
    { key: 'opacity', type: 'range', label: 'Deckkraft', min: 0, max: 100, value: 80, unit: '%' },
    { key: 'size', type: 'range', label: 'Größe', min: 1, max: 150, value: 20, unit: 'px' },
  ], (src, v) => {
    const c = createCanvas(src.width, src.height);
    const g = ctxOf(c);
    g.shadowColor = rgba(v.color, v.opacity / 100);
    g.shadowBlur = v.size;
    g.drawImage(src, 0, 0);
    g.drawImage(src, 0, 0);
    g.shadowColor = 'transparent';
    g.globalCompositeOperation = 'source-over';
    return c;
  });
}

function dlgLayerStroke() {
  layerStyleDialog('Kontur', [
    { key: 'size', type: 'range', label: 'Größe', min: 1, max: 60, value: 4, unit: 'px' },
    { key: 'color', type: 'color', label: 'Farbe', value: '#ffffff' },
  ], (src, v) => {
    const id = readPixels(src);
    const w = id.width, h = id.height;
    const inside = new Uint8Array(w * h);
    for (let i = 0; i < inside.length; i++) inside[i] = id.data[i * 4 + 3] >= 128 ? 1 : 0;
    const dist = distanceField(inside, w, h);
    const out = new ImageData(w, h);
    const { r, g, b } = hexToRgb(v.color);
    for (let i = 0; i < inside.length; i++) {
      const a = dist[i] === 0 ? 1 : clamp(v.size + 0.5 - dist[i], 0, 1);
      if (a > 0) {
        const j = i * 4;
        out.data[j] = r;
        out.data[j + 1] = g;
        out.data[j + 2] = b;
        out.data[j + 3] = a * 255;
      }
    }
    const c = canvasFromImageData(out);
    ctxOf(c).drawImage(src, 0, 0);
    return c;
  });
}

function rasterizeLayer() {
  const l = activeLayer();
  if (!l.text) return toast('Die aktive Ebene ist keine Textebene.');
  rasterizeText(l);
  commit('Text rastern');
}

/* ---------- Auswahl ---------- */

function dlgFeather() {
  if (!hasSelection()) return toast('Bitte zuerst eine Auswahl erstellen.');
  openDialog({
    title: 'Weiche Auswahlkante',
    fields: [{ key: 'r', type: 'range', label: 'Radius', min: 0.5, max: 250, step: 0.5, value: 8, unit: 'px' }],
    onOk(v) {
      setSelection(featherMask(app.doc.selection.mask, v.r), 'Weiche Auswahlkante');
    },
  });
}

function dlgGrow(expand) {
  if (!hasSelection()) return toast('Bitte zuerst eine Auswahl erstellen.');
  openDialog({
    title: expand ? 'Auswahl erweitern' : 'Auswahl verkleinern',
    fields: [{ key: 'r', type: 'range', label: expand ? 'Erweitern um' : 'Verkleinern um', min: 1, max: 200, value: 8, unit: 'px' }],
    onOk(v) {
      setSelection(growMask(app.doc.selection.mask, expand ? v.r : -v.r), expand ? 'Auswahl erweitern' : 'Auswahl verkleinern');
    },
  });
}

/* ---------- Hilfe ---------- */

function dlgShortcuts() {
  const rows = [];
  for (const id of TOOL_GROUPS.flat()) rows.push([TOOL_DEFS[id].name, TOOL_DEFS[id].key.toUpperCase()]);
  rows.push(
    ['Pinselgröße kleiner / größer', ', oder [  ·  . oder ]'],
    ['Deckkraft des Werkzeugs', '1 … 0 (10 % … 100 %)'],
    ['Vorder-/Hintergrundfarbe tauschen', 'X'],
    ['Standardfarben', 'D'],
    ['Temporär verschieben (Hand)', 'Leertaste gedrückt halten'],
    ['Zoomen', 'Strg + Mausrad · Pinch'],
    ['Bedienfelder ein/aus', 'Tab'],
    ['Auswahl hinzufügen / abziehen', 'Umschalt / Alt beim Ziehen']
  );
  for (const it of menuItems) if (it.sc || it.scDisplay) rows.push([it.label.replace(' …', ''), comboLabel(it.sc || it.scDisplay)]);
  const table = el('div', { class: 'shortcut-table' }, rows.map(([a, b]) => el('div', { class: 'sc-row' }, el('span', {}, a), el('kbd', {}, b))));
  openDialog({ title: 'Tastenkürzel', content: table, okLabel: 'Schließen', noCancel: true, wide: true });
}

function dlgAbout() {
  const content = el(
    'div',
    { class: 'about' },
    el('p', {}, el('strong', {}, 'Pytheas Studio'), ' ist eine eigenständige Bildbearbeitung, die vollständig im Browser läuft. Deine Bilder verlassen dein Gerät nicht – es gibt keinen Server, kein Konto und keine Installation.'),
    el('p', {}, 'Ebenen mit Füllmethoden, Auswahl- und Malwerkzeuge, Text, Formen, Verläufe, Korrekturen, Filter, Frei transformieren und ein Protokoll mit 40 Schritten.'),
    el('p', { class: 'muted' }, 'Unabhängiges Projekt des Pytheas Institute. Keine Verbindung zu Adobe Inc.; Photoshop ist eine Marke von Adobe.')
  );
  openDialog({ title: 'Über Pytheas Studio', content, okLabel: 'Schließen', noCancel: true });
}

function togglePanels() {
  if (window.matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('panels-open');
  else document.body.classList.toggle('panels-hidden');
  setTimeout(() => {
    resizeOverlay();
    requestOverlay();
  }, 0);
}

/* ---------- Menüstruktur ---------- */

const needSel = { enabled: hasSelection };

const MENUS = [
  {
    label: 'Datei',
    items: [
      { label: 'Neu …', sc: 'mod+alt+n', action: dlgNew },
      { label: 'Öffnen …', sc: 'mod+o', action: () => $('#file-open').click() },
      { label: 'Platzieren (als Ebene) …', action: () => $('#file-place').click() },
      '-',
      { label: 'Projekt speichern (.pstudio)', sc: 'mod+s', action: saveProject },
      { label: 'Exportieren als …', sc: 'mod+shift+s', action: dlgExport },
    ],
  },
  {
    label: 'Bearbeiten',
    items: [
      { label: 'Rückgängig', sc: 'mod+z', action: undo, enabled: () => app.hIndex > 0, keepInteractions: true },
      { label: 'Wiederholen', sc: 'mod+shift+z', scAlt: 'mod+y', action: redo, enabled: () => app.hIndex < app.history.length - 1, keepInteractions: true },
      '-',
      { label: 'Ausschneiden', sc: 'mod+x', action: cut },
      { label: 'Kopieren', sc: 'mod+c', action: () => copy(false) },
      { label: 'Auf eine Ebene reduziert kopieren', sc: 'mod+shift+c', action: () => copy(true) },
      { label: 'Einfügen', scDisplay: 'mod+v', action: pasteFromMenu },
      { label: 'Löschen', sc: 'delete', action: clearArea, ...needSel },
      '-',
      { label: 'Fläche mit Vordergrundfarbe füllen', sc: 'alt+backspace', action: () => fillWith(app.fg, 'Fläche füllen') },
      { label: 'Fläche mit Hintergrundfarbe füllen', sc: 'mod+backspace', action: () => fillWith(app.bg, 'Fläche füllen') },
      { label: 'Kontur füllen …', action: dlgStrokeSelection, ...needSel },
      '-',
      { label: 'Frei transformieren', sc: 'mod+alt+t', scAlt: 'mod+t', action: () => Transform.begin() },
      {
        label: 'Transformieren',
        items: [
          { label: 'Horizontal spiegeln', action: () => quickTransform((s) => (s.sx = -s.sx), 'Horizontal spiegeln') },
          { label: 'Vertikal spiegeln', action: () => quickTransform((s) => (s.sy = -s.sy), 'Vertikal spiegeln') },
          { label: '90° im UZS drehen', action: () => quickTransform((s) => (s.angle += Math.PI / 2), '90° drehen') },
          { label: '90° gegen UZS drehen', action: () => quickTransform((s) => (s.angle -= Math.PI / 2), '90° drehen') },
          { label: '180° drehen', action: () => quickTransform((s) => (s.angle += Math.PI), '180° drehen') },
        ],
      },
    ],
  },
  {
    label: 'Bild',
    items: [
      {
        label: 'Korrekturen',
        items: [
          { label: 'Helligkeit/Kontrast …', action: dlgBrightness },
          { label: 'Tonwertkorrektur …', sc: 'mod+l', action: dlgLevels },
          { label: 'Farbton/Sättigung …', sc: 'mod+u', action: dlgHueSat },
          { label: 'Dynamik …', action: dlgVibrance },
          { label: 'Farbtemperatur …', action: dlgTemperature },
          '-',
          { label: 'Auto-Kontrast', sc: 'mod+shift+l', action: () => instant(Filters.autoContrast, 'Auto-Kontrast') },
          { label: 'Sättigung verringern', sc: 'mod+shift+u', action: () => instant(Filters.desaturate, 'Sättigung verringern') },
          { label: 'Umkehren', sc: 'mod+i', action: () => instant(Filters.invert, 'Umkehren') },
          { label: 'Sepia', action: () => instant(Filters.sepia, 'Sepia') },
          { label: 'Schwellenwert …', action: dlgThreshold },
          { label: 'Tontrennung …', action: dlgPosterize },
        ],
      },
      '-',
      { label: 'Bildgröße …', sc: 'mod+alt+i', action: dlgImageSize },
      { label: 'Arbeitsfläche …', sc: 'mod+alt+c', action: dlgCanvasSize },
      {
        label: 'Bilddrehung',
        items: [
          { label: '90° im UZS', action: () => rotateImage(90) },
          { label: '90° gegen UZS', action: () => rotateImage(-90) },
          { label: '180°', action: () => rotateImage(180) },
          '-',
          { label: 'Arbeitsfläche horizontal spiegeln', action: () => flipImage(true) },
          { label: 'Arbeitsfläche vertikal spiegeln', action: () => flipImage(false) },
        ],
      },
      '-',
      { label: 'Freistellen (auf Auswahl)', action: cropToSelection, ...needSel },
      { label: 'Transparente Ränder zuschneiden', action: trimTransparent },
    ],
  },
  {
    label: 'Ebene',
    items: [
      { label: 'Neue Ebene', sc: 'mod+shift+alt+n', action: newLayer },
      { label: 'Ebene duplizieren', sc: 'mod+j', action: duplicateLayer },
      { label: 'Ebene löschen', action: () => deleteLayer(), enabled: () => app.doc.layers.length > 1 },
      { label: 'Ebene umbenennen …', action: dlgRenameLayer },
      '-',
      {
        label: 'Ebenenstil',
        items: [
          { label: 'Schlagschatten …', action: dlgDropShadow },
          { label: 'Schein nach außen …', action: dlgOuterGlow },
          { label: 'Kontur …', action: dlgLayerStroke },
        ],
      },
      '-',
      { label: 'Ebene nach oben', sc: 'mod+]', action: () => moveLayer(app.doc.active, app.doc.active + 1) },
      { label: 'Ebene nach unten', sc: 'mod+[', action: () => moveLayer(app.doc.active, app.doc.active - 1) },
      '-',
      { label: 'Mit darunterliegender Ebene zusammenfügen', sc: 'mod+e', action: mergeDown, enabled: () => app.doc.active > 0 },
      { label: 'Sichtbare auf eine Ebene reduzieren', sc: 'mod+shift+e', action: mergeVisible },
      { label: 'Auf Hintergrundebene reduzieren', action: flattenImage },
      '-',
      { label: 'Text rastern', action: rasterizeLayer, enabled: () => !!activeLayer().text },
    ],
  },
  {
    label: 'Auswahl',
    items: [
      { label: 'Alles auswählen', sc: 'mod+a', action: selectAll },
      { label: 'Auswahl aufheben', sc: 'mod+d', action: deselect, ...needSel },
      { label: 'Auswahl umkehren', sc: 'shift+f7', action: invertSelection },
      '-',
      { label: 'Ebenenpixel auswählen', action: selectLayerPixels },
      '-',
      { label: 'Weiche Auswahlkante …', sc: 'shift+f6', action: dlgFeather, ...needSel },
      { label: 'Auswahl erweitern …', action: () => dlgGrow(true), ...needSel },
      { label: 'Auswahl verkleinern …', action: () => dlgGrow(false), ...needSel },
    ],
  },
  {
    label: 'Filter',
    items: [
      { label: 'Gaußscher Weichzeichner …', action: dlgBlur },
      { label: 'Unscharf maskieren …', action: dlgUnsharp },
      { label: 'Scharfzeichnen', action: () => instant(Filters.sharpen, 'Scharfzeichnen') },
      '-',
      { label: 'Rauschen hinzufügen …', action: dlgNoise },
      { label: 'Mosaikeffekt …', action: dlgPixelate },
      { label: 'Relief …', action: dlgEmboss },
      { label: 'Konturen finden', action: () => instant(Filters.findEdges, 'Konturen finden') },
      { label: 'Vignette …', action: dlgVignette },
    ],
  },
  {
    label: 'Ansicht',
    items: [
      { label: 'Einzoomen', sc: 'mod+plus', action: () => zoomStep(1), keepInteractions: true },
      { label: 'Auszoomen', sc: 'mod+minus', action: () => zoomStep(-1), keepInteractions: true },
      { label: 'Ganzes Bild', sc: 'mod+0', action: fitView, keepInteractions: true },
      { label: '100 %', sc: 'mod+1', action: actualPixels, keepInteractions: true },
      '-',
      { label: 'Bedienfelder ein/aus', sc: 'tab', action: togglePanels, keepInteractions: true },
    ],
  },
  {
    label: 'Hilfe',
    items: [
      { label: 'Tastenkürzel …', sc: 'f1', action: dlgShortcuts, keepInteractions: true },
      { label: 'Über Pytheas Studio', action: dlgAbout, keepInteractions: true },
    ],
  },
];
