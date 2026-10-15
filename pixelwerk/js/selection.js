// ─── Selection: a document-sized alpha mask with marching-ants outline ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, scratch, nextVersion } = PW.util;

  const MODE_OP = { add: 'source-over', subtract: 'destination-out', intersect: 'destination-in' };

  // Felzenszwalb–Huttenlocher exact squared Euclidean distance transform (1D pass).
  function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -1e20;
    z[1] = 1e20;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = 1e20;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  }

  // Squared distance from every pixel to the nearest pixel where feature[i] is true.
  function distanceField(feature, w, h) {
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const out = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = feature[i] ? 0 : 1e20;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = out[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) f[x] = out[row + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) out[row + x] = d[x];
    }
    return out;
  }

  class Selection {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.mask = createCanvas(w, h);
      this.ctx = this.mask.getContext('2d');
      this.empty = true;
      this.bounds = null;
      this.version = nextVersion();
      this._alpha = null;
      this._path = null;
      this.segments = 0;
    }

    // Re-read the mask after any change: bounds, emptiness and alpha cache.
    _update(silent) {
      const { w, h } = this;
      const d = this.ctx.getImageData(0, 0, w, h).data;
      const a = new Uint8Array(w * h);
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          const v = d[i * 4 + 3];
          if (v) {
            a[i] = v;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
          }
        }
      }
      this._alpha = a;
      this.empty = x1 < 0;
      this.bounds = this.empty ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      this._path = null;
      this.version = nextVersion();
      if (!silent) PW.bus.emit('selection:changed', this);
    }

    // Takes ownership of a ready alpha array: no canvas read-back needed.
    _setAlpha(a) {
      const { w, h } = this;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0, i = 0; y < h; y++) {
        let rowHit = false;
        for (let x = 0; x < w; x++, i++) {
          if (a[i]) {
            rowHit = true;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
        }
        if (rowHit) {
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
      const img = this.ctx.createImageData(w, h), d = img.data;
      for (let i = 0, j = 0; i < a.length; i++, j += 4) {
        if (!a[i]) continue;
        d[j] = d[j + 1] = d[j + 2] = 255;
        d[j + 3] = a[i];
      }
      this.ctx.putImageData(img, 0, 0);
      this._alpha = a;
      this.empty = x1 < 0;
      this.bounds = this.empty ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      this._path = null;
      this.version = nextVersion();
      PW.bus.emit('selection:changed', this);
    }

    alpha() {
      if (!this._alpha) this._alpha = new Uint8Array(this.w * this.h);
      return this._alpha;
    }

    alphaAt(x, y) {
      x = Math.floor(x);
      y = Math.floor(y);
      if (this.empty || x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
      return this.alpha()[y * this.w + x];
    }

    // draw(ctx) paints the new shape in opaque white; mode decides how it merges.
    combine(draw, mode = 'replace') {
      const tmp = scratch('sel-shape', this.w, this.h);
      const g = tmp.getContext('2d');
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      draw(g);
      const c = this.ctx;
      if (mode === 'replace' || (this.empty && mode !== 'intersect' && mode !== 'subtract')) {
        c.clearRect(0, 0, this.w, this.h);
        c.drawImage(tmp, 0, 0);
      } else {
        c.globalCompositeOperation = MODE_OP[mode] || 'source-over';
        c.drawImage(tmp, 0, 0);
        c.globalCompositeOperation = 'source-over';
      }
      this._update();
    }

    rect(r, mode) {
      const x = Math.round(r.x), y = Math.round(r.y);
      const w = Math.round(r.x + r.w) - x, h = Math.round(r.y + r.h) - y;
      if (w <= 0 || h <= 0) return;
      this.combine(g => g.fillRect(x, y, w, h), mode);
    }

    ellipse(r, mode) {
      if (r.w < 1 || r.h < 1) return;
      this.combine(g => {
        g.beginPath();
        g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        g.fill();
      }, mode);
    }

    polygon(points, mode) {
      if (points.length < 3) return;
      this.combine(g => {
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (const p of points) g.lineTo(p.x, p.y);
        g.closePath();
        g.fill();
      }, mode);
    }

    // alpha: Uint8Array (w*h) of selection strength; merged in JS to avoid canvas round trips.
    fromAlpha(alpha, mode = 'replace') {
      if (mode === 'replace' || (this.empty && mode === 'add')) return this._setAlpha(alpha);
      const cur = this.alpha(), out = new Uint8Array(alpha.length);
      for (let i = 0; i < alpha.length; i++) {
        const a = cur[i], b = alpha[i];
        out[i] = mode === 'add' ? (a > b ? a : b) : mode === 'subtract' ? (a * (255 - b)) / 255 : (a * b) / 255;
      }
      this._setAlpha(out);
    }

    // Selection from a layer's transparency (Ctrl/Cmd-click on a layer thumbnail).
    fromCanvasAlpha(canvas, mode) {
      this.combine(g => g.drawImage(canvas, 0, 0), mode);
    }

    all() {
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(0, 0, this.w, this.h);
      this._update();
    }

    clear() {
      if (this.empty) return;
      this.ctx.clearRect(0, 0, this.w, this.h);
      this._alpha = null;
      this.empty = true;
      this.bounds = null;
      this._path = null;
      this.version = nextVersion();
      PW.bus.emit('selection:changed', this);
    }

    invert() {
      const c = this.ctx;
      c.globalCompositeOperation = 'xor';
      c.fillStyle = '#fff';
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = 'source-over';
      this._update();
    }

    _writeAlpha(a) {
      this._setAlpha(a);
    }

    feather(radius) {
      if (this.empty || radius <= 0) return;
      const a = this.alpha();
      const f = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) f[i] = a[i];
      PW.filters.blurPlane(f, this.w, this.h, radius);
      const out = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = f[i] + 0.5;
      this._writeAlpha(out);
    }

    expand(r) {
      if (this.empty || r <= 0) return;
      const a = this.alpha();
      const feat = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) feat[i] = a[i] >= 128 ? 1 : 0;
      const dist = distanceField(feat, this.w, this.h), r2 = r * r;
      const out = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = dist[i] <= r2 ? 255 : a[i];
      this._writeAlpha(out);
    }

    contract(r) {
      if (this.empty || r <= 0) return;
      const a = this.alpha();
      const feat = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) feat[i] = a[i] < 128 ? 1 : 0;
      const dist = distanceField(feat, this.w, this.h), r2 = r * r;
      const out = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = dist[i] > r2 ? a[i] : 0;
      this._writeAlpha(out);
    }

    border(width) {
      if (this.empty || width <= 0) return;
      const a = this.alpha();
      const inside = new Uint8Array(a.length), outside = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) {
        inside[i] = a[i] >= 128 ? 1 : 0;
        outside[i] = 1 - inside[i];
      }
      const dIn = distanceField(inside, this.w, this.h), dOut = distanceField(outside, this.w, this.h);
      const half = (width / 2) ** 2;
      const out = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) out[i] = (inside[i] ? dOut[i] : dIn[i]) <= half ? 255 : 0;
      this._writeAlpha(out);
    }

    offset(dx, dy) {
      if (this.empty) return;
      const old = cloneCanvas(this.mask);
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.ctx.drawImage(old, Math.round(dx), Math.round(dy));
      this._update();
    }

    // Document geometry changes (resize, crop, rotate) remap the mask too.
    remap(nw, nh, draw) {
      const old = this.empty ? null : cloneCanvas(this.mask);
      this.w = nw;
      this.h = nh;
      this.mask.width = nw;
      this.mask.height = nh;
      if (!old) {
        this._alpha = null;
        this._path = null;
        this.version = nextVersion();
        return;
      }
      draw(this.ctx, old);
      this._update();
    }

    snapshot() {
      return this.empty ? null : cloneCanvas(this.mask);
    }

    restore(snap, w, h) {
      if (w !== this.w || h !== this.h) {
        this.w = w;
        this.h = h;
        this.mask.width = w;
        this.mask.height = h;
      } else {
        this.ctx.clearRect(0, 0, w, h);
      }
      if (snap) {
        this.ctx.drawImage(snap, 0, 0);
        this._update();
      } else {
        this._alpha = null;
        this.empty = true;
        this.bounds = null;
        this._path = null;
        this.version = nextVersion();
        PW.bus.emit('selection:changed', this);
      }
    }

    // Closed outline loops around selected (≥50 %) pixels. Edges are traced into
    // continuous polylines so the dash pattern of the marching ants flows around corners.
    outline() {
      if (this._path) return this._path;
      const p = new Path2D();
      let segs = 0;
      if (!this.empty) {
        const { w, h } = this, a = this.alpha(), b = this.bounds, W1 = w + 1;
        const sel = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[y * w + x] >= 128;
        // Clockwise edges of every selected pixel that borders an unselected one.
        const next = new Map();
        const add = (from, to) => {
          const e = next.get(from);
          if (e === undefined) next.set(from, to);
          else if (typeof e === 'number') next.set(from, [e, to]);
          else e.push(to);
        };
        for (let y = b.y; y < b.y + b.h; y++) {
          for (let x = b.x; x < b.x + b.w; x++) {
            if (a[y * w + x] < 128) continue;
            if (!sel(x, y - 1)) add(y * W1 + x, y * W1 + x + 1);
            if (!sel(x + 1, y)) add(y * W1 + x + 1, (y + 1) * W1 + x + 1);
            if (!sel(x, y + 1)) add((y + 1) * W1 + x + 1, (y + 1) * W1 + x);
            if (!sel(x - 1, y)) add((y + 1) * W1 + x, y * W1 + x);
          }
        }
        const vx = v => v % W1, vy = v => (v / W1) | 0;
        while (next.size) {
          const start = next.keys().next().value;
          let v = start, dir = 0;
          p.moveTo(vx(v), vy(v));
          do {
            const e = next.get(v);
            let n;
            if (typeof e === 'number') {
              n = e;
              next.delete(v);
            } else {
              n = e.pop();
              if (e.length === 1) next.set(v, e[0]);
            }
            const d = n - v;
            if (dir && d !== dir) {
              p.lineTo(vx(v), vy(v));
              segs++;
            }
            dir = d;
            v = n;
          } while (v !== start && next.has(v));
          p.lineTo(vx(v), vy(v));
          p.closePath();
          segs++;
        }
      }
      this.segments = segs;
      this._path = p;
      return p;
    }
  }

  PW.Selection = Selection;
  PW.distanceField = distanceField;
})(window.PW);
