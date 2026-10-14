'use strict';
/* Pytheas Studio — Hilfsfunktionen (DOM, Canvas, Farben, Dateien) */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

function el(tag, attrs, ...children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

/* ---------- Canvas ---------- */

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctxOf(c) {
  return c.getContext('2d');
}

function cloneCanvas(src) {
  const c = createCanvas(src.width, src.height);
  ctxOf(c).drawImage(src, 0, 0);
  return c;
}

function cropCanvas(src, x, y, w, h) {
  const c = createCanvas(w, h);
  ctxOf(c).drawImage(src, -x, -y);
  return c;
}

function readPixels(c) {
  return ctxOf(c).getImageData(0, 0, c.width, c.height);
}

function canvasFromImageData(id) {
  const c = createCanvas(id.width, id.height);
  ctxOf(c).putImageData(id, 0, 0);
  return c;
}

function copyImageData(id) {
  return new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
}

// Begrenzungsrahmen aller Pixel mit Deckkraft > threshold
function alphaBounds(canvas, threshold = 0) {
  const w = canvas.width, h = canvas.height;
  const d = readPixels(canvas).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Hochwertiges Skalieren (stufenweises Verkleinern gegen Treppchen/Moiré)
function resizeCanvas(src, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur = src, cw = src.width, ch = src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    cw = Math.max(w, Math.floor(cw / 2));
    ch = Math.max(h, Math.floor(ch / 2));
    const t = createCanvas(cw, ch);
    const g = ctxOf(t);
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, cw, ch);
    cur = t;
  }
  const out = createCanvas(w, h);
  const g = ctxOf(out);
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, w, h);
  return out;
}

// Chamfer-Distanztransformation: Abstand jedes Pixels zum nächsten "inside"-Pixel
function distanceField(inside, w, h) {
  const INF = 1e9, D1 = 1, D2 = Math.SQRT2;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + D1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + D2);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + D2);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, d[i + 1] + D1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + D1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + D2);
        if (x > 0) v = Math.min(v, d[i + w - 1] + D2);
      }
      d[i] = v;
    }
  }
  return d;
}

/* ---------- Farben ---------- */

function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

function rgba(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function isHexColor(s) {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
}

/* ---------- Dateien ---------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const isUrl = typeof src === 'string';
    const url = isUrl ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      if (!isUrl) setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    img.onerror = () => {
      if (!isUrl) URL.revokeObjectURL(url);
      reject(new Error('Bildformat wird nicht unterstützt'));
    };
    img.src = url;
  });
}

function imageToCanvas(img) {
  const w = img.naturalWidth || img.width || 1000;
  const h = img.naturalHeight || img.height || 1000;
  const c = createCanvas(w, h);
  ctxOf(c).drawImage(img, 0, 0, w, h);
  return c;
}

function canvasToBlob(c, type = 'image/png', quality) {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export fehlgeschlagen'))), type, quality)
  );
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function baseName(name) {
  return String(name || 'Unbenannt').replace(/\.[^.]+$/, '') || 'Unbenannt';
}

function debounce(fn, ms) {
  let t = 0;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

function storageGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – egal */
  }
}
