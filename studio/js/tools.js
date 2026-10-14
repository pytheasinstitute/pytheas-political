'use strict';
/* Pytheas Studio — Werkzeuge */

const TOOL_DEFS = {
  move: { name: 'Verschieben', key: 'v', opts: { autoSelect: false } },
  marquee: { name: 'Auswahlrechteck', key: 'm', opts: { mode: 'new', feather: 0 } },
  ellipse: { name: 'Auswahlellipse', key: 'm', opts: { mode: 'new', feather: 0 } },
  lasso: { name: 'Lasso', key: 'l', opts: { mode: 'new', feather: 0 } },
  wand: { name: 'Zauberstab', key: 'w', opts: { mode: 'new', tolerance: 32, contiguous: true, allLayers: false } },
  crop: { name: 'Freistellen', key: 'c', opts: { ratio: 'free' } },
  eyedropper: { name: 'Pipette', key: 'i', opts: {} },
  brush: { name: 'Pinsel', key: 'b', brushCursor: true, opts: { size: 20, hardness: 80, opacity: 100, pressure: true } },
  clone: { name: 'Kopierstempel', key: 's', brushCursor: true, opts: { size: 40, hardness: 50, opacity: 100, aligned: true, allLayers: false } },
  retouch: { name: 'Retusche-Pinsel', key: 'o', brushCursor: true, opts: { mode: 'dodge', size: 60, hardness: 30, opacity: 40 } },
  eraser: { name: 'Radiergummi', key: 'e', brushCursor: true, opts: { size: 40, hardness: 80, opacity: 100, pressure: true } },
  bucket: { name: 'Füllwerkzeug', key: 'g', opts: { tolerance: 32, contiguous: true, allLayers: false, opacity: 100 } },
  gradient: { name: 'Verlaufswerkzeug', key: 'g', opts: { type: 'linear', colors: 'fgbg', reverse: false, opacity: 100 } },
  text: { name: 'Horizontales Textwerkzeug', key: 't', opts: { family: 'Arial', size: 64, bold: false, italic: false, align: 'left', color: '#000000' } },
  shape: { name: 'Formwerkzeug', key: 'u', opts: { shape: 'rect', fill: true, fillColor: '#4c8dff', stroke: false, strokeColor: '#000000', strokeWidth: 4, radius: 24 } },
  hand: { name: 'Hand', key: 'h', opts: {} },
  zoom: { name: 'Zoom', key: 'z', opts: {} },
};

const Tools = {};
const toolOptions = {};
let spaceHeld = false;
let dragHandler = null;

function toolOpts(tool) {
  if (!toolOptions[tool]) toolOptions[tool] = { ...(TOOL_DEFS[tool].opts || {}) };
  return toolOptions[tool];
}

function loadToolOptions() {
  const saved = storageGet('pytheas-studio:opts', {});
  for (const [t, def] of Object.entries(TOOL_DEFS)) {
    const o = toolOpts(t);
    const s = saved && saved[t];
    if (!s) continue;
    for (const k of Object.keys(def.opts || {})) if (typeof s[k] === typeof def.opts[k]) o[k] = s[k];
  }
}

const saveToolOptions = debounce(() => storageSet('pytheas-studio:opts', toolOptions), 300);

/* ---------- gemeinsame Helfer ---------- */

const scratch = {};
function scratchCanvas(name, w = app.doc.width, h = app.doc.height) {
  let c = scratch[name];
  if (!c || c.width !== w || c.height !== h) c = scratch[name] = createCanvas(w, h);
  return c;
}

function clearCanvas(c) {
  const g = ctxOf(c);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
  return g;
}

function pixelTarget() {
  const L = activeLayer();
  if (!L.visible) {
    toast('Die aktive Ebene ist ausgeblendet – bitte zuerst einblenden.');
    return null;
  }
  return L;
}

function modeFor(e, o) {
  if (e.shiftKey && e.altKey) return 'int';
  if (e.shiftKey) return 'add';
  if (e.altKey) return 'sub';
  return o.mode || 'new';
}

function rectFromDrag(a, b, square, fromCenter) {
  let w = b.x - a.x, h = b.y - a.y;
  if (square) {
    const s = Math.max(Math.abs(w), Math.abs(h));
    w = (w < 0 ? -1 : 1) * s;
    h = (h < 0 ? -1 : 1) * s;
  }
  let x = a.x, y = a.y;
  if (fromCenter) {
    x -= w;
    y -= h;
    w *= 2;
    h *= 2;
  }
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { x, y, w, h };
}

function roundRect(r) {
  const x0 = Math.round(r.x), y0 = Math.round(r.y);
  return { x: x0, y: y0, w: Math.round(r.x + r.w) - x0, h: Math.round(r.y + r.h) - y0 };
}

function snap45(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

function layerAt(p) {
  const d = app.doc;
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= d.width || y >= d.height) return -1;
  for (let i = d.layers.length - 1; i >= 0; i--) {
    const l = d.layers[i];
    if (l.visible && ctxOf(l.canvas).getImageData(x, y, 1, 1).data[3] > 10) return i;
  }
  return -1;
}

function setCursor(c) {
  viewport.style.cursor = c;
}

function updateCursor() {
  if (spaceHeld) return setCursor('grab');
  const h = currentHandler();
  setCursor((h && h.cursor) || 'default');
}

/* ---------- Pinsel, Radiergummi, Kopierstempel ---------- */

const tipCache = new Map();
function brushTip(size, hardness, color) {
  const key = `${size}|${hardness}|${color}`;
  let c = tipCache.get(key);
  if (c) return c;
  if (tipCache.size > 32) tipCache.clear();
  const s = Math.ceil(size) + 2;
  c = createCanvas(s, s);
  const g = ctxOf(c);
  const r = Math.max(0.5, size / 2), m = s / 2;
  if (hardness >= 0.98) {
    g.fillStyle = color;
  } else {
    const { r: R, g: G, b: B } = hexToRgb(color);
    const grad = g.createRadialGradient(m, m, r * hardness, m, m, r);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      grad.addColorStop(t, `rgba(${R},${G},${B},${(0.5 + 0.5 * Math.cos(Math.PI * t)).toFixed(3)})`);
    }
    g.fillStyle = grad;
  }
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  tipCache.set(key, c);
  return c;
}

let cloneSource = null;
let cloneOffset = null;

const RETOUCH_MODES = { dodge: 'Abwedeln', burn: 'Nachbelichten', blur: 'Weichzeichnen', sharpen: 'Scharfzeichnen', sponge: 'Schwamm' };

