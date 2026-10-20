// ─── Verzerren, Perspektivisch verzerren, Verkrümmen ───
// The layer (or the selected pixels) is lifted like in Free Transform and drawn through a mesh:
// a grid of triangles, each mapped with its own affine transform (the canvas draws those fast).
// Distort and perspective place the grid with a homography through four corners; warp places
// it on a bicubic Bézier patch with a 4 × 4 grid of control points.
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, alphaBounds } = PW.util;
  const app = () => PW.app;

  // Homography taking the unit square (0,0),(1,0),(1,1),(0,1) to the quad q[0..3].
  function homography(q) {
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0, h = 0;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-9) {
      g = (dx3 * dy2 - dx2 * dy3) / den;
      h = (dx1 * dy3 - dx3 * dy1) / den;
    }
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
    return (u, v) => {
      const w = g * u + h * v + 1;
      return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w };
    };
  }

  const bern = t => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];

  // Bicubic Bézier patch through 16 control points (row-major, 4 × 4).
  function patch(cp) {
    return (u, v) => {
      const bu = bern(u), bv = bern(v);
      let x = 0, y = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const w = bu[i] * bv[j], p = cp[j * 4 + i];
        x += w * p.x;
        y += w * p.y;
      }
      return { x, y };
    };
  }

  // One triangle of the source drawn onto the destination triangle (slightly grown against seams).
  function drawTri(g, img, s0, s1, s2, d0, d1, d2, grow) {
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const out = p => {
      const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / l) * grow, y: p.y + (dy / l) * grow };
    };
    const e0 = out(d0), e1 = out(d1), e2 = out(d2);
    const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(den) < 1e-9) return;
    // Affine map s → d: x' = a x + c y + e, y' = b x + d y + f.
    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / den;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / den;
    const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / den;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / den;
    const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / den;
    const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / den;
    // Only the source rectangle around the triangle is drawn.
    const m = Math.ceil(grow * 2) + 3;
    const sx = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - m), sy = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - m);
    const sw = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + m) - sx, sh = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + m) - sy;
    if (sw <= 0 || sh <= 0) return;
    g.save();
    g.beginPath();
    g.moveTo(e0.x, e0.y);
    g.lineTo(e1.x, e1.y);
    g.lineTo(e2.x, e2.y);
    g.closePath();
    g.clip();
    g.transform(a, b, c, d, e, f);
    g.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    g.restore();
  }

  // Draws the bounds rect b of img onto g through map(u, v) → destination point, with n × n cells.
  function drawMesh(g, img, b, map, n) {
    const pts = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pts.push(map(i / n, j / n));
    const S = (i, j) => ({ x: b.x + (b.w * i) / n, y: b.y + (b.h * j) / n });
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const d00 = pts[j * (n + 1) + i], d10 = pts[j * (n + 1) + i + 1], d01 = pts[(j + 1) * (n + 1) + i], d11 = pts[(j + 1) * (n + 1) + i + 1];
        drawTri(g, img, S(i, j), S(i + 1, j), S(i + 1, j + 1), d00, d10, d11, 1.1);
        drawTri(g, img, S(i, j), S(i + 1, j + 1), S(i, j + 1), d00, d11, d01, 1.1);
      }
    }
  }

  // Seamless version for the final result: every pixel whose centre lies in a triangle is sampled
  // exactly (barycentric → source, bilinear); the canvas-drawn mesh only adds the soft outer edge.
  function renderSeamless(img, b, map, n) {
    const W = img.width, H = img.height;
    const out = createCanvas(W, H), og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    drawMesh(og, img, b, map, n);
    const res = og.getImageData(0, 0, W, H), r = res.data;
    const src = img.getContext('2d').getImageData(0, 0, W, H).data;
    const pts = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pts.push(map(i / n, j / n));
    const S = (i, j) => ({ x: b.x + (b.w * i) / n, y: b.y + (b.h * j) / n });
    const sample = (x, y, o) => {
      x = Math.min(W - 1, Math.max(0, x - 0.5));
      y = Math.min(H - 1, Math.max(0, y - 0.5));
      const x0 = x | 0, y0 = y | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = x - x0, ty = y - y0;
      const a = (y0 * W + x0) * 4, bb = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
      // Premultiplied, so transparent neighbours do not darken the edge.
      const wa = (1 - tx) * (1 - ty) * src[a + 3], wb = tx * (1 - ty) * src[bb + 3], wc = (1 - tx) * ty * src[c + 3], wd = tx * ty * src[d + 3];
      const al = wa + wb + wc + wd;
      r[o + 3] = al;
      if (al <= 0) return;
      for (let k = 0; k < 3; k++) r[o + k] = (src[a + k] * wa + src[bb + k] * wb + src[c + k] * wc + src[d + k] * wd) / al;
    };
    const tri = (s0, s1, s2, d0, d1, d2) => {
      const x0 = Math.max(0, Math.floor(Math.min(d0.x, d1.x, d2.x))), x1 = Math.min(W - 1, Math.ceil(Math.max(d0.x, d1.x, d2.x)));
      const y0 = Math.max(0, Math.floor(Math.min(d0.y, d1.y, d2.y))), y1 = Math.min(H - 1, Math.ceil(Math.max(d0.y, d1.y, d2.y)));
      const den = (d1.y - d2.y) * (d0.x - d2.x) + (d2.x - d1.x) * (d0.y - d2.y);
      if (Math.abs(den) < 1e-9) return;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const l0 = ((d1.y - d2.y) * (px - d2.x) + (d2.x - d1.x) * (py - d2.y)) / den;
          const l1 = ((d2.y - d0.y) * (px - d2.x) + (d0.x - d2.x) * (py - d2.y)) / den;
          const l2 = 1 - l0 - l1;
          // Shared edges count for both triangles; the second write is the same value.
          if (l0 < -1e-7 || l1 < -1e-7 || l2 < -1e-7) continue;
          sample(l0 * s0.x + l1 * s1.x + l2 * s2.x, l0 * s0.y + l1 * s1.y + l2 * s2.y, (y * W + x) * 4);
        }
      }
    };
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const d00 = pts[j * (n + 1) + i], d10 = pts[j * (n + 1) + i + 1], d01 = pts[(j + 1) * (n + 1) + i], d11 = pts[(j + 1) * (n + 1) + i + 1];
        tri(S(i, j), S(i + 1, j), S(i + 1, j + 1), d00, d10, d11);
        tri(S(i, j), S(i + 1, j + 1), S(i, j + 1), d00, d11, d01);
      }
    }
    og.putImageData(res, 0, 0);
    return out;
  }

  const NAMES = { distort: 'Verzerren', perspective: 'Perspektivisch verzerren', warp: 'Verkrümmen' };

  const tool = PW.tools.register({
    id: 'meshTransform', group: 'transform', hidden: true, name: 'Verzerren', icon: 'transform', cursor: 'default', hideAnts: true,
    options: {},
    bar: [
      { type: 'hint', text: 'Griffe ziehen · Enter bestätigt · Esc bricht ab' },
      { type: 'sep' },
      { type: 'action', icon: 'x', title: 'Abbrechen (Esc)', run: () => tool.cancelMesh() },
      { type: 'action', icon: 'check', title: 'Bestätigen (Enter)', run: () => tool.commitMesh(), primary: true },
    ],

    begin(mode) {
      const a = app(), doc = a.doc, L = doc && doc.active;
      if (!L) return false;
      if (L.locked) { a.toast('Die Ebene ist gesperrt.'); return false; }
      if (L.adjust) { a.toast('Einstellungsebenen lassen sich nicht verzerren.'); return false; }
      if (L.isText && !L.targetIsMask) {
        L.rasterize();
        a.toast('Textebene wurde für die Transformation gerastert.');
      }
      const target = L.target, W = target.width, H = target.height, sel = doc.selection;
      const src = createCanvas(W, H), sg = src.getContext('2d');
      sg.drawImage(target, 0, 0);
      const base = cloneCanvas(target), bg = base.getContext('2d');
      if (!sel.empty) {
        sg.globalCompositeOperation = 'destination-in';
        sg.drawImage(sel.mask, 0, 0);
        bg.globalCompositeOperation = 'destination-out';
        bg.drawImage(sel.mask, 0, 0);
      } else bg.clearRect(0, 0, W, H);
      const b = alphaBounds(src);
      if (!b) { a.toast('Es sind keine Pixel zum Transformieren vorhanden.'); return false; }
      Object.assign(this, { mode, L, src, base, orig: cloneCanvas(target), selMask: sel.empty ? null : cloneCanvas(sel.mask), b });
      this.name = NAMES[mode];
      const P = (u, v) => ({ x: b.x + b.w * u, y: b.y + b.h * v });
      this.quad = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      this.cp = [];
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) this.cp.push(P(i / 3, j / 3));
      this.render(10);
      return true;
    },

    map() {
      return this.mode === 'warp' ? patch(this.cp) : homography(this.quad);
    },

    render(n) {
      const L = this.L, g = L.target.getContext('2d');
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.base, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.imageSmoothingQuality = 'high';
      drawMesh(g, this.src, this.b, this.map(), n);
      g.restore();
      L.markTarget();
      app().render();
    },

    handles() {
      return this.mode === 'warp' ? this.cp : this.quad;
    },
    hit(p) {
      const z = app().view.zoom, hs = this.handles();
      for (let i = 0; i < hs.length; i++) if (Math.hypot(hs[i].x - p.x, hs[i].y - p.y) * z < 10) return i;
      return -1;
    },
    hover(p) {
      if (!this.L) return;
      app().setCursor(this.hit(p) >= 0 ? 'pointer' : 'default');
    },
    down(p) {
      if (!this.L) return;
      const i = this.hit(p);
      if (i < 0) return;
      this.drag = { i, start: { x: p.x, y: p.y }, q0: this.quad.map(q => ({ ...q })), c0: this.cp.map(q => ({ ...q })) };
    },
    move(p) {
      const d = this.drag;
      if (!d) return;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (this.mode === 'distort') {
        this.quad[d.i] = { x: d.q0[d.i].x + dx, y: d.q0[d.i].y + dy };
      } else if (this.mode === 'perspective') {
        // A corner moves along one edge; its neighbour on that edge moves the opposite way (Photoshop).
        const i = d.i, horiz = Math.abs(dx) >= Math.abs(dy);
        const q = d.q0.map(o => ({ ...o }));
        if (horiz) {
          const mate = [1, 0, 3, 2][i];
          q[i].x += dx;
          q[mate].x -= dx;
        } else {
          const mate = [3, 2, 1, 0][i];
          q[i].y += dy;
          q[mate].y -= dy;
        }
        this.quad = q;
      } else {
        this.cp[d.i] = { x: d.c0[d.i].x + dx, y: d.c0[d.i].y + dy };
        // Moving a corner takes its two tangent handles along, so the edge stays smooth.
        const corners = { 0: [1, 4], 3: [2, 7], 12: [8, 13], 15: [11, 14] };
        for (const h of corners[d.i] || []) this.cp[h] = { x: d.c0[h].x + dx, y: d.c0[h].y + dy };
      }
      this.render(8);
    },
    up() {
      if (!this.drag) return;
      this.drag = null;
      this.render(16);
    },
    onKey(e) {
      if (e.key === 'Enter') { this.commitMesh(); return true; }
      if (e.key === 'Escape') { this.cancelMesh(); return true; }
      return false;
    },

    commitMesh() {
      const a = app();
      if (!this.L) return a.restoreTool();
      const map = this.map(), L = this.L, g = L.target.getContext('2d');
      const res = renderSeamless(this.src, this.b, map, 32);
      g.save();
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.base, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.drawImage(res, 0, 0);
      g.restore();
      L.markTarget();
      if (this.selMask) {
        const doc = a.doc, m = renderSeamless(this.selMask, this.b, map, 32);
        doc.selection.remap(doc.width, doc.height, sg => sg.drawImage(m, 0, 0));
      }
      const name = this.name;
      this.clear();
      a.commit(name, 'transform');
      a.restoreTool();
    },
    cancelMesh() {
      const a = app();
      if (this.L) {
        const g = this.L.target.getContext('2d');
        g.save();
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.orig, 0, 0);
        g.restore();
        this.L.markTarget();
      }
      this.clear();
      a.render();
      a.restoreTool();
    },
    clear() {
      this.L = this.src = this.base = this.orig = this.selMask = null;
      this.drag = null;
    },
    deactivate() {
      if (this.L) this.commitMesh();
    },
    drawOverlay(g, view) {
      if (!this.L) return;
      g.save();
      const map = this.map(), line = (pts) => {
        g.beginPath();
        pts.forEach((p, k) => {
          const s = view.ds(p.x, p.y);
          if (k) g.lineTo(s.x, s.y);
          else g.moveTo(s.x, s.y);
        });
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 3;
        g.stroke();
        g.strokeStyle = view.accent;
        g.lineWidth = 1;
        g.stroke();
      };
      // Grid lines through the mapping (thirds for warp, outline for the others).
      const steps = this.mode === 'warp' ? [0, 1 / 3, 2 / 3, 1] : [0, 1];
      for (const v of steps) line(Array.from({ length: 25 }, (_, k) => map(k / 24, v)));
      for (const u of steps) line(Array.from({ length: 25 }, (_, k) => map(u, k / 24)));
      if (this.mode === 'warp') {
        // Tangent handles connected to their corners.
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        for (const [c, hs] of [[0, [1, 4]], [3, [2, 7]], [12, [8, 13]], [15, [11, 14]]]) {
          const s = view.ds(this.cp[c].x, this.cp[c].y);
          for (const h of hs) {
            const t = view.ds(this.cp[h].x, this.cp[h].y);
            g.beginPath();
            g.moveTo(s.x, s.y);
            g.lineTo(t.x, t.y);
            g.stroke();
          }
        }
      }
      for (const h of this.handles()) {
        const s = view.ds(h.x, h.y);
        g.fillStyle = '#fff';
        g.strokeStyle = '#1c1c1c';
        g.lineWidth = 1;
        g.fillRect(Math.round(s.x) - 4, Math.round(s.y) - 4, 8, 8);
        g.strokeRect(Math.round(s.x) - 4.5, Math.round(s.y) - 4.5, 9, 9);
      }
      g.restore();
    },
  });

  // Starts a mesh transform like app.startTransform does for Free Transform.
  function start(mode) {
    const a = app();
    if (!a.doc || a.toolId === 'meshTransform') return;
    a.finishToolWork();
    const prev = a.toolId;
    a.setTool('meshTransform');
    if (tool.begin(mode)) {
      a.prevTool = prev;
    } else {
      a.setTool(prev);
    }
  }

  PW.meshTransform = { start, homography, patch, drawMesh, renderSeamless };
})(window.PW);
