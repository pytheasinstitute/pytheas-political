// ─── Document: layer stack, compositing, geometry operations and undo history ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, scratch, uid, alphaBounds } = PW.util;
  const { Layer, Selection } = PW;

  // ─── History: copy-on-write snapshots (unchanged layers share their pixel copy) ───
  class History {
    constructor(doc, limit = 50) {
      this.doc = doc;
      this.limit = limit;
      this.states = [];
      this.index = -1;
    }

    get current() { return this.states[this.index] || null; }
    get canUndo() { return this.index > 0; }
    get canRedo() { return this.index < this.states.length - 1; }

    push(name, icon) {
      const prev = this.current ? this.current.snap : null;
      const snap = this.doc.capture(prev);
      this.states.length = this.index + 1;
      this.states.push({ name, icon, snap });
      if (this.states.length > this.limit) this.states.shift();
      this.index = this.states.length - 1;
      PW.bus.emit('history:changed', this.doc);
    }

    goto(i) {
      if (i < 0 || i >= this.states.length || i === this.index) return;
      this.index = i;
      this.doc.restore(this.states[i].snap);
      PW.bus.emit('history:changed', this.doc);
    }

    undo() { if (this.canUndo) this.goto(this.index - 1); }
    redo() { if (this.canRedo) this.goto(this.index + 1); }
  }

  // ─── Layer styles (Ebenenstile) ───
  const FX_DEFAULTS = {
    shadow: { enabled: false, color: '#000000', opacity: 0.6, angle: 120, distance: 12, size: 14, blend: 'multiply' },
    glow: { enabled: false, color: '#ffe680', opacity: 0.75, size: 24, blend: 'screen' },
    stroke: { enabled: false, color: '#000000', size: 3, opacity: 1 },
  };

  function hexA(hex, a) {
    const c = PW.util.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }

  // Draws a drop-shadow style blur of src: the source is pushed off-canvas and only its shadow lands.
  function drawShadowOnly(ctx, src, color, blur, dx, dy) {
    const off = src.width + blur * 4 + 200;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = dx + off;
    ctx.shadowOffsetY = dy;
    ctx.drawImage(src, -off, 0);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  }

  function strokeCanvas(src, fx) {
    const w = src.width, h = src.height;
    const sil = createCanvas(w, h), sg = sil.getContext('2d');
    sg.drawImage(src, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = fx.color;
    sg.fillRect(0, 0, w, h);
    const out = createCanvas(w, h), og = out.getContext('2d');
    const r = Math.max(1, fx.size);
    const rings = Math.ceil(r / 2);
    for (let k = 1; k <= rings; k++) {
      const rr = (r * k) / rings, n = Math.max(8, Math.ceil(rr * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        og.drawImage(sil, Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    og.globalCompositeOperation = 'destination-out';
    og.drawImage(src, 0, 0);
    return out;
  }

  class Doc {
    constructor(w, h, name) {
      this.id = uid('D');
      this.width = Math.round(w);
      this.height = Math.round(h);
      this.name = name || 'Unbenannt-1';
      this.layers = [];
      this.activeId = null;
      this.layerCounter = 0;
      this.selection = new Selection(this.width, this.height);
      this.history = new History(this);
      this.view = null;
      this.dirty = false;
      this.savedSelection = null;
      this.compositeCanvas = createCanvas(this.width, this.height);
      this._compSig = null;
    }

    // ─── Layer stack ───
    get active() { return this.layers.find(l => l.id === this.activeId) || null; }
    get activeIndex() { return this.layers.findIndex(l => l.id === this.activeId); }
    layerById(id) { return this.layers.find(l => l.id === id) || null; }

    setActive(id) {
      if (this.activeId === id) return;
      this.activeId = id;
      PW.bus.emit('layers:changed', this);
    }

    nextLayerName(prefix = 'Ebene') {
      return `${prefix} ${++this.layerCounter}`;
    }

    createLayer(name) {
      return new Layer(this.width, this.height, name || this.nextLayerName());
    }

    addLayer(layer, index) {
      if (index == null) index = this.activeIndex + 1;
      this.layers.splice(PW.util.clamp(index, 0, this.layers.length), 0, layer);
      this.activeId = layer.id;
      PW.bus.emit('layers:changed', this);
      return layer;
    }

    removeLayer(id) {
      const i = this.layers.findIndex(l => l.id === id);
      if (i < 0) return;
      this.layers.splice(i, 1);
      if (this.activeId === id) {
        const next = this.layers[Math.max(0, i - 1)];
        this.activeId = next ? next.id : null;
      }
      PW.bus.emit('layers:changed', this);
    }

    moveLayer(id, newIndex) {
      const i = this.layers.findIndex(l => l.id === id);
      if (i < 0) return;
      const [L] = this.layers.splice(i, 1);
      this.layers.splice(PW.util.clamp(newIndex, 0, this.layers.length), 0, L);
      PW.bus.emit('layers:changed', this);
    }

    duplicateLayer(id, name) {
      const src = this.layerById(id);
      if (!src) return null;
      const L = new Layer(this.width, this.height, name || `${src.name} Kopie`);
      L.ctx.drawImage(src.canvas, 0, 0);
      Object.assign(L, {
        visible: src.visible, opacity: src.opacity, blend: src.blend, type: src.type,
        text: src.text ? { ...src.text } : null,
        fx: src.fx ? JSON.parse(JSON.stringify(src.fx)) : null,
        maskEnabled: src.maskEnabled,
      });
      if (src.mask) {
        L.mask = cloneCanvas(src.mask);
        L.touchMask();
      }
      L.touch();
      return this.addLayer(L, this.layers.indexOf(src) + 1);
    }

    mergeDown(id) {
      const i = this.layers.findIndex(l => l.id === id);
      if (i <= 0) return false;
      const upper = this.layers[i], lower = this.layers[i - 1];
      const tmp = createCanvas(this.width, this.height), g = tmp.getContext('2d');
      const lowerProps = { opacity: lower.opacity, blend: lower.blend, fx: lower.fx, visible: lower.visible };
      Object.assign(lower, { opacity: 1, blend: 'source-over', fx: null, visible: true });
      this.drawLayers(g, [lower]);
      Object.assign(lower, lowerProps);
      if (upper.visible) this.drawLayers(g, [upper]);
      lower.ctx.clearRect(0, 0, this.width, this.height);
      lower.ctx.drawImage(tmp, 0, 0);
      lower.type = 'raster';
      lower.text = null;
      if (lower.mask) lower.removeMask();
      lower.touch();
      this.layers.splice(i, 1);
      this.activeId = lower.id;
      PW.bus.emit('layers:changed', this);
      return true;
    }

    mergeVisible() {
      const visible = this.layers.filter(l => l.visible);
      if (visible.length < 2) return false;
      const target = visible[0];
      const tmp = createCanvas(this.width, this.height);
      this.drawLayers(tmp.getContext('2d'), visible);
      target.ctx.clearRect(0, 0, this.width, this.height);
      target.ctx.drawImage(tmp, 0, 0);
      Object.assign(target, { opacity: 1, blend: 'source-over', fx: null, type: 'raster', text: null });
      if (target.mask) target.removeMask();
      target.touch();
      this.layers = this.layers.filter(l => !l.visible || l === target);
      this.activeId = target.id;
      PW.bus.emit('layers:changed', this);
      return true;
    }

    flatten() {
      const L = new Layer(this.width, this.height, 'Hintergrund');
      L.ctx.fillStyle = '#ffffff';
      L.ctx.fillRect(0, 0, this.width, this.height);
      this.drawLayers(L.ctx, this.layers);
      L.touch();
      this.layers = [L];
      this.activeId = L.id;
      PW.bus.emit('layers:changed', this);
    }

    // ─── Compositing ───
    drawLayers(ctx, layers) {
      const w = this.width, h = this.height;
      for (const L of layers) {
        if (!L.visible || L.opacity <= 0) continue;
        let src = L.canvas;
        const masked = L.mask && L.maskEnabled;
        if (L.renderOverride || masked) {
          const tmp = scratch('comp-layer', w, h), g = tmp.getContext('2d');
          if (L.renderOverride) L.renderOverride(g);
          else g.drawImage(L.canvas, 0, 0);
          if (masked) {
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(L.maskAlpha(), 0, 0);
            g.globalCompositeOperation = 'source-over';
          }
          src = tmp;
        }
        const fx = L.fx;
        if (fx) this._drawEffectsBelow(ctx, src, L);
        ctx.globalAlpha = L.opacity;
        ctx.globalCompositeOperation = L.blend;
        ctx.drawImage(src, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    _drawEffectsBelow(ctx, src, L) {
      const fx = L.fx;
      ctx.save();
      if (fx.shadow && fx.shadow.enabled) {
        const s = fx.shadow, a = (s.angle * Math.PI) / 180;
        ctx.globalCompositeOperation = s.blend || 'multiply';
        ctx.globalAlpha = L.opacity;
        drawShadowOnly(ctx, src, hexA(s.color, s.opacity), s.size, -Math.cos(a) * s.distance, Math.sin(a) * s.distance);
      }
      if (fx.glow && fx.glow.enabled) {
        const s = fx.glow;
        ctx.globalCompositeOperation = s.blend || 'screen';
        ctx.globalAlpha = L.opacity;
        drawShadowOnly(ctx, src, hexA(s.color, s.opacity), s.size, 0, 0);
        drawShadowOnly(ctx, src, hexA(s.color, s.opacity * 0.6), s.size / 3, 0, 0);
      }
      if (fx.stroke && fx.stroke.enabled) {
        const s = fx.stroke;
        const key = `${L.version}|${L.maskVersion}|${s.color}|${s.size}`;
        let sc;
        if (!L.renderOverride && L._strokeCache && L._strokeCache.key === key) sc = L._strokeCache.canvas;
        else {
          sc = strokeCanvas(src, s);
          if (!L.renderOverride) L._strokeCache = { key, canvas: sc };
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = L.opacity * (s.opacity ?? 1);
        ctx.drawImage(sc, 0, 0);
      }
      ctx.restore();
    }

    _signature() {
      let s = `${this.width}x${this.height}`;
      for (const L of this.layers) {
        if (L.renderOverride) return null;
        s += `|${L.id}:${L.version}:${L.maskVersion}:${L.visible}:${L.opacity}:${L.blend}:${L.maskEnabled}:${L.fx ? JSON.stringify(L.fx) : ''}`;
      }
      return s;
    }

    // Cached composite of all visible layers (transparent background).
    composite() {
      const c = this.compositeCanvas;
      if (c.width !== this.width || c.height !== this.height) {
        c.width = this.width;
        c.height = this.height;
        this._compSig = null;
      }
      const sig = this._signature();
      if (sig === null || sig !== this._compSig) {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        this.drawLayers(g, this.layers);
        this._compSig = sig;
      }
      return c;
    }

    // Fresh flattened copy, optionally on a solid background (for JPEG export).
    flattened(background) {
      const c = createCanvas(this.width, this.height), g = c.getContext('2d');
      if (background) {
        g.fillStyle = background;
        g.fillRect(0, 0, c.width, c.height);
      }
      g.drawImage(this.composite(), 0, 0);
      return c;
    }

    // ─── Geometry operations (callers record history) ───
    // draw(ctx, oldCanvas) paints the old content into the new-sized canvas.
    _remapAll(nw, nh, draw, textFn) {
      nw = Math.max(1, Math.round(nw));
      nh = Math.max(1, Math.round(nh));
      for (const L of this.layers) {
        if (L.isText && textFn && textFn(L.text) !== false) {
          L.canvas.width = nw;
          L.canvas.height = nh;
        } else {
          if (L.isText) L.rasterize();
          const old = cloneCanvas(L.canvas);
          L.canvas.width = nw;
          L.canvas.height = nh;
          L.ctx.imageSmoothingQuality = 'high';
          draw(L.ctx, old);
        }
        if (L.mask) {
          const old = cloneCanvas(L.mask);
          L.mask.width = nw;
          L.mask.height = nh;
          const g = L.mask.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, nw, nh);
          g.imageSmoothingQuality = 'high';
          draw(g, old);
          L.invalidateMask();
          L.touchMask();
        }
        L._strokeCache = null;
        L.touch();
      }
      this.width = nw;
      this.height = nh;
      this.selection.remap(nw, nh, draw);
      for (const L of this.layers) if (L.isText) L.renderText();
      PW.bus.emit('doc:resized', this);
      PW.bus.emit('layers:changed', this);
    }

    resizeImage(nw, nh, smooth = true) {
      const sx = nw / this.width, sy = nh / this.height;
      this._remapAll(nw, nh, (g, old) => {
        g.imageSmoothingEnabled = smooth;
        g.drawImage(old, 0, 0, Math.round(nw), Math.round(nh));
      }, t => {
        t.x *= sx;
        t.y *= sy;
        t.size = Math.max(1, t.size * Math.sqrt(sx * sy));
      });
    }

    // Offset (dx, dy) of the old content inside the new canvas; bottom layer optionally filled.
    resizeCanvas(nw, nh, dx, dy, fill) {
      const bottom = this.layers[0];
      this._remapAll(nw, nh, (g, old) => g.drawImage(old, Math.round(dx), Math.round(dy)), t => {
        t.x += dx;
        t.y += dy;
      });
      if (fill && bottom && !bottom.isText) {
        const g = bottom.ctx;
        g.save();
        g.globalCompositeOperation = 'destination-over';
        g.fillStyle = fill;
        g.fillRect(0, 0, nw, nh);
        g.restore();
        bottom.touch();
      }
    }

    crop(r) {
      this.resizeCanvas(r.w, r.h, -r.x, -r.y, null);
    }

    rotate(deg) {
      const w = this.width, h = this.height;
      const swap = deg % 180 !== 0;
      const nw = swap ? h : w, nh = swap ? w : h;
      this._remapAll(nw, nh, (g, old) => {
        g.save();
        g.translate(nw / 2, nh / 2);
        g.rotate((deg * Math.PI) / 180);
        g.drawImage(old, -w / 2, -h / 2);
        g.restore();
      }, () => false);
    }

    flip(horizontal) {
      const w = this.width, h = this.height;
      this._remapAll(w, h, (g, old) => {
        g.save();
        if (horizontal) {
          g.translate(w, 0);
          g.scale(-1, 1);
        } else {
          g.translate(0, h);
          g.scale(1, -1);
        }
        g.drawImage(old, 0, 0);
        g.restore();
      }, () => false);
    }

    trimBounds() {
      return alphaBounds(this.flattened());
    }

    // ─── Snapshots for history ───
    capture(prev) {
      const prevLayers = new Map((prev ? prev.layers : []).map(r => [r.id, r]));
      const layers = this.layers.map(L => {
        const p = prevLayers.get(L.id);
        return {
          id: L.id,
          name: L.name,
          visible: L.visible,
          opacity: L.opacity,
          blend: L.blend,
          locked: L.locked,
          lockAlpha: L.lockAlpha,
          type: L.type,
          text: L.text ? { ...L.text } : null,
          fx: L.fx ? JSON.parse(JSON.stringify(L.fx)) : null,
          maskEnabled: L.maskEnabled,
          editMask: L.editMask,
          version: L.version,
          pixels: p && p.version === L.version ? p.pixels : cloneCanvas(L.canvas),
          maskVersion: L.maskVersion,
          mask: L.mask ? (p && p.mask && p.maskVersion === L.maskVersion ? p.mask : cloneCanvas(L.mask)) : null,
        };
      });
      const sel = this.selection;
      return {
        width: this.width,
        height: this.height,
        activeId: this.activeId,
        layerCounter: this.layerCounter,
        layers,
        selVersion: sel.version,
        selection: prev && prev.selVersion === sel.version ? prev.selection : sel.snapshot(),
      };
    }

    restore(snap) {
      const resized = snap.width !== this.width || snap.height !== this.height;
      this.width = snap.width;
      this.height = snap.height;
      const live = new Map(this.layers.map(L => [L.id, L]));
      this.layers = snap.layers.map(r => {
        let L = live.get(r.id);
        if (!L || L.width !== this.width || L.height !== this.height) {
          L = new Layer(this.width, this.height, r.name);
          L.id = r.id;
        }
        if (L.version !== r.version) {
          L.ctx.clearRect(0, 0, this.width, this.height);
          L.ctx.drawImage(r.pixels, 0, 0);
          L.version = r.version;
        }
        if (L.maskVersion !== r.maskVersion || !!L.mask !== !!r.mask) {
          if (r.mask) {
            if (!L.mask || L.mask.width !== this.width || L.mask.height !== this.height) L.mask = createCanvas(this.width, this.height);
            const g = L.mask.getContext('2d');
            g.clearRect(0, 0, this.width, this.height);
            g.drawImage(r.mask, 0, 0);
          } else {
            L.mask = null;
          }
          L.maskVersion = r.maskVersion;
          L.invalidateMask();
        }
        Object.assign(L, {
          name: r.name,
          visible: r.visible,
          opacity: r.opacity,
          blend: r.blend,
          locked: r.locked,
          lockAlpha: r.lockAlpha,
          type: r.type,
          text: r.text ? { ...r.text } : null,
          fx: r.fx ? JSON.parse(JSON.stringify(r.fx)) : null,
          maskEnabled: r.maskEnabled,
          editMask: r.editMask && !!r.mask,
          renderOverride: null,
          _strokeCache: null,
        });
        return L;
      });
      this.activeId = snap.activeId;
      this.layerCounter = snap.layerCounter;
      this.selection.restore(snap.selection, this.width, this.height);
      this._compSig = null;
      if (resized) PW.bus.emit('doc:resized', this);
      PW.bus.emit('layers:changed', this);
    }

    // ─── Project files ───
    async serialize() {
      return {
        app: 'pixelwerk',
        version: 1,
        name: this.name,
        width: this.width,
        height: this.height,
        activeIndex: this.activeIndex,
        layers: await Promise.all(this.layers.map(L => L.serialize())),
      };
    }

    static async deserialize(data) {
      const doc = new Doc(data.width, data.height, data.name);
      for (const ld of data.layers) {
        const L = await Layer.deserialize(ld, doc.width, doc.height);
        doc.layers.push(L);
      }
      doc.layerCounter = doc.layers.length;
      const active = doc.layers[data.activeIndex] || doc.layers[doc.layers.length - 1];
      doc.activeId = active ? active.id : null;
      return doc;
    }
  }

  PW.Doc = Doc;
  PW.History = History;
  PW.FX_DEFAULTS = FX_DEFAULTS;
})(window.PW);