// Der Retusche-Pinsel malt aus einer einmal pro Strich bearbeiteten Kopie der Ebene
function retouchSource(src, o) {
  if (o.mode === 'blur') return gaussianBlurCanvas(src, Math.max(1.5, o.size / 12));
  const id = readPixels(src);
  if (o.mode === 'dodge') Filters.levels(id, { gamma: 1.6 });
  else if (o.mode === 'burn') Filters.levels(id, { gamma: 0.6 });
  else if (o.mode === 'sharpen') Filters.unsharpMask(id, { amount: 160, radius: 1.5, threshold: 0 }, readPixels(gaussianBlurCanvas(src, 1.5)).data);
  else Filters.desaturate(id);
  return canvasFromImageData(id);
}

function makePaintTool(kind) {
  const HIST = { brush: 'Pinsel', eraser: 'Radiergummi', clone: 'Kopierstempel' };
  const sampling = kind === 'clone' || kind === 'retouch';
  let st = null;

  function dab(x, y, pr) {
    const s = st.tipSize * pr;
    if (s < 0.3) return;
    const box = { x: x - s / 2 - 1, y: y - s / 2 - 1, w: s + 2, h: s + 2 };
    st.dirty = st.dirty ? unionRect(st.dirty, box) : box;
    if (sampling) {
      const dg = st.dabCtx;
      dg.globalCompositeOperation = 'source-over';
      dg.clearRect(0, 0, st.dab.width, st.dab.height);
      dg.drawImage(st.src, x + st.offset.x - s / 2, y + st.offset.y - s / 2, s, s, 0, 0, s, s);
      dg.globalCompositeOperation = 'destination-in';
      dg.drawImage(st.tip, 0, 0, s, s);
      st.sctx.drawImage(st.dab, 0, 0, s, s, x - s / 2, y - s / 2, s, s);
    } else {
      st.sctx.drawImage(st.tip, x - s / 2, y - s / 2, s, s);
    }
  }

  function strokeTo(p) {
    const a = st.last;
    const dx = p.x - a.x, dy = p.y - a.y;
    const dist = Math.hypot(dx, dy);
    let t = st.rest;
    while (t <= dist) {
      const k = dist ? t / dist : 0;
      dab(a.x + dx * k, a.y + dy * k, lerp(a.pr, p.pr, k));
      t += st.spacing;
    }
    st.rest = t - dist;
    st.last = p;
  }

  // Strich auf die Auswahl beschränkt (nur im Bereich r, sonst vollständig)
  function maskedStroke(s, r) {
    const sel = app.doc.selection;
    if (!sel) return s.stroke;
    const m = scratchCanvas('strokeMasked');
    const g = ctxOf(m);
    r = r || { x: 0, y: 0, w: m.width, h: m.height };
    g.globalCompositeOperation = 'source-over';
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(s.stroke, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(sel.mask, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.globalCompositeOperation = 'source-over';
    return m;
  }

  // Vorschau = Ebene + Strich; nach dem ersten Mal wird nur der geänderte Bereich aktualisiert
  function preview(full) {
    const pv = scratchCanvas('preview');
    const r = full ? { x: 0, y: 0, w: pv.width, h: pv.height } : st.dirty && clipRectToDoc(st.dirty);
    st.dirty = null;
    if (!r) return;
    const g = ctxOf(pv);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(st.layer.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.globalAlpha = st.alpha;
    g.globalCompositeOperation = st.op;
    g.drawImage(maskedStroke(st, r), r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    app.preview = { index: app.doc.layers.indexOf(st.layer), canvas: pv, mode: 'replace' };
    requestRender(full ? undefined : r);
  }

  return {
    cursor: 'crosshair',
    down(p, e) {
      const o = toolOpts(kind);
      if (kind === 'clone' && e.altKey) {
        cloneSource = { x: p.x, y: p.y };
        cloneOffset = null;
        toast('Kopierquelle festgelegt.');
        requestOverlay();
        return;
      }
      const L = pixelTarget();
      if (!L) return;
      if (kind === 'clone') {
        if (!cloneSource) {
          toast('Zuerst mit Alt + Klick eine Quelle festlegen.');
          return;
        }
        if (!o.aligned || !cloneOffset) cloneOffset = { x: cloneSource.x - p.x, y: cloneSource.y - p.y };
      }
      const hardness = o.hardness / 100;
      const tip = brushTip(o.size, hardness, kind === 'brush' ? app.fg : '#ffffff');
      const stroke = scratchCanvas('stroke');
      st = {
        layer: L,
        stroke,
        sctx: clearCanvas(stroke),
        tip,
        tipSize: tip.width,
        alpha: o.opacity / 100,
        op: kind === 'eraser' ? 'destination-out' : 'source-over',
        spacing: Math.max(0.5, o.size * (hardness > 0.9 ? 0.06 : 0.12)),
        usePressure: !!o.pressure && kind !== 'clone',
        rest: 0,
        last: null,
      };
      if (sampling) {
        st.src = kind === 'retouch' ? retouchSource(L.canvas, o) : o.allLayers ? flattenCanvas() : L.canvas;
        st.offset = kind === 'clone' ? cloneOffset : { x: 0, y: 0 };
        st.dab = scratchCanvas('dab', tip.width, tip.width);
        st.dabCtx = ctxOf(st.dab);
      }
      const pt = { x: p.x, y: p.y, pr: st.usePressure ? p.pressure : 1 };
      st.last = pt;
      dab(pt.x, pt.y, pt.pr);
      st.rest = st.spacing;
      preview(true);
    },
    move(p) {
      if (st) strokeTo({ x: p.x, y: p.y, pr: st.usePressure ? p.pressure : 1 });
    },
    moveDone() {
      if (st) preview();
    },
    up() {
      if (!st) return;
      const s = st;
      st = null;
      const g = editable(s.layer);
      g.globalAlpha = s.alpha;
      g.globalCompositeOperation = s.op;
      g.drawImage(maskedStroke(s), 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      rasterizeText(s.layer);
      app.preview = null;
      commit(kind === 'retouch' ? RETOUCH_MODES[toolOpts('retouch').mode] : HIST[kind]);
    },
    overlay(g) {
      if (kind !== 'clone' || !cloneSource) return;
      let src = cloneSource;
      if (cloneOffset && app.hover) src = { x: app.hover.x + cloneOffset.x, y: app.hover.y + cloneOffset.y };
      const s = docToScreen(src.x, src.y);
      g.save();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.beginPath();
      g.moveTo(s.x - 8, s.y);
      g.lineTo(s.x + 8, s.y);
      g.moveTo(s.x, s.y - 8);
      g.lineTo(s.x, s.y + 8);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = '#fff';
      g.stroke();
      g.restore();
    },
    cancel() {
      st = null;
    },
  };
}

Tools.brush = makePaintTool('brush');
Tools.eraser = makePaintTool('eraser');
Tools.clone = makePaintTool('clone');
Tools.retouch = makePaintTool('retouch');

/* ---------- Füllwerkzeug & Zauberstab ---------- */

function floodBits(id, sx, sy, tol, contiguous) {
  const { width: w, height: h, data: d } = id;
  const out = new Uint8Array(w * h);
  const i0 = (sy * w + sx) * 4;
  const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const match = (i) => {
    const j = i * 4;
    if (a0 === 0) return d[j + 3] <= tol;
    return (
      Math.abs(d[j] - r0) <= tol &&
      Math.abs(d[j + 1] - g0) <= tol &&
      Math.abs(d[j + 2] - b0) <= tol &&
      Math.abs(d[j + 3] - a0) <= tol
    );
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (match(i)) out[i] = 1;
    return out;
  }
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const row = y * w;
    if (out[row + x] || !match(row + x)) continue;
    let xl = x, xr = x;
    while (xl > 0 && !out[row + xl - 1] && match(row + xl - 1)) xl--;
    while (xr < w - 1 && !out[row + xr + 1] && match(row + xr + 1)) xr++;
    for (let i = xl; i <= xr; i++) out[row + i] = 1;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let inRun = false;
      for (let i = xl; i <= xr; i++) {
        const ok = !out[nrow + i] && match(nrow + i);
        if (ok && !inRun) {
          stack.push(i, ny);
          inRun = true;
        } else if (!ok) inRun = false;
      }
    }
  }
  return out;
}

function floodAt(p, o) {
  const d = app.doc;
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= d.width || y >= d.height) return null;
  const sample = o.allLayers ? flattenCanvas() : activeLayer().canvas;
  return maskFromBits(floodBits(readPixels(sample), x, y, o.tolerance, o.contiguous), d.width, d.height);
}

Tools.bucket = {
  cursor: 'crosshair',
  down(p) {
    const L = pixelTarget();
    if (!L) return;
    const o = toolOpts('bucket');
    const fill = floodAt(p, o);
    if (!fill) return;
    const g = ctxOf(fill);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = app.fg;
    g.fillRect(0, 0, fill.width, fill.height);
    if (app.doc.selection) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(app.doc.selection.mask, 0, 0);
    }
    const lg = editable(L);
    lg.globalAlpha = o.opacity / 100;
    lg.drawImage(fill, 0, 0);
    lg.globalAlpha = 1;
    rasterizeText(L);
    commit('Füllen');
  },
};

Tools.wand = {
  cursor: 'crosshair',
  down(p, e) {
    const o = toolOpts('wand');
    const mask = floodAt(p, o);
    if (mask) applySelectionMode(mask, modeFor(e, o), 'Zauberstab');
  },
};

/* ---------- Auswahlrechteck, Auswahlellipse, Lasso ---------- */

function makeMarquee(shape) {
  let st = null;
  return {
    cursor: 'crosshair',
    down(p, e) {
      const o = toolOpts(shape);
      const mode = modeFor(e, o);
      const sel = app.doc.selection;
      if (mode === 'new' && sel && maskHit(sel.mask, p)) {
        st = { moving: true, start: p, dx: 0, dy: 0 };
        return;
      }
      st = { start: p, cur: p, mode, shift: false, alt: false };
    },
    move(p, e) {
      if (!st) return;
      if (st.moving) {
        st.dx = Math.round(p.x - st.start.x);
        st.dy = Math.round(p.y - st.start.y);
        app.selOffset = { dx: st.dx, dy: st.dy };
      } else {
        st.cur = p;
        st.shift = e.shiftKey;
        st.alt = e.altKey && st.mode !== 'sub';
      }
    },
    moveDone() {
      requestOverlay();
    },
    up() {
      if (!st) return;
      const s = st;
      st = null;
      app.selOffset = null;
      if (s.moving) {
        if (s.dx || s.dy) {
          const m = blankMask();
          ctxOf(m).drawImage(app.doc.selection.mask, s.dx, s.dy);
          setSelection(m, 'Auswahl verschieben');
        }
        requestOverlay();
        return;
      }
      const r = roundRect(rectFromDrag(s.start, s.cur, s.shift, s.alt));
      if (r.w < 1 || r.h < 1) {
        if (s.mode === 'new') deselect();
        requestOverlay();
        return;
      }
      let m = shape === 'marquee' ? rectMask(r) : ellipseMask(r);
      const o = toolOpts(shape);
      let hint;
      if (o.feather > 0) m = featherMask(m, o.feather);
      else hint = shapeHint(r, shape === 'ellipse');
      applySelectionMode(m, s.mode, TOOL_DEFS[shape].name, hint);
    },
    overlay(g) {
      if (!st || st.moving) return;
      const r = rectFromDrag(st.start, st.cur, st.shift, st.alt);
      if (shape === 'marquee') strokeDocRect(g, r);
      else {
        const c = docToScreen(r.x + r.w / 2, r.y + r.h / 2);
        const path = new Path2D();
        path.ellipse(c.x, c.y, (r.w / 2) * app.zoom, (r.h / 2) * app.zoom, 0, 0, Math.PI * 2);
        strokeScreenPath(g, path);
      }
    },
    cancel() {
      st = null;
    },
  };
}

Tools.marquee = makeMarquee('marquee');
Tools.ellipse = makeMarquee('ellipse');

let lassoPts = null;
let lassoMode = 'new';
Tools.lasso = {
  cursor: 'crosshair',
  down(p, e) {
    lassoPts = [p];
    lassoMode = modeFor(e, toolOpts('lasso'));
  },
  move(p) {
    if (!lassoPts) return;
    const last = lassoPts[lassoPts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) * app.zoom >= 2) lassoPts.push(p);
  },
  moveDone() {
    requestOverlay();
  },
  up() {
    const pts = lassoPts;
    lassoPts = null;
    if (!pts || pts.length < 3) {
      if (lassoMode === 'new') deselect();
      requestOverlay();
      return;
    }
    let m = polygonMask(pts);
    const o = toolOpts('lasso');
    if (o.feather > 0) m = featherMask(m, o.feather);
    applySelectionMode(m, lassoMode, 'Lasso');
  },
  overlay(g) {
    if (!lassoPts) return;
    const path = new Path2D();
    lassoPts.forEach((p, i) => {
      const s = docToScreen(p.x, p.y);
      i ? path.lineTo(s.x, s.y) : path.moveTo(s.x, s.y);
    });
    strokeScreenPath(g, path);
  },
  cancel() {
    lassoPts = null;
  },
};

