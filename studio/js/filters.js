'use strict';
/* Pytheas Studio — Korrekturen und Filter (arbeiten direkt auf ImageData) */

/* ---------- Weichzeichnen (3× Box-Blur ≈ Gauß, mit vormultipliziertem Alpha) ---------- */

function boxesForGauss(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

// Horizontaler Box-Blur, alle vier Kanäle gleichzeitig, Ränder werden fortgesetzt
function boxBlurH(src, dst, w, h, r) {
  const iarr = 1 / (2 * r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = -r; k <= r; k++) {
      const j = row + (k < 0 ? 0 : k > last ? last : k) * 4;
      s0 += src[j];
      s1 += src[j + 1];
      s2 += src[j + 2];
      s3 += src[j + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = row + x * 4;
      dst[o] = s0 * iarr;
      dst[o + 1] = s1 * iarr;
      dst[o + 2] = s2 * iarr;
      dst[o + 3] = s3 * iarr;
      const a = row + (x + r + 1 > last ? last : x + r + 1) * 4;
      const s = row + (x - r < 0 ? 0 : x - r) * 4;
      s0 += src[a] - src[s];
      s1 += src[a + 1] - src[s + 1];
      s2 += src[a + 2] - src[s + 2];
      s3 += src[a + 3] - src[s + 3];
    }
  }
}

// Vertikaler Box-Blur zeilenweise mit laufenden Spaltensummen (cache-freundlich)
function boxBlurV(src, dst, w, h, r) {
  const iarr = 1 / (2 * r + 1);
  const rowLen = w * 4;
  const last = h - 1;
  const sums = new Float64Array(rowLen);
  for (let k = -r; k <= r; k++) {
    const ro = (k < 0 ? 0 : k > last ? last : k) * rowLen;
    for (let i = 0; i < rowLen; i++) sums[i] += src[ro + i];
  }
  for (let y = 0; y < h; y++) {
    const o = y * rowLen;
    const ao = (y + r + 1 > last ? last : y + r + 1) * rowLen;
    const so = (y - r < 0 ? 0 : y - r) * rowLen;
    for (let i = 0; i < rowLen; i++) {
      dst[o + i] = sums[i] * iarr;
      sums[i] += src[ao + i] - src[so + i];
    }
  }
}

function blurRGBA(data, w, h, radius) {
  if (!(radius > 0)) return;
  const n = w * h;
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const al = data[j + 3] / 255;
    a[j] = data[j] * al;
    a[j + 1] = data[j + 1] * al;
    a[j + 2] = data[j + 2] * al;
    a[j + 3] = data[j + 3];
  }
  for (const box of boxesForGauss(radius, 3)) {
    const r = Math.max(0, (box - 1) / 2);
    if (r === 0) continue;
    boxBlurH(a, b, w, h, r);
    boxBlurV(b, a, w, h, r);
  }
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const al = a[j + 3];
    if (al > 0.01) {
      const k = 255 / al;
      data[j] = a[j] * k;
      data[j + 1] = a[j + 1] * k;
      data[j + 2] = a[j + 2] * k;
      data[j + 3] = al;
    } else {
      data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0;
    }
  }
}

// GPU-Weichzeichner über ctx.filter, falls der Browser ihn unterstützt (sonst JS)
let canvasBlurSupported = null;
function supportsCanvasBlur() {
  if (canvasBlurSupported !== null) return canvasBlurSupported;
  try {
    const c = createCanvas(9, 9);
    const g = ctxOf(c);
    g.filter = 'blur(2px)';
    g.fillStyle = '#fff';
    g.fillRect(4, 4, 1, 1);
    canvasBlurSupported = g.getImageData(2, 4, 1, 1).data[3] > 0;
  } catch {
    canvasBlurSupported = false;
  }
  return canvasBlurSupported;
}

