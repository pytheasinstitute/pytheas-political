// ─── Gradient and paint bucket ───
'use strict';

(function (PW) {
  const { createCanvas, hexToRgb, luma, clamp } = PW.util;
  const app = () => PW.app;

  const PRESETS = [
    ['fgbg', 'Vordergrund → Hintergrund'],
    ['fgtrans', 'Vordergrund → Transparent'],
    ['bw', 'Schwarz → Weiß'],
    ['spectrum', 'Spektrum'],
    ['sunset', 'Abendrot'],
    ['chrome', 'Chrom'],
  ];

  // Colour stops as [offset, r, g, b, a].
  function stops(preset, fg, bg, reverse, gray) {
    const c = hex => {
      const o = hexToRgb(hex);
      if (gray) {
        const v = Math.round(luma(o.r, o.g, o.b));
        return [v, v, v];
      }
      return [o.r, o.g, o.b];
    };
    let s;
    switch (preset) {
      case 'fgtrans': s = [[0, ...c(fg), 1], [1, ...c(fg), 0]]; break;
      case 'bw': s = [[0, 0, 0, 0, 1], [1, 255, 255, 255, 1]]; break;
      case 'spectrum':
        s = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].map((h, i, a) => [i / (a.length - 1), ...c(h), 1]);
        break;
      case 'sunset': s = [[0, ...c('#2b1055'), 1], [0.45, ...c('#d53369'), 1], [0.75, ...c('#f58b54'), 1], [1, ...c('#fbd786'), 1]]; break;
      case 'chrome': s = [[0, ...c('#29323c'), 1], [0.48, ...c('#e8eef3'), 1], [0.52, ...c('#5d4632'), 1], [1, ...c('#f2e3c6'), 1]]; break;
      default: s = [[0, ...c(fg), 1], [1, ...c(bg), 1]];
    }
    if (reverse) s = s.map(([o, r, g, b, a]) => [1 - o, r, g, b, a]).reverse();
    return s;
  }

  const rgba = ([, r, g, b, a]) => `rgba(${r},${g},${b},${a})`;

  // 256-entry colour table, used for the per-pixel diamond gradient.
  function gradientLUT(st) {
    const c = createCanvas(256, 1), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 0);
    st.forEach(s => gr.addColorStop(s[0], rgba(s)));
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 1);
    return g.getImageData(0, 0, 256, 1).data;
  }

  function paintGradient(g, W, H, type, s, e, st) {
    const dx = e.x - s.x, dy = e.y - s.y, len = Math.hypot(dx, dy) || 1;
    let grad;
    if (type === 'radial') {
      grad = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, len);
      st.forEach(x => grad.addColorStop(x[0], rgba(x)));
    } else if (type === 'angle' && g.createConicGradient) {
      grad = g.createConicGradient(Math.atan2(dy, dx), s.x, s.y);
      st.forEach(x => grad.addColorStop(x[0], rgba(x)));
    } else if (type === 'reflected') {
      grad = g.createLinearGradient(s.x - dx, s.y - dy, e.x, e.y);
      st.forEach(x => {
        grad.addColorStop(0.5 - x[0] / 2, rgba(x));
        grad.addColorStop(0.5 + x[0] / 2, rgba(x));
      });
    } else if (type === 'diamond') {
      const lut = gradientLUT(st), img = g.createImageData(W, H), d = img.data;
      const ux = dx / len, uy = dy / len;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const px = x + 0.5 - s.x, py = y + 0.5 - s.y;
          const t = clamp((Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / len, 0, 1);
          const k = Math.round(t * 255) * 4, j = (y * W + x) * 4;
          d[j] = lut[k];
          d[j + 1] = lut[k + 1];
          d[j + 2] = lut[k + 2];
          d[j + 3] = lut[k + 3];
        }
      }
      g.putImageData(img, 0, 0);
      return;
    } else {
      grad = g.createLinearGradient(s.x, s.y, e.x, e.y);
      st.forEach(x => grad.addColorStop(x[0], rgba(x)));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  // Draws `src` (doc-sized) onto the active paint target through the selection.
  function compositeOnto(layer, src, opacity) {
    const target = layer.target, W = target.width, H = target.height;
    const sel = app().doc.selection;
    if (!sel.empty) {
      const g = src.getContext('2d');
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(sel.mask, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    const tg = target.getContext('2d');
    tg.save();
    tg.globalAlpha = opacity;
    tg.globalCompositeOperation = layer.lockAlpha && !layer.targetIsMask ? 'source-atop' : 'source-over';
    tg.drawImage(src, 0, 0);
    tg.restore();
    layer.markTarget({ x: 0, y: 0, w: W, h: H });
  }

  PW.tools.register({
    id: 'gradient', group: 'fill', name: 'Verlaufswerkzeug', key: 'G', icon: 'gradient', cursor: 'crosshair', altEyedropper: true,
    options: { preset: 'fgbg', type: 'linear', opacity: 100, reverse: false },
    bar: [
      { type: 'select', key: 'preset', label: 'Verlauf', options: PRESETS },
      { type: 'buttons', key: 'type', options: [
        ['linear', 'grad-linear', 'Linearer Verlauf'], ['radial', 'grad-radial', 'Radialverlauf'],
        ['angle', 'grad-angle', 'Verlaufswinkel'], ['reflected', 'grad-reflected', 'Reflektierter Verlauf'], ['diamond', 'grad-diamond', 'Rautenverlauf']] },
      { type: 'sep' },
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
      { type: 'check', key: 'reverse', label: 'Umkehren' },
    ],
    down(p) {
      if (!app().paintLayer()) return;
      this.start = { x: p.x, y: p.y };
      this.end = { x: p.x, y: p.y };
    },
    move(p) {
      if (!this.start) return;
      let e = { x: p.x, y: p.y };
      if (p.shift) {
        const dx = e.x - this.start.x, dy = e.y - this.start.y;
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
        e = { x: this.start.x + Math.cos(a) * l, y: this.start.y + Math.sin(a) * l };
      }
      this.end = e;
      app().render();
    },
    up() {
      const s = this.start, e = this.end;
      this.start = null;
      if (!s || Math.hypot(e.x - s.x, e.y - s.y) < 1) return app().render();
      const a = app(), layer = a.paintLayer();
      if (!layer) return;
      const W = layer.target.width, H = layer.target.height;
      const buf = createCanvas(W, H);
      const o = this.options;
      paintGradient(buf.getContext('2d'), W, H, o.type, s, e, stops(o.preset, a.fg, a.bg, o.reverse, layer.targetIsMask));
      compositeOnto(layer, buf, o.opacity / 100);
      a.commit('Verlauf', 'gradient');
    },
    cancel() {
      this.start = null;
      app().render();
    },
    drawOverlay(g, view) {
      if (!this.start) return;
      const a = view.ds(this.start.x, this.start.y), b = view.ds(this.end.x, this.end.y);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = '#fff';
      g.stroke();
      for (const pt of [a, b]) {
        g.fillStyle = '#fff';
        g.strokeStyle = '#000';
        g.beginPath();
        g.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    },
  });

  PW.tools.register({
    id: 'bucket', group: 'fill', name: 'Füllwerkzeug', key: 'G', icon: 'bucket', cursor: 'crosshair', altEyedropper: true,
    options: { tolerance: 32, contiguous: true, sampleAll: false, opacity: 100, antialias: true },
    bar: [
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
      { type: 'number', key: 'tolerance', label: 'Toleranz', min: 0, max: 255 },
      { type: 'check', key: 'antialias', label: 'Glätten' },
      { type: 'check', key: 'contiguous', label: 'Benachbart' },
      { type: 'check', key: 'sampleAll', label: 'Alle Ebenen' },
    ],
    down(p) {
      const a = app(), doc = a.doc, layer = a.paintLayer();
      if (!layer) return;
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
      const o = this.options, W = doc.width, H = doc.height;
      const src = o.sampleAll ? doc.flattened() : layer.target;
      const data = src.getContext('2d').getImageData(0, 0, W, H).data;
      const alpha = PW.selectionTools.floodFill(data, W, H, x, y, o.tolerance, o.contiguous);
      const color = hexToRgb(PW.paint.targetColor(layer, a.fg));
      const buf = createCanvas(W, H), bg = buf.getContext('2d');
      const img = bg.createImageData(W, H), d = img.data;
      for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
        if (!alpha[i]) continue;
        d[j] = color.r;
        d[j + 1] = color.g;
        d[j + 2] = color.b;
        d[j + 3] = alpha[i];
      }
      bg.putImageData(img, 0, 0);
      if (o.antialias) {
        // A one-pixel soft edge hides stair-stepping along the fill border.
        const soft = createCanvas(W, H), sg = soft.getContext('2d');
        sg.filter = 'blur(0.6px)';
        sg.drawImage(buf, 0, 0);
        sg.filter = 'none';
        sg.drawImage(buf, 0, 0);
        compositeOnto(layer, soft, o.opacity / 100);
      } else {
        compositeOnto(layer, buf, o.opacity / 100);
      }
      a.commit('Füllen', 'bucket');
    },
  });

  PW.gradients = { PRESETS, stops, paintGradient, compositeOnto };
})(window.PW);