/* ---------- Verschieben ---------- */

function beginMove(L) {
  const sel = app.doc.selection;
  const s = { L, dx: 0, dy: 0 };
  if (sel) {
    s.float = maskedCopy(L.canvas);
    s.base = cloneCanvas(L.canvas);
    const g = ctxOf(s.base);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sel.mask, 0, 0);
  }
  return s;
}

function movePreview(s) {
  const pv = scratchCanvas('preview');
  const g = clearCanvas(pv);
  if (s.float) {
    g.drawImage(s.base, 0, 0);
    g.drawImage(s.float, s.dx, s.dy);
    app.selOffset = { dx: s.dx, dy: s.dy };
  } else {
    g.drawImage(s.L.canvas, s.dx, s.dy);
  }
  app.preview = { index: app.doc.layers.indexOf(s.L), canvas: pv, mode: 'replace' };
  requestRender();
}

function applyMove(s, name = 'Verschieben') {
  const d = app.doc;
  app.preview = null;
  app.selOffset = null;
  if (s.float) {
    const c = cloneCanvas(s.base);
    ctxOf(c).drawImage(s.float, s.dx, s.dy);
    s.L.canvas = c;
    rasterizeText(s.L);
    const m = blankMask();
    ctxOf(m).drawImage(d.selection.mask, s.dx, s.dy);
    d.selection = buildSelection(m);
  } else if (s.L.text) {
    s.L.text.x += s.dx;
    s.L.text.y += s.dy;
    const c = createCanvas(d.width, d.height);
    renderText(s.L.text, c);
    s.L.canvas = c;
  } else {
    const c = createCanvas(d.width, d.height);
    ctxOf(c).drawImage(s.L.canvas, s.dx, s.dy);
    s.L.canvas = c;
  }
  commit(name);
}

