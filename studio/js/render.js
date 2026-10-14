'use strict';
/* Pytheas Studio — Darstellung: Ebenen zusammensetzen, Zoom/Ansicht, Überlagerung */

const viewport = $('#viewport');
const viewCanvas = $('#view-canvas');
const overlay = $('#overlay');
const viewCtx = ctxOf(viewCanvas);
const overlayCtx = ctxOf(overlay);

const ZOOM_STEPS = [0.03, 0.05, 0.0625, 0.083, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

let renderQueued = false;
let overlayQueued = false;
let renderFull = false;
let renderDirty = null;
let antsPhase = 0;

function unionRect(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// rect (optional): nur dieser Dokumentbereich hat sich geändert
function requestRender(rect) {
  if (rect) renderDirty = renderDirty ? unionRect(renderDirty, rect) : { ...rect };
  else renderFull = true;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const r = renderFull ? null : renderDirty;
    renderFull = false;
    renderDirty = null;
    renderComposite(r);
    renderOverlay();
  });
}

function requestOverlay() {
  if (overlayQueued || renderQueued) return;
  overlayQueued = true;
  requestAnimationFrame(() => {
    overlayQueued = false;
    renderOverlay();
  });
}

function drawLayerInto(g, canvas, layer, r) {
  g.globalAlpha = layer.opacity;
  g.globalCompositeOperation = layer.blend;
  if (r) g.drawImage(canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  else g.drawImage(canvas, 0, 0);
}

function compositeLayers(g, layers) {
  for (const l of layers) drawLayerInto(g, l.canvas, l);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

// Setzt alle sichtbaren Ebenen zusammen; optional inkl. Werkzeugvorschau und nur im Bereich r
function compositeTo(g, noPreview = false, r = null) {
  const d = app.doc;
  const pv = noPreview ? null : app.preview;
  d.layers.forEach((l, i) => {
    const isPv = pv && pv.index === i;
    if (l.visible) {
      if (isPv && pv.mode === 'replace') drawLayerInto(g, pv.canvas, l, r);
      else if (!(isPv && pv.mode === 'hide')) drawLayerInto(g, l.canvas, l, r);
    }
    if (isPv && pv.mode === 'above') drawLayerInto(g, pv.canvas, { opacity: 1, blend: 'source-over' }, r);
  });
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function clipRectToDoc(r) {
  const d = app.doc;
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(d.width, Math.ceil(r.x + r.w)), y1 = Math.min(d.height, Math.ceil(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function renderComposite(rect = null) {
  const d = app.doc;
  if (!d) return;
  if (viewCanvas.width !== d.width || viewCanvas.height !== d.height) {
    viewCanvas.width = d.width;
    viewCanvas.height = d.height;
    positionCanvas();
    rect = null;
  }
  if (rect) {
    rect = clipRectToDoc(rect);
    if (!rect) return;
    viewCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
    compositeTo(viewCtx, false, rect);
  } else {
    viewCtx.clearRect(0, 0, d.width, d.height);
    compositeTo(viewCtx);
  }
}

/* ---------- Ansicht ---------- */

function positionCanvas() {
  const d = app.doc;
  if (!d) return;
  const s = viewCanvas.style;
  s.left = app.panX + 'px';
  s.top = app.panY + 'px';
  s.width = d.width * app.zoom + 'px';
  s.height = d.height * app.zoom + 'px';
  viewCanvas.classList.toggle('pixelated', app.zoom >= 2);
}

function setView(zoom, panX, panY) {
  app.zoom = clamp(zoom, 0.02, 32);
  app.panX = Math.round(panX);
  app.panY = Math.round(panY);
  positionCanvas();
  if (typeof positionTextEditor === 'function') positionTextEditor();
  requestOverlay();
  updateStatus();
}

function fitView() {
  const d = app.doc;
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const z = Math.min((vw - 48) / d.width, (vh - 48) / d.height, 1);
  const zoom = z > 0 ? z : 1;
  setView(zoom, (vw - d.width * zoom) / 2, (vh - d.height * zoom) / 2);
  requestRender();
}

function actualPixels() {
  zoomAt(1, viewport.clientWidth / 2, viewport.clientHeight / 2);
}

function zoomAt(newZoom, sx, sy) {
  newZoom = clamp(newZoom, 0.02, 32);
  const dx = (sx - app.panX) / app.zoom;
  const dy = (sy - app.panY) / app.zoom;
  setView(newZoom, sx - dx * newZoom, sy - dy * newZoom);
}

function zoomStep(dir, sx = viewport.clientWidth / 2, sy = viewport.clientHeight / 2) {
  const z = app.zoom;
  let next = dir > 0 ? ZOOM_STEPS.find((s) => s > z * 1.001) : [...ZOOM_STEPS].reverse().find((s) => s < z * 0.999);
  if (next == null) next = dir > 0 ? 32 : 0.02;
  zoomAt(next, sx, sy);
}

function screenToDoc(clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  return { x: (clientX - r.left - app.panX) / app.zoom, y: (clientY - r.top - app.panY) / app.zoom };
}

function docToScreen(x, y) {
  return { x: x * app.zoom + app.panX, y: y * app.zoom + app.panY };
}

function onDocResized() {
  renderComposite();
  fitView();
}

/* ---------- Überlagerung (Auswahl, Pinselspitze, Werkzeug-Hilfslinien) ---------- */

function resizeOverlay() {
  const dpr = window.devicePixelRatio || 1;
  const w = viewport.clientWidth, h = viewport.clientHeight;
  overlay.width = Math.round(w * dpr);
  overlay.height = Math.round(h * dpr);
  overlay.style.width = w + 'px';
  overlay.style.height = h + 'px';
  requestOverlay();
}

function renderOverlay() {
  const g = overlayCtx;
  const dpr = window.devicePixelRatio || 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, overlay.width, overlay.height);
  if (!app.doc) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSelectionOutline(g);
  const handler = currentHandler();
  if (handler && handler.overlay) handler.overlay(g);
  drawBrushCursor(g);
}

function drawSelectionOutline(g) {
  const sel = app.doc.selection;
  if (!sel || Transform.active) return;
  const off = app.selOffset || { dx: 0, dy: 0 };
  const z = app.zoom;
  g.save();
  g.translate(app.panX + off.dx * z + 0.5, app.panY + off.dy * z + 0.5);
  g.scale(z, z);
  g.lineWidth = 1 / z;
  g.strokeStyle = '#ffffff';
  g.stroke(sel.path);
  g.setLineDash([4 / z, 4 / z]);
  g.lineDashOffset = -antsPhase / z;
  g.strokeStyle = '#000000';
  g.stroke(sel.path);
  g.restore();
}

function drawBrushCursor(g) {
  const def = TOOL_DEFS[app.tool];
  if (!app.hover || !def || !def.brushCursor || spaceHeld || Transform.active) return;
  const size = toolOpts(app.tool).size;
  const r = (size / 2) * app.zoom;
  if (r < 3) return;
  const s = docToScreen(app.hover.x, app.hover.y);
  g.beginPath();
  g.arc(s.x, s.y, r, 0, Math.PI * 2);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.stroke();
}

// Hilfsfunktion für Werkzeug-Overlays: Rechteck in Dokumentkoordinaten zeichnen
function strokeDocRect(g, r, dashed = true) {
  const a = docToScreen(r.x, r.y);
  const w = r.w * app.zoom, h = r.h * app.zoom;
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = '#fff';
  g.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  if (dashed) g.setLineDash([4, 4]);
  g.strokeStyle = '#000';
  g.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  g.restore();
}

function strokeScreenPath(g, path) {
  g.save();
  g.lineWidth = 1;
  g.strokeStyle = '#fff';
  g.stroke(path);
  g.setLineDash([4, 4]);
  g.strokeStyle = '#000';
  g.stroke(path);
  g.restore();
}

setInterval(() => {
  if (app.doc && app.doc.selection && !document.hidden) {
    antsPhase = (antsPhase + 1) % 8;
    requestOverlay();
  }
}, 110);
