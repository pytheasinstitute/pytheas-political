// ─── Pixelwerk core: namespace, helpers, colour maths, event bus ───
// Plain scripts (no modules) so the app also runs when index.html is opened from disk.
'use strict';

window.PW = {};

(function (PW) {
  // ─── Math & geometry ───
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function normRect(x0, y0, x1, y1) {
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }

  function rectUnion(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }

  // Integer rect clipped to [0,0,w,h]; null when empty.
  function clipRect(r, w, h) {
    const x0 = clamp(Math.floor(r.x), 0, w), y0 = clamp(Math.floor(r.y), 0, h);
    const x1 = clamp(Math.ceil(r.x + r.w), 0, w), y1 = clamp(Math.ceil(r.y + r.h), 0, h);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ─── Canvas helpers ───
  function createCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function cloneCanvas(src) {
    const c = createCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // Bounding box of non-transparent pixels, or null if the canvas is empty.
  function alphaBounds(canvas, threshold = 0) {
    const w = canvas.width, h = canvas.height;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      let row = y * w * 4 + 3;
      for (let x = 0; x < w; x++, row += 4) {
        if (d[row] > threshold) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Reusable, cleared work canvases keyed by purpose, so hot paths avoid reallocating.
  const scratchPool = new Map();
  function scratch(key, w, h) {
    let c = scratchPool.get(key);
    if (!c) {
      c = createCanvas(w, h);
      scratchPool.set(key, c);
    } else if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    } else {
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
    }
    return c;
  }

  let checkerPattern = null;
  function checker(ctx, size = 8) {
    if (!checkerPattern) {
      const c = createCanvas(size * 2, size * 2);
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, size * 2, size * 2);
      g.fillStyle = '#cccccc';
      g.fillRect(0, 0, size, size);
      g.fillRect(size, size, size, size);
      checkerPattern = c;
    }
    return ctx.createPattern(checkerPattern, 'repeat');
  }

  // ─── Colour maths ───
  function hexToRgb(hex) {
    let s = String(hex || '').trim().replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    if (typeof r === 'object') ({ r, g, b } = r);
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  // h 0..360, s/v 0..100
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? (d / max) * 100 : 0, v: max * 100 };
  }

  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = v - c;
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  // All in 0..1 – used by the pixel filters, so kept allocation-free via out array.
  function rgbToHsl(r, g, b, out) {
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    out[0] = h; out[1] = s; out[2] = l;
    return out;
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hslToRgb(h, s, l, out) {
    if (s === 0) { out[0] = out[1] = out[2] = l; return out; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    out[0] = hue2rgb(p, q, h + 1 / 3);
    out[1] = hue2rgb(p, q, h);
    out[2] = hue2rgb(p, q, h - 1 / 3);
    return out;
  }

  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  // ─── DOM helpers ───
  // el('div', {class:'x', onclick: fn}, [children…])
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k in node && typeof v !== 'string') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children != null) {
      for (const c of [].concat(children)) {
        if (c == null || c === false) continue;
        node.append(c instanceof Node ? c : document.createTextNode(String(c)));
      }
    }
    return node;
  }

  // Resolves true when the file was handed over. Inside a claude.ai artifact the frame
  // cannot download by itself, so the viewer's own save prompt is used there.
  async function download(blob, filename) {
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const dl = await window.claude.use('downloads');
        if (dl) {
          // Project files travel as JSON there; Öffnen accepts both extensions.
          await dl.save({ filename: /\.pxw$/i.test(filename) ? `${filename}.json` : filename, data: blob });
          return true;
        }
      } catch (e) {
        if (e && (e.code === 'declined' || e.code === 'rate_limited')) return false;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.src = src;
    });
  }

  async function imageFromBlob(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await loadImage(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  const fmt = (n, d = 0) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0 });

  // ─── Event bus ───
  const listeners = new Map();
  const bus = {
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    emit(evt, data) {
      const set = listeners.get(evt);
      if (set) for (const fn of [...set]) fn(data);
    },
  };

  let uidCounter = 0;
  const uid = (prefix = 'id') => `${prefix}${++uidCounter}`;

  // Global, monotonically increasing content version for copy-on-write history.
  let versionCounter = 0;
  const nextVersion = () => ++versionCounter;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  PW.util = {
    clamp, lerp, dist, normRect, rectUnion, clipRect,
    createCanvas, cloneCanvas, alphaBounds, checker, scratch,
    hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, luma,
    el, download, loadImage, imageFromBlob, fmt, uid, nextVersion, isMac,
  };
  PW.bus = bus;

  // ─── Tool registry (tools/*.js register themselves; order of groups = toolbar order) ───
  PW.tools = {
    list: [],
    byId: {},
    groups: ['move', 'marquee', 'lasso', 'wand', 'crop', 'eyedropper', 'heal', 'brush', 'clone', 'history', 'eraser', 'fill', 'blur', 'dodge', 'text', 'shape', 'hand', 'zoom'],
    register(def) {
      def.options = def.options || {};
      this.list.push(def);
      this.byId[def.id] = def;
      return def;
    },
    inGroup(group) {
      return this.list.filter(t => t.group === group && !t.hidden);
    },
  };
})(window.PW);