let moveSt = null;
Tools.move = {
  cursor: 'move',
  down(p, e) {
    if (toolOpts('move').autoSelect || e.ctrlKey || e.metaKey) {
      const i = layerAt(p);
      if (i >= 0 && i !== app.doc.active) {
        app.doc.active = i;
        updateLayersPanel();
      }
    }
    const L = pixelTarget();
    if (!L) return;
    moveSt = beginMove(L);
    moveSt.p0 = p;
  },
  move(p, e) {
    if (!moveSt) return;
    let dx = Math.round(p.x - moveSt.p0.x), dy = Math.round(p.y - moveSt.p0.y);
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    moveSt.dx = dx;
    moveSt.dy = dy;
  },
  moveDone() {
    if (moveSt) movePreview(moveSt);
  },
  up() {
    if (!moveSt) return;
    const s = moveSt;
    moveSt = null;
    if (!s.dx && !s.dy) {
      app.preview = null;
      app.selOffset = null;
      requestRender();
      return;
    }
    applyMove(s);
  },
  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const step = e.shiftKey ? 10 : 1;
    const dirs = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const dd = dirs[e.key];
    if (!dd) return false;
    const L = pixelTarget();
    if (!L) return true;
    const s = beginMove(L);
    s.dx = dd[0];
    s.dy = dd[1];
    applyMove(s, 'Verschieben (Pfeiltaste)');
    return true;
  },
  cancel() {
    moveSt = null;
  },
};

/* ---------- Pipette ---------- */

function pickColor(p, toBg) {
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= app.doc.width || y >= app.doc.height) return;
  const px = viewCtx.getImageData(x, y, 1, 1).data;
  if (px[3] === 0) return;
  const hex = rgbToHex(px[0], px[1], px[2]);
  if (toBg) setBG(hex);
  else setFG(hex);
}

Tools.eyedropper = {
  cursor: 'crosshair',
  down(p, e) {
    pickColor(p, e.altKey);
  },
  move(p, e) {
    pickColor(p, e.altKey);
  },
};

/* ---------- Verlauf ---------- */

let gradSt = null;

function drawGradient(g, o, a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const grad = o.type === 'radial'
    ? g.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, len))
    : g.createLinearGradient(a.x, a.y, b.x, b.y);
  let stops;
  if (o.colors === 'fgtrans') stops = [rgba(app.fg, 1), rgba(app.fg, 0)];
  else if (o.colors === 'rainbow') stops = ['#ff2a2a', '#ff9f1a', '#ffe81a', '#2bd94a', '#1a8cff', '#7a2bff'];
  else stops = [app.fg, app.bg];
  if (o.reverse) stops = stops.slice().reverse();
  stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
  g.fillStyle = grad;
  g.fillRect(0, 0, app.doc.width, app.doc.height);
}

function composeGradient(s, target) {
  const o = toolOpts('gradient');
  const gc = scratchCanvas('grad');
  const gg = clearCanvas(gc);
  drawGradient(gg, o, s.a, s.b);
  if (app.doc.selection) {
    gg.globalCompositeOperation = 'destination-in';
    gg.drawImage(app.doc.selection.mask, 0, 0);
    gg.globalCompositeOperation = 'source-over';
  }
  const g = clearCanvas(target);
  g.drawImage(s.L.canvas, 0, 0);
  g.globalAlpha = o.opacity / 100;
  g.drawImage(gc, 0, 0);
  g.globalAlpha = 1;
  return target;
}

Tools.gradient = {
  cursor: 'crosshair',
  down(p) {
    const L = pixelTarget();
    if (!L) return;
    gradSt = { L, a: p, b: p };
  },
  move(p, e) {
    if (gradSt) gradSt.b = e.shiftKey ? snap45(gradSt.a, p) : p;
  },
  moveDone() {
    if (!gradSt) return;
    app.preview = { index: app.doc.layers.indexOf(gradSt.L), canvas: composeGradient(gradSt, scratchCanvas('preview')), mode: 'replace' };
    requestRender();
  },
  up() {
    if (!gradSt) return;
    const s = gradSt;
    gradSt = null;
    app.preview = null;
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 1) {
      requestRender();
      return;
    }
    s.L.canvas = composeGradient(s, createCanvas(app.doc.width, app.doc.height));
    rasterizeText(s.L);
    commit('Verlauf');
  },
  overlay(g) {
    if (!gradSt) return;
    const a = docToScreen(gradSt.a.x, gradSt.a.y), b = docToScreen(gradSt.b.x, gradSt.b.y);
    g.save();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = '#fff';
    g.stroke();
    for (const q of [a, b]) {
      g.beginPath();
      g.arc(q.x, q.y, 4, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.stroke();
    }
    g.restore();
  },
  cancel() {
    gradSt = null;
  },
};

