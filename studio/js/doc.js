'use strict';
/* Pytheas Studio — Dokument, Ebenen, Protokoll (Undo/Redo) und Auswahl */

const HISTORY_LIMIT = 40;
const MAX_SIZE = 8192;

const BLEND_MODES = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiplizieren'],
  ['screen', 'Negativ multiplizieren'],
  ['overlay', 'Ineinanderkopieren'],
  ['darken', 'Abdunkeln'],
  ['lighten', 'Aufhellen'],
  ['color-dodge', 'Farbig abwedeln'],
  ['color-burn', 'Farbig nachbelichten'],
  ['hard-light', 'Hartes Licht'],
  ['soft-light', 'Weiches Licht'],
  ['difference', 'Differenz'],
  ['exclusion', 'Ausschluss'],
  ['hue', 'Farbton'],
  ['saturation', 'Sättigung'],
  ['color', 'Farbe'],
  ['luminosity', 'Luminanz'],
];

const app = {
  doc: null,
  history: [],
  hIndex: -1,
  dirty: false,
  fg: '#000000',
  bg: '#ffffff',
  tool: 'brush',
  zoom: 1,
  panX: 0,
  panY: 0,
  preview: null, // { index, canvas, mode: 'replace' | 'above' | 'hide' }
  selOffset: null, // { dx, dy } während eine Auswahl verschoben wird
  hover: null, // Mausposition in Dokumentkoordinaten
  clipboard: null, // { canvas, x, y }
  layerCounter: 1,
};

let layerUid = 1;

function makeLayer(name, w, h) {
  return {
    id: layerUid++,
    name,
    canvas: createCanvas(w, h),
    visible: true,
    opacity: 1,
    blend: 'source-over',
    text: null,
  };
}

function nextLayerName(prefix = 'Ebene') {
  return `${prefix} ${app.layerCounter++}`;
}

function activeLayer() {
  return app.doc.layers[app.doc.active];
}

// Vor jeder Pixeländerung aufrufen: Canvas, die im Protokoll steckt, wird erst kopiert (Copy-on-Write)
function editable(layer) {
  if (layer.canvas.__shared) layer.canvas = cloneCanvas(layer.canvas);
  return ctxOf(layer.canvas);
}

function rasterizeText(layer) {
  layer.text = null;
}

/* ---------- Protokoll ---------- */

function snapshot(name) {
  const d = app.doc;
  for (const l of d.layers) l.canvas.__shared = true;
  return {
    name,
    width: d.width,
    height: d.height,
    active: d.active,
    selection: d.selection,
    layers: d.layers.map((l) => ({ ...l, text: l.text ? { ...l.text } : null })),
  };
}

function commit(name) {
  const h = app.history;
  h.splice(app.hIndex + 1);
  h.push(snapshot(name));
  while (h.length > HISTORY_LIMIT) h.shift();
  app.hIndex = h.length - 1;
  app.dirty = true;
  afterChange();
}

function resetHistory(name) {
  app.history = [snapshot(name)];
  app.hIndex = 0;
  app.dirty = false;
  afterChange();
}

function restoreState(i) {
  const s = app.history[i];
  if (!s) return;
  cancelInteractions();
  const d = app.doc;
  const resized = d.width !== s.width || d.height !== s.height;
  d.width = s.width;
  d.height = s.height;
  d.active = s.active;
  d.selection = s.selection;
  d.layers = s.layers.map((m) => ({ ...m, text: m.text ? { ...m.text } : null }));
  app.hIndex = i;
  if (resized) onDocResized();
  afterChange();
}

function undo() {
  if (app.hIndex > 0) restoreState(app.hIndex - 1);
}

function redo() {
  if (app.hIndex < app.history.length - 1) restoreState(app.hIndex + 1);
}

/* ---------- Dokument ---------- */