function gaussianBlurCanvas(src, sigma) {
  const w = src.width, h = src.height;
  if (!(sigma > 0)) return cloneCanvas(src);
  if (!supportsCanvasBlur()) {
    const id = readPixels(src);
    blurRGBA(id.data, w, h, sigma);
    return canvasFromImageData(id);
  }
  // Rand nach außen fortsetzen, damit die Bildkanten nicht ausfransen
  const pad = Math.ceil(sigma * 3) + 2;
  const big = createCanvas(w + 2 * pad, h + 2 * pad);
  const g = ctxOf(big);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, pad, pad);
  g.drawImage(src, 0, 0, w, 1, pad, 0, w, pad);
  g.drawImage(src, 0, h - 1, w, 1, pad, pad + h, w, pad);
  g.drawImage(src, 0, 0, 1, h, 0, pad, pad, h);
  g.drawImage(src, w - 1, 0, 1, h, pad + w, pad, pad, h);
  g.drawImage(src, 0, 0, 1, 1, 0, 0, pad, pad);
  g.drawImage(src, w - 1, 0, 1, 1, pad + w, 0, pad, pad);
  g.drawImage(src, 0, h - 1, 1, 1, 0, pad + h, pad, pad);
  g.drawImage(src, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
  const out = createCanvas(w, h);
  const go = ctxOf(out);
  go.filter = `blur(${sigma}px)`;
  go.drawImage(big, -pad, -pad);
  go.filter = 'none';
  return out;
}

/* ---------- Farbraum-Helfer (inline für Tempo) ---------- */

function rgbToHslInto(r, g, b, out) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
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
  out[0] = h;
  out[1] = s;
  out[2] = l;
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgbInto(h, s, l, out) {
  if (s === 0) {
    out[0] = out[1] = out[2] = l * 255;
    return;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[0] = hue2rgb(p, q, h + 1 / 3) * 255;
  out[1] = hue2rgb(p, q, h) * 255;
  out[2] = hue2rgb(p, q, h - 1 / 3) * 255;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function applyLUT(d, lut) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
}

function convolve3(id, k, { bias = 0, gray = false } = {}) {
  const { width: w, height: h, data: s } = id;
  const src = new Uint8ClampedArray(s);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const yy = clamp(y + ky, 0, h - 1);
        for (let kx = -1; kx <= 1; kx++) {
          const xx = clamp(x + kx, 0, w - 1);
          const j = (yy * w + xx) * 4;
          const kv = k[(ky + 1) * 3 + kx + 1];
          r += src[j] * kv;
          g += src[j + 1] * kv;
          b += src[j + 2] * kv;
        }
      }
      const i = (y * w + x) * 4;
      if (gray) {
        const v = luma(r, g, b) + bias;
        s[i] = s[i + 1] = s[i + 2] = v;
      } else {
        s[i] = r + bias;
        s[i + 1] = g + bias;
        s[i + 2] = b + bias;
      }
    }
  }
}

/* ---------- Filterkatalog ---------- */

