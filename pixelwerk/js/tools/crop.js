// ─── Crop tool and Free Transform ───
'use strict';

(function (PW) {
  const { normRect, createCanvas, cloneCanvas, alphaBounds } = PW.util;
  const app = () => PW.app;

  const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

  // Cursor for a handle direction, rotated with the box.
  function handleCursor(hx, hy, rot = 0) {
    const a = Math.atan2(hy, hx) + rot;
    const idx = ((Math.round(a / (Math.PI / 4)) % 4) + 4) % 4;
    return RESIZE_CURSORS[idx];
  }

  function drawHandle(g, x, y) {
    g.fillStyle = '#fff';
    g.strokeStyle = '#1c1c1c';
    g.lineWidth = 1;
    g.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
    g.strokeRect(Math.round(x) - 4.5, Math.round(y) - 4.5, 9, 9);
  }

  // ─── Crop ───
  const RATIOS = [['free', 'Verhältnis (frei)'], ['orig', 'Originalverhältnis'], ['1:1', '1 : 1 (Quadrat)'], ['4:5', '4 : 5 (8 : 10)'], ['5:7', '5 : 7'], ['2:3', '2 : 3 (4 : 6)'], ['16:9', '16 : 9']];

  const crop = PW.tools.register({
    id: 'crop', group: 'crop', name: 'Freistellungswerkzeug', key: 'C', icon: 'crop', cursor: 'crosshair', hideAnts: true,
    options: { ratio: 'free' },
    bar: [
      { type: 'select', key: 'ratio', label: '', options: RATIOS },
      { type: 'action', icon: 'swap', title: 'Höhe und Breite tauschen', run: () => crop.swap() },
      { type: 'action', label: 'Zurücksetzen', run: () => crop.reset() },
      { type: 'sep' },
      { type: 'action', icon: 'x', title: 'Freistellen abbrechen (Esc)', run: () => crop.reset() },
      { type: 'action', icon: 'check', title: 'Freistellen bestätigen (Enter)', run: () => crop.apply(), primary: true },
    ],
    activate() { this.reset(); },
    deactivate() { this.drag = null; },
    reset() {
      const doc = app().doc;
      if (!doc) return;
      const sel = doc.selection;
      this.rect = sel.empty ? { x: 0, y: 0, w: doc.width, h: doc.height } : { ...sel.bounds };
      this.applyRatio();
      app().render();
    },
    ratio() {
      const r = this.options.ratio, doc = app().doc;
      if (r === 'free') return null;
      let k = r === 'orig' ? doc.width / doc.height : (([a, b]) => a / b)(r.split(':').map(Number));
      if (r !== 'orig' && this.portrait === false) k = 1 / k;
      return k;
    },
    swap() {
      const r = this.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      this.rect = { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w };
      if (this.options.ratio !== 'free') this.portrait = this.portrait === false;
      app().render();
    },
    onOption(key) {
      if (key === 'ratio') {
        this.portrait = undefined;
        this.applyRatio();
        app().render();
      }
    },
    applyRatio() {
      const k = this.ratio();
      if (!k || !this.rect) return;
      const r = this.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      let w = r.w, h = w / k;
      if (h > r.h) {
        h = r.h;
        w = h * k;
      }
      this.rect = { x: cx - w / 2, y: cy - h / 2, w, h };
    },
    hit(p) {
      const v = app().view, r = this.rect;
      const a = v.ds(r.x, r.y), b = v.ds(r.x + r.w, r.y + r.h);
      const s = { x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y };
      for (const [hx, hy] of HANDLES) {
        const hxp = hx < 0 ? a.x : hx > 0 ? b.x : (a.x + b.x) / 2;
        const hyp = hy < 0 ? a.y : hy > 0 ? b.y : (a.y + b.y) / 2;
        if (Math.abs(s.x - hxp) < 9 && Math.abs(s.y - hyp) < 9) return { type: 'handle', hx, hy };
      }
      if (s.x > a.x && s.x < b.x && s.y > a.y && s.y < b.y) return { type: 'move' };
      return { type: 'new' };
    },
    hover(p) {
      if (!this.rect) return;
      const h = this.hit(p);
      app().setCursor(h.type === 'handle' ? handleCursor(h.hx, h.hy) : h.type === 'move' ? 'move' : 'crosshair');
    },
    down(p) {
      if (!this.rect) this.reset();
      const h = this.hit(p);
      this.drag = { ...h, start: p, r0: { ...this.rect } };
    },
    move(p) {
      const d = this.drag;
      if (!d) return;
      const dx = p.x - d.start.x, dy = p.y - d.start.y, r0 = d.r0, k = this.ratio();
      if (d.type === 'move') {
        this.rect = { ...r0, x: r0.x + dx, y: r0.y + dy };
      } else if (d.type === 'new') {
        let w = p.x - d.start.x, h = p.y - d.start.y;
        if (k) h = Math.sign(h || 1) * Math.abs(w) / k;
        this.rect = normRect(d.start.x, d.start.y, d.start.x + w, d.start.y + h);
      } else {
        let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
        if (d.hx < 0) x1 += dx;
        if (d.hx > 0) x2 += dx;
        if (d.hy < 0) y1 += dy;
        if (d.hy > 0) y2 += dy;
        if (k) {
          if (d.hx && d.hy) {
            const w = Math.abs(x2 - x1), h = w / k;
            if (d.hy < 0) y1 = y2 - h;
            else y2 = y1 + h;
          } else if (d.hx) {
            const h = Math.abs(x2 - x1) / k, cy = (r0.y * 2 + r0.h) / 2;
            y1 = cy - h / 2;
            y2 = cy + h / 2;
          } else {
            const w = Math.abs(y2 - y1) * k, cx = (r0.x * 2 + r0.w) / 2;
            x1 = cx - w / 2;
            x2 = cx + w / 2;
          }
        }
        this.rect = normRect(x1, y1, x2, y2);
      }
      app().render();
    },
    up() {
      if (this.drag && this.drag.type === 'new' && (this.rect.w < 2 || this.rect.h < 2)) this.rect = this.drag.r0;
      this.drag = null;
      app().render();
    },
    onKey(e) {
      if (e.key === 'Enter') { this.apply(); return true; }
      if (e.key === 'Escape') { this.reset(); return true; }
      return false;
    },
    apply() {
      const a = app(), doc = a.doc, r = this.rect;
      if (!doc || !r) return;
      const R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) };
      if (R.x === 0 && R.y === 0 && R.w === doc.width && R.h === doc.height) return;
      doc.crop(R);
      a.commit('Freistellen', 'crop');
      a.view.fit(false);
      this.reset();
    },
    drawOverlay(g, view) {
      if (!this.rect) return;
      const r = this.rect, a = view.ds(r.x, r.y), w = r.w * view.zoom, h = r.h * view.zoom;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.rect(0, 0, view.cw, view.ch);
      g.rect(a.x, a.y, w, h);
      g.fill('evenodd');
      g.strokeStyle = 'rgba(255,255,255,0.45)';
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
      g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w), Math.round(h));
      for (const [hx, hy] of HANDLES) drawHandle(g, a.x + ((hx + 1) / 2) * w, a.y + ((hy + 1) / 2) * h);
      if (this.drag) {
        g.font = '11px system-ui, sans-serif';
        const t = `B: ${Math.round(r.w)} Px  H: ${Math.round(r.h)} Px`;
        g.fillStyle = 'rgba(20,20,22,0.85)';
        g.fillRect(a.x + w + 10, a.y + h + 10, g.measureText(t).width + 12, 20);
        g.fillStyle = '#fff';
        g.fillText(t, a.x + w + 16, a.y + h + 24);
      }
    },
  });

  PW.bus.on('doc:resized', () => {
    if (PW.app && PW.app.toolId === 'crop') crop.reset();
  });
  PW.bus.on('doc:switched', () => {
    if (PW.app && PW.app.toolId === 'crop') crop.reset();
  });

  // ─── Free Transform (Strg+T) ───
  // Lifts the layer (or selected pixels) and draws it through a move/scale/rotate matrix.
  const transform = PW.tools.register({
    id: 'transform', group: 'transform', hidden: true, name: 'Frei transformieren', icon: 'transform', cursor: 'default', hideAnts: true,
    options: { smooth: true },
    bar: [
      { type: 'tnum', key: 'x', label: 'X', unit: 'Px' },
      { type: 'tnum', key: 'y', label: 'Y', unit: 'Px' },
      { type: 'tnum', key: 'w', label: 'B', unit: '%' },
      { type: 'tnum', key: 'h', label: 'H', unit: '%' },
      { type: 'tnum', key: 'rot', label: '∠', unit: '°' },
      { type: 'select', key: 'smooth', label: 'Interpolation', options: [[true, 'Bikubisch'], [false, 'Pixelwiederholung']] },
      { type: 'sep' },
      { type: 'action', icon: 'x', title: 'Transformieren abbrechen (Esc)', run: () => transform.cancelTransform() },
      { type: 'action', icon: 'check', title: 'Transformieren bestätigen (Enter)', run: () => transform.commitTransform(), primary: true },
    ],

    begin() {
      const a = app(), doc = a.doc, L = doc && doc.active;
      if (!L) return false;
      if (L.locked) { a.toast('Die Ebene ist gesperrt.'); return false; }
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
      } else {
        bg.clearRect(0, 0, W, H);
      }
      if (L.targetIsMask) {
        bg.globalCompositeOperation = 'destination-over';
        bg.fillStyle = sel.empty ? '#fff' : '#000';
        bg.fillRect(0, 0, W, H);
      }
      const b = alphaBounds(src);
      if (!b) { a.toast('Es sind keine Pixel zum Transformieren vorhanden.'); return false; }
      this.L = L;
      this.src = src;
      this.base = base;
      this.orig = cloneCanvas(target);
      this.selMask = sel.empty ? null : cloneCanvas(sel.mask);
      this.b = b;
      this.t = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, sx: 1, sy: 1, rot: 0 };
      this.render();
      return true;
    },

    matrix(g) {
      const t = this.t;
      g.translate(t.cx, t.cy);
      g.rotate(t.rot);
      g.scale(t.sx, t.sy);
    },

    render() {
      const L = this.L, g = L.target.getContext('2d'), b = this.b;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.base, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.imageSmoothingEnabled = this.options.smooth;
      g.imageSmoothingQuality = 'high';
      this.matrix(g);
      g.drawImage(this.src, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
      L.markTarget();
      PW.bus.emit('options:refresh');
      app().render();
    },

    // Values shown in the options bar.
    value(key) {
      const t = this.t;
      if (!t) return 0;
      return { x: t.cx, y: t.cy, w: t.sx * 100, h: t.sy * 100, rot: (t.rot * 180) / Math.PI }[key];
    },
    setValue(key, v) {
      const t = this.t;
      if (!t || !isFinite(v)) return;
      if (key === 'x') t.cx = v;
      if (key === 'y') t.cy = v;
      if (key === 'w') t.sx = Math.max(0.001, v / 100);
      if (key === 'h') t.sy = Math.max(0.001, v / 100);
      if (key === 'rot') t.rot = (v * Math.PI) / 180;
      this.render();
    },
    onOption() { if (this.t) this.render(); },

    toLocal(p) {
      const t = this.t, dx = p.x - t.cx, dy = p.y - t.cy, c = Math.cos(-t.rot), s = Math.sin(-t.rot);
      return { x: dx * c - dy * s, y: dx * s + dy * c };
    },
    corners() {
      const t = this.t, W = this.b.w * t.sx, H = this.b.h * t.sy, c = Math.cos(t.rot), s = Math.sin(t.rot);
      return HANDLES.map(([hx, hy]) => {
        const lx = (hx * W) / 2, ly = (hy * H) / 2;
        return { hx, hy, x: t.cx + lx * c - ly * s, y: t.cy + lx * s + ly * c };
      });
    },
    hit(p) {
      const z = app().view.zoom;
      for (const h of this.corners()) if (Math.hypot(h.x - p.x, h.y - p.y) * z < 9) return { type: 'scale', hx: h.hx, hy: h.hy };
      const l = this.toLocal(p), W = this.b.w * this.t.sx, H = this.b.h * this.t.sy;
      if (Math.abs(l.x) <= W / 2 && Math.abs(l.y) <= H / 2) return { type: 'move' };
      return { type: 'rotate' };
    },
    hover(p) {
      if (!this.t) return;
      const h = this.hit(p);
      app().setCursor(h.type === 'scale' ? handleCursor(h.hx, h.hy, this.t.rot) : h.type === 'move' ? 'move' : 'alias');
    },
    down(p) {
      if (!this.t) return;
      const now = performance.now();
      if (now - (this.lastDown || 0) < 300 && this.hit(p).type === 'move') return this.commitTransform();
      this.lastDown = now;
      this.drag = { ...this.hit(p), start: p, t0: { ...this.t }, l0: this.toLocal(p) };
    },
    move(p) {
      const d = this.drag;
      if (!d) return;
      const t = this.t, t0 = d.t0;
      if (d.type === 'move') {
        t.cx = t0.cx + p.x - d.start.x;
        t.cy = t0.cy + p.y - d.start.y;
      } else if (d.type === 'rotate') {
        const a0 = Math.atan2(d.start.y - t0.cy, d.start.x - t0.cx), a1 = Math.atan2(p.y - t0.cy, p.x - t0.cx);
        let r = t0.rot + a1 - a0;
        if (p.shift) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
        t.rot = r;
      } else {
        // Scale against the opposite handle (or the centre with Alt), in the box's own frame.
        const W0 = this.b.w * t0.sx, H0 = this.b.h * t0.sy;
        const dx = p.x - t0.cx, dy = p.y - t0.cy, c = Math.cos(-t0.rot), s = Math.sin(-t0.rot);
        const l = { x: dx * c - dy * s, y: dx * s + dy * c };
        const ax = p.alt ? 0 : (-d.hx * W0) / 2, ay = p.alt ? 0 : (-d.hy * H0) / 2;
        let W = W0, H = H0;
        if (d.hx) W = Math.max(1, p.alt ? 2 * Math.abs(l.x) : d.hx * (l.x - ax));
        if (d.hy) H = Math.max(1, p.alt ? 2 * Math.abs(l.y) : d.hy * (l.y - ay));
        const proportional = d.hx && d.hy ? !p.shift : p.shift;
        if (proportional) {
          const k = d.hx && d.hy ? Math.max(W / W0, H / H0) : d.hx ? W / W0 : H / H0;
          W = W0 * k;
          H = H0 * k;
        }
        const cl = { x: p.alt || !d.hx ? 0 : ax + (d.hx * W) / 2, y: p.alt || !d.hy ? 0 : ay + (d.hy * H) / 2 };
        if (proportional && !p.alt) {
          if (!d.hx) cl.x = 0;
          if (!d.hy) cl.y = 0;
        }
        const C = Math.cos(t0.rot), S = Math.sin(t0.rot);
        t.cx = t0.cx + cl.x * C - cl.y * S;
        t.cy = t0.cy + cl.x * S + cl.y * C;
        t.sx = W / this.b.w;
        t.sy = H / this.b.h;
      }
      this.render();
    },
    up() { this.drag = null; },
    onKey(e) {
      if (e.key === 'Enter') { this.commitTransform(); return true; }
      if (e.key === 'Escape') { this.cancelTransform(); return true; }
      return false;
    },

    commitTransform() {
      const a = app();
      if (!this.L) return a.restoreTool();
      if (this.selMask) {
        const b = this.b, m = this.selMask;
        const doc = a.doc;
        doc.selection.remap(doc.width, doc.height, g => {
          g.save();
          g.imageSmoothingEnabled = this.options.smooth;
          this.matrix(g);
          g.drawImage(m, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
          g.restore();
        });
      }
      this.clear();
      a.commit('Frei transformieren', 'transform');
      a.restoreTool();
    },
    cancelTransform() {
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
      this.L = this.src = this.base = this.orig = this.selMask = this.t = null;
      this.drag = null;
    },
    deactivate() {
      if (this.L) this.commitTransform();
    },
    drawOverlay(g, view) {
      if (!this.t) return;
      const cs = this.corners().map(c => ({ ...view.ds(c.x, c.y), hx: c.hx, hy: c.hy }));
      const order = [0, 2, 4, 6];
      g.beginPath();
      order.forEach((i, k) => (k ? g.lineTo(cs[i].x, cs[i].y) : g.moveTo(cs[i].x, cs[i].y)));
      g.closePath();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 3;
      g.stroke();
      g.strokeStyle = app().view.accent;
      g.lineWidth = 1;
      g.stroke();
      for (const c of cs) drawHandle(g, c.x, c.y);
      const ctr = view.ds(this.t.cx, this.t.cy);
      g.beginPath();
      g.arc(ctr.x, ctr.y, 4, 0, Math.PI * 2);
      g.strokeStyle = '#fff';
      g.stroke();
      g.beginPath();
      g.arc(ctr.x, ctr.y, 5, 0, Math.PI * 2);
      g.strokeStyle = '#000';
      g.stroke();
    },
  });

  PW.cropTool = crop;
  PW.transformTool = transform;
})(window.PW);
