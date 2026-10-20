// ─── Retouch: spot healing brush, remove tool, healing brush, patch tool, content-aware fill ───
// Spot healing and remove paint over what should go; on release the painted area is rebuilt from
// its surroundings (PW.inpaint). The healing brush and the patch tool copy from a chosen spot and
// then carry over light and colour from the edge of the target (membrane), so the copy blends in.
'use strict';

(function (PW) {
  const { createCanvas, clipRect, clamp, dist, lerp, alphaBounds } = PW.util;
  const app = () => PW.app;
  const scaleOf = doc => Math.max(1, Math.max(doc.width, doc.height) / 2000);

  // Long work runs behind the busy screen with a percentage.
  async function withProgress(label, fn) {
    return PW.ui.busy(() => fn(p => PW.ui.busyText(`${label} … ${Math.round(p * 100)} %`)), `${label} …`);
  }

  // Straight-alpha "over": puts colour c with alpha a (0–1) over pixel j of d.
  function over(d, j, r, g, b, a) {
    const da = d[j + 3] / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[j] = (r * a + d[j] * da * (1 - a)) / oa;
    d[j + 1] = (g * a + d[j + 1] * da * (1 - a)) / oa;
    d[j + 2] = (b * a + d[j + 2] * da * (1 - a)) / oa;
    d[j + 3] = oa * 255;
  }

  function selectionAlpha(doc, r) {
    if (doc.selection.empty) return null;
    return doc.selection.mask.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
  }

  // Grow a binary mask by `n` pixels (square neighbourhood, two passes).
  function grow(m, w, h, n) {
    if (n < 1) return m;
    const a = new Uint8Array(m.length), b = new Uint8Array(m.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = Math.max(0, x - n); k <= Math.min(w - 1, x + n) && !v; k++) v = m[y * w + k];
        a[y * w + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = Math.max(0, y - n); k <= Math.min(h - 1, y + n) && !v; k++) v = a[k * w + x];
        b[y * w + x] = v;
      }
    }
    return b;
  }

  // ─── Content-aware: rebuild the area of `mask` (canvas, alpha = how much) on `layer` ───
  // opts: grow (px), reach (search area around the hole, as a multiple of its size), sampleAll, label,
  // clip (false: not limited by the selection).
  async function rebuild(layer, mask, opts = {}) {
    const doc = app().doc, W = doc.width, H = doc.height, sc = scaleOf(doc);
    const mb = alphaBounds(mask);
    if (!mb) return false;
    const margin = Math.round(Math.max(28 * sc, Math.max(mb.w, mb.h) * (opts.reach || 1.2)));
    const r = clipRect({ x: mb.x - margin, y: mb.y - margin, w: mb.w + margin * 2, h: mb.h + margin * 2 }, W, H);
    const src = (opts.sampleAll ? doc.flattened() : layer.canvas).getContext('2d').getImageData(r.x, r.y, r.w, r.h);
    const md = mask.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
    const n = r.w * r.h;
    let hole = new Uint8Array(n);
    const avoid = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      hole[i] = md[i * 4 + 3] > 5 ? 1 : 0;
      if (src.data[i * 4 + 3] < 250) avoid[i] = 1;
    }
    hole = grow(hole, r.w, r.h, Math.round(opts.grow || 0));
    const filled = await withProgress(opts.label || 'Wird aufgefüllt', set => PW.inpaint.fill(src.data, r.w, r.h, hole, { avoid, onProgress: set }));
    // The fill already meets its surroundings; a slight feather only smooths the stair steps.
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = hole[i];
    PW.filters.blurPlane(a, r.w, r.h, 0.6);
    for (let i = 0; i < n; i++) if (hole[i]) a[i] = Math.max(a[i], 0.9);
    const sel = opts.clip === false ? null : selectionAlpha(doc, r);
    const g = layer.canvas.getContext('2d'), cur = g.getImageData(r.x, r.y, r.w, r.h), d = cur.data;
    for (let i = 0; i < n; i++) {
      let k = a[i];
      if (sel) k *= sel[i * 4 + 3] / 255;
      if (k <= 0) continue;
      over(d, i * 4, filled[i * 4], filled[i * 4 + 1], filled[i * 4 + 2], Math.min(1, k));
    }
    g.putImageData(cur, r.x, r.y);
    layer.touch();
    return true;
  }

  // ─── Healing copy: `copy` (RGBA of the region) goes where alpha > 0, shifted in light and colour
  // so that it meets the original `base` at the edge of the area. a: Float32Array (0–1) per pixel.
  function healInto(base, copy, srcAround, a, w, h) {
    const n = w * h, diff = new Float32Array(n * 3), known = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (a[i] > 0.02) continue;
      known[i] = 1;
      for (let c = 0; c < 3; c++) diff[i * 3 + c] = base[i * 4 + c] - srcAround[i * 4 + c];
    }
    PW.inpaint.membrane(diff, known, w, h, 3, 60);
    const out = new Uint8ClampedArray(base);
    for (let i = 0; i < n; i++) {
      const k = a[i];
      if (k <= 0) continue;
      const j = i * 4;
      for (let c = 0; c < 3; c++) out[j + c] = base[j + c] + (copy[j + c] + diff[i * 3 + c] - base[j + c]) * k;
    }
    return out;
  }

  // Copies the area `alpha` (Float32Array over doc rect r) from (dx, dy) away with healing.
  function healCopyRegion(layer, src, r, alpha, dx, dy, baseData) {
    const doc = app().doc, W = doc.width, H = doc.height;
    // Pixels at the shifted position, over the whole region (edge included), clamped to the picture.
    const sx = clamp(r.x + dx, 0, W - 1), sy = clamp(r.y + dy, 0, H - 1);
    const sr = clipRect({ x: sx, y: sy, w: r.w, h: r.h }, W, H);
    const sd = src.getContext('2d').getImageData(sr.x, sr.y, sr.w, sr.h).data;
    const shifted = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++) {
      const yy = clamp(r.y + y + dy, sr.y, sr.y + sr.h - 1) - sr.y;
      for (let x = 0; x < r.w; x++) {
        const xx = clamp(r.x + x + dx, sr.x, sr.x + sr.w - 1) - sr.x;
        const j = (y * r.w + x) * 4, k = (yy * sr.w + xx) * 4;
        shifted[j] = sd[k];
        shifted[j + 1] = sd[k + 1];
        shifted[j + 2] = sd[k + 2];
        shifted[j + 3] = sd[k + 3];
      }
    }
    const out = healInto(baseData, shifted, shifted, alpha, r.w, r.h);
    const g = layer.canvas.getContext('2d'), img = g.getImageData(r.x, r.y, r.w, r.h);
    for (let i = 0; i < r.w * r.h; i++) {
      if (alpha[i] <= 0) continue;
      for (let c = 0; c < 4; c++) img.data[i * 4 + c] = c === 3 ? Math.max(baseData[i * 4 + 3], out[i * 4 + 3]) : out[i * 4 + c];
    }
    g.putImageData(img, r.x, r.y);
    layer.touch();
  }

  // ─── Painting a mask (spot healing, remove) ───
  function dab(g, x, y, size, hardness, color) {
    const r = Math.max(0.5, size / 2), grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(clamp(hardness, 0, 0.99), color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function cursor(g, view, size) {
    const h = view.hover;
    if (!h) return;
    const s = view.ds(h.x, h.y), r = Math.max(2, (size / 2) * view.zoom);
    g.beginPath();
    g.arc(s.x, s.y, r, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  }

  function healLayer() {
    const a = app(), layer = a.paintLayer();
    if (!layer) return null;
    if (layer.targetIsMask) {
      a.toast('Auf einer Maske gibt es nichts zu reparieren. Klicke in den Ebenen auf das Bild statt auf die Maske.');
      return null;
    }
    return layer;
  }

  function maskTool(def) {
    return PW.tools.register({
      group: 'heal', key: 'J', brushCursor: true,
      cursorSize() { return this.options.size; },
      down(p) {
        if (this.working) return;
        const doc = app().doc;
        this.layer = healLayer();
        if (!this.layer) return;
        if (!this.mask || this.mask.width !== doc.width || this.mask.height !== doc.height) this.mask = createCanvas(doc.width, doc.height);
        this.mg = this.mask.getContext('2d');
        this.mg.clearRect(0, 0, doc.width, doc.height);
        this.last = p;
        dab(this.mg, p.x, p.y, this.options.size, this.options.hardness / 100, this.tint);
        app().render();
      },
      move(p) {
        if (!this.layer || !this.last) return;
        const d = dist(this.last, p), step = Math.max(1, this.options.size * 0.1);
        for (let s = step; s <= d; s += step) {
          const t = s / d;
          dab(this.mg, lerp(this.last.x, p.x, t), lerp(this.last.y, p.y, t), this.options.size, this.options.hardness / 100, this.tint);
        }
        if (d >= step) this.last = p;
        app().render();
      },
      async up() {
        if (!this.layer || this.working) return;
        const layer = this.layer;
        this.layer = null;
        this.last = null;
        this.working = true;
        try {
          const sc = scaleOf(app().doc);
          const ok = await rebuild(layer, this.mask, { grow: this.growPx * sc, reach: this.reach, sampleAll: this.options.sampleAll, label: this.busyLabel });
          this.mg.clearRect(0, 0, this.mask.width, this.mask.height);
          if (ok) app().commit(this.historyName, this.icon);
        } catch (e) {
          this.mg.clearRect(0, 0, this.mask.width, this.mask.height);
          app().toast(e.message || String(e));
        } finally {
          this.working = false;
          app().render();
        }
      },
      cancel() {
        if (this.working) return;
        this.layer = null;
        this.last = null;
        if (this.mg) this.mg.clearRect(0, 0, this.mask.width, this.mask.height);
        app().render();
      },
      drawOverlay(g, view) {
        if (this.layer && this.mask) {
          const z = view.zoom, d = view.dpr;
          g.save();
          g.setTransform(d * z, 0, 0, d * z, d * view.x, d * view.y);
          g.globalAlpha = 0.5;
          g.drawImage(this.mask, 0, 0);
          g.restore();
        }
        cursor(g, view, this.options.size);
      },
      ...def,
    });
  }

  maskTool({
    id: 'spotHeal', name: 'Bereichsreparatur-Pinsel-Werkzeug', historyName: 'Bereichsreparatur-Pinsel', icon: 'bandage',
    options: { size: 30, hardness: 80, sampleAll: false },
    bar: [{ type: 'brush' }, { type: 'sep' }, { type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' }, { type: 'hint', text: 'Über die Stelle malen, die verschwinden soll' }],
    hint: 'Über kleine Störungen malen (Pickel, Flecken, Fussel): sie werden aus der Umgebung aufgefüllt.',
    tint: 'rgba(0,0,0,1)', growPx: 2, reach: 1.5, busyLabel: 'Wird repariert',
  });

  maskTool({
    id: 'remove', name: 'Entfernen-Werkzeug', historyName: 'Entfernen', icon: 'remove',
    options: { size: 70, hardness: 90, sampleAll: false },
    bar: [{ type: 'brush' }, { type: 'sep' }, { type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' }, { type: 'hint', text: 'Ganz über das Objekt malen, auch über seinen Schatten' }],
    hint: 'Über ein Objekt malen, das weg soll (Person, Kabel, Schrift): es wird durch passenden Hintergrund ersetzt.',
    tint: 'rgba(233,60,110,1)', growPx: 4, reach: 1.2, busyLabel: 'Wird entfernt',
  });

  // ─── Healing brush: like the clone stamp, then light and colour from the target's edge ───
  PW.tools.register({
    id: 'heal', group: 'heal', name: 'Reparatur-Pinsel-Werkzeug', historyName: 'Reparatur-Pinsel', key: 'J', icon: 'heal', brushCursor: true,
    options: { size: 40, hardness: 70, aligned: true, sampleAll: false },
    bar: [
      { type: 'brush' },
      { type: 'sep' },
      { type: 'check', key: 'aligned', label: 'Ausger.' },
      { type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' },
      { type: 'hint', text: 'Alt + Klick legt die Quelle fest' },
    ],
    hint: 'Alt-Klick auf eine saubere Stelle, dann über die Störung malen. Die Struktur kommt von der Quelle, Licht und Farbe vom Ziel.',
    cursorSize() { return this.options.size; },
    down(p) {
      const a = app();
      if (p.alt) {
        this.source = { x: p.x, y: p.y };
        this.offset = null;
        a.toast('Quelle festgelegt');
        a.render();
        return;
      }
      if (!this.source) {
        a.toast('Halte Alt gedrückt und klicke auf eine saubere Stelle, um die Quelle festzulegen.');
        return;
      }
      const layer = healLayer();
      if (!layer) return;
      if (!this.offset || !this.options.aligned) this.offset = { x: this.source.x - p.x, y: this.source.y - p.y };
      const doc = a.doc;
      this.layer = layer;
      this.src = this.options.sampleAll ? doc.flattened() : PW.util.cloneCanvas(layer.canvas);
      this.base = PW.util.cloneCanvas(layer.canvas);
      if (!this.mask || this.mask.width !== doc.width || this.mask.height !== doc.height) this.mask = createCanvas(doc.width, doc.height);
      this.mg = this.mask.getContext('2d');
      this.mg.clearRect(0, 0, doc.width, doc.height);
      this.last = p;
      this.paint(p);
    },
    // Live preview: plain copy where the brush went.
    paint(p) {
      const o = this.options;
      dab(this.mg, p.x, p.y, o.size, o.hardness / 100, '#fff');
      const r = clipRect({ x: Math.floor(p.x - o.size / 2) - 1, y: Math.floor(p.y - o.size / 2) - 1, w: Math.ceil(o.size) + 3, h: Math.ceil(o.size) + 3 }, this.mask.width, this.mask.height);
      if (!r) return;
      const g = this.layer.canvas.getContext('2d');
      g.save();
      g.beginPath();
      g.rect(r.x, r.y, r.w, r.h);
      g.clip();
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.base, 0, 0);
      g.globalCompositeOperation = 'source-over';
      const t = createCanvas(r.w, r.h), tg = t.getContext('2d');
      tg.drawImage(this.src, r.x + this.offset.x, r.y + this.offset.y, r.w, r.h, 0, 0, r.w, r.h);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(this.mask, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      g.drawImage(t, r.x, r.y);
      g.restore();
      this.layer.touch();
    },
    move(p) {
      if (!this.layer || !this.last) return;
      const d = dist(this.last, p), step = Math.max(1, this.options.size * 0.1);
      for (let s = step; s <= d; s += step) {
        const t = s / d;
        this.paint({ x: lerp(this.last.x, p.x, t), y: lerp(this.last.y, p.y, t) });
      }
      if (d >= step) this.last = p;
      app().render();
    },
    up() {
      if (!this.layer) return;
      const layer = this.layer, doc = app().doc;
      this.layer = null;
      this.last = null;
      const mb = alphaBounds(this.mask);
      if (!mb) return;
      const pad = Math.round(4 * scaleOf(doc)) + 2;
      const r = clipRect({ x: mb.x - pad, y: mb.y - pad, w: mb.w + 2 * pad, h: mb.h + 2 * pad }, doc.width, doc.height);
      const md = this.mg.getImageData(r.x, r.y, r.w, r.h).data, sel = selectionAlpha(doc, r);
      const alpha = new Float32Array(r.w * r.h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = (md[i * 4 + 3] / 255) * (sel ? sel[i * 4 + 3] / 255 : 1);
      const baseData = this.base.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
      healCopyRegion(layer, this.src, r, alpha, Math.round(this.offset.x), Math.round(this.offset.y), baseData);
      this.mg.clearRect(0, 0, this.mask.width, this.mask.height);
      this.src = this.base = null;
      app().commit(this.historyName, this.icon);
    },
    cancel() {
      if (this.layer && this.base) {
        const g = this.layer.canvas.getContext('2d');
        g.save();
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.base, 0, 0);
        g.restore();
        this.layer.touch();
      }
      this.layer = null;
      this.last = null;
      app().render();
    },
    drawOverlay(g, view) {
      cursor(g, view, this.options.size);
      const h = view.hover;
      if (!this.source || !h) return;
      // Where the brush takes from right now.
      const off = this.offset && this.options.aligned ? this.offset : { x: this.source.x - h.x, y: this.source.y - h.y };
      const s = view.ds(h.x + off.x, h.y + off.y);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(s.x - 6, s.y);
      g.lineTo(s.x + 6, s.y);
      g.moveTo(s.x, s.y - 6);
      g.lineTo(s.x, s.y + 6);
      g.stroke();
    },
  });

  // ─── Patch tool: draw around the spot, drag it onto a clean area ───
  PW.tools.register({
    id: 'patch', group: 'heal', name: 'Ausbessern-Werkzeug', historyName: 'Ausbessern', key: 'J', icon: 'patch',
    options: { sampleAll: false },
    bar: [{ type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' }, { type: 'hint', text: 'Stelle umfahren, dann die Auswahl auf eine saubere Stelle ziehen' }],
    hint: 'Umfahre die Stelle, die weg soll. Dann die Auswahl auf eine saubere Stelle ziehen: deren Struktur wird übernommen und farblich angepasst.',
    down(p) {
      const doc = app().doc, sel = doc.selection;
      if (!sel.empty && sel.alphaAt(p.x, p.y) > 0) {
        this.drag = { start: p, dx: 0, dy: 0 };
        this.hideAnts = true;
        return;
      }
      this.points = [{ x: p.x, y: p.y }];
    },
    move(p) {
      if (this.drag) {
        this.drag.dx = Math.round(p.x - this.drag.start.x);
        this.drag.dy = Math.round(p.y - this.drag.start.y);
        app().render();
        return;
      }
      if (!this.points) return;
      const last = this.points[this.points.length - 1];
      if (dist(last, p) * app().view.zoom >= 1.5) this.points.push({ x: p.x, y: p.y });
      app().render();
    },
    up() {
      const a = app(), doc = a.doc;
      if (this.drag) {
        const { dx, dy } = this.drag;
        this.drag = null;
        this.hideAnts = false;
        if (!dx && !dy) return a.render();
        const layer = healLayer();
        if (!layer) return a.render();
        const sel = doc.selection, b = sel.bounds, pad = Math.round(3 * scaleOf(doc)) + 2;
        const r = clipRect({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }, doc.width, doc.height);
        if (!r) return a.render();
        const sd = sel.mask.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data, alpha = new Float32Array(r.w * r.h);
        for (let i = 0; i < alpha.length; i++) alpha[i] = sd[i * 4 + 3] / 255;
        const src = this.options.sampleAll ? doc.flattened() : PW.util.cloneCanvas(layer.canvas);
        const baseData = layer.canvas.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
        healCopyRegion(layer, src, r, alpha, dx, dy, baseData);
        a.commit(this.historyName, this.icon);
        return;
      }
      if (!this.points) return;
      const pts = this.points;
      this.points = null;
      if (pts.length < 3) return a.render();
      doc.selection.polygon(pts, 'replace');
      a.commit('Ausbessern-Auswahl', 'selection');
    },
    cancel() {
      this.points = null;
      this.drag = null;
      this.hideAnts = false;
      app().render();
    },
    drawOverlay(g, view) {
      const z = view.zoom, d = view.dpr;
      if (this.drag) {
        g.save();
        g.setTransform(d * z, 0, 0, d * z, d * (view.x + this.drag.dx * z), d * (view.y + this.drag.dy * z));
        g.lineWidth = 1 / z;
        g.strokeStyle = '#fff';
        g.stroke(app().doc.selection.outline());
        g.setLineDash([4 / z, 4 / z]);
        g.strokeStyle = '#000';
        g.stroke(app().doc.selection.outline());
        g.restore();
        return;
      }
      if (!this.points) return;
      g.beginPath();
      this.points.forEach((p, i) => {
        const s = view.ds(p.x, p.y);
        if (i) g.lineTo(s.x, s.y);
        else g.moveTo(s.x, s.y);
      });
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([4, 4]);
      g.strokeStyle = '#000';
      g.stroke();
      g.setLineDash([]);
    },
  });

  // ─── Edit › Content-aware fill: the selection is rebuilt from its surroundings ───
  async function contentAwareFill() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    if (doc.selection.empty) return a.toast('Wähle zuerst aus, was aufgefüllt werden soll, z. B. mit dem Lasso.');
    const layer = healLayer();
    if (!layer) return;
    try {
      // The selection decides where; inside it the whole area is rebuilt, its soft edge blends.
      const ok = await rebuild(layer, doc.selection.mask, { grow: 2 * scaleOf(doc), reach: 1.3, clip: false, label: 'Inhaltsbasiert füllen' });
      if (ok) a.commit('Inhaltsbasiert füllen', 'bandage');
    } catch (e) {
      a.toast(e.message || String(e));
    }
  }

  PW.retouch = { rebuild, healCopyRegion, contentAwareFill };
})(window.PW);
