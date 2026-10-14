// ─── Pixel operations: adjustments (Korrekturen) and filters, all on ImageData ───
'use strict';

(function (PW) {
  const { clamp, rgbToHsl, hslToRgb, hexToRgb } = PW.util;

  // ─── Blur primitives ───
  function boxesForGauss(sigma, n) {
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
    const m = Math.round(mIdeal);
    const sizes = [];
    for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
    return sizes;
  }

  function boxH(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1), last = w - 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + (k < 0 ? 0 : k > last ? last : k)];
      for (let x = 0; x < w; x++) {
        dst[row + x] = acc * norm;
        const add = x + r + 1, rem = x - r;
        acc += src[row + (add > last ? last : add)] - src[row + (rem < 0 ? 0 : rem)];
      }
    }
  }

  // Vertical pass walks rows with one running sum per column (cache-friendly).
  function boxV(src, dst, w, h, r) {
    const norm = 1 / (2 * r + 1), last = h - 1;
    const acc = new Float64Array(w);
    for (let k = -r; k <= r; k++) {
      const row = (k < 0 ? 0 : k > last ? last : k) * w;
      for (let x = 0; x < w; x++) acc[x] += src[row + x];
    }
    for (let y = 0; y < h; y++) {
      const out = y * w, add = (y + r + 1 > last ? last : y + r + 1) * w, rem = (y - r < 0 ? 0 : y - r) * w;
      for (let x = 0; x < w; x++) {
        dst[out + x] = acc[x] * norm;
        acc[x] += src[add + x] - src[rem + x];
      }
    }
  }

  // In-place approximate gaussian blur of a single float plane.
  function blurPlane(f, w, h, sigma, tmp) {
    if (sigma < 0.3) return f;
    tmp = tmp || new Float32Array(f.length);
    for (const size of boxesForGauss(sigma, 3)) {
      const r = (size - 1) >> 1;
      if (r < 1) continue;
      boxH(f, tmp, w, h, r);
      boxV(tmp, f, w, h, r);
    }
    return f;
  }

  // Splits RGBA into premultiplied float planes (avoids dark fringes at transparent edges).
  function toPlanes(img) {
    const d = img.data, n = img.width * img.height;
    const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const al = d[j + 3] / 255;
      r[i] = d[j] * al;
      g[i] = d[j + 1] * al;
      b[i] = d[j + 2] * al;
      a[i] = d[j + 3];
    }
    return [r, g, b, a];
  }

  function fromPlanes(img, [r, g, b, a]) {
    const d = img.data, n = img.width * img.height;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const al = a[i];
      if (al > 0.01) {
        const k = 255 / al;
        d[j] = r[i] * k;
        d[j + 1] = g[i] * k;
        d[j + 2] = b[i] * k;
      }
      d[j + 3] = al;
    }
  }

  function gaussianBlur(img, sigma) {
    if (sigma < 0.3) return;
    const d = img.data, n = img.width * img.height, tmp = new Float32Array(n);
    let opaque = true;
    for (let j = 3; j < d.length; j += 4) {
      if (d[j] !== 255) {
        opaque = false;
        break;
      }
    }
    if (!opaque) {
      const planes = toPlanes(img);
      for (const p of planes) blurPlane(p, img.width, img.height, sigma, tmp);
      fromPlanes(img, planes);
      return;
    }
    // Fully opaque (typical photo): no premultiplication and no alpha plane needed.
    const plane = new Float32Array(n);
    for (let c = 0; c < 3; c++) {
      for (let i = 0, j = c; i < n; i++, j += 4) plane[i] = d[j];
      blurPlane(plane, img.width, img.height, sigma, tmp);
      for (let i = 0, j = c; i < n; i++, j += 4) d[j] = plane[i];
    }
  }

  function copyImage(img) {
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  }

  // ─── Lookup-table helpers ───
  function applyLUT(img, lr, lg, lb) {
    const d = img.data;
    lg = lg || lr;
    lb = lb || lr;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lr[d[i]];
      d[i + 1] = lg[d[i + 1]];
      d[i + 2] = lb[d[i + 2]];
    }
  }

  function makeLUT(fn) {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(fn(i));
    return lut;
  }

  // Monotone cubic (Fritsch–Carlson) curve through control points in 0..255.
  function curveLUT(points) {
    const pts = [...points].sort((a, b) => a.x - b.x);
    const n = pts.length;
    if (n < 2) return makeLUT(i => i);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const dx = [], dy = [], m = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(xs[i + 1] - xs[i] || 1e-6);
      dy.push(ys[i + 1] - ys[i]);
      m.push(dy[i] / dx[i]);
    }
    const t = [m[0]];
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    t.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) {
        t[i] = t[i + 1] = 0;
        continue;
      }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
    return makeLUT(x => {
      if (x <= xs[0]) return clamp(ys[0], 0, 255);
      if (x >= xs[n - 1]) return clamp(ys[n - 1], 0, 255);
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = dx[i], u = (x - xs[i]) / h, u2 = u * u, u3 = u2 * u;
      const v = (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * t[i + 1];
      return clamp(v, 0, 255);
    });
  }

  function histogram(img) {
    const d = img.data;
    const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      r[d[i]]++;
      g[d[i + 1]]++;
      b[d[i + 2]]++;
      l[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
    }
    return { r, g, b, l };
  }

  // Low/high input levels that clip `clip` fraction of pixels on each side.
  function clipRange(hist, clip) {
    let total = 0;
    for (let i = 0; i < 256; i++) total += hist[i];
    if (!total) return [0, 255];
    const limit = total * clip;
    let lo = 0, hi = 255, acc = 0;
    for (lo = 0; lo < 255; lo++) { acc += hist[lo]; if (acc > limit) break; }
    acc = 0;
    for (hi = 255; hi > 0; hi--) { acc += hist[hi]; if (acc > limit) break; }
    return hi <= lo ? [0, 255] : [lo, hi];
  }

  const stretch = (lo, hi) => makeLUT(i => ((i - lo) / (hi - lo)) * 255);

  // ─── Sampling for distortions ───
  function bilinear(src, w, h, x, y, out) {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0, fy = y - y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    for (let c = 0; c < 4; c++) {
      const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
      const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
      out[c] = top + (bot - top) * fy;
    }
    return out;
  }

  // dest(x,y) = source(map(x,y)); coordinates are document-relative via ctx offset.
  function displace(img, ctx, map) {
    const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
    const out = [0, 0, 0, 0], p = { x: 0, y: 0 };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        p.x = x;
        p.y = y;
        if (map(p, x, y)) {
          bilinear(src, w, h, p.x, p.y, out);
          const j = (y * w + x) * 4;
          d[j] = out[0];
          d[j + 1] = out[1];
          d[j + 2] = out[2];
          d[j + 3] = out[3];
        }
      }
    }
  }

  function convolve3(img, k, opts = {}) {
    const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
    const bias = opts.bias || 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, ki = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -1; dx <= 1; dx++, ki++) {
            const j = (yy * w + clamp(x + dx, 0, w - 1)) * 4, kv = k[ki];
            r += src[j] * kv;
            g += src[j + 1] * kv;
            b += src[j + 2] * kv;
          }
        }
        const j = (y * w + x) * 4;
        d[j] = r + bias;
        d[j + 1] = g + bias;
        d[j + 2] = b + bias;
      }
    }
  }

  // Seeded value noise for the clouds filter.
  function makeNoise(seed) {
    const perm = new Uint8Array(512), vals = new Float32Array(256);
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
      vals[i] = rnd();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const a = vals[perm[X + perm[Y]]], b = vals[perm[X + 1 + perm[Y]]];
      const c = vals[perm[X + perm[Y + 1]]], d = vals[perm[X + 1 + perm[Y + 1]]];
      const u = sm(xf), v = sm(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function gaussRand() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ─── Operations: fn(img, params, ctx) mutates img in place ───
  // ctx: { x0, y0, W, H, fg, bg } — region offset and document size.
  const ops = {
    brightnessContrast(img, p) {
      const c = clamp(p.contrast, -50, 100) / 100;
      const f = Math.tan(((c * 0.75 + 1) * Math.PI) / 4);
      const b = p.brightness;
      applyLUT(img, makeLUT(i => {
        let v = i + b * (1 - Math.abs(i - 127.5) / 255);
        return (v - 127.5) * f + 127.5;
      }));
    },

    levels(img, p) {
      const ib = p.inBlack, iw = Math.max(p.inWhite, ib + 1), g = 1 / p.gamma;
      applyLUT(img, makeLUT(i => {
        const v = clamp((i - ib) / (iw - ib), 0, 1) ** g;
        return p.outBlack + v * (p.outWhite - p.outBlack);
      }));
    },

    curves(img, p) {
      const rgb = curveLUT(p.rgb);
      const ch = k => {
        const c = curveLUT(p[k]);
        return makeLUT(i => rgb[c[i]]);
      };
      applyLUT(img, ch('r'), ch('g'), ch('b'));
    },

    exposure(img, p) {
      const k = 2 ** p.exposure, g = 1 / p.gamma;
      applyLUT(img, makeLUT(i => clamp((i / 255) * k + p.offset, 0, 1) ** g * 255));
    },

    vibrance(img, p) {
      const d = img.data, vib = p.vibrance / 100, sat = p.saturation / 100;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const avg = (r + g + b) / 3, s = (mx - mn) / 255;
        const k = 1 + vib * (1 - s) * (vib > 0 ? 1.4 : 1);
        r = avg + (r - avg) * k;
        g = avg + (g - avg) * k;
        b = avg + (b - avg) * k;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        d[i] = l + (r - l) * (1 + sat);
        d[i + 1] = l + (g - l) * (1 + sat);
        d[i + 2] = l + (b - l) * (1 + sat);
      }
    },

    hueSaturation(img, p) {
      const d = img.data, hsl = [0, 0, 0], rgb = [0, 0, 0];
      const dh = p.hue / 360, ds = p.saturation / 100, dl = p.lightness / 100;
      for (let i = 0; i < d.length; i += 4) {
        rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, hsl);
        let [h, s, l] = hsl;
        if (p.colorize) {
          h = ((p.hue + 360) % 360) / 360;
          s = clamp(0.25 + ds * 0.75, 0, 1);
        } else {
          h = (h + dh + 1) % 1;
          s = ds > 0 ? s + (1 - s) * ds * s ** 0.3 : s * (1 + ds);
          s = clamp(s, 0, 1);
        }
        l = dl > 0 ? l + (1 - l) * dl : l * (1 + dl);
        hslToRgb(h, s, l, rgb);
        d[i] = rgb[0] * 255;
        d[i + 1] = rgb[1] * 255;
        d[i + 2] = rgb[2] * 255;
      }
    },

    colorBalance(img, p) {
      const d = img.data;
      const sr = p.cyanRed * 0.6, sg = p.magentaGreen * 0.6, sb = p.yellowBlue * 0.6;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const w = p.tone === 'shadows' ? (1 - l) ** 2 : p.tone === 'highlights' ? l * l : 1 - Math.abs(2 * l - 1);
        let nr = r + sr * w, ng = g + sg * w, nb = b + sb * w;
        if (p.preserve) {
          const nl = (0.299 * nr + 0.587 * ng + 0.114 * nb) / 255, k = nl > 0 ? l / nl : 1;
          nr *= k; ng *= k; nb *= k;
        }
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    },

    blackWhite(img, p) {
      const d = img.data;
      const R = p.reds / 100, Y = p.yellows / 100, G = p.greens / 100, C = p.cyans / 100, B = p.blues / 100, M = p.magentas / 100;
      const tint = p.tint ? hexToRgb(p.tintColor) : null;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        let mx, md, mn, wMax, wMid;
        if (r >= g && r >= b) {
          mx = r;
          if (g >= b) { md = g; mn = b; wMid = Y; } else { md = b; mn = g; wMid = M; }
          wMax = R;
        } else if (g >= r && g >= b) {
          mx = g;
          if (r >= b) { md = r; mn = b; wMid = Y; } else { md = b; mn = r; wMid = C; }
          wMax = G;
        } else {
          mx = b;
          if (r >= g) { md = r; mn = g; wMid = M; } else { md = g; mn = r; wMid = C; }
          wMax = B;
        }
        let v = clamp(mn + (mx - md) * wMax + (md - mn) * wMid, 0, 255);
        if (tint) {
          const l = v / 255;
          d[i] = l * 255 + (tint.r - 128) * (1 - Math.abs(2 * l - 1)) * 0.6;
          d[i + 1] = l * 255 + (tint.g - 128) * (1 - Math.abs(2 * l - 1)) * 0.6;
          d[i + 2] = l * 255 + (tint.b - 128) * (1 - Math.abs(2 * l - 1)) * 0.6;
        } else {
          d[i] = d[i + 1] = d[i + 2] = v;
        }
      }
    },

    photoFilter(img, p) {
      const d = img.data, c = hexToRgb(p.color) || { r: 236, g: 138, b: 0 }, k = p.density / 100;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        let nr = r + (((r * c.r) / 255) - r) * k * 0.5 + (c.r - r) * k * 0.25;
        let ng = g + (((g * c.g) / 255) - g) * k * 0.5 + (c.g - g) * k * 0.25;
        let nb = b + (((b * c.b) / 255) - b) * k * 0.5 + (c.b - b) * k * 0.25;
        if (p.preserve) {
          const l0 = 0.299 * r + 0.587 * g + 0.114 * b, l1 = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const s = l1 > 0 ? l0 / l1 : 1;
          nr *= s; ng *= s; nb *= s;
        }
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
    },

    shadowsHighlights(img, p, ctx) {
      const w = img.width, h = img.height, d = img.data, n = w * h;
      const lum = new Float32Array(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) lum[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
      const blurred = new Float32Array(lum);
      blurPlane(blurred, w, h, Math.max(4, Math.min(ctx.W, ctx.H) * 0.02));
      const s = p.shadows / 100, hi = p.highlights / 100;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const b = blurred[i];
        let gain = 1 + s * (1 - b) ** 2 * 2.2;
        gain *= 1 - hi * b * b * 0.55;
        d[j] *= gain;
        d[j + 1] *= gain;
        d[j + 2] *= gain;
      }
    },

    invert(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    },

    desaturate(img) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = (mx + mn) / 2;
      }
    },

    posterize(img, p) {
      const n = Math.max(2, p.levels) - 1;
      applyLUT(img, makeLUT(i => Math.round((i / 255) * n) * (255 / n)));
    },

    threshold(img, p) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= p.level ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    },

    gradientMap(img, p, ctx) {
      const a = hexToRgb(p.reverse ? ctx.bg : ctx.fg), b = hexToRgb(p.reverse ? ctx.fg : ctx.bg), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        d[i] = a.r + (b.r - a.r) * t;
        d[i + 1] = a.g + (b.g - a.g) * t;
        d[i + 2] = a.b + (b.b - a.b) * t;
      }
    },

    equalize(img) {
      const hist = new Uint32Array(256), d = img.data;
      let total = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        hist[d[i]]++;
        hist[d[i + 1]]++;
        hist[d[i + 2]]++;
        total += 3;
      }
      if (!total) return;
      let acc = 0;
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        acc += hist[i];
        lut[i] = Math.round((acc / total) * 255);
      }
      applyLUT(img, lut);
    },

    autoTone(img) {
      const hst = histogram(img);
      const [r0, r1] = clipRange(hst.r, 0.001), [g0, g1] = clipRange(hst.g, 0.001), [b0, b1] = clipRange(hst.b, 0.001);
      applyLUT(img, stretch(r0, r1), stretch(g0, g1), stretch(b0, b1));
    },

    autoContrast(img) {
      const hst = histogram(img);
      const all = new Uint32Array(256);
      for (let i = 0; i < 256; i++) all[i] = hst.r[i] + hst.g[i] + hst.b[i];
      const [lo, hi] = clipRange(all, 0.001);
      applyLUT(img, stretch(lo, hi));
    },

    // One-click improvement for beginners: stretch tones, then a little more colour.
    autoEnhance(img) {
      ops.autoTone(img);
      ops.vibrance(img, { vibrance: 25, saturation: 0 });
    },

    autoColor(img) {
      ops.autoTone(img);
      const d = img.data;
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
      }
      if (!n) return;
      const mean = (sr + sg + sb) / (3 * n);
      const gam = m => Math.log(mean / 255) / Math.log(Math.max(1, m / n) / 255);
      const lut = g => makeLUT(i => 255 * (i / 255) ** clamp(g, 0.6, 1.6));
      applyLUT(img, lut(gam(sr)), lut(gam(sg)), lut(gam(sb)));
    },

    gaussianBlur(img, p) {
      gaussianBlur(img, p.radius);
    },

    blur(img) {
      gaussianBlur(img, 1);
    },

    blurMore(img) {
      gaussianBlur(img, 2.5);
    },

    motionBlur(img, p) {
      const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
      const a = (p.angle * Math.PI) / 180, steps = Math.max(1, Math.round(p.distance));
      const ux = Math.cos(a), uy = -Math.sin(a);
      const offs = [];
      for (let s = 0; s <= steps; s++) {
        const t = s - steps / 2;
        offs.push([Math.round(ux * t), Math.round(uy * t)]);
      }
      const n = offs.length;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0, al = 0;
          for (let k = 0; k < n; k++) {
            const xx = clamp(x + offs[k][0], 0, w - 1), yy = clamp(y + offs[k][1], 0, h - 1);
            const j = (yy * w + xx) * 4, A = src[j + 3];
            r += src[j] * A;
            g += src[j + 1] * A;
            b += src[j + 2] * A;
            al += A;
          }
          const j = (y * w + x) * 4;
          if (al > 0) {
            d[j] = r / al;
            d[j + 1] = g / al;
            d[j + 2] = b / al;
          }
          d[j + 3] = al / n;
        }
      }
    },

    unsharpMask(img, p) {
      const blurred = copyImage(img);
      gaussianBlur(blurred, p.radius);
      const d = img.data, bd = blurred.data, k = p.amount / 100, t = p.threshold;
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const diff = d[i + c] - bd[i + c];
          if (Math.abs(diff) >= t) d[i + c] = d[i + c] + diff * k;
        }
      }
    },

    sharpen(img) {
      convolve3(img, [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0]);
    },

    sharpenMore(img) {
      convolve3(img, [-0.5, -0.5, -0.5, -0.5, 5, -0.5, -0.5, -0.5, -0.5]);
    },

    highPass(img, p) {
      const blurred = copyImage(img);
      gaussianBlur(blurred, p.radius);
      const d = img.data, bd = blurred.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 128 + d[i] - bd[i];
        d[i + 1] = 128 + d[i + 1] - bd[i + 1];
        d[i + 2] = 128 + d[i + 2] - bd[i + 2];
      }
    },

    addNoise(img, p) {
      const d = img.data, amt = (p.amount / 100) * 255;
      const rnd = p.distribution === 'gauss' ? () => gaussRand() * 0.5 : () => Math.random() * 2 - 1;
      for (let i = 0; i < d.length; i += 4) {
        if (p.mono) {
          const v = rnd() * amt;
          d[i] += v;
          d[i + 1] += v;
          d[i + 2] += v;
        } else {
          d[i] += rnd() * amt;
          d[i + 1] += rnd() * amt;
          d[i + 2] += rnd() * amt;
        }
      }
    },

    // Sliding-histogram median per channel, O(r) per pixel.
    median(img, p) {
      const w = img.width, h = img.height, r = Math.max(1, Math.round(p.radius));
      const src = new Uint8ClampedArray(img.data), d = img.data;
      const hist = new Uint32Array(256);
      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < h; y++) {
          hist.fill(0);
          const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
          let count = 0;
          const addCol = (x, s) => {
            if (x < 0 || x >= w) return;
            for (let yy = y0; yy <= y1; yy++) {
              hist[src[(yy * w + x) * 4 + c]] += s;
              count += s;
            }
          };
          for (let x = -r; x <= r; x++) addCol(x, 1);
          for (let x = 0; x < w; x++) {
            if (x > 0) {
              addCol(x - r - 1, -1);
              addCol(x + r, 1);
            }
            const half = count >> 1;
            let acc = 0, v = 0;
            for (; v < 255; v++) {
              acc += hist[v];
              if (acc > half) break;
            }
            d[(y * w + x) * 4 + c] = v;
          }
        }
      }
    },

    mosaic(img, p, ctx) {
      const w = img.width, h = img.height, d = img.data, s = Math.max(2, Math.round(p.size));
      const ox = ((ctx.x0 % s) + s) % s, oy = ((ctx.y0 % s) + s) % s;
      for (let by = -oy; by < h; by += s) {
        for (let bx = -ox; bx < w; bx += s) {
          const x0 = Math.max(0, bx), y0 = Math.max(0, by), x1 = Math.min(w, bx + s), y1 = Math.min(h, by + s);
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const j = (y * w + x) * 4, A = d[j + 3];
              r += d[j] * A; g += d[j + 1] * A; b += d[j + 2] * A; a += A; n++;
            }
          }
          if (!n) continue;
          const R = a ? r / a : 0, G = a ? g / a : 0, B = a ? b / a : 0, Al = a / n;
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const j = (y * w + x) * 4;
              d[j] = R; d[j + 1] = G; d[j + 2] = B; d[j + 3] = Al;
            }
          }
        }
      }
    },

    emboss(img, p) {
      const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
      const a = (p.angle * Math.PI) / 180, hgt = Math.max(1, p.height);
      const dx = Math.round(Math.cos(a) * hgt), dy = Math.round(-Math.sin(a) * hgt), k = p.amount / 100;
      const L = j => 0.299 * src[j] + 0.587 * src[j + 1] + 0.114 * src[j + 2];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const j1 = (clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4;
          const j2 = (clamp(y - dy, 0, h - 1) * w + clamp(x - dx, 0, w - 1)) * 4;
          const v = 128 + (L(j1) - L(j2)) * k;
          const j = (y * w + x) * 4;
          d[j] = d[j + 1] = d[j + 2] = v;
        }
      }
    },

    findEdges(img) {
      const w = img.width, h = img.height, src = new Uint8ClampedArray(img.data), d = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const j = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) {
            const P = (dx, dy) => src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c];
            const gx = -P(-1, -1) - 2 * P(-1, 0) - P(-1, 1) + P(1, -1) + 2 * P(1, 0) + P(1, 1);
            const gy = -P(-1, -1) - 2 * P(0, -1) - P(1, -1) + P(-1, 1) + 2 * P(0, 1) + P(1, 1);
            d[j + c] = 255 - Math.min(255, Math.hypot(gx, gy) * 0.5);
          }
        }
      }
    },

    solarize(img) {
      applyLUT(img, makeLUT(i => (i > 127 ? 255 - i : i) * 2));
    },

    twirl(img, p, ctx) {
      const cx = ctx.W / 2 - ctx.x0, cy = ctx.H / 2 - ctx.y0, R = Math.min(ctx.W, ctx.H) / 2;
      const ang = (p.angle * Math.PI) / 180;
      displace(img, ctx, (pt, x, y) => {
        const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
        if (dd >= R) return false;
        const t = ang * (1 - dd / R) ** 2, c = Math.cos(t), s = Math.sin(t);
        pt.x = cx + dx * c - dy * s;
        pt.y = cy + dx * s + dy * c;
        return true;
      });
    },

    spherize(img, p, ctx) {
      const cx = ctx.W / 2 - ctx.x0, cy = ctx.H / 2 - ctx.y0, R = Math.min(ctx.W, ctx.H) / 2;
      const amt = -p.amount / 100;
      displace(img, ctx, (pt, x, y) => {
        const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy);
        if (dd >= R || dd === 0) return false;
        const k = Math.pow(Math.sin((Math.PI / 2) * (dd / R)), amt);
        pt.x = cx + dx * k;
        pt.y = cy + dy * k;
        return true;
      });
    },

    wave(img, p, ctx) {
      const A = p.amplitude, L = Math.max(2, p.wavelength);
      displace(img, ctx, (pt, x, y) => {
        const X = x + ctx.x0, Y = y + ctx.y0;
        pt.x = x + (p.direction !== 'v' ? A * Math.sin((2 * Math.PI * Y) / L) : 0);
        pt.y = y + (p.direction !== 'h' ? A * Math.sin((2 * Math.PI * X) / L) : 0);
        return true;
      });
    },

    clouds(img, p, ctx) {
      const noise = makeNoise(p.seed || 1), d = img.data, w = img.width, h = img.height;
      const a = hexToRgb(ctx.fg), b = hexToRgb(ctx.bg), base = p.scale / Math.max(ctx.W, ctx.H);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let f = base, amp = 0.5, v = 0;
          for (let o = 0; o < 6; o++) {
            v += noise((x + ctx.x0) * f, (y + ctx.y0) * f) * amp;
            f *= 2;
            amp *= 0.5;
          }
          const t = clamp((v - 0.5) * 1.4 + 0.5, 0, 1), j = (y * w + x) * 4;
          d[j] = a.r + (b.r - a.r) * t;
          d[j + 1] = a.g + (b.g - a.g) * t;
          d[j + 2] = a.b + (b.b - a.b) * t;
          d[j + 3] = 255;
        }
      }
    },

    vignette(img, p, ctx) {
      const d = img.data, w = img.width, h = img.height;
      const cx = ctx.W / 2, cy = ctx.H / 2, R = Math.hypot(cx, cy);
      const amt = p.amount / 100, mid = p.midpoint / 100;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const r = Math.hypot(x + ctx.x0 - cx, y + ctx.y0 - cy) / R;
          const t = clamp((r - mid) / (1 - mid + 1e-6), 0, 1);
          const k = 1 - amt * t * t * (3 - 2 * t), j = (y * w + x) * 4;
          if (amt >= 0) {
            d[j] *= k; d[j + 1] *= k; d[j + 2] *= k;
          } else {
            const m = 1 - k;
            d[j] += (255 - d[j]) * -m; d[j + 1] += (255 - d[j + 1]) * -m; d[j + 2] += (255 - d[j + 2]) * -m;
          }
        }
      }
    },
  };

  // ─── Definitions drive menus and dialogs ───
  const R = (key, label, min, max, value, extra) => ({ type: 'range', key, label, min, max, value, step: 1, ...extra });
  const defs = [
    // Image > Adjustments
    { id: 'brightnessContrast', menu: 'adjust', name: 'Helligkeit/Kontrast…', title: 'Helligkeit/Kontrast', icon: 'sun', params: [R('brightness', 'Helligkeit', -150, 150, 0), R('contrast', 'Kontrast', -50, 100, 0)] },
    { id: 'levels', menu: 'adjust', name: 'Tonwertkorrektur…', title: 'Tonwertkorrektur', shortcut: 'Mod+L', dialog: 'levels', icon: 'levels' },
    { id: 'curves', menu: 'adjust', name: 'Gradationskurven…', title: 'Gradationskurven', shortcut: 'Mod+M', dialog: 'curves', icon: 'curves' },
    { id: 'exposure', menu: 'adjust', name: 'Belichtung…', title: 'Belichtung', icon: 'exposure', params: [
      R('exposure', 'Belichtung', -5, 5, 0, { step: 0.01 }), R('offset', 'Versatz', -0.5, 0.5, 0, { step: 0.001 }), R('gamma', 'Gamma', 0.1, 4, 1, { step: 0.01 })] },
    { sep: true, menu: 'adjust' },
    { id: 'vibrance', menu: 'adjust', name: 'Dynamik…', title: 'Dynamik', icon: 'vibrance', params: [R('vibrance', 'Dynamik', -100, 100, 0), R('saturation', 'Sättigung', -100, 100, 0)] },
    { id: 'hueSaturation', menu: 'adjust', name: 'Farbton/Sättigung…', title: 'Farbton/Sättigung', shortcut: 'Mod+U', icon: 'hue', params: [
      R('hue', 'Farbton', -180, 180, 0, { gradient: 'hue' }), R('saturation', 'Sättigung', -100, 100, 0), R('lightness', 'Helligkeit', -100, 100, 0),
      { type: 'check', key: 'colorize', label: 'Färben', value: false }] },
    { id: 'colorBalance', menu: 'adjust', name: 'Farbbalance…', title: 'Farbbalance', shortcut: 'Mod+B', icon: 'balance', params: [
      { type: 'select', key: 'tone', label: 'Farbtonbalance', value: 'midtones', options: [['shadows', 'Tiefen'], ['midtones', 'Mitteltöne'], ['highlights', 'Lichter']] },
      R('cyanRed', 'Cyan ↔ Rot', -100, 100, 0, { gradient: 'cr' }), R('magentaGreen', 'Magenta ↔ Grün', -100, 100, 0, { gradient: 'mg' }), R('yellowBlue', 'Gelb ↔ Blau', -100, 100, 0, { gradient: 'yb' }),
      { type: 'check', key: 'preserve', label: 'Luminanz erhalten', value: true }] },
    { id: 'blackWhite', menu: 'adjust', name: 'Schwarzweiß…', title: 'Schwarzweiß', shortcut: 'Mod+Alt+Shift+B', icon: 'bw', params: [
      R('reds', 'Rottöne', -200, 300, 40), R('yellows', 'Gelbtöne', -200, 300, 60), R('greens', 'Grüntöne', -200, 300, 40),
      R('cyans', 'Cyantöne', -200, 300, 60), R('blues', 'Blautöne', -200, 300, 20), R('magentas', 'Magentatöne', -200, 300, 80),
      { type: 'check', key: 'tint', label: 'Farbton', value: false }, { type: 'color', key: 'tintColor', label: 'Tönung', value: '#c8a26e' }] },
    { id: 'photoFilter', menu: 'adjust', name: 'Fotofilter…', title: 'Fotofilter', icon: 'filter', params: [
      { type: 'color', key: 'color', label: 'Farbe', value: '#ec8a00' }, R('density', 'Dichte', 1, 100, 25, { unit: '%' }),
      { type: 'check', key: 'preserve', label: 'Luminanz erhalten', value: true }] },
    { sep: true, menu: 'adjust' },
    { id: 'shadowsHighlights', menu: 'adjust', name: 'Tiefen/Lichter…', title: 'Tiefen/Lichter', icon: 'sh', params: [R('shadows', 'Tiefen', 0, 100, 35, { unit: '%' }), R('highlights', 'Lichter', 0, 100, 0, { unit: '%' })] },
    { sep: true, menu: 'adjust' },
    { id: 'invert', menu: 'adjust', name: 'Umkehren', shortcut: 'Mod+I', icon: 'invert' },
    { id: 'posterize', menu: 'adjust', name: 'Tontrennung…', title: 'Tontrennung', icon: 'posterize', params: [R('levels', 'Stufen', 2, 32, 4)] },
    { id: 'threshold', menu: 'adjust', name: 'Schwellenwert…', title: 'Schwellenwert', icon: 'threshold', params: [R('level', 'Schwellenwert', 1, 255, 128)] },
    { id: 'gradientMap', menu: 'adjust', name: 'Verlaufsumsetzung…', title: 'Verlaufsumsetzung (Vorder- → Hintergrundfarbe)', icon: 'gradmap', params: [{ type: 'check', key: 'reverse', label: 'Umkehren', value: false }] },
    { sep: true, menu: 'adjust' },
    { id: 'desaturate', menu: 'adjust', name: 'Sättigung verringern', shortcut: 'Mod+Shift+U' },
    { id: 'equalize', menu: 'adjust', name: 'Tonwertangleichung' },

    // Image (auto)
    { id: 'autoEnhance', menu: 'auto', name: 'Automatisch verbessern' },
    { id: 'autoTone', menu: 'auto', name: 'Auto-Farbton', shortcut: 'Mod+Shift+L' },
    { id: 'autoContrast', menu: 'auto', name: 'Auto-Kontrast', shortcut: 'Mod+Alt+Shift+L' },
    { id: 'autoColor', menu: 'auto', name: 'Auto-Farbe', shortcut: 'Mod+Shift+B' },

    // Filter
    { id: 'gaussianBlur', menu: 'filter', group: 'Weichzeichnungsfilter', name: 'Gaußscher Weichzeichner…', title: 'Gaußscher Weichzeichner', params: [R('radius', 'Radius', 0.1, 250, 4, { step: 0.1, unit: 'Pixel', log: true })], margin: p => p.radius * 3 },
    { id: 'motionBlur', menu: 'filter', group: 'Weichzeichnungsfilter', name: 'Bewegungsunschärfe…', title: 'Bewegungsunschärfe', params: [R('angle', 'Winkel', -180, 180, 0, { unit: '°' }), R('distance', 'Abstand', 1, 200, 20, { unit: 'Pixel', log: true })], margin: p => p.distance },
    { id: 'blur', menu: 'filter', group: 'Weichzeichnungsfilter', name: 'Weichzeichnen', margin: () => 4 },
    { id: 'blurMore', menu: 'filter', group: 'Weichzeichnungsfilter', name: 'Stärker weichzeichnen', margin: () => 8 },
    { id: 'unsharpMask', menu: 'filter', group: 'Scharfzeichnungsfilter', name: 'Unscharf maskieren…', title: 'Unscharf maskieren', params: [
      R('amount', 'Stärke', 1, 500, 100, { unit: '%' }), R('radius', 'Radius', 0.1, 100, 1.5, { step: 0.1, unit: 'Pixel', log: true }), R('threshold', 'Schwellenwert', 0, 255, 0, { unit: 'Stufen' })], margin: p => p.radius * 3 },
    { id: 'sharpen', menu: 'filter', group: 'Scharfzeichnungsfilter', name: 'Scharfzeichnen', margin: () => 1 },
    { id: 'sharpenMore', menu: 'filter', group: 'Scharfzeichnungsfilter', name: 'Stärker scharfzeichnen', margin: () => 1 },
    { id: 'addNoise', menu: 'filter', group: 'Rauschfilter', name: 'Rauschen hinzufügen…', title: 'Rauschen hinzufügen', params: [
      R('amount', 'Stärke', 0.1, 100, 12, { step: 0.1, unit: '%' }),
      { type: 'select', key: 'distribution', label: 'Verteilung', value: 'gauss', options: [['uniform', 'Gleichmäßig'], ['gauss', 'Gaußsche Normalverteilung']] },
      { type: 'check', key: 'mono', label: 'Monochromatisch', value: false }] },
    { id: 'median', menu: 'filter', group: 'Rauschfilter', name: 'Median…', title: 'Median', params: [R('radius', 'Radius', 1, 20, 2, { unit: 'Pixel' })], margin: p => p.radius },
    { id: 'mosaic', menu: 'filter', group: 'Vergröberungsfilter', name: 'Mosaikeffekt…', title: 'Mosaikeffekt', params: [R('size', 'Zellengröße', 2, 200, 12, { unit: 'Quadrat', log: true })] },
    { id: 'emboss', menu: 'filter', group: 'Stilisierungsfilter', name: 'Relief…', title: 'Relief', params: [R('angle', 'Winkel', -180, 180, 135, { unit: '°' }), R('height', 'Höhe', 1, 50, 3, { unit: 'Pixel' }), R('amount', 'Stärke', 1, 500, 100, { unit: '%' })], margin: p => p.height },
    { id: 'findEdges', menu: 'filter', group: 'Stilisierungsfilter', name: 'Konturen finden', margin: () => 1 },
    { id: 'solarize', menu: 'filter', group: 'Stilisierungsfilter', name: 'Solarisation' },
    { id: 'twirl', menu: 'filter', group: 'Verzerrungsfilter', name: 'Strudel…', title: 'Strudel', full: true, params: [R('angle', 'Winkel', -999, 999, 120, { unit: '°' })] },
    { id: 'spherize', menu: 'filter', group: 'Verzerrungsfilter', name: 'Wölben…', title: 'Wölben', full: true, params: [R('amount', 'Stärke', -100, 100, 60, { unit: '%' })] },
    { id: 'wave', menu: 'filter', group: 'Verzerrungsfilter', name: 'Wellen…', title: 'Wellen', full: true, params: [
      R('amplitude', 'Amplitude', 1, 100, 8, { unit: 'Pixel' }), R('wavelength', 'Wellenlänge', 4, 500, 80, { unit: 'Pixel', log: true }),
      { type: 'select', key: 'direction', label: 'Richtung', value: 'hv', options: [['hv', 'Beide'], ['h', 'Horizontal'], ['v', 'Vertikal']] }] },
    { id: 'clouds', menu: 'filter', group: 'Renderfilter', name: 'Wolken', randomSeed: true, params: [R('scale', 'Skalierung', 1, 40, 6), R('seed', 'Variante', 1, 9999, 7)] },
    { id: 'vignette', menu: 'filter', group: 'Renderfilter', name: 'Vignette…', title: 'Vignette', params: [R('amount', 'Stärke', -100, 100, 55, { unit: '%' }), R('midpoint', 'Mittelpunkt', 0, 95, 45, { unit: '%' })] },
    { id: 'highPass', menu: 'filter', group: 'Sonstige Filter', name: 'Hochpass…', title: 'Hochpass', params: [R('radius', 'Radius', 0.1, 250, 10, { step: 0.1, unit: 'Pixel', log: true })], margin: p => p.radius * 3 },
  ];

  const defaults = def => Object.fromEntries((def.params || []).map(p => [p.key, p.value]));

  // ─── Live session: preview a filter on the active layer, then commit or cancel ───
  class FilterSession {
    constructor(doc, layer, def, ctx) {
      this.doc = doc;
      this.layer = layer;
      this.def = def;
      this.ctx = ctx;
      this.canvas = layer.target;
      this.g = this.canvas.getContext('2d');
      this.W = this.canvas.width;
      this.H = this.canvas.height;
      this.orig = this.g.getImageData(0, 0, this.W, this.H);
      this.sel = doc.selection.empty ? null : doc.selection;
      this.applied = false;
      this.origVersion = layer.targetIsMask ? layer.maskVersion : layer.version;
    }

    region(params) {
      if (!this.sel || this.def.full) return { x: 0, y: 0, w: this.W, h: this.H };
      const b = this.sel.bounds, m = Math.ceil(this.def.margin ? this.def.margin(params) : 0);
      return PW.util.clipRect({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }, this.W, this.H);
    }

    run(params) {
      const r = this.region(params), W = this.W;
      const img = new ImageData(r.w, r.h), d = img.data, o = this.orig.data;
      for (let y = 0; y < r.h; y++) {
        const s = ((r.y + y) * W + r.x) * 4;
        d.set(o.subarray(s, s + r.w * 4), y * r.w * 4);
      }
      ops[this.def.id](img, params, { x0: r.x, y0: r.y, W: this.W, H: this.H, fg: this.ctx.fg, bg: this.ctx.bg });
      if (this.layer.targetIsMask) {
        for (let i = 0; i < d.length; i += 4) {
          const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
      }
      if (this.sel) {
        const a = this.sel.alpha();
        for (let y = 0; y < r.h; y++) {
          for (let x = 0; x < r.w; x++) {
            const k = a[(r.y + y) * W + r.x + x];
            if (k === 255) continue;
            const j = (y * r.w + x) * 4, s = ((r.y + y) * W + r.x + x) * 4, t = k / 255;
            for (let c = 0; c < 4; c++) d[j + c] = o[s + c] + (d[j + c] - o[s + c]) * t;
          }
        }
      }
      this.g.putImageData(img, r.x, r.y);
      this.applied = true;
      this.layer.markTarget(r);
    }

    cancel() {
      if (!this.applied) return;
      this.g.putImageData(this.orig, 0, 0);
      // Same pixels as before, so restore the version and let history share the old snapshot.
      if (this.layer.targetIsMask) {
        this.layer.maskVersion = this.origVersion;
        this.layer.invalidateMask();
      } else {
        this.layer.version = this.origVersion;
      }
    }
  }

  PW.filters = { ops, defs, defaults, FilterSession, blurPlane, gaussianBlur, curveLUT, histogram, makeNoise };
})(window.PW);