function newDocument(w, h, fill, name = 'Unbenannt') {
  cancelInteractions();
  w = clamp(Math.round(w), 1, MAX_SIZE);
  h = clamp(Math.round(h), 1, MAX_SIZE);
  app.layerCounter = 1;
  const bgLayer = makeLayer('Hintergrund', w, h);
  if (fill) {
    const g = ctxOf(bgLayer.canvas);
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  app.doc = { width: w, height: h, layers: [bgLayer], active: 0, selection: null, name };
  resetHistory('Neu');
  fitView();
}

function setDocument(doc, histName) {
  cancelInteractions();
  app.doc = doc;
  resetHistory(histName);
  fitView();
}

function flattenCanvas() {
  const c = createCanvas(app.doc.width, app.doc.height);
  compositeTo(ctxOf(c), true);
  return c;
}

function cropDocument(x, y, w, h, name = 'Freistellen') {
  x = Math.round(x);
  y = Math.round(y);
  w = clamp(Math.round(w), 1, MAX_SIZE);
  h = clamp(Math.round(h), 1, MAX_SIZE);
  const d = app.doc;
  for (const l of d.layers) {
    const c = createCanvas(w, h);
    ctxOf(c).drawImage(l.canvas, -x, -y);
    l.canvas = c;
    if (l.text) {
      l.text.x -= x;
      l.text.y -= y;
    }
  }
  d.width = w;
  d.height = h;
  d.selection = null;
  onDocResized();
  commit(name);
}

function resizeImage(w, h) {
  w = clamp(Math.round(w), 1, MAX_SIZE);
  h = clamp(Math.round(h), 1, MAX_SIZE);
  const d = app.doc;
  for (const l of d.layers) {
    l.canvas = resizeCanvas(l.canvas, w, h);
    rasterizeText(l);
  }
  d.width = w;
  d.height = h;
  d.selection = null;
  onDocResized();
  commit('Bildgröße');
}

function resizeCanvasArea(w, h, ax, ay, fill) {
  w = clamp(Math.round(w), 1, MAX_SIZE);
  h = clamp(Math.round(h), 1, MAX_SIZE);
  const d = app.doc;
  const ox = Math.round((w - d.width) * ax);
  const oy = Math.round((h - d.height) * ay);
  d.layers.forEach((l, i) => {
    const c = createCanvas(w, h);
    const g = ctxOf(c);
    if (i === 0 && fill) {
      g.fillStyle = fill;
      g.fillRect(0, 0, w, h);
      g.clearRect(ox, oy, d.width, d.height);
    }
    g.drawImage(l.canvas, ox, oy);
    l.canvas = c;
    if (l.text) {
      l.text.x += ox;
      l.text.y += oy;
    }
  });
  d.width = w;
  d.height = h;
  d.selection = null;
  onDocResized();
  commit('Arbeitsfläche');
}

function rotateImage(deg) {
  const d = app.doc;
  const swap = deg === 90 || deg === -90;
  const w = swap ? d.height : d.width;
  const h = swap ? d.width : d.height;
  for (const l of d.layers) {
    const c = createCanvas(w, h);
    const g = ctxOf(c);
    g.translate(w / 2, h / 2);
    g.rotate((deg * Math.PI) / 180);
    g.drawImage(l.canvas, -d.width / 2, -d.height / 2);
    l.canvas = c;
    rasterizeText(l);
  }
  d.width = w;
  d.height = h;
  d.selection = null;
  onDocResized();
  commit(deg === 180 ? 'Bild 180° drehen' : deg > 0 ? 'Bild 90° im UZS drehen' : 'Bild 90° gegen UZS drehen');
}

function flipImage(horizontal) {
  const d = app.doc;
  for (const l of d.layers) {
    const c = createCanvas(d.width, d.height);
    const g = ctxOf(c);
    if (horizontal) g.setTransform(-1, 0, 0, 1, d.width, 0);
    else g.setTransform(1, 0, 0, -1, 0, d.height);
    g.drawImage(l.canvas, 0, 0);
    l.canvas = c;
    rasterizeText(l);
  }
  if (d.selection) {
    const m = blankMask();
    const g = ctxOf(m);
    if (horizontal) g.setTransform(-1, 0, 0, 1, d.width, 0);
    else g.setTransform(1, 0, 0, -1, 0, d.height);
    g.drawImage(d.selection.mask, 0, 0);
    d.selection = buildSelection(m);
  }
  commit(horizontal ? 'Arbeitsfläche horizontal spiegeln' : 'Arbeitsfläche vertikal spiegeln');
}

/* ---------- Ebenen ---------- */

function addLayer(name = nextLayerName(), index = app.doc.active + 1) {
  const d = app.doc;
  const l = makeLayer(name, d.width, d.height);
  d.layers.splice(index, 0, l);
  d.active = index;
  return l;
}

function newLayer() {
  addLayer();
  commit('Neue Ebene');
}

function deleteLayer(i = app.doc.active) {
  const d = app.doc;
  if (d.layers.length <= 1) {
    toast('Die letzte Ebene kann nicht gelöscht werden.');
    return;
  }
  d.layers.splice(i, 1);
  d.active = clamp(i - 1, 0, d.layers.length - 1);
  commit('Ebene löschen');
}

function duplicateLayer() {
  const d = app.doc;
  const src = activeLayer();
  if (d.selection) {
    const content = maskedCopy(src.canvas);
    const l = addLayer(nextLayerName());
    ctxOf(l.canvas).drawImage(content, 0, 0);
    commit('Ebene durch Kopie');
    return;
  }
  const l = addLayer(src.name + ' Kopie');
  ctxOf(l.canvas).drawImage(src.canvas, 0, 0);
  l.opacity = src.opacity;
  l.blend = src.blend;
  l.visible = src.visible;
  l.text = src.text ? { ...src.text } : null;
  commit('Ebene duplizieren');
}

function moveLayer(from, to) {
  const d = app.doc;
  to = clamp(to, 0, d.layers.length - 1);
  if (from === to) return;
  const [l] = d.layers.splice(from, 1);
  d.layers.splice(to, 0, l);
  d.active = to;
  commit('Ebene verschieben');
}

function mergeDown() {
  const d = app.doc;
  const i = d.active;
  if (i === 0) {
    toast('Unter dieser Ebene liegt keine weitere Ebene.');
    return;
  }
  const upper = d.layers[i];
  const lower = d.layers[i - 1];
  if (upper.visible) {
    const g = editable(lower);
    g.globalAlpha = upper.opacity;
    g.globalCompositeOperation = upper.blend;
    g.drawImage(upper.canvas, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    rasterizeText(lower);
  }
  d.layers.splice(i, 1);
  d.active = i - 1;
  commit('Auf eine Ebene reduzieren');
}

function mergeVisible() {
  const d = app.doc;
  const visible = d.layers.filter((l) => l.visible);
  if (visible.length < 2) {
    toast('Es sind weniger als zwei Ebenen sichtbar.');
    return;
  }
  const merged = makeLayer('Zusammengeführt', d.width, d.height);
  compositeLayers(ctxOf(merged.canvas), visible);
  const insertAt = d.layers.indexOf(visible[0]);
  d.layers = d.layers.filter((l) => !l.visible);
  d.layers.splice(insertAt, 0, merged);
  d.active = insertAt;
  commit('Sichtbare auf eine Ebene reduzieren');
}

function flattenImage() {
  const d = app.doc;
  const l = makeLayer('Hintergrund', d.width, d.height);
  ctxOf(l.canvas).drawImage(flattenCanvas(), 0, 0);
  d.layers = [l];
  d.active = 0;
  commit('Auf Hintergrundebene reduzieren');
}

function setLayerProp(i, prop, value, histName) {
  const l = app.doc.layers[i];
  if (!l || l[prop] === value) return;
  l[prop] = value;
  commit(histName);
}

/* ---------- Auswahl ---------- */

function blankMask() {
  return createCanvas(app.doc.width, app.doc.height);
}

function rectMask(r) {
  const m = blankMask();
  const g = ctxOf(m);
  g.fillStyle = '#fff';
  g.fillRect(r.x, r.y, r.w, r.h);
  return m;
}

function ellipseMask(r) {
  const m = blankMask();
  const g = ctxOf(m);
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  g.fill();
  return m;
}

function polygonMask(pts) {
  const m = blankMask();
  const g = ctxOf(m);
  g.fillStyle = '#fff';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
  return m;
}

function maskFromBits(bits, w, h) {
  const id = new ImageData(w, h);
  const d = id.data;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) {
      const j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 255;
    }
  }
  return canvasFromImageData(id);
}