/* ---------- Formen ---------- */

const SHAPE_NAMES = { rect: 'Rechteck', rrect: 'Abgerundetes Rechteck', ellipse: 'Ellipse', line: 'Linie' };
let shapeSt = null;

function roundRectPath(p, r, rad) {
  const k = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  p.moveTo(r.x + k, r.y);
  p.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  p.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  p.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  p.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  p.closePath();
}

function drawShape(g, o, s) {
  g.save();
  if (o.shape === 'line') {
    const b = s.shift ? snap45(s.a, s.b) : s.b;
    g.strokeStyle = o.strokeColor;
    g.lineWidth = Math.max(1, o.strokeWidth);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(s.a.x, s.a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  } else {
    const r = rectFromDrag(s.a, s.b, s.shift, s.alt);
    const path = new Path2D();
    if (o.shape === 'ellipse') path.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    else if (o.shape === 'rrect') roundRectPath(path, r, o.radius);
    else path.rect(r.x, r.y, r.w, r.h);
    if (o.fill) {
      g.fillStyle = o.fillColor;
      g.fill(path);
    }
    if (o.stroke && o.strokeWidth > 0) {
      g.strokeStyle = o.strokeColor;
      g.lineWidth = o.strokeWidth;
      g.stroke(path);
    }
  }
  g.restore();
}

Tools.shape = {
  cursor: 'crosshair',
  down(p, e) {
    shapeSt = { a: p, b: p, shift: e.shiftKey, alt: e.altKey };
  },
  move(p, e) {
    if (!shapeSt) return;
    shapeSt.b = p;
    shapeSt.shift = e.shiftKey;
    shapeSt.alt = e.altKey;
  },
  moveDone() {
    if (!shapeSt) return;
    const c = scratchCanvas('shape');
    drawShape(clearCanvas(c), toolOpts('shape'), shapeSt);
    app.preview = { index: app.doc.active, canvas: c, mode: 'above' };
    requestRender();
  },
  up() {
    if (!shapeSt) return;
    const s = shapeSt;
    shapeSt = null;
    app.preview = null;
    const o = toolOpts('shape');
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 2) {
      requestRender();
      return;
    }
    if (o.shape !== 'line' && !o.fill && !(o.stroke && o.strokeWidth > 0)) {
      toast('Bitte Füllung oder Kontur aktivieren.');
      requestRender();
      return;
    }
    const l = addLayer(nextLayerName(SHAPE_NAMES[o.shape]));
    drawShape(ctxOf(l.canvas), o, s);
    commit('Form erstellen');
  },
  cancel() {
    shapeSt = null;
  },
};

/* ---------- Text ---------- */

const textEditor = $('#text-editor');
const LINE_H = 1.2;
const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS', 'system-ui', 'serif', 'sans-serif', 'monospace'];
const GENERIC_FONTS = ['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui'];
const TextEdit = { active: false, index: -1, data: null };

function fontStack(f) {
  return GENERIC_FONTS.includes(f) ? f : `"${String(f).replace(/"/g, '')}", sans-serif`;
}

function textFont(t, scale = 1) {
  return `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size * scale}px ${fontStack(t.family)}`;
}

function measureText(t) {
  const g = ctxOf(scratchCanvas('measure', 4, 4));
  g.font = textFont(t);
  const lines = String(t.text).split('\n');
  const widths = lines.map((s) => g.measureText(s).width);
  const probe = g.measureText('Hg');
  return {
    lines,
    widths,
    w: Math.max(1, ...widths),
    h: lines.length * t.size * LINE_H,
    ascent: probe.fontBoundingBoxAscent,
    descent: probe.fontBoundingBoxDescent,
  };
}

function renderText(t, canvas) {
  const g = clearCanvas(canvas);
  const m = measureText(t);
  g.font = textFont(t);
  g.fillStyle = t.color;
  const lh = t.size * LINE_H;
  const exact = m.ascent > 0 && m.descent >= 0;
  g.textBaseline = exact ? 'alphabetic' : 'top';
  m.lines.forEach((s, i) => {
    let x = t.x;
    if (t.align === 'center') x += (m.w - m.widths[i]) / 2;
    else if (t.align === 'right') x += m.w - m.widths[i];
    const top = t.y + i * lh;
    // wie CSS: Halbdurchschuss oberhalb, dann Oberlänge bis zur Grundlinie
    const y = exact ? top + (lh - (m.ascent + m.descent)) / 2 + m.ascent : top + (lh - t.size) / 2;
    g.fillText(s, x, y);
  });
}

function textHit(t, p) {
  const m = measureText(t);
  return p.x >= t.x - 4 && p.x <= t.x + m.w + 4 && p.y >= t.y - 4 && p.y <= t.y + m.h + 4;
}

function beginTextEdit(index, p) {
  const o = toolOpts('text');
  if (index >= 0) {
    const l = app.doc.layers[index];
    TextEdit.data = { ...l.text };
    for (const k of ['family', 'size', 'bold', 'italic', 'align', 'color']) o[k] = l.text[k];
    app.doc.active = index;
    app.preview = { index, mode: 'hide' };
    updateLayersPanel();
  } else {
    TextEdit.data = {
      text: '',
      x: Math.round(p.x),
      y: Math.round(p.y - (o.size * LINE_H) / 2),
      family: o.family,
      size: o.size,
      bold: o.bold,
      italic: o.italic,
      align: o.align,
      color: o.color,
    };
  }
  TextEdit.index = index;
  TextEdit.active = true;
  textEditor.value = TextEdit.data.text;
  textEditor.hidden = false;
  positionTextEditor();
  buildOptionsBar();
  requestRender();
  setTimeout(() => textEditor.focus(), 0);
}

