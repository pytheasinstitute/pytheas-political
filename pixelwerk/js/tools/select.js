// ─── Selection tools: marquees, lassos, magic wand (+ shared flood fill) ───
'use strict';

(function (PW) {
  const { normRect, dist } = PW.util;
  const app = () => PW.app;

  const MODE_BUTTONS = {
    type: 'buttons', key: 'mode', options: [
      ['replace', 'sel-new', 'Neue Auswahl'],
      ['add', 'sel-add', 'Der Auswahl hinzufügen (Umschalt)'],
      ['subtract', 'sel-sub', 'Von Auswahl subtrahieren (Alt)'],
      ['intersect', 'sel-int', 'Schnittmenge mit Auswahl bilden (Umschalt+Alt)'],
    ],
  };
  const FEATHER = { type: 'number', key: 'feather', label: 'Weiche Kante', min: 0, max: 250, unit: 'Px' };

  // Modifier keys at mouse-down override the mode buttons, like Photoshop.
  function pickMode(tool, p) {
    const has = !app().doc.selection.empty;
    if (has) {
      if (p.shift && p.alt) return 'intersect';
      if (p.shift) return 'add';
      if (p.alt) return 'subtract';
    }
    return tool.options.mode;
  }

  function finishSelection(tool, apply, name) {
    const a = app(), sel = a.doc.selection;
    apply(sel);
    if (tool.options.feather > 0) sel.feather(tool.options.feather / 2);
    a.commit(name, 'selection');
  }

  function deselect(name = 'Auswahl aufheben') {
    const a = app(), sel = a.doc.selection;
    if (sel.empty) return;
    a.doc.savedSelection = sel.snapshot();
    sel.clear();
    a.commit(name, 'selection');
  }

  function dashedPath(g, build) {
    g.beginPath();
    build(g);
    g.lineWidth = 1;
    g.setLineDash([]);
    g.strokeStyle = '#fff';
    g.stroke();
    g.setLineDash([4, 4]);
    g.strokeStyle = '#000';
    g.stroke();
    g.setLineDash([]);
  }

  function sizeLabel(g, x, y, text) {
    g.font = '11px system-ui, sans-serif';
    const w = g.measureText(text).width + 12;
    g.fillStyle = 'rgba(20,20,22,0.85)';
    g.fillRect(x + 14, y + 14, w, 20);
    g.fillStyle = '#fff';
    g.fillText(text, x + 20, y + 28);
  }

  // Shared "drag inside an existing selection moves its outline" behaviour.
  const outlineMover = {
    startMove(p) {
      this.moving = { start: p, dx: 0, dy: 0 };
      this.hideAnts = true;
    },
    updateMove(p) {
      this.moving.dx = Math.round(p.x - this.moving.start.x);
      this.moving.dy = Math.round(p.y - this.moving.start.y);
      app().render();
    },
    endMove() {
      const { dx, dy } = this.moving;
      this.moving = null;
      this.hideAnts = false;
      if (dx || dy) {
        app().doc.selection.offset(dx, dy);
        app().commit('Auswahl verschieben', 'selection');
      } else app().render();
    },
    drawMove(g, view) {
      const m = this.moving, z = view.zoom, d = view.dpr;
      g.save();
      g.setTransform(d * z, 0, 0, d * z, d * (view.x + m.dx * z), d * (view.y + m.dy * z));
      g.lineWidth = 1 / z;
      g.strokeStyle = '#fff';
      g.stroke(app().doc.selection.outline());
      g.setLineDash([4 / z, 4 / z]);
      g.strokeStyle = '#000';
      g.stroke(app().doc.selection.outline());
      g.restore();
    },
  };

  // ─── Marquees ───
  function marquee(def) {
    return PW.tools.register({
      ...outlineMover,
      options: { mode: 'replace', feather: 0, style: 'normal', fixedW: 64, fixedH: 64 },
      bar: [
        MODE_BUTTONS, { type: 'sep' }, FEATHER,
        { type: 'select', key: 'style', label: 'Art', options: [['normal', 'Normal'], ['ratio', 'Festes Seitenverhältnis'], ['size', 'Feste Größe']] },
        { type: 'number', key: 'fixedW', label: 'B', min: 1, max: 30000, showIf: o => o.style !== 'normal' },
        { type: 'number', key: 'fixedH', label: 'H', min: 1, max: 30000, showIf: o => o.style !== 'normal' },
      ],
      down(p) {
        const sel = app().doc.selection;
        this.mode = pickMode(this, p);
        if (this.mode === 'replace' && !p.shift && !p.alt && sel.alphaAt(p.x, p.y) > 0 && this.options.style !== 'size') {
          this.startMove(p);
          return;
        }
        this.start = p;
        this.cur = p;
        this.lockShift = p.shift && !sel.empty;
        this.lockAlt = p.alt && !sel.empty;
      },
      move(p) {
        if (this.moving) return this.updateMove(p);
        if (!this.start) return;
        this.cur = p;
        app().render();
      },
      rect() {
        const s = this.start, c = this.cur, o = this.options;
        if (o.style === 'size') return { x: Math.round(c.x), y: Math.round(c.y), w: o.fixedW, h: o.fixedH };
        let dx = c.x - s.x, dy = c.y - s.y;
        const square = c.shift && !this.lockShift;
        const fromCenter = c.alt && !this.lockAlt;
        if (o.style === 'ratio') {
          const k = o.fixedH / o.fixedW, m = Math.max(Math.abs(dx), Math.abs(dy) / k);
          dx = Math.sign(dx || 1) * m;
          dy = Math.sign(dy || 1) * m * k;
        } else if (square) {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * m;
          dy = Math.sign(dy || 1) * m;
        }
        if (fromCenter) return normRect(s.x - dx, s.y - dy, s.x + dx, s.y + dy);
        return normRect(s.x, s.y, s.x + dx, s.y + dy);
      },
      up(p) {
        if (this.moving) return this.endMove();
        if (!this.start) return;
        this.cur = p;
        const r = this.rect();
        this.start = null;
        if (r.w < 1 || r.h < 1) {
          if (this.mode === 'replace') deselect();
          app().render();
          return;
        }
        finishSelection(this, sel => (this.shape === 'ellipse' ? sel.ellipse(r, this.mode) : sel.rect(r, this.mode)), this.historyName);
      },
      cancel() {
        this.start = null;
        if (this.moving) {
          this.moving = null;
          this.hideAnts = false;
        }
        app().render();
      },
      drawOverlay(g, view) {
        if (this.moving) return this.drawMove(g, view);
        if (!this.start) return;
        const r = this.rect(), a = view.ds(r.x, r.y), z = view.zoom;
        dashedPath(g, c => {
          if (this.shape === 'ellipse') c.ellipse(a.x + (r.w * z) / 2, a.y + (r.h * z) / 2, (r.w * z) / 2, (r.h * z) / 2, 0, 0, Math.PI * 2);
          else c.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(r.w * z), Math.round(r.h * z));
        });
        const c = view.ds(this.cur.x, this.cur.y);
        sizeLabel(g, c.x, c.y, `B: ${Math.round(r.w)} Px  H: ${Math.round(r.h)} Px`);
      },
      ...def,
    });
  }

  marquee({ id: 'marqueeRect', group: 'marquee', shape: 'rect', name: 'Auswahlrechteck-Werkzeug', historyName: 'Rechteckige Auswahl', key: 'M', icon: 'marquee-rect' });
  marquee({ id: 'marqueeEllipse', group: 'marquee', shape: 'ellipse', name: 'Auswahlellipse-Werkzeug', historyName: 'Elliptische Auswahl', key: 'M', icon: 'marquee-ellipse' });

  // ─── Freehand lasso ───
  PW.tools.register({
    ...outlineMover,
    id: 'lasso', group: 'lasso', name: 'Lasso-Werkzeug', key: 'L', icon: 'lasso',
    options: { mode: 'replace', feather: 0 },
    bar: [MODE_BUTTONS, { type: 'sep' }, FEATHER],
    down(p) {
      const sel = app().doc.selection;
      this.mode = pickMode(this, p);
      if (this.mode === 'replace' && !p.shift && !p.alt && sel.alphaAt(p.x, p.y) > 0) return this.startMove(p);
      this.points = [{ x: p.x, y: p.y }];
    },
    move(p) {
      if (this.moving) return this.updateMove(p);
      if (!this.points) return;
      const last = this.points[this.points.length - 1];
      if (dist(last, p) * app().view.zoom >= 1.5) this.points.push({ x: p.x, y: p.y });
      app().render();
    },
    up() {
      if (this.moving) return this.endMove();
      if (!this.points) return;
      const pts = this.points;
      this.points = null;
      if (pts.length < 3) {
        if (this.mode === 'replace') deselect();
        app().render();
        return;
      }
      finishSelection(this, sel => sel.polygon(pts, this.mode), 'Lasso');
    },
    cancel() {
      this.points = null;
      this.moving = null;
      this.hideAnts = false;
      app().render();
    },
    drawOverlay(g, view) {
      if (this.moving) return this.drawMove(g, view);
      if (!this.points) return;
      dashedPath(g, c => this.points.forEach((p, i) => {
        const s = view.ds(p.x, p.y);
        i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y);
      }));
    },
  });

  // ─── Polygon lasso: click to add corners, close on the start point or double-click ───
  PW.tools.register({
    id: 'polyLasso', group: 'lasso', name: 'Polygon-Lasso-Werkzeug', key: 'L', icon: 'poly-lasso',
    options: { mode: 'replace', feather: 0 },
    bar: [MODE_BUTTONS, { type: 'sep' }, FEATHER, { type: 'hint', text: 'Doppelklick oder Enter schließt · Rücktaste entfernt Punkt' }],
    down(p) {
      const view = app().view, now = performance.now();
      if (!this.points) {
        this.mode = pickMode(this, p);
        this.points = [{ x: p.x, y: p.y }];
        this.lastClick = now;
        app().render();
        return;
      }
      const first = this.points[0], last = this.points[this.points.length - 1];
      const nearStart = dist(first, p) * view.zoom < 8 && this.points.length > 2;
      const dbl = now - this.lastClick < 320 && dist(last, p) * view.zoom < 6;
      this.lastClick = now;
      if (nearStart || dbl) return this.close();
      this.points.push({ x: p.x, y: p.y });
      app().render();
    },
    close() {
      const pts = this.points;
      this.points = null;
      if (!pts || pts.length < 3) return app().render();
      finishSelection(this, sel => sel.polygon(pts, this.mode), 'Polygon-Lasso');
    },
    onKey(e) {
      if (!this.points) return false;
      if (e.key === 'Enter') { this.close(); return true; }
      if (e.key === 'Escape') { this.cancel(); return true; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        this.points.pop();
        if (!this.points.length) this.points = null;
        app().render();
        return true;
      }
      return false;
    },
    cancel() {
      this.points = null;
      app().render();
    },
    deactivate() { this.cancel(); },
    drawOverlay(g, view) {
      if (!this.points) return;
      const h = view.hover;
      dashedPath(g, c => {
        this.points.forEach((p, i) => {
          const s = view.ds(p.x, p.y);
          i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y);
        });
        if (h) {
          const s = view.ds(h.x, h.y);
          c.lineTo(s.x, s.y);
        }
      });
      const f = view.ds(this.points[0].x, this.points[0].y);
      g.strokeStyle = '#fff';
      g.strokeRect(f.x - 3.5, f.y - 3.5, 7, 7);
    },
  });

  // ─── Flood fill: selection strength map of pixels similar to the seed ───
  function floodFill(data, W, H, sx, sy, tol, contiguous) {
    const out = new Uint8Array(W * H);
    const i0 = (sy * W + sx) * 4;
    const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
    const match = i => {
      const j = i * 4;
      return Math.abs(data[j] - r0) <= tol && Math.abs(data[j + 1] - g0) <= tol && Math.abs(data[j + 2] - b0) <= tol && Math.abs(data[j + 3] - a0) <= tol;
    };
    if (!contiguous) {
      for (let i = 0; i < W * H; i++) if (match(i)) out[i] = 255;
      return out;
    }
    const stack = new Int32Array(W * H + 1);
    let sp = 0;
    stack[sp++] = sy * W + sx;
    while (sp) {
      const i = stack[--sp];
      if (out[i]) continue;
      const y = (i / W) | 0;
      let x = i - y * W;
      while (x > 0 && !out[y * W + x - 1] && match(y * W + x - 1)) x--;
      let upOpen = false, downOpen = false;
      for (; x < W; x++) {
        const k = y * W + x;
        if (out[k] || !match(k)) break;
        out[k] = 255;
        if (y > 0) {
          const u = k - W;
          if (!out[u] && match(u)) {
            if (!upOpen) { stack[sp++] = u; upOpen = true; }
          } else upOpen = false;
        }
        if (y < H - 1) {
          const dn = k + W;
          if (!out[dn] && match(dn)) {
            if (!downOpen) { stack[sp++] = dn; downOpen = true; }
          } else downOpen = false;
        }
      }
    }
    return out;
  }

  function softenEdges(alpha, W, H) {
    const f = new Float32Array(alpha.length);
    for (let i = 0; i < f.length; i++) f[i] = alpha[i];
    PW.filters.blurPlane(f, W, H, 0.7);
    for (let i = 0; i < f.length; i++) {
      // Keep solid interiors solid; only edge pixels become partial.
      alpha[i] = alpha[i] ? Math.max(f[i], 128) : f[i] > 60 ? f[i] : 0;
    }
    return alpha;
  }

  PW.tools.register({
    id: 'wand', group: 'wand', name: 'Zauberstab-Werkzeug', key: 'W', icon: 'wand',
    options: { mode: 'replace', tolerance: 32, antialias: true, contiguous: true, sampleAll: false },
    bar: [
      MODE_BUTTONS, { type: 'sep' },
      { type: 'number', key: 'tolerance', label: 'Toleranz', min: 0, max: 255 },
      { type: 'check', key: 'antialias', label: 'Glätten' },
      { type: 'check', key: 'contiguous', label: 'Benachbart' },
      { type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' },
    ],
    down(p) {
      const a = app(), doc = a.doc;
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
      const layer = doc.active;
      const src = this.options.sampleAll || !layer ? doc.flattened() : layer.canvas;
      const data = src.getContext('2d').getImageData(0, 0, doc.width, doc.height).data;
      const alpha = floodFill(data, doc.width, doc.height, x, y, this.options.tolerance, this.options.contiguous);
      if (this.options.antialias) softenEdges(alpha, doc.width, doc.height);
      const mode = pickMode(this, p);
      doc.selection.fromAlpha(alpha, mode);
      a.commit('Zauberstab', 'selection');
    },
  });

  PW.selectionTools = { floodFill, deselect, pickMode };
})(window.PW);
