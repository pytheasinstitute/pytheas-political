// ─── Move, hand, zoom and eyedropper tools ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas } = PW.util;
  const app = () => PW.app;

  // Topmost visible layer with a non-transparent pixel under p.
  function layerAt(doc, p) {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const L = doc.layers[i];
      if (!L.visible || L.opacity <= 0) continue;
      if (L.ctx.getImageData(x, y, 1, 1).data[3] > 8) return L;
    }
    return null;
  }

  // ─── Move ───
  PW.tools.register({
    id: 'move', group: 'move', name: 'Verschieben-Werkzeug', key: 'V', icon: 'move', cursor: 'move',
    options: { autoSelect: false },
    bar: [
      { type: 'check', key: 'autoSelect', label: 'Automatisch auswählen: Ebene' },
      { type: 'sep' },
      { type: 'action', label: 'Transformieren', icon: 'transform', action: 'edit.transform', title: 'Frei transformieren (Strg+T)' },
      { type: 'hint', text: 'Pfeiltasten verschieben um 1 Px, mit Umschalt um 10 Px · Alt dupliziert' },
    ],
    down(p) {
      const a = app(), doc = a.doc;
      if (this.options.autoSelect || p.mod) {
        const hit = layerAt(doc, p);
        if (hit) doc.setActive(hit.id);
      }
      const L = doc.active;
      if (!L) return;
      if (L.locked) return a.toast('Die Ebene ist gesperrt.');
      if (!L.visible) return a.toast('Die Ebene ist ausgeblendet.');
      this.begin(L, p.alt);
      this.start = p;
    },
    begin(L, duplicate) {
      const doc = app().doc, sel = doc.selection;
      this.L = L;
      this.dx = this.dy = 0;
      if (L.isText && !L.targetIsMask) {
        this.mode = 'text';
        this.orig = { x: L.text.x, y: L.text.y };
        return;
      }
      const target = L.target, W = target.width, H = target.height;
      this.base = cloneCanvas(target);
      if (!sel.empty) {
        this.mode = 'float';
        this.float = createCanvas(W, H);
        const fg = this.float.getContext('2d');
        fg.drawImage(target, 0, 0);
        fg.globalCompositeOperation = 'destination-in';
        fg.drawImage(sel.mask, 0, 0);
        if (!duplicate) {
          const bg = this.base.getContext('2d');
          bg.globalCompositeOperation = 'destination-out';
          bg.drawImage(sel.mask, 0, 0);
          if (L.targetIsMask) {
            bg.globalCompositeOperation = 'destination-over';
            bg.fillStyle = '#000';
            bg.fillRect(0, 0, W, H);
          }
        }
      } else {
        this.mode = 'layer';
      }
    },
    apply() {
      const L = this.L;
      if (this.mode === 'text') {
        L.text.x = this.orig.x + this.dx;
        L.text.y = this.orig.y + this.dy;
        L.renderText();
        return;
      }
      const g = L.target.getContext('2d'), W = L.target.width, H = L.target.height;
      g.save();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      if (L.targetIsMask) {
        g.fillStyle = this.mode === 'layer' ? '#fff' : '#000';
        g.fillRect(0, 0, W, H);
      } else {
        g.clearRect(0, 0, W, H);
      }
      if (this.mode === 'float') {
        g.drawImage(this.base, 0, 0);
        g.drawImage(this.float, this.dx, this.dy);
      } else {
        g.drawImage(this.base, this.dx, this.dy);
      }
      g.restore();
      L.markTarget();
    },
    move(p) {
      if (!this.L || !this.start) return;
      let dx = Math.round(p.x - this.start.x), dy = Math.round(p.y - this.start.y);
      if (p.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (dx === this.dx && dy === this.dy) return;
      this.dx = dx;
      this.dy = dy;
      this.apply();
      app().render();
    },
    up() {
      if (!this.L) return;
      this.finish();
    },
    finish() {
      const moved = this.dx || this.dy;
      if (moved && this.mode === 'float') app().doc.selection.offset(this.dx, this.dy);
      this.L = null;
      this.start = null;
      this.base = this.float = null;
      if (moved) app().commit('Verschieben', 'move');
    },
    cancel() {
      if (!this.L) return;
      this.dx = this.dy = 0;
      this.apply();
      this.L = null;
      this.start = null;
      app().render();
    },
    nudge(dx, dy) {
      const a = app(), L = a.doc && a.doc.active;
      if (!L) return;
      if (L.locked) return a.toast('Die Ebene ist gesperrt.');
      this.begin(L, false);
      this.dx = dx;
      this.dy = dy;
      this.apply();
      this.finish();
    },
    onKey(e) {
      const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = map[e.key];
      if (!d || e.ctrlKey || e.metaKey) return false;
      const k = e.shiftKey ? 10 : 1;
      this.nudge(d[0] * k, d[1] * k);
      return true;
    },
  });

  // ─── Hand ───
  PW.tools.register({
    id: 'hand', group: 'hand', name: 'Hand-Werkzeug', key: 'H', icon: 'hand', cursor: 'grab',
    bar: [
      { type: 'action', label: '100 %', action: 'view.actual' },
      { type: 'action', label: 'Ganzes Bild', action: 'view.fit' },
      { type: 'hint', text: 'Tipp: Leertaste gedrückt halten, um mit jedem Werkzeug zu verschieben' },
    ],
    down(p) {
      this.last = { x: p.clientX, y: p.clientY };
      app().view.el.classList.add('panning');
    },
    move(p) {
      if (!this.last) return;
      app().view.panBy(p.clientX - this.last.x, p.clientY - this.last.y);
      this.last = { x: p.clientX, y: p.clientY };
    },
    up() {
      this.last = null;
      app().view.el.classList.remove('panning');
    },
  });

  // ─── Zoom: click to zoom, Alt-click out, drag horizontally to scrub ───
  PW.tools.register({
    id: 'zoom', group: 'zoom', name: 'Zoom-Werkzeug', key: 'Z', icon: 'zoom',
    cursor() { return this.options.out ? 'zoom-out' : 'zoom-in'; },
    options: { out: false },
    bar: [
      { type: 'buttons', key: 'out', options: [[false, 'zoom-in', 'Einzoomen'], [true, 'zoom-out', 'Auszoomen (Alt)']] },
      { type: 'sep' },
      { type: 'action', label: '100 %', action: 'view.actual' },
      { type: 'action', label: 'Ganzes Bild', action: 'view.fit' },
      { type: 'hint', text: 'Ziehen nach rechts/links zoomt stufenlos' },
    ],
    down(p) {
      const r = app().view.canvas.getBoundingClientRect();
      this.start = { x: p.clientX, sx: p.clientX - r.left, sy: p.clientY - r.top, zoom: app().view.zoom, alt: p.alt };
      this.scrubbed = false;
    },
    move(p) {
      if (!this.start) return;
      const dx = p.clientX - this.start.x;
      if (Math.abs(dx) > 3) this.scrubbed = true;
      if (this.scrubbed) app().view.setZoom(this.start.zoom * Math.exp(dx * 0.01), this.start.sx, this.start.sy);
    },
    up() {
      if (!this.start) return;
      if (!this.scrubbed) app().view.zoomStep(this.options.out !== this.start.alt ? -1 : 1, this.start.sx, this.start.sy);
      this.start = null;
    },
  });

  // ─── Eyedropper ───
  PW.tools.register({
    id: 'eyedropper', group: 'eyedropper', name: 'Pipette-Werkzeug', key: 'I', icon: 'eyedropper', cursor: 'crosshair',
    options: { size: 1, sampleAll: true },
    bar: [
      { type: 'select', key: 'size', label: 'Aufnahmebereich', options: [[1, '1 Pixel'], [3, '3 × 3 Pixel Durchschnitt'], [5, '5 × 5 Pixel Durchschnitt'], [11, '11 × 11 Pixel Durchschnitt']] },
      { type: 'select', key: 'sampleAll', label: 'Aufnehmen', options: [[true, 'Alle Ebenen'], [false, 'Aktuelle Ebene']] },
      { type: 'hint', text: 'Alt-Klick setzt die Hintergrundfarbe' },
    ],
    down(p) {
      this.prev = p.alt ? app().bg : app().fg;
      this.alt = p.alt;
      this.pick(p);
    },
    move(p) {
      if (this.prev !== undefined && this.prev !== null) this.pick(p);
    },
    up() {
      this.prev = null;
      app().render();
    },
    pick(p) {
      const c = app().sampleColor(p.x, p.y, Number(this.options.size), this.options.sampleAll);
      if (!c) return;
      this.picked = c;
      if (this.alt) app().setBG(c);
      else app().setFG(c);
    },
    drawOverlay(g, view) {
      const h = view.hover;
      if (!h || this.prev == null || !this.picked) return;
      const s = view.ds(h.x, h.y);
      g.lineWidth = 14;
      g.beginPath();
      g.arc(s.x, s.y, 34, Math.PI, 0);
      g.strokeStyle = this.picked;
      g.stroke();
      g.beginPath();
      g.arc(s.x, s.y, 34, 0, Math.PI);
      g.strokeStyle = this.prev;
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(128,128,128,0.9)';
      g.beginPath();
      g.arc(s.x, s.y, 41, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(s.x, s.y, 27, 0, Math.PI * 2);
      g.stroke();
    },
  });

  PW.layerAt = layerAt;
})(window.PW);