function positionTextEditor() {
  if (!TextEdit.active) return;
  const t = TextEdit.data;
  t.text = textEditor.value;
  const m = measureText(t);
  const s = docToScreen(t.x, t.y);
  const st = textEditor.style;
  st.left = s.x - 1 + 'px';
  st.top = s.y - 1 + 'px';
  st.font = textFont(t, app.zoom);
  st.lineHeight = String(LINE_H);
  st.color = t.color;
  st.textAlign = t.align;
  st.width = Math.ceil(m.w * app.zoom) + 1 + 'px';
  st.paddingRight = Math.ceil(t.size * app.zoom * 0.5) + 'px';
  st.height = Math.ceil(m.lines.length * t.size * LINE_H * app.zoom) + 'px';
}

function applyTextOptions() {
  if (!TextEdit.active) return;
  const o = toolOpts('text');
  for (const k of ['family', 'size', 'bold', 'italic', 'align', 'color']) TextEdit.data[k] = o[k];
  positionTextEditor();
}

function endTextEditUI() {
  TextEdit.active = false;
  textEditor.hidden = true;
  textEditor.blur();
  app.preview = null;
  buildOptionsBar();
}

function commitText() {
  if (!TextEdit.active) return;
  const t = TextEdit.data;
  t.text = textEditor.value.replace(/\s+$/, '');
  endTextEditUI();
  const d = app.doc;
  if (TextEdit.index < 0) {
    if (!t.text.trim()) return requestRender();
    const l = addLayer(t.text.split('\n')[0].trim().slice(0, 28) || 'Text');
    l.text = t;
    renderText(t, l.canvas);
    commit('Text erstellen');
    return;
  }
  const l = d.layers[TextEdit.index];
  if (!l) return requestRender();
  if (!t.text.trim()) {
    if (d.layers.length > 1) {
      d.layers.splice(TextEdit.index, 1);
      d.active = clamp(TextEdit.index - 1, 0, d.layers.length - 1);
    } else {
      l.text = null;
      l.canvas = createCanvas(d.width, d.height);
    }
    commit('Text löschen');
    return;
  }
  if (JSON.stringify(l.text) === JSON.stringify(t)) return requestRender();
  l.text = t;
  l.canvas = createCanvas(d.width, d.height);
  renderText(t, l.canvas);
  commit('Text bearbeiten');
}

function cancelText() {
  endTextEditUI();
  requestRender();
}

textEditor.addEventListener('input', positionTextEditor);

Tools.text = {
  cursor: 'text',
  down(p) {
    if (TextEdit.active) {
      commitText();
      return;
    }
    const d = app.doc;
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const l = d.layers[i];
      if (l.text && l.visible && textHit(l.text, p)) {
        beginTextEdit(i);
        return;
      }
    }
    beginTextEdit(-1, p);
  },
};

/* ---------- Freistellen ---------- */

const Crop = { rect: null, drag: null };
const HANDLE_DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

function cropRatio() {
  const r = toolOpts('crop').ratio;
  return r === 'free' ? 0 : parseFloat(r) || 0;
}

function cropHandleAt(r, p) {
  const sp = docToScreen(p.x, p.y);
  const a = docToScreen(r.x, r.y);
  const w = r.w * app.zoom, h = r.h * app.zoom;
  for (const [hx, hy] of HANDLE_DIRS) {
    const hxp = a.x + ((hx + 1) / 2) * w, hyp = a.y + ((hy + 1) / 2) * h;
    if (Math.abs(sp.x - hxp) <= 9 && Math.abs(sp.y - hyp) <= 9) return { hx, hy };
  }
  return null;
}

function inRect(r, p) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
}

function handleCursor(hx, hy) {
  if (hx && hy) return hx === hy ? 'nwse-resize' : 'nesw-resize';
  return hx ? 'ew-resize' : 'ns-resize';
}

function applyCrop() {
  const r = Crop.rect && roundRect(Crop.rect);
  Crop.rect = null;
  Crop.drag = null;
  buildOptionsBar();
  if (!r || r.w < 1 || r.h < 1) return requestOverlay();
  cropDocument(r.x, r.y, r.w, r.h);
}

function cancelCrop() {
  Crop.rect = null;
  Crop.drag = null;
  buildOptionsBar();
  requestOverlay();
}

