// ─── Painting: stroke engine + brush, pencil, eraser, clone stamp, retouch tools ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, clipRect, rectUnion, clamp, hexToRgb, rgbToHex, luma, dist, lerp } = PW.util;
  const app = () => PW.app;

  // Paint colour as seen by the target: masks only take grey values.
  function targetColor(layer, hex) {
    if (!layer.targetIsMask) return hex;
    const c = hexToRgb(hex);
    const v = Math.round(luma(c.r, c.g, c.b));
    return rgbToHex(v, v, v);
  }

  function makeDab(size, hardness, color, pencil) {
    const D = Math.max(1, Math.ceil(size)) + 2;
    const c = createCanvas(D, D), g = c.getContext('2d');
    const r = size / 2, cx = D / 2, cy = D / 2;
    const rgb = hexToRgb(color);
    if (pencil) {
      const img = g.createImageData(D, D), d = img.data, rr = Math.max(0.5, r) ** 2;
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < D; x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rr) {
            const j = (y * D + x) * 4;
            d[j] = rgb.r;
            d[j + 1] = rgb.g;
            d[j + 2] = rgb.b;
            d[j + 3] = 255;
          }
        }
      }
      g.putImageData(img, 0, 0);
    } else {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(0.5, r));
      const h = clamp(hardness, 0, 0.99);
      grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      grad.addColorStop(h, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  // ─── StrokeEngine: dabs accumulate in a buffer that is composited over a snapshot ───
  // Opacity caps the whole stroke (like Photoshop); flow is per dab.
  class StrokeEngine {
    constructor(layer, o) {
      this.layer = layer;
      this.target = layer.target;
      this.g = this.target.getContext('2d');
      this.W = this.target.width;
      this.H = this.target.height;
      this.o = o;
      this.base = cloneCanvas(this.target);
      this.buf = createCanvas(this.W, this.H);
      this.bg = this.buf.getContext('2d');
      const sel = PW.app.doc.selection;
      this.sel = sel.empty ? null : sel.mask;
      if (this.sel) {
        this.masked = createCanvas(this.W, this.H);
        this.mg = this.masked.getContext('2d');
      }
      this.dab = makeDab(o.size, o.hardness, o.color || '#000000', o.pencil);
      this.D = this.dab.width;
      if (o.mode === 'clone') this.cloneDab = createCanvas(this.D + 1, this.D + 1);
      this.op = o.mode === 'erase' ? 'destination-out' : layer.lockAlpha && !layer.targetIsMask ? 'source-atop' : 'source-over';
      this.dirty = null;
      this.total = null;
      this.last = null;
      this.carry = 0;
    }

    step(pr) {
      const sc = this.o.pressureSize && !this.o.pencil ? Math.max(0.05, pr) : 1;
      return Math.max(this.o.pencil ? 0.5 : 0.6, this.o.size * sc * (this.o.spacing || 0.12));
    }

    begin(p) {
      this.last = p;
      this.carry = 0;
      this.stamp(p.x, p.y, p.pressure);
      this.flush();
    }

    to(p) {
      const a = this.last, d = dist(a, p);
      if (d === 0) return;
      const step = this.step(p.pressure);
      let s = step - this.carry;
      while (s <= d) {
        const t = s / d;
        this.stamp(lerp(a.x, p.x, t), lerp(a.y, p.y, t), lerp(a.pressure, p.pressure, t));
        s += step;
      }
      this.carry = d - (s - step);
      this.last = p;
    }

    stamp(x, y, pr) {
      const o = this.o;
      const sc = o.pressureSize && !o.pencil ? Math.max(0.05, pr) : 1;
      const D = this.D * sc;
      const dx = o.pencil ? Math.round(x - D / 2) : x - D / 2;
      const dy = o.pencil ? Math.round(y - D / 2) : y - D / 2;
      this.bg.globalAlpha = clamp(o.flow * (o.pressureOpacity ? pr : 1), 0, 1);
      if (o.mode === 'clone') {
        const cd = this.cloneDab, cg = cd.getContext('2d');
        cg.globalCompositeOperation = 'source-over';
        cg.clearRect(0, 0, cd.width, cd.height);
        cg.drawImage(o.clone.canvas, dx + o.clone.dx, dy + o.clone.dy, D, D, 0, 0, D, D);
        cg.globalCompositeOperation = 'destination-in';
        cg.drawImage(this.dab, 0, 0, D, D);
        this.bg.drawImage(cd, 0, 0, D, D, dx, dy, D, D);
      } else {
        this.bg.drawImage(this.dab, dx, dy, D, D);
      }
      this.dirty = rectUnion(this.dirty, { x: dx - 1, y: dy - 1, w: D + 2, h: D + 2 });
    }

    flush() {
      const r = this.dirty && clipRect(this.dirty, this.W, this.H);
      this.dirty = null;
      if (!r) return;
      this.total = rectUnion(this.total, r);
      const g = this.g;
      g.save();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(r.x, r.y, r.w, r.h);
      g.drawImage(this.base, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      let src = this.buf;
      if (this.sel) {
        const m = this.mg;
        m.globalCompositeOperation = 'source-over';
        m.clearRect(r.x, r.y, r.w, r.h);
        m.drawImage(this.buf, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        m.globalCompositeOperation = 'destination-in';
        m.drawImage(this.sel, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        m.globalCompositeOperation = 'source-over';
        src = this.masked;
      }
      g.globalAlpha = this.o.opacity;
      g.globalCompositeOperation = this.op;
      g.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      g.restore();
      this.layer.markTarget(r);
    }

    end() {
      this.flush();
      return this.total;
    }

    cancel() {
      this.g.save();
      this.g.globalCompositeOperation = 'copy';
      this.g.drawImage(this.base, 0, 0);
      this.g.restore();
      this.layer.markTarget();
    }
  }

  // ─── Shared UI bits ───
  function drawBrushCursor(g, view, size) {
    const h = view.hover;
    if (!h || PW.app.dragging === 'pan') return;
    const s = view.ds(h.x, h.y), r = (size / 2) * view.zoom;
    if (r < 3) {
      g.strokeStyle = '#000';
      g.lineWidth = 3;
      cross(g, s.x, s.y, 6);
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      cross(g, s.x, s.y, 6);
      return;
    }
    g.beginPath();
    g.arc(s.x, s.y, r, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 2.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1;
    g.stroke();
  }

  function cross(g, x, y, n) {
    g.beginPath();
    g.moveTo(x - n, y);
    g.lineTo(x + n, y);
    g.moveTo(x, y - n);
    g.lineTo(x, y + n);
    g.stroke();
  }

  const BRUSH_BAR = [
    { type: 'brush' },
    { type: 'sep' },
    { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
    { type: 'range', key: 'flow', label: 'Fluss', min: 1, max: 100, unit: '%' },
    { type: 'check', key: 'pressure', label: 'Stiftdruck steuert Größe', icon: 'pen' },
  ];

  // Builds brush-like tools that share the StrokeEngine.
  function paintTool(def) {
    return PW.tools.register({
      brushCursor: true,
      cursorSize() { return this.options.size; },
      drawOverlay(g, view) {
        drawBrushCursor(g, view, this.options.size);
        if (this.overlayExtra) this.overlayExtra(g, view);
      },
      down(p) {
        const a = app();
        const layer = a.paintLayer();
        if (!layer) return;
        const o = this.engineOptions(layer, p);
        if (!o) return;
        this.stroke = new StrokeEngine(layer, o);
        if (p.shift && this.lastPoint && this.lastLayer === layer.id) {
          this.stroke.begin(this.lastPoint);
          this.stroke.to(p);
          this.stroke.flush();
        } else {
          this.stroke.begin(p);
        }
        a.render();
      },
      move(p) {
        if (!this.stroke) return;
        this.stroke.to(p);
        this.stroke.flush();
        app().render();
      },
      up(p) {
        if (!this.stroke) return;
        const changed = this.stroke.end();
        this.lastPoint = { x: p.x, y: p.y, pressure: 1 };
        this.lastLayer = this.stroke.layer.id;
        this.stroke = null;
        if (changed) app().commit(this.historyName || this.name, this.icon);
        if (this.afterStroke) this.afterStroke();
      },
      cancel() {
        if (this.stroke) this.stroke.cancel();
        this.stroke = null;
        app().render();
      },
      ...def,
    });
  }

  paintTool({
    id: 'brush', group: 'brush', name: 'Pinsel-Werkzeug', historyName: 'Pinsel', key: 'B', icon: 'brush', altEyedropper: true,
    options: { size: 24, hardness: 70, opacity: 100, flow: 100, pressure: true },
    bar: BRUSH_BAR,
    engineOptions(layer) {
      const o = this.options;
      return { size: o.size, hardness: o.hardness / 100, opacity: o.opacity / 100, flow: o.flow / 100, color: targetColor(layer, app().fg), pressureSize: o.pressure };
    },
  });

  paintTool({
    id: 'pencil', group: 'brush', name: 'Buntstift-Werkzeug', historyName: 'Buntstift', key: 'B', icon: 'pencil', altEyedropper: true,
    options: { size: 1, opacity: 100 },
    bar: [{ type: 'brush', noHardness: true }, { type: 'sep' }, { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' }],
    engineOptions(layer) {
      const o = this.options;
      return { size: o.size, hardness: 1, opacity: o.opacity / 100, flow: 1, color: targetColor(layer, app().fg), pencil: true, spacing: 0.25 };
    },
  });

  paintTool({
    id: 'eraser', group: 'eraser', name: 'Radiergummi-Werkzeug', historyName: 'Radiergummi', key: 'E', icon: 'eraser',
    options: { size: 40, hardness: 60, opacity: 100, flow: 100, mode: 'brush', pressure: true },
    bar: [
      { type: 'brush' },
      { type: 'select', key: 'mode', label: 'Modus', options: [['brush', 'Pinsel'], ['pencil', 'Buntstift']] },
      { type: 'sep' },
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
      { type: 'range', key: 'flow', label: 'Fluss', min: 1, max: 100, unit: '%' },
      { type: 'check', key: 'pressure', label: 'Stiftdruck steuert Größe', icon: 'pen' },
    ],
    engineOptions(layer) {
      const o = this.options, pencil = o.mode === 'pencil';
      const base = { size: o.size, hardness: pencil ? 1 : o.hardness / 100, opacity: o.opacity / 100, flow: o.flow / 100, pencil, pressureSize: o.pressure };
      // On a mask the eraser paints the background colour, like Photoshop.
      if (layer.targetIsMask) return { ...base, color: targetColor(layer, app().bg) };
      return { ...base, mode: 'erase' };
    },
  });

  // ─── Clone stamp ───
  paintTool({
    id: 'clone', group: 'clone', name: 'Kopierstempel-Werkzeug', historyName: 'Kopierstempel', key: 'S', icon: 'stamp',
    options: { size: 40, hardness: 50, opacity: 100, flow: 100, aligned: true, sampleAll: false, pressure: false },
    bar: [
      { type: 'brush' },
      { type: 'sep' },
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
      { type: 'range', key: 'flow', label: 'Fluss', min: 1, max: 100, unit: '%' },
      { type: 'check', key: 'aligned', label: 'Ausger.' },
      { type: 'check', key: 'sampleAll', label: 'Alle Ebenen aufnehmen' },
      { type: 'hint', text: 'Alt + Klick legt die Quelle fest' },
    ],
    hint: 'Alt-Klick: Aufnahmebereich festlegen, dann malen',
    down(p) {
      const a = app();
      if (p.alt) {
        this.source = { x: p.x, y: p.y };
        this.offset = null;
        a.toast('Aufnahmebereich festgelegt');
        a.render();
        return;
      }
      if (!this.source) {
        a.toast('Halten Sie Alt gedrückt und klicken Sie, um einen Aufnahmebereich festzulegen.');
        return;
      }
      const layer = a.paintLayer();
      if (!layer) return;
      if (!this.offset || !this.options.aligned) this.offset = { x: this.source.x - p.x, y: this.source.y - p.y };
      const o = this.options;
      const src = o.sampleAll ? a.doc.flattened() : cloneCanvas(layer.target);
      this.stroke = new StrokeEngine(layer, {
        size: o.size, hardness: o.hardness / 100, opacity: o.opacity / 100, flow: o.flow / 100, pressureSize: o.pressure,
        mode: 'clone', clone: { canvas: src, dx: this.offset.x, dy: this.offset.y },
      });
      this.stroke.begin(p);
      a.render();
    },
    overlayExtra(g, view) {
      const h = view.hover;
      let pt = null;
      if (this.source && h) pt = this.offset ? { x: h.x + this.offset.x, y: h.y + this.offset.y } : this.source;
      if (!pt) return;
      const s = view.ds(pt.x, pt.y);
      g.strokeStyle = '#000';
      g.lineWidth = 3;
      cross(g, s.x, s.y, 7);
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      cross(g, s.x, s.y, 7);
    },
  });

  // ─── Retouch tools work directly on pixel data ───
  const RANGE_W = {
    shadows: l => (1 - l) ** 2,
    midtones: l => 1 - (2 * l - 1) ** 2,
    highlights: l => l * l,
  };

  class RetouchStroke {
    constructor(layer, o) {
      this.layer = layer;
      this.target = layer.target;
      this.g = this.target.getContext('2d');
      this.W = this.target.width;
      this.H = this.target.height;
      this.o = o;
      const sel = PW.app.doc.selection;
      this.selA = sel.empty ? null : sel.alpha();
      this.total = null;
      this.patch = null;
    }

    begin(p) {
      this.last = p;
      this.carry = 0;
      this.apply([p], true);
    }

    to(p) {
      const a = this.last, d = dist(a, p), step = Math.max(1, this.o.size * 0.18), pts = [];
      let s = step - this.carry;
      while (s <= d) {
        const t = s / d;
        pts.push({ x: lerp(a.x, p.x, t), y: lerp(a.y, p.y, t) });
        s += step;
      }
      this.carry = d - (s - step);
      this.last = p;
      this.apply(pts, false);
    }

    apply(pts, first) {
      if (!pts.length) return;
      const r = this.o.size / 2 + 2;
      let box = null;
      for (const p of pts) box = rectUnion(box, { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r });
      box = clipRect(box, this.W, this.H);
      if (!box) return;
      const img = this.g.getImageData(box.x, box.y, box.w, box.h);
      for (const p of pts) this.dab(img, box, p, first);
      this.g.putImageData(img, box.x, box.y);
      this.layer.markTarget(box);
      this.total = rectUnion(this.total, box);
    }

    dab(img, box, pt, first) {
      const o = this.o, r = o.size / 2, hard = o.hardness, d = img.data, iw = img.width, ih = img.height;
      const x0 = Math.max(0, Math.floor(pt.x - r - box.x)), x1 = Math.min(iw - 1, Math.ceil(pt.x + r - box.x));
      const y0 = Math.max(0, Math.floor(pt.y - r - box.y)), y1 = Math.min(ih - 1, Math.ceil(pt.y + r - box.y));
      if (x1 < x0 || y1 < y0) return;
      const kind = o.kind;
      // Blur and sharpen read neighbours from an untouched copy of the dab area.
      let src = null, sw = 0, sh = 0, sx0 = 0, sy0 = 0;
      if (kind === 'blur' || kind === 'sharpen') {
        sx0 = Math.max(0, x0 - 1);
        sy0 = Math.max(0, y0 - 1);
        const sx1 = Math.min(iw - 1, x1 + 1), sy1 = Math.min(ih - 1, y1 + 1);
        sw = sx1 - sx0 + 1;
        sh = sy1 - sy0 + 1;
        src = new Uint8ClampedArray(sw * sh * 4);
        for (let y = sy0; y <= sy1; y++) src.set(d.subarray((y * iw + sx0) * 4, (y * iw + sx1 + 1) * 4), (y - sy0) * sw * 4);
      }
      const P = Math.ceil(o.size) + 3, half = P >> 1;
      if (kind === 'smudge' && (first || !this.patch)) {
        this.patch = new Float32Array(P * P * 4).fill(-1);
      }
      const cxi = Math.floor(pt.x), cyi = Math.floor(pt.y);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const gx = x + box.x, gy = y + box.y;
          const dd = Math.hypot(gx + 0.5 - pt.x, gy + 0.5 - pt.y);
          if (dd > r) continue;
          let f = dd <= r * hard ? 1 : 1 - (dd - r * hard) / (r - r * hard + 1e-6);
          f = f * f * (3 - 2 * f);
          let w = f * o.strength;
          if (this.selA) w *= this.selA[gy * this.W + gx] / 255;
          if (w <= 0.001) continue;
          const j = (y * iw + x) * 4;
          if (kind === 'blur' || kind === 'sharpen') {
            for (let c = 0; c < 3; c++) {
              let s = 0, n = 0;
              for (let ky = -1; ky <= 1; ky++) {
                const yy = y + ky - sy0;
                if (yy < 0 || yy >= sh) continue;
                for (let kx = -1; kx <= 1; kx++) {
                  const xx = x + kx - sx0;
                  if (xx < 0 || xx >= sw) continue;
                  s += src[(yy * sw + xx) * 4 + c];
                  n++;
                }
              }
              const avg = s / n;
              d[j + c] = kind === 'blur' ? d[j + c] + (avg - d[j + c]) * w * 0.6 : d[j + c] + (d[j + c] - avg) * w * 0.35;
            }
          } else if (kind === 'smudge') {
            const px = gx - cxi + half, py = gy - cyi + half;
            if (px < 0 || py < 0 || px >= P || py >= P) continue;
            const k = (py * P + px) * 4;
            for (let c = 0; c < 4; c++) {
              const cur = d[j + c];
              if (this.patch[k + c] < 0) {
                this.patch[k + c] = cur;
                continue;
              }
              const out = first ? cur : cur + (this.patch[k + c] - cur) * w;
              d[j + c] = out;
              this.patch[k + c] = out;
            }
          } else {
            const l = luma(d[j], d[j + 1], d[j + 2]) / 255;
            const k = w * RANGE_W[o.range](l) * 0.14;
            for (let c = 0; c < 3; c++) {
              d[j + c] = kind === 'dodge' ? d[j + c] + (255 - d[j + c]) * k : d[j + c] * (1 - k);
            }
          }
        }
      }
    }
  }

  function retouchTool(def) {
    return PW.tools.register({
      brushCursor: true,
      cursorSize() { return this.options.size; },
      drawOverlay(g, view) { drawBrushCursor(g, view, this.options.size); },
      down(p) {
        const layer = app().paintLayer();
        if (!layer) return;
        const o = this.options;
        this.stroke = new RetouchStroke(layer, {
          kind: this.kind, size: o.size, hardness: o.hardness / 100,
          strength: (o.strength ?? o.exposure) / 100, range: o.range,
        });
        this.stroke.begin(p);
        app().render();
      },
      move(p) {
        if (!this.stroke) return;
        this.stroke.to(p);
        app().render();
      },
      up() {
        if (!this.stroke) return;
        const changed = this.stroke.total;
        this.stroke = null;
        if (changed) app().commit(this.historyName, this.icon);
      },
      cancel() { this.stroke = null; },
      ...def,
    });
  }

  const STRENGTH_BAR = [{ type: 'brush' }, { type: 'sep' }, { type: 'range', key: 'strength', label: 'Stärke', min: 1, max: 100, unit: '%' }];
  const TONE_BAR = [
    { type: 'brush' },
    { type: 'sep' },
    { type: 'select', key: 'range', label: 'Bereich', options: [['shadows', 'Tiefen'], ['midtones', 'Mitteltöne'], ['highlights', 'Lichter']] },
    { type: 'range', key: 'exposure', label: 'Belichtung', min: 1, max: 100, unit: '%' },
  ];

  retouchTool({ id: 'blur', group: 'blur', kind: 'blur', name: 'Weichzeichner-Werkzeug', historyName: 'Weichzeichner', key: 'R', icon: 'drop', options: { size: 40, hardness: 0, strength: 60 }, bar: STRENGTH_BAR });
  retouchTool({ id: 'sharpen', group: 'blur', kind: 'sharpen', name: 'Scharfzeichner-Werkzeug', historyName: 'Scharfzeichner', key: 'R', icon: 'sharpen', options: { size: 40, hardness: 0, strength: 50 }, bar: STRENGTH_BAR });
  retouchTool({ id: 'smudge', group: 'blur', kind: 'smudge', name: 'Wischfinger-Werkzeug', historyName: 'Wischfinger', key: 'R', icon: 'finger', options: { size: 30, hardness: 30, strength: 60 }, bar: STRENGTH_BAR });
  retouchTool({ id: 'dodge', group: 'dodge', kind: 'dodge', name: 'Abwedler-Werkzeug', historyName: 'Abwedler', key: 'O', icon: 'dodge', options: { size: 60, hardness: 0, exposure: 50, range: 'midtones' }, bar: TONE_BAR });
  retouchTool({ id: 'burn', group: 'dodge', kind: 'burn', name: 'Nachbelichter-Werkzeug', historyName: 'Nachbelichter', key: 'O', icon: 'burn', options: { size: 60, hardness: 0, exposure: 50, range: 'midtones' }, bar: TONE_BAR });

  PW.paint = { StrokeEngine, makeDab, drawBrushCursor, cross, targetColor };
})(window.PW);
