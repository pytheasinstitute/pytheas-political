// ─── View: zoom, pan and drawing of the active document plus tool overlays ───
'use strict';

(function (PW) {
  const { clamp, el, checker } = PW.util;

  const ZOOM_STEPS = [0.01, 0.02, 0.03, 0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 48, 64];

  class View {
    constructor(container) {
      this.el = container;
      this.canvas = el('canvas', { class: 'view-canvas', tabindex: '0', 'aria-label': 'Arbeitsfläche' });
      container.prepend(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.doc = null;
      this.zoom = 1;
      this.x = 0;
      this.y = 0;
      this.dpr = window.devicePixelRatio || 1;
      this.cw = 0;
      this.ch = 0;
      this.hover = null;
      this.antsOffset = 0;
      this.showExtras = true;
      this.pixelGrid = true;
      this._raf = 0;
      this._pointers = new Map();
      this._pinch = null;
      this._pan = null;
      this.readTheme();

      new ResizeObserver(() => this.resize()).observe(container);
      this.resize();
      // Size changes (crop, rotate, undo of either) re-fit the document.
      PW.bus.on('doc:resized', d => {
        if (d === this.doc) this.fit(false);
      });
      this._bindPointer();
      setInterval(() => {
        const s = this.doc && this.doc.selection;
        if (s && !s.empty && this.showExtras && s.segments < 60000) {
          this.antsOffset = (this.antsOffset + 1) % 8;
          this.requestRender();
        }
      }, 110);
    }

    readTheme() {
      const cs = getComputedStyle(document.documentElement);
      this.bg = cs.getPropertyValue('--ws').trim() || '#1f1f22';
      this.accent = cs.getPropertyValue('--accent').trim() || '#3b8cf0';
      this.requestRender();
    }

    resize() {
      const r = this.el.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      const first = !this.cw;
      const oldW = this.cw, oldH = this.ch;
      this.cw = Math.max(1, r.width);
      this.ch = Math.max(1, r.height);
      this.canvas.width = Math.round(this.cw * this.dpr);
      this.canvas.height = Math.round(this.ch * this.dpr);
      this.canvas.style.width = this.cw + 'px';
      this.canvas.style.height = this.ch + 'px';
      if (this.doc && !first) {
        this.x += (this.cw - oldW) / 2;
        this.y += (this.ch - oldH) / 2;
        this.constrain();
      }
      this.render();
    }

    setDoc(doc) {
      if (this.doc) this.doc.view = { zoom: this.zoom, x: this.x, y: this.y };
      this.doc = doc;
      if (doc && doc.view) Object.assign(this, doc.view);
      else if (doc) this.fit(false);
      this.emitZoom();
      this.requestRender();
    }

    // ─── Zoom & pan ───
    fit(allowUpscale = true) {
      if (!this.doc) return;
      const pad = this.cw < 600 ? 16 : 40;
      let z = Math.min((this.cw - pad * 2) / this.doc.width, (this.ch - pad * 2) / this.doc.height);
      if (!allowUpscale) z = Math.min(1, z);
      this.zoom = clamp(z, 0.01, 64);
      this.center();
    }

    center() {
      this.x = Math.round((this.cw - this.doc.width * this.zoom) / 2);
      this.y = Math.round((this.ch - this.doc.height * this.zoom) / 2);
      this.emitZoom();
      this.requestRender();
    }

    actual() {
      this.setZoom(1, this.cw / 2, this.ch / 2);
    }

    setZoom(z, sx = this.cw / 2, sy = this.ch / 2) {
      if (!this.doc) return;
      z = clamp(z, 0.01, 64);
      const dx = (sx - this.x) / this.zoom, dy = (sy - this.y) / this.zoom;
      this.zoom = z;
      this.x = sx - dx * z;
      this.y = sy - dy * z;
      this.constrain();
      this.emitZoom();
      this.requestRender();
    }

    zoomStep(dir, sx, sy) {
      const z = this.zoom;
      const next = dir > 0 ? ZOOM_STEPS.find(s => s > z * 1.001) : [...ZOOM_STEPS].reverse().find(s => s < z * 0.999);
      if (next) this.setZoom(next, sx, sy);
    }

    panBy(dx, dy) {
      this.x += dx;
      this.y += dy;
      this.constrain();
      this.requestRender();
      PW.bus.emit('view:changed');
    }

    // Keep the document reachable: centred when it fits, otherwise never lost off-screen.
    constrain() {
      if (!this.doc) return;
      const sw = this.doc.width * this.zoom, sh = this.doc.height * this.zoom;
      const mx = Math.min(240, this.cw * 0.4), my = Math.min(240, this.ch * 0.4);
      if (sw <= this.cw - 2 * 16) this.x = clamp(this.x, Math.min(16, (this.cw - sw) / 2), Math.max(this.cw - sw - 16, (this.cw - sw) / 2));
      else this.x = clamp(this.x, this.cw - sw - mx, mx);
      if (sh <= this.ch - 2 * 16) this.y = clamp(this.y, Math.min(16, (this.ch - sh) / 2), Math.max(this.ch - sh - 16, (this.ch - sh) / 2));
      else this.y = clamp(this.y, this.ch - sh - my, my);
    }

    emitZoom() {
      PW.bus.emit('view:zoom', this.zoom);
    }

    // ─── Coordinates ───
    toDoc(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (clientX - r.left - this.x) / this.zoom, y: (clientY - r.top - this.y) / this.zoom };
    }

    ds(x, y) {
      return { x: this.x + x * this.zoom, y: this.y + y * this.zoom };
    }

    // ─── Rendering ───
    requestRender() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.render();
      });
    }

    render() {
      const g = this.ctx, dpr = this.dpr;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = this.bg;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const doc = this.doc;
      if (!doc) return;
      const z = this.zoom, sw = doc.width * z, sh = doc.height * z;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(this.x + 2, this.y + 3, sw, sh);
      g.fillStyle = checker(g);
      g.fillRect(this.x, this.y, sw, sh);

      g.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.x, dpr * this.y);
      g.imageSmoothingEnabled = z < 1;
      g.imageSmoothingQuality = 'high';
      g.drawImage(doc.composite(), 0, 0);
      g.imageSmoothingEnabled = true;

      const tool = PW.app && PW.app.activeTool();

      if (this.pixelGrid && this.showExtras && z >= 8) this.drawPixelGrid(g);

      // Selection outline (marching ants)
      const sel = doc.selection;
      if (!sel.empty && this.showExtras && !(tool && tool.hideAnts)) {
        const path = sel.outline();
        g.setTransform(dpr * z, 0, 0, dpr * z, dpr * this.x, dpr * this.y);
        g.lineWidth = 1 / z;
        g.setLineDash([]);
        g.strokeStyle = '#ffffff';
        g.stroke(path);
        g.setLineDash([4 / z, 4 / z]);
        g.lineDashOffset = -this.antsOffset / z;
        g.strokeStyle = '#000000';
        g.stroke(path);
        g.setLineDash([]);
      }

      // Tool overlays in screen space (constant line widths)
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (tool && tool.drawOverlay) {
        g.save();
        tool.drawOverlay(g, this);
        g.restore();
      }
    }

    drawPixelGrid(g) {
      const z = this.zoom, dpr = this.dpr, doc = this.doc;
      const x0 = Math.max(0, Math.floor(-this.x / z)), y0 = Math.max(0, Math.floor(-this.y / z));
      const x1 = Math.min(doc.width, Math.ceil((this.cw - this.x) / z)), y1 = Math.min(doc.height, Math.ceil((this.ch - this.y) / z));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.beginPath();
      for (let x = x0; x <= x1; x++) {
        const sx = Math.round(this.x + x * z) + 0.5;
        g.moveTo(sx, this.y + y0 * z);
        g.lineTo(sx, this.y + y1 * z);
      }
      for (let y = y0; y <= y1; y++) {
        const sy = Math.round(this.y + y * z) + 0.5;
        g.moveTo(this.x + x0 * z, sy);
        g.lineTo(this.x + x1 * z, sy);
      }
      g.strokeStyle = 'rgba(140,140,140,0.35)';
      g.lineWidth = 1;
      g.stroke();
    }

    // ─── Input ───
    _point(e) {
      const p = this.toDoc(e.clientX, e.clientY);
      p.pressure = e.pointerType === 'pen' ? (e.pressure || 0.5) : 1;
      p.pointerType = e.pointerType;
      p.shift = e.shiftKey;
      p.alt = e.altKey;
      p.mod = e.ctrlKey || e.metaKey;
      p.button = e.button;
      p.clientX = e.clientX;
      p.clientY = e.clientY;
      return p;
    }

    _bindPointer() {
      const c = this.canvas;
      c.addEventListener('contextmenu', e => e.preventDefault());

      c.addEventListener('pointerdown', e => {
        c.focus({ preventScroll: true });
        if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur && document.activeElement.tagName !== 'TEXTAREA') document.activeElement.blur();
        this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
        try { c.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }

        // Two fingers: pinch-zoom and pan, abandon any single-finger action.
        if (e.pointerType === 'touch' && this._pointers.size === 2) {
          PW.app.pointer('cancel', this._point(e), e);
          const [a, b] = [...this._pointers.values()];
          this._pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: this.zoom };
          return;
        }
        if (e.button === 1 || (e.button === 0 && PW.app.spaceDown)) {
          this._pan = { x: e.clientX, y: e.clientY };
          this.el.classList.add('panning');
          e.preventDefault();
          return;
        }
        if (e.button !== 0) return;
        PW.app.pointer('down', this._point(e), e);
      });

      c.addEventListener('pointermove', e => {
        if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
        if (this._pinch && this._pointers.size >= 2) {
          const [a, b] = [...this._pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          const r = c.getBoundingClientRect();
          this.panBy(cx - this._pinch.cx, cy - this._pinch.cy);
          this.setZoom(this._pinch.zoom * (d / this._pinch.d), cx - r.left, cy - r.top);
          this._pinch.cx = cx;
          this._pinch.cy = cy;
          return;
        }
        if (this._pan) {
          this.panBy(e.clientX - this._pan.x, e.clientY - this._pan.y);
          this._pan = { x: e.clientX, y: e.clientY };
          return;
        }
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const list = events.length ? events : [e];
        for (const ev of list) {
          const p = this._point(ev);
          p.shift = e.shiftKey;
          p.alt = e.altKey;
          p.mod = e.ctrlKey || e.metaKey;
          this.hover = p;
          PW.app.pointer('move', p, e);
        }
        PW.bus.emit('cursor:moved', this.hover);
        this.requestRender();
      });

      const end = e => {
        this._pointers.delete(e.pointerId);
        if (this._pinch) {
          if (this._pointers.size < 2) this._pinch = null;
          return;
        }
        if (this._pan) {
          this._pan = null;
          this.el.classList.remove('panning');
          return;
        }
        PW.app.pointer(e.type === 'pointercancel' ? 'cancel' : 'up', this._point(e), e);
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => {
        this.hover = null;
        PW.bus.emit('cursor:moved', null);
        this.requestRender();
      });

      c.addEventListener('wheel', e => {
        if (!this.doc) return;
        e.preventDefault();
        const r = c.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey || e.altKey) {
          const k = Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 50 ? 0.01 : 0.0025));
          this.setZoom(this.zoom * k, e.clientX - r.left, e.clientY - r.top);
        } else if (e.shiftKey) {
          this.panBy(-(e.deltaY || e.deltaX), 0);
        } else {
          this.panBy(-e.deltaX, -e.deltaY);
        }
      }, { passive: false });
    }
  }

  PW.View = View;
})(window.PW);