Tools.crop = {
  cursor: 'crosshair',
  activate() {
    Crop.rect = null;
  },
  deactivate() {
    Crop.rect = null;
    Crop.drag = null;
  },
  down(p) {
    const r = Crop.rect;
    if (r) {
      const h = cropHandleAt(r, p);
      if (h) {
        Crop.drag = { type: 'resize', h, p0: p, r0: { ...r } };
        return;
      }
      if (inRect(r, p)) {
        Crop.drag = { type: 'move', p0: p, r0: { ...r } };
        return;
      }
    }
    Crop.drag = { type: 'new', p0: p };
    Crop.rect = { x: p.x, y: p.y, w: 0, h: 0 };
  },
  move(p, e) {
    const dr = Crop.drag;
    if (!dr) return;
    const ratio = cropRatio();
    if (dr.type === 'new') {
      let dx = p.x - dr.p0.x, dy = p.y - dr.p0.y;
      if (ratio || e.shiftKey) {
        const rt = ratio || 1;
        const w = Math.abs(dx), h = Math.abs(dy);
        const nw = Math.max(w, h * rt);
        dx = (dx < 0 ? -1 : 1) * nw;
        dy = (dy < 0 ? -1 : 1) * (nw / rt);
      }
      Crop.rect = rectFromDrag(dr.p0, { x: dr.p0.x + dx, y: dr.p0.y + dy }, false, false);
    } else if (dr.type === 'move') {
      Crop.rect = { ...dr.r0, x: dr.r0.x + p.x - dr.p0.x, y: dr.r0.y + p.y - dr.p0.y };
    } else {
      const { hx, hy } = dr.h, r0 = dr.r0;
      let l = r0.x, t = r0.y, rr = r0.x + r0.w, b = r0.y + r0.h;
      const dx = p.x - dr.p0.x, dy = p.y - dr.p0.y;
      if (hx < 0) l += dx;
      if (hx > 0) rr += dx;
      if (hy < 0) t += dy;
      if (hy > 0) b += dy;
      if (ratio) {
        if (hx && hy) {
          const nh = Math.abs(rr - l) / ratio;
          if (hy > 0) b = t + nh;
          else t = b - nh;
        } else if (hx) {
          const nh = Math.abs(rr - l) / ratio, cy = (t + b) / 2;
          t = cy - nh / 2;
          b = cy + nh / 2;
        } else {
          const nw = Math.abs(b - t) * ratio, cx = (l + rr) / 2;
          l = cx - nw / 2;
          rr = cx + nw / 2;
        }
      }
      Crop.rect = { x: Math.min(l, rr), y: Math.min(t, b), w: Math.abs(rr - l), h: Math.abs(b - t) };
    }
  },
  moveDone() {
    requestOverlay();
    updateCropInfo();
  },
  hover(p) {
    const r = Crop.rect;
    if (!r) return setCursor('crosshair');
    const h = cropHandleAt(r, p);
    setCursor(h ? handleCursor(h.hx, h.hy) : inRect(r, p) ? 'move' : 'crosshair');
  },
  up() {
    Crop.drag = null;
    if (Crop.rect && (Crop.rect.w < 2 || Crop.rect.h < 2)) Crop.rect = null;
    buildOptionsBar();
    requestOverlay();
  },
  key(e) {
    if (!Crop.rect) return false;
    if (e.key === 'Enter') {
      applyCrop();
      return true;
    }
    if (e.key === 'Escape') {
      cancelCrop();
      return true;
    }
    return false;
  },
  overlay(g) {
    const r = Crop.rect;
    if (!r) return;
    const a = docToScreen(r.x, r.y);
    const w = r.w * app.zoom, h = r.h * app.zoom;
    g.save();
    g.fillStyle = 'rgba(10,12,16,0.62)';
    g.beginPath();
    g.rect(0, 0, viewport.clientWidth, viewport.clientHeight);
    g.rect(a.x, a.y, w, h);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 3; i++) {
      g.moveTo(a.x + (w * i) / 3, a.y);
      g.lineTo(a.x + (w * i) / 3, a.y + h);
      g.moveTo(a.x, a.y + (h * i) / 3);
      g.lineTo(a.x + w, a.y + (h * i) / 3);
    }
    g.stroke();
    g.strokeStyle = '#fff';
    g.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
    g.fillStyle = '#fff';
    g.strokeStyle = '#1b1d21';
    for (const [hx, hy] of HANDLE_DIRS) {
      const x = a.x + ((hx + 1) / 2) * w, y = a.y + ((hy + 1) / 2) * h;
      g.fillRect(x - 4, y - 4, 8, 8);
      g.strokeRect(x - 4 + 0.5, y - 4 + 0.5, 7, 7);
    }
    const label = `${Math.round(r.w)} × ${Math.round(r.h)} px`;
    g.font = '12px system-ui, sans-serif';
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(20,22,26,0.85)';
    g.fillRect(a.x, a.y + h + 6, tw + 12, 20);
    g.fillStyle = '#fff';
    g.fillText(label, a.x + 6, a.y + h + 20);
    g.restore();
  },
  cancel() {
    Crop.drag = null;
  },
};

/* ---------- Hand & Zoom ---------- */

Tools.hand = { cursor: 'grab' };

Tools.zoom = {
  cursor: 'zoom-in',
  down(p, e) {
    const s = docToScreen(p.x, p.y);
    zoomStep(e.altKey ? -1 : 1, s.x, s.y);
  },
  hover(p, e) {
    setCursor(e && e.altKey ? 'zoom-out' : 'zoom-in');
  },
};

/* ---------- Frei transformieren ---------- */

const ROTATE_CURSOR =
  'url("data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round">' +
      '<path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="#fff" stroke-width="4"/><path d="M19 4v4h-4" stroke="#fff" stroke-width="4"/>' +
      '<path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="#000" stroke-width="1.6"/><path d="M19 4v4h-4" stroke="#000" stroke-width="1.6"/></svg>'
  ) +
  '") 12 12, crosshair';

