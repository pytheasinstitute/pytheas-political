// ─── Content-aware fill: rebuilds a hole from the rest of the picture ───
// Like Photoshop's "Inhaltsbasiert": every small patch (7 × 7) in and around the hole looks for the
// most similar patch outside it (PatchMatch: random guesses, spread to neighbours, ever narrower
// search), the hole is rebuilt from the overlapping matches, coarse to fine. A smooth correction
// at the end lets the fill meet its surroundings without a seam. Also home of the membrane fill
// that healing tools use to carry over light and colour from the edge.
'use strict';

(function (PW) {
  const R = 3, PS = 2 * R + 1;
  const tick = () => new Promise(r => setTimeout(r, 0));

  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ─── Membrane: smooth values for the unknown pixels that meet the known ones at the edge ───
  // Push-pull pyramid with relaxation on every level (a cheap multigrid for Laplace's equation).
  // vals: Float32Array w*h*c (changed in place), known: Uint8Array w*h (1 = fixed).
  function membrane(vals, known, w, h, c, relax = 40) {
    const levels = [];
    let cur = { v: vals, wt: Float32Array.from(known, k => (k ? 1 : 0)), w, h };
    levels.push(cur);
    while (cur.w > 2 || cur.h > 2) {
      const nw = Math.ceil(cur.w / 2), nh = Math.ceil(cur.h / 2);
      const v = new Float32Array(nw * nh * c), wt = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          let s = 0;
          const acc = [0, 0, 0, 0];
          for (let dy = 0; dy < 2; dy++) {
            const yy = 2 * y + dy;
            if (yy >= cur.h) continue;
            for (let dx = 0; dx < 2; dx++) {
              const xx = 2 * x + dx;
              if (xx >= cur.w) continue;
              const i = yy * cur.w + xx, k = cur.wt[i];
              if (!k) continue;
              s += k;
              for (let ch = 0; ch < c; ch++) acc[ch] += cur.v[i * c + ch] * k;
            }
          }
          const o = y * nw + x;
          if (s > 0) for (let ch = 0; ch < c; ch++) v[o * c + ch] = acc[ch] / s;
          wt[o] = Math.min(1, s);
        }
      }
      cur = { v, wt, w: nw, h: nh };
      levels.push(cur);
    }
    // Pull back up: what a level does not know comes from the smoother level below, then relax.
    for (let l = levels.length - 2; l >= 0; l--) {
      const f = levels[l], g = levels[l + 1];
      for (let y = 0; y < f.h; y++) {
        const gy = Math.min(g.h - 1, Math.max(0, (y - 0.5) / 2)), y0 = Math.floor(gy), y1 = Math.min(g.h - 1, y0 + 1), ty = gy - y0;
        for (let x = 0; x < f.w; x++) {
          const i = y * f.w + x, k = f.wt[i];
          if (k >= 1) continue;
          const gx = Math.min(g.w - 1, Math.max(0, (x - 0.5) / 2)), x0 = Math.floor(gx), x1 = Math.min(g.w - 1, x0 + 1), tx = gx - x0;
          for (let ch = 0; ch < c; ch++) {
            const a = g.v[(y0 * g.w + x0) * c + ch], b = g.v[(y0 * g.w + x1) * c + ch];
            const cc = g.v[(y1 * g.w + x0) * c + ch], d = g.v[(y1 * g.w + x1) * c + ch];
            const up = (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
            f.v[i * c + ch] = k * f.v[i * c + ch] + (1 - k) * up;
          }
        }
      }
      relaxLevel(f, c, l === 0 ? relax : 6, l === 0 ? known : null);
    }
    return vals;
  }

  // Jacobi steps on the not fully known pixels: each becomes the mean of its four neighbours.
  function relaxLevel(f, c, n, known) {
    const { w, h, v, wt } = f;
    const free = [];
    for (let i = 0; i < w * h; i++) if (known ? !known[i] : wt[i] < 1) free.push(i);
    if (!free.length) return;
    const tmp = new Float32Array(free.length * c);
    for (let it = 0; it < n; it++) {
      for (let k = 0; k < free.length; k++) {
        const i = free[k], y = (i / w) | 0, x = i - y * w;
        const l = x > 0 ? i - 1 : i, r = x < w - 1 ? i + 1 : i, u = y > 0 ? i - w : i, d = y < h - 1 ? i + w : i;
        for (let ch = 0; ch < c; ch++) tmp[k * c + ch] = (v[l * c + ch] + v[r * c + ch] + v[u * c + ch] + v[d * c + ch]) * 0.25;
      }
      for (let k = 0; k < free.length; k++) for (let ch = 0; ch < c; ch++) v[free[k] * c + ch] = tmp[k * c + ch];
    }
  }

  // ─── Pyramid level ───
  function makeLevel(w, h) {
    return { w, h, img: new Float32Array(w * h * 3), hole: new Uint8Array(w * h), avoid: new Uint8Array(w * h) };
  }

  function down(f) {
    const w = Math.ceil(f.w / 2), h = Math.ceil(f.h / 2), g = makeLevel(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let n = 0, holeAny = 0, avoidAny = 0;
        const acc = [0, 0, 0];
        for (let dy = 0; dy < 2; dy++) {
          const yy = 2 * y + dy;
          if (yy >= f.h) continue;
          for (let dx = 0; dx < 2; dx++) {
            const xx = 2 * x + dx;
            if (xx >= f.w) continue;
            const i = yy * f.w + xx;
            if (f.hole[i]) holeAny = 1;
            else {
              n++;
              acc[0] += f.img[i * 3];
              acc[1] += f.img[i * 3 + 1];
              acc[2] += f.img[i * 3 + 2];
            }
            if (f.avoid[i]) avoidAny = 1;
          }
        }
        const o = y * w + x;
        if (n) for (let c = 0; c < 3; c++) g.img[o * 3 + c] = acc[c] / n;
        g.hole[o] = holeAny;
        g.avoid[o] = avoidAny;
      }
    }
    return g;
  }

  // Patches that may serve as a source: fully inside, nothing of the hole or the avoided area in them.
  function sources(L) {
    const { w, h, hole, avoid } = L;
    const W1 = w + 1, ii = new Int32Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        row += hole[i] || avoid[i] ? 1 : 0;
        ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row;
      }
    }
    const ok = new Uint8Array(w * h), list = [];
    for (let y = R; y < h - R; y++) {
      for (let x = R; x < w - R; x++) {
        const s = ii[(y + R + 1) * W1 + x + R + 1] - ii[(y - R) * W1 + x + R + 1] - ii[(y + R + 1) * W1 + x - R] + ii[(y - R) * W1 + x - R];
        if (!s) {
          ok[y * w + x] = 1;
          list.push(y * w + x);
        }
      }
    }
    return { ok, list: Int32Array.from(list) };
  }

  // Patch centres whose patch touches the hole (the hole grown by the patch radius, rows then columns).
  function targetsOf(L) {
    const { w, h, hole } = L, rowGrown = new Uint8Array(w * h), is = new Uint8Array(w * h), list = [];
    for (let y = 0; y < h; y++) {
      let last = -1e9;
      for (let x = 0; x < w + R; x++) {
        if (x < w && hole[y * w + x]) last = x;
        const c = x - R;
        if (c >= 0 && x - last <= 2 * R) rowGrown[y * w + c] = 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let last = -1e9;
      for (let y = 0; y < h + R; y++) {
        if (y < h && rowGrown[y * w + x]) last = y;
        const c = y - R;
        if (c >= 0 && y - last <= 2 * R) is[c * w + x] = 1;
      }
    }
    for (let i = 0; i < w * h; i++) if (is[i]) list.push(i);
    return { is, list: Int32Array.from(list) };
  }

  // ─── One level: PatchMatch + voting ───
  // Colour adaptation: patches are compared by shape, a difference in mean colour only costs a
  // share `adapt` of what it would, and a copied patch takes on the mean colour of where it goes.
  // So a texture from a lighter or darker spot fits, and gradients (sky, skin, walls) run on.
  class Solver {
    constructor(L, random, adapt = 0.5) {
      this.L = L;
      this.rand = random;
      this.keep = 1 - adapt;
      const s = sources(L);
      this.srcOK = s.ok;
      this.srcList = s.list;
      const t = targetsOf(L);
      this.isT = t.is;
      this.tList = t.list;
      const n = L.w * L.h;
      this.nn = new Int32Array(n).fill(-1);
      this.dist = new Float32Array(n);
      this.tp = new Float32Array(PS * PS * 3);
      this.tm = new Float32Array(3);
      this.sMean = this.sourceMeans();
    }

    // Mean colour of every target patch right now (border pixels repeated, as in loadTarget).
    targetMeans() {
      const { w, h, img } = this.L, list = this.tList, W1 = w + 1, N = PS * PS;
      const ii = new Float64Array(W1 * (h + 1) * 3);
      for (let y = 0; y < h; y++) {
        let r0 = 0, r1 = 0, r2 = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 3, o = ((y + 1) * W1 + x + 1) * 3, u = (y * W1 + x + 1) * 3;
          r0 += img[i]; r1 += img[i + 1]; r2 += img[i + 2];
          ii[o] = ii[u] + r0; ii[o + 1] = ii[u + 1] + r1; ii[o + 2] = ii[u + 2] + r2;
        }
      }
      const out = new Float32Array(list.length * 3);
      for (let k = 0; k < list.length; k++) {
        const q = list[k], qy = (q / w) | 0, qx = q - qy * w;
        if (qx >= R && qy >= R && qx < w - R && qy < h - R) {
          const a = ((qy + R + 1) * W1 + qx + R + 1) * 3, b = ((qy - R) * W1 + qx + R + 1) * 3, c0 = ((qy + R + 1) * W1 + qx - R) * 3, d = ((qy - R) * W1 + qx - R) * 3;
          for (let c = 0; c < 3; c++) out[k * 3 + c] = (ii[a + c] - ii[b + c] - ii[c0 + c] + ii[d + c]) / N;
        } else {
          this.loadTarget(q);
          for (let c = 0; c < 3; c++) out[k * 3 + c] = this.tm[c];
        }
      }
      return out;
    }

    // Mean colour of every source patch (sources hold no hole pixels, so this stays valid).
    sourceMeans() {
      const { w, h, img } = this.L, W1 = w + 1, n = w * h, out = new Float32Array(n * 3), N = PS * PS;
      const ii = new Float64Array(W1 * (h + 1) * 3);
      for (let y = 0; y < h; y++) {
        const row = [0, 0, 0];
        for (let x = 0; x < w; x++) {
          const i = y * w + x, o = ((y + 1) * W1 + x + 1) * 3, u = (y * W1 + x + 1) * 3;
          for (let c = 0; c < 3; c++) {
            row[c] += img[i * 3 + c];
            ii[o + c] = ii[u + c] + row[c];
          }
        }
      }
      for (const s of this.srcList) {
        const y = (s / w) | 0, x = s - y * w;
        const a = ((y + R + 1) * W1 + x + R + 1) * 3, b = ((y - R) * W1 + x + R + 1) * 3, c0 = ((y + R + 1) * W1 + x - R) * 3, d = ((y - R) * W1 + x - R) * 3;
        for (let c = 0; c < 3; c++) out[s * 3 + c] = (ii[a + c] - ii[b + c] - ii[c0 + c] + ii[d + c]) / N;
      }
      return out;
    }

    randomSource() {
      return this.srcList[(this.rand() * this.srcList.length) | 0];
    }

    // Target patch (border pixels repeated) into this.tp.
    loadTarget(q) {
      const { w, h, img } = this.L, qy = (q / w) | 0, qx = q - qy * w, tp = this.tp;
      let k = 0, m0 = 0, m1 = 0, m2 = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.min(h - 1, Math.max(0, qy + dy)) * w;
        for (let dx = -R; dx <= R; dx++) {
          const j = (yy + Math.min(w - 1, Math.max(0, qx + dx))) * 3;
          m0 += tp[k++] = img[j];
          m1 += tp[k++] = img[j + 1];
          m2 += tp[k++] = img[j + 2];
        }
      }
      const N = PS * PS;
      this.tm[0] = m0 / N;
      this.tm[1] = m1 / N;
      this.tm[2] = m2 / N;
    }

    // Squared distance between the loaded target patch and the source patch centred at s; stops above `limit`.
    patchDist(s, limit) {
      const { w, img } = this.L, tp = this.tp, sm = this.sMean, tm = this.tm;
      const e0 = tm[0] - sm[s * 3], e1 = tm[1] - sm[s * 3 + 1], e2 = tm[2] - sm[s * 3 + 2];
      // SSD minus the forgiven part of the mean difference (sum of (a − mean a)² = SSD − N·mean²).
      const credit = this.keep * PS * PS * (e0 * e0 + e1 * e1 + e2 * e2), stop = limit + credit;
      let d = 0, k = 0;
      for (let dy = -R; dy <= R; dy++) {
        let j = (s + dy * w - R) * 3;
        for (let dx = -R; dx <= R; dx++, j += 3, k += 3) {
          const a = tp[k] - img[j], b = tp[k + 1] - img[j + 1], c = tp[k + 2] - img[j + 2];
          d += a * a + b * b + c * c;
        }
        if (d > stop) return d - credit;
      }
      return d - credit;
    }

    // Random start, or keep a given field (e.g. from the coarser level) where it is still valid.
    init() {
      for (const q of this.tList) {
        if (this.nn[q] < 0 || !this.srcOK[this.nn[q]]) this.nn[q] = this.randomSource();
      }
      this.refreshDist();
    }

    refreshDist() {
      for (const q of this.tList) {
        this.loadTarget(q);
        this.dist[q] = this.patchDist(this.nn[q], Infinity);
      }
    }

    // radius: how far the random search starts looking (finer levels only refine what they got).
    search(iterations, radius = Infinity) {
      const { w, h } = this.L, list = this.tList, nn = this.nn, dist = this.dist, ok = this.srcOK, isT = this.isT, rand = this.rand;
      const maxR = Math.min(Math.max(w, h), radius);
      for (let it = 0; it < iterations; it++) {
        const fwd = it % 2 === 0, step = fwd ? 1 : -1;
        for (let k = fwd ? 0 : list.length - 1; k >= 0 && k < list.length; k += step) {
          const q = list[k], qy = (q / w) | 0, qx = q - qy * w;
          this.loadTarget(q);
          let best = nn[q], bd = dist[q];
          // Propagation: the neighbour's match, shifted by one, often fits too.
          const nx = qx - step, ny = qy - step;
          if (nx >= 0 && nx < w && isT[q - step]) {
            const c = nn[q - step] + step;
            const cy = (c / w) | 0, cx = c - cy * w;
            if (cy === ((nn[q - step] / w) | 0) && cx >= 0 && cx < w && ok[c]) {
              const d = this.patchDist(c, bd);
              if (d < bd) { bd = d; best = c; }
            }
          }
          if (ny >= 0 && ny < h && isT[q - step * w]) {
            const c = nn[q - step * w] + step * w;
            if (c >= 0 && c < w * h && ok[c]) {
              const d = this.patchDist(c, bd);
              if (d < bd) { bd = d; best = c; }
            }
          }
          // Random search around the best match, halving the radius.
          const by = (best / w) | 0, bx = best - by * w;
          for (let r = maxR; r >= 1; r >>= 1) {
            const cx = Math.min(w - 1 - R, Math.max(R, bx + Math.round((rand() * 2 - 1) * r)));
            const cy = Math.min(h - 1 - R, Math.max(R, by + Math.round((rand() * 2 - 1) * r)));
            const c = cy * w + cx;
            if (!ok[c] || c === best) continue;
            const d = this.patchDist(c, bd);
            if (d < bd) { bd = d; best = c; }
          }
          nn[q] = best;
          dist[q] = bd;
        }
      }
    }

    // Rebuild the hole pixels from all patches that cover them, better matches weigh more.
    // ring: also rebuild known pixels next to the hole (for the seam correction); returns that image.
    vote(sharp = 1, ring = null) {
      const { w, h, img, hole } = this.L, list = this.tList, nn = this.nn, dist = this.dist;
      const n = w * h, acc = new Float32Array(n * 3), ws = new Float32Array(n), sm = this.sMean;
      const ds = Array.from(list, q => dist[q]).sort((a, b) => a - b);
      const s2 = Math.max(1, ds[Math.floor(ds.length * 0.75)] || 1) * sharp;
      // Colour shift per target, from the current state (before this vote changes it).
      const shift = new Float32Array(list.length * 3), tMean = this.targetMeans();
      list.forEach((q, k) => {
        for (let c = 0; c < 3; c++) shift[k * 3 + c] = tMean[k * 3 + c] - sm[nn[q] * 3 + c];
      });
      for (let k = 0; k < list.length; k++) {
        const q = list[k], qy = (q / w) | 0, qx = q - qy * w, s = nn[q];
        const wq = Math.exp(-dist[q] / (2 * s2)) + 1e-12;
        const f0 = shift[k * 3], f1 = shift[k * 3 + 1], f2 = shift[k * 3 + 2];
        for (let dy = -R; dy <= R; dy++) {
          const py = qy + dy;
          if (py < 0 || py >= h) continue;
          for (let dx = -R; dx <= R; dx++) {
            const px = qx + dx;
            if (px < 0 || px >= w) continue;
            const p = py * w + px;
            if (!hole[p] && !(ring && ring[p])) continue;
            const j = (s + dy * w + dx) * 3;
            acc[p * 3] += wq * (img[j] + f0);
            acc[p * 3 + 1] += wq * (img[j + 1] + f1);
            acc[p * 3 + 2] += wq * (img[j + 2] + f2);
            ws[p] += wq;
          }
        }
      }
      const rebuilt = ring ? new Float32Array(img) : null;
      for (let p = 0; p < n; p++) {
        if (!ws[p]) continue;
        const out = hole[p] ? img : ring && ring[p] ? rebuilt : null;
        if (!out) continue;
        out[p * 3] = acc[p * 3] / ws[p];
        out[p * 3 + 1] = acc[p * 3 + 1] / ws[p];
        out[p * 3 + 2] = acc[p * 3 + 2] / ws[p];
        if (rebuilt && hole[p]) {
          rebuilt[p * 3] = img[p * 3];
          rebuilt[p * 3 + 1] = img[p * 3 + 1];
          rebuilt[p * 3 + 2] = img[p * 3 + 2];
        }
      }
      return rebuilt;
    }
  }

  // ─── Fill ───
  // data: RGBA (Uint8ClampedArray, w*h*4) of the area to work in; hole: Uint8Array (1 = rebuild);
  // opts.avoid: Uint8Array (1 = never copy from here); opts.onProgress(0–1); opts.seed.
  // Returns a new RGBA array with the hole filled (alpha kept).
  async function fill(data, w, h, hole, opts = {}) {
    const rand = rng(opts.seed || 12345);
    const L0 = makeLevel(w, h);
    let holeN = 0;
    for (let i = 0; i < w * h; i++) {
      L0.img[i * 3] = data[i * 4];
      L0.img[i * 3 + 1] = data[i * 4 + 1];
      L0.img[i * 3 + 2] = data[i * 4 + 2];
      L0.hole[i] = hole[i] ? 1 : 0;
      if (opts.avoid && opts.avoid[i]) L0.avoid[i] = 1;
      holeN += L0.hole[i];
    }
    const out = new Uint8ClampedArray(data);
    if (!holeN) return out;
    // Coarser levels until the hole is only a few patches wide.
    const pyr = [L0];
    for (;;) {
      const top = pyr[pyr.length - 1];
      const ext = extent(top.hole, top.w, top.h);
      if (Math.max(ext.w, ext.h) <= 2 * PS || Math.min(top.w, top.h) < 6 * PS) break;
      const next = down(top);
      if (sources(next).list.length < 50) break;
      pyr.push(next);
    }
    if (sources(L0).list.length < 20) throw new Error('Um die Stelle herum ist zu wenig Bild, aus dem gefüllt werden kann.');
    // Plan the work for the progress display: finer levels cost more but get fewer rounds.
    // The layout is decided on the small levels; big levels only refine it and get fewer rounds,
    // since nearly all the time goes there.
    const rounds = hn => (hn > 100000 ? { em: 1, pm: 1 } : hn > 25000 ? { em: 2, pm: 1 } : hn > 6000 ? { em: 3, pm: 2 } : { em: 5, pm: 2 });
    const plan = pyr.map((L, l) => (l === pyr.length - 1 ? { em: 10, pm: 4 } : rounds(holeN / Math.pow(4, l))));
    const cost = plan.reduce((s, p, l) => s + p.em * p.pm / Math.pow(4, l), 0);
    let done = 0;
    const report = c => {
      done += c;
      if (opts.onProgress) opts.onProgress(Math.min(1, done / cost));
    };

    let prev = null;
    for (let l = pyr.length - 1; l >= 0; l--) {
      const L = pyr[l], S = new Solver(L, rand), { w: lw, h: lh } = L;
      if (!prev) {
        // Coarsest: a smooth first guess, random matches.
        const known = Uint8Array.from(L.hole, v => (v ? 0 : 1));
        membrane(L.img, known, lw, lh, 3, 60);
      } else {
        // Hole from the coarser result, matches scaled up.
        const C = prev.L;
        for (let y = 0; y < lh; y++) {
          for (let x = 0; x < lw; x++) {
            const i = y * lw + x;
            if (!L.hole[i]) continue;
            const ci = Math.min(C.h - 1, y >> 1) * C.w + Math.min(C.w - 1, x >> 1);
            L.img[i * 3] = C.img[ci * 3];
            L.img[i * 3 + 1] = C.img[ci * 3 + 1];
            L.img[i * 3 + 2] = C.img[ci * 3 + 2];
          }
        }
        for (const q of S.tList) {
          const qy = (q / lw) | 0, qx = q - qy * lw;
          const ci = Math.min(C.h - 1, qy >> 1) * C.w + Math.min(C.w - 1, qx >> 1), cs = prev.nn[ci];
          if (cs < 0) continue;
          const sy = (cs / C.w) | 0, sx = cs - sy * C.w;
          const nx = Math.min(lw - 1 - R, Math.max(R, 2 * sx + (qx & 1))), ny = Math.min(lh - 1 - R, Math.max(R, 2 * sy + (qy & 1)));
          S.nn[q] = ny * lw + nx;
        }
        S.init();
        S.vote(1);
      }
      if (!prev) S.init();
      const { em, pm } = plan[l];
      const radius = l === pyr.length - 1 ? Infinity : 24 << (pyr.length - 1 - l);
      for (let e = 0; e < em; e++) {
        // The last vote changed the hole, so the stored distances are stale.
        if (e) S.refreshDist();
        S.search(pm, radius);
        S.vote(l === 0 && e === em - 1 ? 0.5 : 1);
        report(pm / Math.pow(4, l));
        await tick();
      }
      if (l === 0) seamFix(S);
      prev = S;
    }
    for (let i = 0; i < w * h; i++) {
      if (!L0.hole[i]) continue;
      out[i * 4] = L0.img[i * 3];
      out[i * 4 + 1] = L0.img[i * 3 + 1];
      out[i * 4 + 2] = L0.img[i * 3 + 2];
    }
    if (opts.onProgress) opts.onProgress(1);
    return out;
  }

  // The rebuilt patches are compared with the real pixels just outside the hole; the difference is
  // spread smoothly into the hole, so light and colour run on without a step ("Farbanpassung").
  function seamFix(S) {
    const { w, h, img, hole } = S.L, n = w * h;
    // Only a window around the hole matters.
    const e = extent(hole, w, h), pad = 4;
    const x0 = Math.max(0, e.x - pad), y0 = Math.max(0, e.y - pad), x1 = Math.min(w, e.x + e.w + pad), y1 = Math.min(h, e.y + e.h + pad);
    const cw = x1 - x0, ch = y1 - y0;
    const ring = new Uint8Array(n);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (hole[i]) continue;
        for (let dy = -2; dy <= 2 && !ring[i]; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w && hole[yy * w + xx]) { ring[i] = 1; break; }
          }
        }
      }
    }
    const rebuilt = S.vote(0.5, ring);
    const diff = new Float32Array(cw * ch * 3), known = new Uint8Array(cw * ch);
    let any = false;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x, k = (y - y0) * cw + x - x0;
        if (hole[i]) continue;
        known[k] = 1;
        if (!ring[i]) continue;
        any = true;
        for (let c = 0; c < 3; c++) diff[k * 3 + c] = img[i * 3 + c] - rebuilt[i * 3 + c];
      }
    }
    if (!any) return;
    // Away from the ring the correction fades to nothing (known zero), so it stays local to the seam.
    membrane(diff, known, cw, ch, 3, 60);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x, k = (y - y0) * cw + x - x0;
        if (!hole[i]) continue;
        for (let c = 0; c < 3; c++) img[i * 3 + c] += diff[k * 3 + c];
      }
    }
  }

  function extent(mask, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  PW.inpaint = { fill, membrane, extent };
})(window.PW);