const Filters = {
  invert(id) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  },

  desaturate(id) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = luma(d[i], d[i + 1], d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  },

  sepia(id) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = r * 0.393 + g * 0.769 + b * 0.189;
      d[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
      d[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
    }
  },

  brightnessContrast(id, { brightness = 0, contrast = 0 }) {
    const c = clamp(contrast, -100, 100) * 2.55;
    const f = (259 * (c + 255)) / (255 * (259 - c));
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = f * (v + brightness - 128) + 128;
    applyLUT(id.data, lut);
  },

  levels(id, { inBlack = 0, inWhite = 255, gamma = 1, outBlack = 0, outWhite = 255 }) {
    const lo = Math.min(inBlack, inWhite - 1);
    const range = Math.max(1, inWhite - lo);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      const t = clamp((v - lo) / range, 0, 1);
      lut[v] = outBlack + Math.pow(t, 1 / gamma) * (outWhite - outBlack);
    }
    applyLUT(id.data, lut);
  },

  autoContrast(id) {
    const d = id.data;
    const hist = new Uint32Array(256);
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      hist[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++;
      n++;
    }
    if (!n) return;
    const cut = n * 0.005;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) <= cut) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) <= cut) hi--;
    if (hi <= lo) return;
    Filters.levels(id, { inBlack: lo, inWhite: hi, gamma: 1, outBlack: 0, outWhite: 255 });
  },

  hueSaturation(id, { hue = 0, saturation = 0, lightness = 0, colorize = false }) {
    const d = id.data;
    const hs = [0, 0, 0], rgb = [0, 0, 0];
    const dh = hue / 360;
    const ds = saturation / 100;
    const dl = lightness / 100;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      rgbToHslInto(d[i], d[i + 1], d[i + 2], hs);
      let h, s, l = hs[2];
      if (colorize) {
        h = ((hue + 360) % 360) / 360;
        s = clamp(0.25 + ds * 0.75, 0, 1);
      } else {
        h = hs[0] + dh;
        if (h < 0) h += 1;
        if (h > 1) h -= 1;
        s = ds >= 0 ? hs[1] + (1 - hs[1]) * ds * hs[1] : hs[1] * (1 + ds);
        s = clamp(s, 0, 1);
      }
      l = dl >= 0 ? l + (1 - l) * dl : l * (1 + dl);
      hslToRgbInto(h, s, l, rgb);
      d[i] = rgb[0];
      d[i + 1] = rgb[1];
      d[i + 2] = rgb[2];
    }
  },

  vibrance(id, { amount = 0 }) {
    const d = id.data;
    const a = amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b);
      const sat = (max - Math.min(r, g, b)) / 255;
      // wenig gesättigte Farben werden stärker angehoben als bereits kräftige
      const k = -a * (1 - sat) * 1.5;
      d[i] = r + (max - r) * k;
      d[i + 1] = g + (max - g) * k;
      d[i + 2] = b + (max - b) * k;
    }
  },

  temperature(id, { temp = 0, tint = 0 }) {
    const d = id.data;
    const t = temp * 0.6, n = tint * 0.6;
    for (let i = 0; i < d.length; i += 4) {
      d[i] += t;
      d[i + 1] += n;
      d[i + 2] -= t;
    }
  },

  threshold(id, { level = 128 }) {
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = luma(d[i], d[i + 1], d[i + 2]) >= level ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  },

  posterize(id, { levels = 4 }) {
    const n = clamp(Math.round(levels), 2, 255) - 1;
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = (Math.round((v / 255) * n) / n) * 255;
    applyLUT(id.data, lut);
  },

  // blurredData: optional bereits weichgezeichnete Pixel (z. B. von der GPU)
  unsharpMask(id, { amount = 100, radius = 2, threshold = 0 }, blurredData) {
    let b = blurredData;
    if (!b) {
      const blurred = copyImageData(id);
      blurRGBA(blurred.data, id.width, id.height, radius);
      b = blurred.data;
    }
    const d = id.data;
    const k = amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = d[i + c] - b[i + c];
        if (Math.abs(diff) >= threshold) d[i + c] = d[i + c] + diff * k;
      }
    }
  },

  addNoise(id, { amount = 20, mono = true }) {
    const d = id.data;
    const a = amount * 2.55;
    for (let i = 0; i < d.length; i += 4) {
      if (mono) {
        const n = (Math.random() - 0.5) * 2 * a;
        d[i] += n;
        d[i + 1] += n;
        d[i + 2] += n;
      } else {
        d[i] += (Math.random() - 0.5) * 2 * a;
        d[i + 1] += (Math.random() - 0.5) * 2 * a;
        d[i + 2] += (Math.random() - 0.5) * 2 * a;
      }
    }
  },

  pixelate(id, { size = 10 }) {
    const { width: w, height: h, data: d } = id;
    const s = Math.max(1, Math.round(size));
    for (let by = 0; by < h; by += s) {
      for (let bx = 0; bx < w; bx += s) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        const ex = Math.min(bx + s, w), ey = Math.min(by + s, h);
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            const al = d[i + 3];
            r += d[i] * al;
            g += d[i + 1] * al;
            b += d[i + 2] * al;
            a += al;
            n++;
          }
        }
        const ar = a || 1;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            d[i] = r / ar;
            d[i + 1] = g / ar;
            d[i + 2] = b / ar;
            d[i + 3] = a / n;
          }
        }
      }
    }
  },

  emboss(id, { strength = 1 }) {
    const s = strength;
    convolve3(id, [-s, -s, 0, -s, 0, s, 0, s, s], { bias: 128, gray: true });
  },

  sharpen(id) {
    convolve3(id, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
  },

  findEdges(id) {
    const { width: w, height: h, data: s } = id;
    const src = new Uint8ClampedArray(s);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const p = (dx, dy) => src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c];
          const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
          const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
          s[i + c] = 255 - Math.min(255, Math.hypot(gx, gy));
        }
      }
    }
  },

  vignette(id, { amount = 50, size = 50 }) {
    const { width: w, height: h, data: d } = id;
    const cx = w / 2, cy = h / 2;
    const maxD = Math.hypot(cx, cy);
    const inner = clamp(size / 100, 0, 0.99);
    const a = amount / 100;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = clamp((Math.hypot(x - cx, y - cy) / maxD - inner) / (1 - inner), 0, 1);
        const f = 1 - a * t * t * (3 - 2 * t);
        const i = (y * w + x) * 4;
        d[i] *= f;
        d[i + 1] *= f;
        d[i + 2] *= f;
      }
    }
  },
};
