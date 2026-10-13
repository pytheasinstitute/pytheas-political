// ─── Shape tools: rectangle, ellipse, polygon, line (each drawn onto a new layer) ───
'use strict';

(function (PW) {
  const app = () => PW.app;

  function buildPath(g, kind, r, o) {
    g.beginPath();
    if (kind === 'rect') {
      const rad = Math.min(o.radius || 0, r.w / 2, r.h / 2);
      if (rad > 0 && g.roundRect) g.roundRect(r.x, r.y, r.w, r.h, rad);
      else g.rect(r.x, r.y, r.w, r.h);
    } else if (kind === 'ellipse') {
      g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
    } else if (kind === 'polygon') {
      const n = Math.max(3, o.sides | 0), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const star = o.star, pts = star ? n * 2 : n;
      for (let i = 0; i < pts; i++) {
        const a = -Math.PI / 2 + (i / pts) * Math.PI * 2;
        const k = star && i % 2 ? 0.45 : 1;
        const x = cx + Math.cos(a) * (r.w / 2) * k, y = cy + Math.sin(a) * (r.h / 2) * k;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    }
  }

  function drawShape(g, kind, s, e, o, fg) {
    if (kind === 'line') {
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(e.x, e.y);
      g.lineCap = 'round';
      g.lineWidth = o.weight;
      g.strokeStyle = fg;
      g.stroke();
      if (o.arrow) {
        const a = Math.atan2(e.y - s.y, e.x - s.x), L = o.weight * 4 + 6;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x - Math.cos(a - 0.45) * L, e.y - Math.sin(a - 0.45) * L);
        g.lineTo(e.x - Math.cos(a + 0.45) * L, e.y - Math.sin(a + 0.45) * L);
        g.closePath();
        g.fillStyle = fg;
        g.fill();
      }
      return;
    }
    const r = { x: Math.min(s.x, e.x), y: Math.min(s.y, e.y), w: Math.abs(e.x - s.x), h: Math.abs(e.y - s.y) };
    buildPath(g, kind, r, o);
    if (o.fill) {
      g.fillStyle = fg;
      g.fill();
    }
    if (o.stroke && o.strokeWidth > 0) {
      g.lineWidth = o.strokeWidth;
      g.lineJoin = 'round';
      g.strokeStyle = o.strokeColor;
      g.stroke();
    }
  }

  const FILL_STROKE = [
    { type: 'check', key: 'fill', label: 'Fläche (Vordergrundfarbe)' },
    { type: 'check', key: 'stroke', label: 'Kontur' },
    { type: 'color', key: 'strokeColor', title: 'Konturfarbe' },
    { type: 'number', key: 'strokeWidth', label: '', min: 0, max: 500, unit: 'Px', title: 'Konturstärke' },
  ];

  function shapeTool(def) {
    return PW.tools.register({
      cursor: 'crosshair',
      altEyedropper: false,
      down(p) {
        this.start = { x: p.x, y: p.y };
        this.end = { x: p.x, y: p.y };
        this.mods = p;
      },
      move(p) {
        if (!this.start) return;
        this.end = { x: p.x, y: p.y };
        this.mods = p;
        app().render();
      },
      // Shift constrains (square / circle / 45°), Alt draws from the centre.
      points() {
        let s = this.start, e = { ...this.end };
        const dx = e.x - s.x, dy = e.y - s.y;
        if (this.kind === 'line') {
          if (this.mods.shift) {
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
            e = { x: s.x + Math.cos(a) * l, y: s.y + Math.sin(a) * l };
          }
          return [s, e];
        }
        if (this.mods.shift) {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          e = { x: s.x + Math.sign(dx || 1) * m, y: s.y + Math.sign(dy || 1) * m };
        }
        if (this.mods.alt) s = { x: 2 * s.x - e.x, y: 2 * s.y - e.y };
        return [s, e];
      },
      up() {
        if (!this.start) return;
        const [s, e] = this.points();
        this.start = null;
        if (Math.hypot(e.x - s.x, e.y - s.y) < 2) return app().render();
        const a = app(), doc = a.doc;
        const L = doc.createLayer(doc.nextLayerName(this.layerName));
        drawShape(L.ctx, this.kind, s, e, this.options, a.fg);
        L.touch();
        doc.addLayer(L);
        a.commit(this.historyName, 'shape');
      },
      cancel() {
        this.start = null;
        app().render();
      },
      drawOverlay(g, view) {
        if (!this.start) return;
        const [s, e] = this.points(), d = view.dpr;
        g.save();
        g.setTransform(d * view.zoom, 0, 0, d * view.zoom, d * view.x, d * view.y);
        g.globalAlpha = 0.85;
        drawShape(g, this.kind, s, e, this.options, app().fg);
        g.restore();
      },
      ...def,
    });
  }

  shapeTool({
    id: 'shapeRect', group: 'shape', kind: 'rect', name: 'Rechteck-Werkzeug', layerName: 'Rechteck', historyName: 'Rechteck', key: 'U', icon: 'shape-rect',
    options: { fill: true, stroke: false, strokeColor: '#000000', strokeWidth: 4, radius: 0 },
    bar: [...FILL_STROKE, { type: 'sep' }, { type: 'number', key: 'radius', label: 'Radius', min: 0, max: 2000, unit: 'Px' }],
  });
  shapeTool({
    id: 'shapeEllipse', group: 'shape', kind: 'ellipse', name: 'Ellipse-Werkzeug', layerName: 'Ellipse', historyName: 'Ellipse', key: 'U', icon: 'shape-ellipse',
    options: { fill: true, stroke: false, strokeColor: '#000000', strokeWidth: 4 },
    bar: FILL_STROKE,
  });
  shapeTool({
    id: 'shapePolygon', group: 'shape', kind: 'polygon', name: 'Polygon-Werkzeug', layerName: 'Polygon', historyName: 'Polygon', key: 'U', icon: 'shape-polygon',
    options: { fill: true, stroke: false, strokeColor: '#000000', strokeWidth: 4, sides: 5, star: false },
    bar: [...FILL_STROKE, { type: 'sep' }, { type: 'number', key: 'sides', label: 'Seiten', min: 3, max: 64 }, { type: 'check', key: 'star', label: 'Stern' }],
  });
  shapeTool({
    id: 'shapeLine', group: 'shape', kind: 'line', name: 'Linienzeichner-Werkzeug', layerName: 'Linie', historyName: 'Linie', key: 'U', icon: 'shape-line',
    options: { weight: 4, arrow: false },
    bar: [{ type: 'number', key: 'weight', label: 'Stärke', min: 1, max: 500, unit: 'Px' }, { type: 'check', key: 'arrow', label: 'Pfeilspitze' }],
  });
})(window.PW);
