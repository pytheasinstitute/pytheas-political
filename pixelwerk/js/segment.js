// ─── Segmentation: what belongs to an object and what not ───
// GrabCut (colour models for object and background, cut along edges by a minimum graph cut),
// the Boykov–Kolmogorov max-flow that does the cut, and a guided filter that turns a hard
// mask into a soft one that follows fine detail such as hair. Used by "Motiv auswählen",
// the object and quick selection tools and "Auswählen und maskieren".
'use strict';

(function (PW) {
  // ─── Max-flow / min-cut on a graph with terminal capacities (Boykov–Kolmogorov) ───
  const TERMINAL = -2, ORPHAN = -3, NONE = -1;

  class Graph {
    constructor(nodes, arcsHint) {
      this.n = nodes;
      this.first = new Int32Array(nodes).fill(-1);
      this.tr = new Float64Array(nodes); // >0: from source, <0: to sink
      const m = Math.max(16, arcsHint | 0);
      this.head = new Int32Array(m);
      this.next = new Int32Array(m);
      this.cap = new Float64Array(m);
      this.arcs = 0;
      this.flow = 0;
    }

    grow() {
      const m = this.head.length * 2;
      const head = new Int32Array(m), next = new Int32Array(m), cap = new Float64Array(m);
      head.set(this.head);
      next.set(this.next);
      cap.set(this.cap);
      this.head = head;
      this.next = next;
      this.cap = cap;
    }

    addTerminal(i, toSource, toSink) {
      const d = this.tr[i];
      // Keep only the difference; the common part flows straight through.
      const s = d > 0 ? toSource + d : toSource, t = d < 0 ? toSink - d : toSink;
      this.flow += Math.min(s, t);
      this.tr[i] = s - t;
    }

    // Edge i–j with capacity cij (i→j) and cji (j→i). Arcs 2k and 2k+1 are sisters.
    addEdge(i, j, cij, cji) {
      if (this.arcs + 2 > this.head.length) this.grow();
      const a = this.arcs, b = a + 1;
      this.head[a] = j; this.cap[a] = cij; this.next[a] = this.first[i]; this.first[i] = a;
      this.head[b] = i; this.cap[b] = cji; this.next[b] = this.first[j]; this.first[j] = b;
      this.arcs += 2;
    }

    // Returns the flow; afterwards inSource(i) tells the side of each node.
    maxflow() {
      const n = this.n, first = this.first, head = this.head, next = this.next, cap = this.cap, tr = this.tr;
      const parent = (this.parent = new Int32Array(n).fill(NONE));
      const isSink = (this.isSink = new Uint8Array(n));
      const ts = new Int32Array(n), dist = new Int32Array(n);
      const nextActive = new Int32Array(n).fill(NONE);
      let qHead = NONE, qTail = NONE;
      const activate = i => {
        if (nextActive[i] !== NONE) return;
        nextActive[i] = i; // self-loop marks "queued, last"
        if (qTail !== NONE) nextActive[qTail] = i;
        else qHead = i;
        qTail = i;
      };
      const popActive = () => {
        for (;;) {
          const i = qHead;
          if (i === NONE) return NONE;
          if (nextActive[i] === i) qHead = qTail = NONE;
          else qHead = nextActive[i];
          nextActive[i] = NONE;
          if (parent[i] !== NONE) return i;
        }
      };
      for (let i = 0; i < n; i++) {
        if (tr[i] > 0) { isSink[i] = 0; parent[i] = TERMINAL; activate(i); ts[i] = 0; dist[i] = 1; }
        else if (tr[i] < 0) { isSink[i] = 1; parent[i] = TERMINAL; activate(i); ts[i] = 0; dist[i] = 1; }
      }
      let time = 0, flow = this.flow;
      const orphans = [];
      let current = NONE;

      for (;;) {
        // Growth
        let i = current;
        if (i !== NONE) {
          nextActive[i] = NONE;
          if (parent[i] === NONE) i = NONE;
        }
        if (i === NONE) {
          i = popActive();
          if (i === NONE) break;
        }
        let meet = NONE;
        if (!isSink[i]) {
          for (let a = first[i]; a !== NONE; a = next[a]) {
            if (cap[a] <= 0) continue;
            const j = head[a];
            if (parent[j] === NONE) {
              isSink[j] = 0; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; activate(j);
            } else if (isSink[j]) { meet = a; break; }
            else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; }
          }
        } else {
          for (let a = first[i]; a !== NONE; a = next[a]) {
            if (cap[a ^ 1] <= 0) continue;
            const j = head[a];
            if (parent[j] === NONE) {
              isSink[j] = 1; parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; activate(j);
            } else if (!isSink[j]) { meet = a ^ 1; break; }
            else if (ts[j] <= ts[i] && dist[j] > dist[i]) { parent[j] = a ^ 1; ts[j] = ts[i]; dist[j] = dist[i] + 1; }
          }
        }
        time++;
        if (meet === NONE) { current = NONE; continue; }
        // Keep working from i next round (it may have more paths).
        nextActive[i] = i;
        current = i;

        // Augment along source-side path, meet arc, sink-side path.
        let bottleneck = cap[meet];
        for (let k = head[meet ^ 1]; ; ) {
          const a = parent[k];
          if (a === TERMINAL) { bottleneck = Math.min(bottleneck, tr[k]); break; }
          bottleneck = Math.min(bottleneck, cap[a ^ 1]);
          k = head[a];
        }
        for (let k = head[meet]; ; ) {
          const a = parent[k];
          if (a === TERMINAL) { bottleneck = Math.min(bottleneck, -tr[k]); break; }
          bottleneck = Math.min(bottleneck, cap[a]);
          k = head[a];
        }
        cap[meet ^ 1] += bottleneck;
        cap[meet] -= bottleneck;
        for (let k = head[meet ^ 1]; ; ) {
          const a = parent[k];
          if (a === TERMINAL) {
            tr[k] -= bottleneck;
            if (!tr[k]) { parent[k] = ORPHAN; orphans.push(k); }
            break;
          }
          cap[a] += bottleneck;
          cap[a ^ 1] -= bottleneck;
          if (!cap[a ^ 1]) { parent[k] = ORPHAN; orphans.push(k); }
          k = head[a];
        }
        for (let k = head[meet]; ; ) {
          const a = parent[k];
          if (a === TERMINAL) {
            tr[k] += bottleneck;
            if (!tr[k]) { parent[k] = ORPHAN; orphans.push(k); }
            break;
          }
          cap[a ^ 1] += bottleneck;
          cap[a] -= bottleneck;
          if (!cap[a]) { parent[k] = ORPHAN; orphans.push(k); }
          k = head[a];
        }
        flow += bottleneck;

        // Adoption
        time++;
        while (orphans.length) {
          const o = orphans.pop(), sink = isSink[o];
          let best = NONE, bestD = 1e9;
          for (let a = first[o]; a !== NONE; a = next[a]) {
            if (!(sink ? cap[a] : cap[a ^ 1])) continue;
            let j = head[a];
            if (isSink[j] !== sink || parent[j] === NONE) continue;
            // Does j lead to the terminal? Walk up, using cached distances.
            let d = 0, ok = false;
            for (;;) {
              if (ts[j] === time) { d += dist[j]; ok = true; break; }
              const pa = parent[j];
              d++;
              if (pa === TERMINAL) { ts[j] = time; dist[j] = 1; ok = true; break; }
              if (pa === ORPHAN || pa === NONE) break;
              j = head[pa];
            }
            if (!ok) continue;
            if (d < bestD) { best = a; bestD = d; }
            // Mark the path with distances for later walks.
            for (let k = head[a], dd = d; ts[k] !== time; k = head[parent[k]]) { ts[k] = time; dist[k] = dd--; }
          }
          if (best !== NONE) {
            parent[o] = best;
            ts[o] = time;
            dist[o] = bestD + 1;
            continue;
          }
          // No parent: o becomes free; its children become orphans, neighbours become active.
          for (let a = first[o]; a !== NONE; a = next[a]) {
            const j = head[a];
            if (isSink[j] !== sink || parent[j] === NONE) continue;
            if (sink ? cap[a] : cap[a ^ 1]) activate(j);
            const pa = parent[j];
            if (pa !== TERMINAL && pa !== ORPHAN && pa !== NONE && head[pa] === o) { parent[j] = ORPHAN; orphans.push(j); }
          }
          parent[o] = NONE;
        }
      }
      this.flow = flow;
      return flow;
    }

    inSource(i) {
      return this.parent[i] !== NONE && !this.isSink[i];
    }
  }

  // ─── Gaussian mixture model (k components, full covariance, d = 3 or 4 features) ───
  class GMM {
    constructor(k = 5, d = 3) {
      this.k = k;
      this.d = d;
      this.w = new Float64Array(k);
      this.mean = new Float64Array(k * d);
      this.li = new Float64Array(k * d * d); // inverse of the Cholesky factor (lower triangular)
      this.norm = new Float64Array(k);
      this.x = new Float64Array(d);
    }

    // Fit from samples (Float32Array, d values per sample) with the given component labels.
    fit(samples, labels) {
      const k = this.k, d = this.d, n = samples.length / d;
      const cnt = new Float64Array(k), sum = new Float64Array(k * d), prod = new Float64Array(k * d * d);
      for (let i = 0; i < n; i++) {
        const c = labels[i], o = i * d;
        cnt[c]++;
        for (let p = 0; p < d; p++) {
          sum[c * d + p] += samples[o + p];
          for (let q = 0; q <= p; q++) prod[c * d * d + p * d + q] += samples[o + p] * samples[o + q];
        }
      }
      for (let c = 0; c < k; c++) {
        if (!cnt[c]) { this.w[c] = 0; continue; }
        this.w[c] = cnt[c] / n;
        const m = new Float64Array(d);
        for (let p = 0; p < d; p++) m[p] = sum[c * d + p] / cnt[c];
        this.mean.set(m, c * d);
        const cov = new Float64Array(d * d);
        for (let p = 0; p < d; p++) for (let q = 0; q <= p; q++) cov[p * d + q] = cov[q * d + p] = prod[c * d * d + p * d + q] / cnt[c] - m[p] * m[q];
        for (let p = 0; p < d; p++) cov[p * d + p] += 4; // keeps flat colours invertible
        // Cholesky: cov = L·Lᵀ
        const L = new Float64Array(d * d);
        let logDet = 0;
        for (let p = 0; p < d; p++) {
          for (let q = 0; q <= p; q++) {
            let v = cov[p * d + q];
            for (let r = 0; r < q; r++) v -= L[p * d + r] * L[q * d + r];
            if (p === q) {
              L[p * d + p] = Math.sqrt(Math.max(v, 1e-6));
              logDet += 2 * Math.log(L[p * d + p]);
            } else L[p * d + q] = v / L[q * d + q];
          }
        }
        // Inverse of L (lower triangular).
        const I = new Float64Array(d * d);
        for (let p = 0; p < d; p++) {
          I[p * d + p] = 1 / L[p * d + p];
          for (let q = 0; q < p; q++) {
            let v = 0;
            for (let r = q; r < p; r++) v -= L[p * d + r] * I[r * d + q];
            I[p * d + q] = v / L[p * d + p];
          }
        }
        this.li.set(I, c * d * d);
        this.norm[c] = Math.exp(-0.5 * logDet);
      }
    }

    compProb(c, v, o) {
      if (!this.w[c]) return 0;
      const d = this.d, m = this.mean, li = this.li, x = this.x, base = c * d * d;
      for (let p = 0; p < d; p++) x[p] = v[o + p] - m[c * d + p];
      let q = 0;
      for (let p = 0; p < d; p++) {
        let z = 0;
        for (let r = 0; r <= p; r++) z += li[base + p * d + r] * x[r];
        q += z * z;
      }
      return this.norm[c] * Math.exp(-0.5 * q);
    }

    prob(v, o) {
      let p = 0;
      for (let c = 0; c < this.k; c++) p += this.w[c] * this.compProb(c, v, o);
      return p;
    }

    best(v, o) {
      let bc = 0, bp = -1;
      for (let c = 0; c < this.k; c++) {
        const p = this.w[c] * this.compProb(c, v, o);
        if (p > bp) { bp = p; bc = c; }
      }
      return bc;
    }

    // Start: k-means from k seeds spread over the (brightness-sorted) samples.
    init(samples) {
      const k = this.k, d = this.d, n = samples.length / d, labels = new Uint8Array(n);
      if (!n) return labels;
      const cent = new Float64Array(k * d);
      for (let c = 0; c < k; c++) {
        const i = Math.floor(((c + 0.5) / k) * n);
        for (let p = 0; p < d; p++) cent[c * d + p] = samples[i * d + p];
      }
      for (let it = 0; it < 6; it++) {
        const s = new Float64Array(k * d), cnt = new Float64Array(k);
        for (let i = 0; i < n; i++) {
          let bc = 0, bd = Infinity;
          for (let c = 0; c < k; c++) {
            let dd = 0;
            for (let p = 0; p < d; p++) dd += (samples[i * d + p] - cent[c * d + p]) ** 2;
            if (dd < bd) { bd = dd; bc = c; }
          }
          labels[i] = bc;
          cnt[bc]++;
          for (let p = 0; p < d; p++) s[bc * d + p] += samples[i * d + p];
        }
        for (let c = 0; c < k; c++) if (cnt[c]) for (let p = 0; p < d; p++) cent[c * d + p] = s[c * d + p] / cnt[c];
      }
      this.fit(samples, labels);
      return labels;
    }
  }

  // ─── Texture: how much fine detail (strands, sharp structure) a spot has, 0–255-ish ───
  // What a 5-tap median removes, squared, averaged over a few pixels. Out-of-focus backgrounds
  // and smooth skin stay low, hair and sharp fabric high.
  function texture(rgb, w, h, scale = 24) {
    const n = w * h, L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
    const med = (a, b, c, d, e) => {
      const v = [a, b, c, d, e].sort((x, y) => x - y);
      return v[2];
    };
    const t = new Float32Array(n), r = new Float32Array(n);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) t[o + x] = med(L[o + Math.max(0, x - 2)], L[o + Math.max(0, x - 1)], L[o + x], L[o + Math.min(w - 1, x + 1)], L[o + Math.min(w - 1, x + 2)]);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = med(t[Math.max(0, y - 2) * w + x], t[Math.max(0, y - 1) * w + x], t[y * w + x], t[Math.min(h - 1, y + 1) * w + x], t[Math.min(h - 1, y + 2) * w + x]);
        r[y * w + x] = (L[y * w + x] - v) ** 2;
      }
    }
    const b = boxBlur(boxBlur(r, w, h, 2), w, h, 2);
    for (let i = 0; i < n; i++) b[i] = Math.min(255, Math.sqrt(b[i]) * scale);
    return b;
  }

  // rgb + texture as one feature array (4 per pixel).
  function features(rgb, w, h) {
    const n = w * h, tx = texture(rgb, w, h), f = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      f[i * 4] = rgb[i * 3];
      f[i * 4 + 1] = rgb[i * 3 + 1];
      f[i * 4 + 2] = rgb[i * 3 + 2];
      f[i * 4 + 3] = tx[i];
    }
    return f;
  }

  // ─── GrabCut ───
  // rgb: Float32Array (w*h*3); trimap: Uint8Array — 0 sure background, 1 probably background,
  // 2 probably object, 3 sure object. opts.active: Uint8Array — only these pixels are decided
  // (the rest keeps its trimap side and only steers its neighbours); opts.prior: Float32Array —
  // extra cost (log units) for calling a pixel background (>0) or object (<0).
  // Returns Uint8Array mask (1 = object).
  function grabCut(rgb, w, h, trimap, opts = {}) {
    const n = w * h, iters = opts.iterations || 4, gamma = opts.gamma || 50, active = opts.active || null, prior = opts.prior || null;
    // Colour models work on rgb, or on rgb + texture when given (opts.feat, 4 per pixel).
    const feat = opts.feat || rgb, d = opts.feat ? 4 : 3;
    const diff2 = (i, j) => (rgb[i * 3] - rgb[j * 3]) ** 2 + (rgb[i * 3 + 1] - rgb[j * 3 + 1]) ** 2 + (rgb[i * 3 + 2] - rgb[j * 3 + 2]) ** 2;
    // Edge strength: neighbour weights from colour differences (β from the mean difference).
    let sum = 0, cnt = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w - 1; x += 2) {
        const i = y * w + x;
        sum += diff2(i, i + 1); cnt++;
        if (y < h - 1) { sum += diff2(i, i + w); cnt++; }
      }
    }
    const beta = cnt ? 1 / (2 * Math.max(sum / cnt, 1e-6)) : 0;
    const nbr = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT1_2], [-1, 1, Math.SQRT1_2]];
    const weight = (i, j, f) => gamma * f * Math.exp(-beta * diff2(i, j));
    // Graph nodes: active pixels (or all).
    const id = new Int32Array(n).fill(-1);
    let m = 0;
    for (let i = 0; i < n; i++) if (!active || active[i]) id[i] = m++;
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) mask[i] = trimap[i] >= 2 ? 1 : 0;
    if (!m) return mask;
    const fg = new GMM(5, d), bg = new GMM(5, d);
    const K = 9 * gamma; // larger than any sum of neighbour weights: hard constraint
    for (let it = 0; it < iters; it++) {
      // Learn the colour models from the current split (sampled, enough for 5 components).
      const fs = [], bs = [], step = Math.max(1, Math.floor(n / 120000));
      for (let i = 0; i < n; i += step) {
        const arr = mask[i] ? fs : bs;
        for (let p = 0; p < d; p++) arr.push(feat[i * d + p]);
      }
      if (!fs.length || !bs.length) break;
      const fa = Float32Array.from(fs), ba = Float32Array.from(bs);
      if (it === 0) {
        fg.init(sortByLuma(fa, d));
        bg.init(sortByLuma(ba, d));
      } else {
        fg.fit(fa, labelAll(fg, fa));
        bg.fit(ba, labelAll(bg, ba));
      }
      const G = new Graph(m, m * 8);
      for (let i = 0; i < n; i++) {
        const v = id[i];
        if (v < 0) continue;
        const t = trimap[i];
        let toS, toT;
        if (t === 0) { toS = 0; toT = K; }
        else if (t === 3) { toS = K; toT = 0; }
        else {
          toS = -Math.log(Math.max(bg.prob(feat, i * d), 1e-300)); // cost of calling it background
          toT = -Math.log(Math.max(fg.prob(feat, i * d), 1e-300));
          if (prior) { if (prior[i] > 0) toS += prior[i]; else toT -= prior[i]; }
        }
        G.addTerminal(v, toS, toT);
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          for (const [dx, dy, f] of nbr) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx, a = id[i], b = id[j];
            if (a < 0 && b < 0) continue;
            const c = weight(i, j, f);
            if (a >= 0 && b >= 0) G.addEdge(a, b, c, c);
            // A fixed neighbour pulls towards its side.
            else if (a >= 0) G.addTerminal(a, mask[j] ? c : 0, mask[j] ? 0 : c);
            else G.addTerminal(b, mask[i] ? c : 0, mask[i] ? 0 : c);
          }
        }
      }
      G.maxflow();
      let changed = 0;
      for (let i = 0; i < n; i++) {
        const v = id[i];
        if (v < 0) continue;
        const nv = trimap[i] === 0 ? 0 : trimap[i] === 3 ? 1 : G.inSource(v) ? 1 : 0;
        if (nv !== mask[i]) { changed++; mask[i] = nv; }
      }
      if (changed < m * 0.001) break;
    }
    return mask;
  }

  // Coarse to fine: the whole picture small, then only a band along the found edge at full size.
  // rgb/trimap/prior as in grabCut. Returns Uint8Array mask.
  function cutOut(rgb, w, h, trimap, opts = {}) {
    const n = w * h, target = opts.coarsePixels || 60000;
    // Texture as a fourth feature only on request: on dark hair against a dark wall it hurt more than it helped.
    const useTex = opts.texture === true;
    if (n <= target * 1.5) return grabCut(rgb, w, h, trimap, { ...opts, feat: useTex ? features(rgb, w, h) : null });
    const f = Math.ceil(Math.sqrt(n / target)), cw = Math.ceil(w / f), ch = Math.ceil(h / f);
    const crgb = new Float32Array(cw * ch * 3), ctri = new Uint8Array(cw * ch), cpri = opts.prior ? new Float32Array(cw * ch) : null;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        let c = 0, nc = 0;
        const acc = [0, 0, 0], votes = [0, 0, 0, 0];
        let pr = 0;
        for (let dy = 0; dy < f; dy++) {
          const yy = y * f + dy;
          if (yy >= h) continue;
          for (let dx = 0; dx < f; dx++) {
            const xx = x * f + dx;
            if (xx >= w) continue;
            const i = yy * w + xx;
            if (!opts.nearest || (dy === f >> 1 && dx === f >> 1) || !c) { acc[0] += rgb[i * 3]; acc[1] += rgb[i * 3 + 1]; acc[2] += rgb[i * 3 + 2]; nc++; }
            votes[trimap[i]]++;
            if (cpri) pr += opts.prior[i];
            c++;
          }
        }
        const o = y * cw + x;
        for (let k = 0; k < 3; k++) crgb[o * 3 + k] = acc[k] / nc;
        // Sure only if all of it is sure; otherwise the majority of maybe-object vs maybe-background.
        ctri[o] = votes[0] === c ? 0 : votes[3] === c ? 3 : votes[2] + votes[3] >= votes[0] + votes[1] ? 2 : 1;
        if (cpri) cpri[o] = pr / c;
      }
    }
    // Texture is measured at full size (fine strands) and averaged down.
    let cfeat = null, ffeat = null;
    if (useTex) {
      ffeat = features(rgb, w, h);
      cfeat = new Float32Array(cw * ch * 4);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          let t = 0, c = 0;
          for (let dy = 0; dy < f && y * f + dy < h; dy++) for (let dx = 0; dx < f && x * f + dx < w; dx++, c++) t += ffeat[((y * f + dy) * w + x * f + dx) * 4 + 3];
          const o = y * cw + x;
          cfeat[o * 4] = crgb[o * 3];
          cfeat[o * 4 + 1] = crgb[o * 3 + 1];
          cfeat[o * 4 + 2] = crgb[o * 3 + 2];
          cfeat[o * 4 + 3] = t / c;
        }
      }
    }
    const coarse = grabCut(crgb, cw, ch, ctri, { ...opts, prior: cpri, feat: cfeat });
    // Up to full size; decide again only near the edge.
    const mask = new Uint8Array(n), band = new Uint8Array(n), B = Math.max(2, Math.round(f * 1.5));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[y * w + x] = coarse[Math.min(ch - 1, (y / f) | 0) * cw + Math.min(cw - 1, (x / f) | 0)];
    const edge = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if ((x < w - 1 && mask[i] !== mask[i + 1]) || (y < h - 1 && mask[i] !== mask[i + w])) edge[i] = 1;
      }
    }
    // Band = edge grown by B (rows, then columns).
    const rows = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      let last = -1e9;
      for (let x = 0; x < w + B; x++) {
        if (x < w && edge[y * w + x]) last = x;
        if (x - B >= 0 && x - last <= 2 * B) rows[y * w + x - B] = 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let last = -1e9;
      for (let y = 0; y < h + B; y++) {
        if (y < h && rows[y * w + x]) last = y;
        if (y - B >= 0 && y - last <= 2 * B) band[(y - B) * w + x] = 1;
      }
    }
    const tri = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = trimap[i];
      tri[i] = t === 0 || t === 3 ? t : band[i] ? (mask[i] ? 2 : 1) : mask[i] ? 3 : 0;
      if (!band[i]) band[i] = 0;
    }
    const fine = grabCut(rgb, w, h, tri, { ...opts, active: band, iterations: opts.fineIterations || 2, feat: ffeat });
    return fine;
  }

  // Enclosed background areas (eyes, buttons, gaps smaller than maxArea) become object.
  function fillHoles(mask, w, h, maxArea = Infinity) {
    const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n), out = new Uint8Array(mask);
    for (let s = 0; s < n; s++) {
      if (mask[s] || seen[s]) continue;
      let sp = 0, touches = false;
      const comp = [];
      stack[sp++] = s;
      seen[s] = 1;
      while (sp) {
        const i = stack[--sp], y = (i / w) | 0, x = i - y * w;
        comp.push(i);
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const j of nb) if (j >= 0 && !mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
      if (!touches && comp.length <= maxArea) for (const i of comp) out[i] = 1;
    }
    return out;
  }

  function sortByLuma(s, d) {
    const n = s.length / d, idx = Array.from({ length: n }, (_, i) => i);
    const lum = i => 0.299 * s[i * d] + 0.587 * s[i * d + 1] + 0.114 * s[i * d + 2];
    idx.sort((a, b) => lum(a) - lum(b));
    const out = new Float32Array(s.length);
    idx.forEach((j, i) => { for (let p = 0; p < d; p++) out[i * d + p] = s[j * d + p]; });
    return out;
  }

  function labelAll(gmm, s) {
    const d = gmm.d, n = s.length / d, l = new Uint8Array(n);
    for (let i = 0; i < n; i++) l[i] = gmm.best(s, i * d);
    return l;
  }

  // ─── Guided filter (He et al.): smooths p while keeping the edges of the guide I ───
  // I: Float32Array grey guide (0–1), p: Float32Array input (0–1), r radius, eps regularisation.
  function guidedFilter(I, p, w, h, r, eps) {
    const box = a => boxBlur(a, w, h, r);
    const n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
    for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
    const mI = box(I), mp = box(p), mIp = box(Ip), mII = box(II);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cov = mIp[i] - mI[i] * mp[i], vr = mII[i] - mI[i] * mI[i];
      a[i] = cov / (vr + eps);
      b[i] = mp[i] - a[i] * mI[i];
    }
    const ma = box(a), mb = box(b), q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = ma[i] * I[i] + mb[i];
    return q;
  }

  // Mean over a (2r+1)² window, clamped at the borders.
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = s / (2 * r + 1);
        s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / (2 * r + 1);
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // Keeps the object parts that matter: components with at least `share` of the largest one.
  function keepMain(mask, w, h, share = 0.08) {
    const n = w * h, comp = new Int32Array(n).fill(-1), sizes = [], stack = new Int32Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (!mask[s0] || comp[s0] >= 0) continue;
      const c = sizes.length;
      let sp = 0, size = 0;
      stack[sp++] = s0;
      comp[s0] = c;
      while (sp) {
        const i = stack[--sp], y = (i / w) | 0, x = i - y * w;
        size++;
        if (x > 0 && mask[i - 1] && comp[i - 1] < 0) { comp[i - 1] = c; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && comp[i + 1] < 0) { comp[i + 1] = c; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] && comp[i - w] < 0) { comp[i - w] = c; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && comp[i + w] < 0) { comp[i + w] = c; stack[sp++] = i + w; }
      }
      sizes.push(size);
    }
    const big = Math.max(0, ...sizes), out = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (comp[i] >= 0 && sizes[comp[i]] >= big * share) out[i] = 1;
    return out;
  }

  // ─── The main subject of a picture ───
  // box (optional): {x, y, w, h} around the subject. Without one, the picture's top edge and the
  // upper part of its side edges count as background (people and objects usually reach the
  // bottom or stand on it, so the bottom stays open). Returns Uint8Array mask.
  function subject(rgb, w, h, box) {
    const tri = new Uint8Array(w * h);
    if (box) {
      const x0 = Math.max(0, Math.round(box.x)), y0 = Math.max(0, Math.round(box.y));
      const x1 = Math.min(w, Math.round(box.x + box.w)), y1 = Math.min(h, Math.round(box.y + box.h));
      // A box edge on the picture edge does not say "background there".
      const open = { l: x0 <= 1, r: x1 >= w - 1, t: y0 <= 1, b: y1 >= h - 1 };
      const m = Math.max(2, Math.round(Math.min(w, h) * 0.01));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const inside = (x >= x0 || open.l) && (x < x1 || open.r) && (y >= y0 || open.t) && (y < y1 || open.b);
          // The outer strip of a picture-edge box side stays a little background, so there is some.
          const rim = (open.t && y < m && !open.l && !open.r);
          tri[y * w + x] = inside && !rim ? 2 : 0;
        }
      }
    } else {
      const bx = Math.max(2, Math.round(w * 0.025)), by = Math.max(2, Math.round(h * 0.02)), side = h * 0.55;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const bg = y < by || ((x < bx || x >= w - bx) && y < side);
          tri[y * w + x] = bg ? 0 : 2;
        }
      }
    }
    let mask = cutOut(rgb, w, h, tri);
    mask = keepMain(mask, w, h);
    return fillHoles(mask, w, h, w * h * 0.02);
  }

  PW.segment = { Graph, GMM, grabCut, cutOut, fillHoles, keepMain, subject, texture, features, guidedFilter, boxBlur };
})(window.PW);