const Transform = {
  active: false,
  s: null,
  drag: null,
  cursor: 'move',

  begin() {
    if (TextEdit.active) commitText();
    if (this.active) return;
    const L = pixelTarget();
    if (!L) return false;
    const d = app.doc;
    const sel = d.selection;
    const content = sel ? maskedCopy(L.canvas) : L.canvas;
    const b = alphaBounds(content);
    if (!b) {
      toast('Hier gibt es keine Pixel zum Transformieren.');
      return false;
    }
    let base;
    if (sel) {
      base = cloneCanvas(L.canvas);
      const g = ctxOf(base);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(sel.mask, 0, 0);
    } else {
      base = createCanvas(d.width, d.height);
    }
    this.s = {
      L,
      src: cropCanvas(content, b.x, b.y, b.w, b.h),
      srcMask: sel ? cropCanvas(sel.mask, b.x, b.y, b.w, b.h) : null,
      base,
      ow: b.w,
      oh: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      sx: 1,
      sy: 1,
      angle: 0,
    };
    this.active = true;
    this.drag = null;
    this.preview();
    buildOptionsBar();
    updateCursor();
    return true;
  },

  drawContent(g, img, s = this.s) {
    g.save();
    g.translate(s.cx, s.cy);
    g.rotate(s.angle);
    g.scale(s.sx, s.sy);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, -s.ow / 2, -s.oh / 2);
    g.restore();
  },

  preview() {
    const s = this.s;
    const pv = scratchCanvas('preview');
    const g = clearCanvas(pv);
    g.drawImage(s.base, 0, 0);
    this.drawContent(g, s.src);
    app.preview = { index: app.doc.layers.indexOf(s.L), canvas: pv, mode: 'replace' };
    requestRender();
  },

  toLocal(p, s = this.s) {
    const dx = p.x - s.cx, dy = p.y - s.cy;
    const c = Math.cos(-s.angle), sn = Math.sin(-s.angle);
    return { x: dx * c - dy * sn, y: dx * sn + dy * c };
  },

  toWorld(lx, ly, s = this.s) {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    return { x: s.cx + lx * c - ly * sn, y: s.cy + lx * sn + ly * c };
  },

  handles() {
    const s = this.s;
    const hw = (s.ow * s.sx) / 2, hh = (s.oh * s.sy) / 2;
    return HANDLE_DIRS.map(([hx, hy]) => ({ hx, hy, p: this.toWorld(hx * hw, hy * hh) }));
  },

  hit(p) {
    const sp = docToScreen(p.x, p.y);
    for (const h of this.handles()) {
      const hp = docToScreen(h.p.x, h.p.y);
      if (Math.abs(sp.x - hp.x) <= 8 && Math.abs(sp.y - hp.y) <= 8) return { type: 'scale', hx: h.hx, hy: h.hy };
    }
    const s = this.s;
    const q = this.toLocal(p);
    if (Math.abs(q.x) <= Math.abs((s.ow * s.sx) / 2) && Math.abs(q.y) <= Math.abs((s.oh * s.sy) / 2)) return { type: 'move' };
    return { type: 'rotate' };
  },

  cursorFor(h) {
    if (h.type === 'move') return 'move';
    if (h.type === 'rotate') return ROTATE_CURSOR;
    const s = this.s;
    const ang = Math.atan2(h.hy * Math.sign(s.sy || 1), h.hx * Math.sign(s.sx || 1)) + s.angle;
    const idx = ((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4;
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][idx];
  },

  hover(p) {
    setCursor(this.cursorFor(this.hit(p)));
  },

  down(p) {
    const h = this.hit(p);
    this.drag = { ...h, p0: p, s0: { ...this.s } };
    setCursor(this.cursorFor(h));
  },

  move(p, e) {
    const d = this.drag;
    if (!d) return;
    const s = this.s, s0 = d.s0;
    if (d.type === 'move') {
      s.cx = s0.cx + p.x - d.p0.x;
      s.cy = s0.cy + p.y - d.p0.y;
    } else if (d.type === 'rotate') {
      const a0 = Math.atan2(d.p0.y - s0.cy, d.p0.x - s0.cx);
      const a1 = Math.atan2(p.y - s0.cy, p.x - s0.cx);
      let a = s0.angle + a1 - a0;
      if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      s.angle = a;
    } else {
      const q = this.toLocal(p, s0);
      const W0 = s0.ow * s0.sx, H0 = s0.oh * s0.sy;
      const { hx, hy } = d;
      const fromCenter = e.altKey;
      const ax = fromCenter ? 0 : (-hx * W0) / 2;
      const ay = fromCenter ? 0 : (-hy * H0) / 2;
      let W = W0, H = H0;
      if (hx) W = fromCenter ? 2 * hx * q.x : hx * (q.x - ax);
      if (hy) H = fromCenter ? 2 * hy * q.y : hy * (q.y - ay);
      if (e.shiftKey && hx && hy) {
        const kx = W / W0, ky = H / H0;
        const k = Math.abs(kx) > Math.abs(ky) ? kx : ky;
        W = W0 * k;
        H = H0 * k;
      }
      if (Math.abs(W) < 1) W = W < 0 ? -1 : 1;
      if (Math.abs(H) < 1) H = H < 0 ? -1 : 1;
      const cxl = hx && !fromCenter ? ax + (hx * W) / 2 : 0;
      const cyl = hy && !fromCenter ? ay + (hy * H) / 2 : 0;
      const c = this.toWorld(cxl, cyl, s0);
      s.cx = c.x;
      s.cy = c.y;
      s.sx = W / s0.ow;
      s.sy = H / s0.oh;
    }
  },

  moveDone() {
    this.preview();
    updateTransformFields();
  },

  up() {
    this.drag = null;
  },

  setNumeric(field, v) {
    const s = this.s;
    if (!s || !isFinite(v)) return;
    if (field === 'w') s.sx = (Math.sign(s.sx) || 1) * Math.max(0.1, Math.abs(v)) / 100;
    if (field === 'h') s.sy = (Math.sign(s.sy) || 1) * Math.max(0.1, Math.abs(v)) / 100;
    if (field === 'angle') s.angle = (v * Math.PI) / 180;
    this.preview();
  },

  apply(name = 'Frei transformieren') {
    if (!this.active) return;
    const s = this.s;
    const out = cloneCanvas(s.base);
    this.drawContent(ctxOf(out), s.src);
    s.L.canvas = out;
    rasterizeText(s.L);
    if (s.srcMask) {
      const m = blankMask();
      this.drawContent(ctxOf(m), s.srcMask);
      app.doc.selection = buildSelection(m);
    }
    this.active = false;
    this.s = null;
    this.drag = null;
    app.preview = null;
    commit(name);
    buildOptionsBar();
    updateCursor();
  },

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.s = null;
    this.drag = null;
    app.preview = null;
    buildOptionsBar();
    updateCursor();
    requestRender();
  },

  key(e) {
    if (e.key === 'Enter') {
      this.apply();
      return true;
    }
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    // Löschen während der Transformation würde beim Anwenden ohnehin überschrieben
    return e.key === 'Backspace' || e.key === 'Delete';
  },

  overlay(g) {
    const s = this.s;
    if (!s) return;
    const hs = this.handles().map((h) => ({ ...h, sp: docToScreen(h.p.x, h.p.y) }));
    const corners = [0, 2, 4, 6].map((i) => hs[i].sp);
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = '#4c8dff';
    g.beginPath();
    corners.forEach((c, i) => (i ? g.lineTo(c.x, c.y) : g.moveTo(c.x, c.y)));
    g.closePath();
    g.stroke();
    g.fillStyle = '#fff';
    for (const h of hs) {
      g.fillRect(h.sp.x - 4, h.sp.y - 4, 8, 8);
      g.strokeRect(h.sp.x - 4 + 0.5, h.sp.y - 4 + 0.5, 7, 7);
    }
    const c = docToScreen(s.cx, s.cy);
    g.beginPath();
    g.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  },
};

// Spiegeln/Drehen der aktiven Ebene (bzw. Auswahl) ohne interaktiven Rahmen
function quickTransform(fn, name) {
  if (Transform.active) Transform.apply();
  if (!Transform.begin()) return;
  fn(Transform.s);
  Transform.apply(name);
}

/* ---------- Werkzeugwechsel & Interaktionen ---------- */

function currentHandler() {
  return Transform.active ? Transform : Tools[app.tool];
}

function setTool(name) {
  if (!Tools[name]) return;
  if (name !== app.tool) {
    finishInteractions();
    const prev = Tools[app.tool];
    if (prev && prev.deactivate) prev.deactivate();
    app.tool = name;
    if (Tools[name].activate) Tools[name].activate();
    storageSet('pytheas-studio:tool', name);
  }
  updateToolbar();
  buildOptionsBar();
  updateCursor();
  requestOverlay();
}

function finishInteractions() {
  if (TextEdit.active) commitText();
  if (Transform.active) Transform.apply();
}

function cancelInteractions() {
  if (TextEdit.active) cancelText();
  if (Transform.active) Transform.cancel();
  for (const t of Object.values(Tools)) if (t.cancel) t.cancel();
  Crop.rect = null;
  Crop.drag = null;
  dragHandler = null;
  app.preview = null;
  app.selOffset = null;
}