function maskFromAlpha(canvas) {
  const m = cloneCanvas(canvas);
  const g = ctxOf(m);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, m.width, m.height);
  return m;
}

function maskBits(mask) {
  const d = readPixels(mask).data;
  const bits = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < bits.length; i++) bits[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return bits;
}

// Erzeugt Auswahlobjekt mit Umriss (für die "laufenden Ameisen") und Begrenzung.
// hint = { path, bounds } spart das Auslesen der Maske bei exakt bekannten Formen.
function buildSelection(mask, hint) {
  if (hint) return hint.bounds.w > 0 && hint.bounds.h > 0 ? { mask, path: hint.path, bounds: hint.bounds } : null;
  const w = mask.width, h = mask.height;
  const d = readPixels(mask).data;
  const bits = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (d[i * 4 + 3] >= 128) {
        bits[i] = 1;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const path = new Path2D();
  // waagerechte Kanten: Unterschied zwischen Zeile y-1 und y, zu Läufen zusammengefasst
  for (let y = y0; y <= y1 + 1; y++) {
    const ra = (y - 1) * w, rb = y * w;
    let start = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      let edge = false;
      if (x <= x1) {
        const a = y > y0 ? bits[ra + x] : 0;
        const b = y <= y1 ? bits[rb + x] : 0;
        edge = a !== b;
      }
      if (edge && start < 0) start = x;
      else if (!edge && start >= 0) {
        path.moveTo(start, y);
        path.lineTo(x, y);
        start = -1;
      }
    }
  }
  // senkrechte Kanten zeilenweise, Läufe je Spalte werden offen gehalten
  const runStart = new Int32Array(x1 - x0 + 2).fill(-1);
  for (let y = y0; y <= y1 + 1; y++) {
    const r = y * w;
    for (let x = x0; x <= x1 + 1; x++) {
      let edge = false;
      if (y <= y1) {
        const a = x > x0 ? bits[r + x - 1] : 0;
        const b = x <= x1 ? bits[r + x] : 0;
        edge = a !== b;
      }
      const k = x - x0;
      if (edge && runStart[k] < 0) runStart[k] = y;
      else if (!edge && runStart[k] >= 0) {
        path.moveTo(x, runStart[k]);
        path.lineTo(x, y);
        runStart[k] = -1;
      }
    }
  }
  return { mask, path, bounds: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

// Exakter Umriss für Rechteck/Ellipse (auf das Dokument begrenzt)
function shapeHint(r, ellipse) {
  const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
  const x1 = Math.min(app.doc.width, r.x + r.w), y1 = Math.min(app.doc.height, r.y + r.h);
  const path = new Path2D();
  if (ellipse) path.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  else path.rect(x0, y0, x1 - x0, y1 - y0);
  return { path, bounds: { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) } };
}

function setSelection(mask, label, hint) {
  const sel = mask ? buildSelection(mask, hint) : null;
  if (!sel && !app.doc.selection) return;
  if (mask && !sel) toast('Es sind keine Pixel zu mehr als 50 % ausgewählt.');
  app.doc.selection = sel;
  commit(label || (sel ? 'Auswahl' : 'Auswahl aufheben'));
}

function applySelectionMode(mask, mode, label, hint) {
  const cur = app.doc.selection;
  if (mode === 'new' || !cur) {
    const keep = mode === 'new' || mode === 'add';
    return setSelection(keep ? mask : null, label, keep ? hint : undefined);
  }
  const result = cloneCanvas(cur.mask);
  const g = ctxOf(result);
  g.globalCompositeOperation = { add: 'source-over', sub: 'destination-out', int: 'destination-in' }[mode];
  g.drawImage(mask, 0, 0);
  setSelection(result, label);
}

function selectAll() {
  const r = { x: 0, y: 0, w: app.doc.width, h: app.doc.height };
  setSelection(rectMask(r), 'Alles auswählen', shapeHint(r, false));
}

function deselect() {
  if (app.doc.selection) setSelection(null, 'Auswahl aufheben');
}

function invertSelection() {
  const m = rectMask({ x: 0, y: 0, w: app.doc.width, h: app.doc.height });
  if (app.doc.selection) {
    const g = ctxOf(m);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(app.doc.selection.mask, 0, 0);
  }
  setSelection(m, 'Auswahl umkehren');
}

function featherMask(mask, radius) {
  return gaussianBlurCanvas(mask, radius);
}

function growMask(mask, r) {
  const w = mask.width, h = mask.height;
  const bits = maskBits(mask);
  const out = new Uint8Array(w * h);
  if (r > 0) {
    const dist = distanceField(bits, w, h);
    for (let i = 0; i < out.length; i++) out[i] = dist[i] <= r ? 1 : 0;
  } else {
    const outside = bits.map((b) => 1 - b);
    const dist = distanceField(outside, w, h);
    for (let i = 0; i < out.length; i++) out[i] = dist[i] > -r ? 1 : 0;
  }
  return maskFromBits(out, w, h);
}

function selectLayerPixels() {
  setSelection(maskFromAlpha(activeLayer().canvas), 'Ebenenpixel auswählen');
}

function maskHit(mask, p) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  return ctxOf(mask).getImageData(x, y, 1, 1).data[3] >= 128;
}

// Inhalt einer Canvas innerhalb der Auswahl
function maskedCopy(canvas) {
  const c = cloneCanvas(canvas);
  const sel = app.doc.selection;
  if (sel) {
    const g = ctxOf(c);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(sel.mask, 0, 0);
  }
  return c;
}

// Außerhalb der Auswahl bleibt das Original erhalten, innen gilt das Ergebnis
function clipToSelection(original, result) {
  const sel = app.doc.selection;
  if (!sel) return result;
  const out = cloneCanvas(original);
  const g = ctxOf(out);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(sel.mask, 0, 0);
  const inner = cloneCanvas(result);
  const gi = ctxOf(inner);
  gi.globalCompositeOperation = 'destination-in';
  gi.drawImage(sel.mask, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(inner, 0, 0);
  return out;
}
