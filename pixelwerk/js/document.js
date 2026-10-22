// ─── Document: layer stack, compositing, geometry operations and undo history ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, scratch, uid, alphaBounds } = PW.util;
  const { Layer, Selection } = PW;

  // ─── History: copy-on-write snapshots (unchanged layers share their pixel copy) ───
  // Everything about a layer that changes how it looks.
  const layerSig = L => `|${L.id}:${L.version}:${L.maskVersion}:${L.visible}:${L.opacity}:${L.blend}:${L.maskEnabled}:${L.parent || ''}:${L.fx ? JSON.stringify(L.fx) : ''}:${L.adjust ? JSON.stringify(L.adjust) : ''}`;

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

    // index: position in the stack (default: above the active layer). parent: the group it goes
    // into; left out, it joins the group of the layer just below it (that keeps groups whole).
    addLayer(layer, index, parent) {
      if (index == null) {
        // Above the active layer; into an open group when the group itself is active.
        const A = this.active;
        if (A && A.isGroup && !A.collapsed) {
          index = this.layers.indexOf(A);
          if (parent === undefined) parent = A.id;
        } else index = this.activeIndex + 1;
      }
      index = PW.util.clamp(index, 0, this.layers.length);
      if (parent === undefined) {
        const below = this.layers[index - 1];
        parent = below ? below.parent : null;
      }
      layer.parent = parent;
      this.layers.splice(index, 0, layer);
      this.activeId = layer.id;
      PW.bus.emit('layers:changed', this);
      return layer;
    }

    // ─── Groups ───
    // Everything inside group G (all levels), bottom to top: the run of layers directly below it.
    descendantsOf(G) {
      if (!G || !G.isGroup) return [];
      const ids = new Set([G.id]), out = [];
      for (let i = this.layers.indexOf(G) - 1; i >= 0; i--) {
        const L = this.layers[i];
        if (!ids.has(L.parent)) break;
        ids.add(L.id);
        out.push(L);
      }
      return out.reverse();
    }
    // A layer together with its contents (one unit when moving, copying or deleting).
    blockOf(L) { return [...this.descendantsOf(L), L]; }
    ancestorsOf(L) {
      const out = [];
      for (let p = L && this.layerById(L.parent); p; p = this.layerById(p.parent)) out.push(p);
      return out;
    }
    depthOf(L) { return this.ancestorsOf(L).length; }
    // Visible on screen: the layer and every group it is in.
    shown(L) { return L.visible && this.ancestorsOf(L).every(g => g.visible); }
    // Layers inside the active group or the active layer itself, for tools that move pixels.
    pixelLayersOf(L) {
      return L && L.isGroup ? this.descendantsOf(L).filter(x => !x.isGroup && !x.adjust) : L ? [L] : [];
    }

    // Index of X in the stack as it is without L and its contents (for moveBlock).
    restIndex(L, X) {
      const block = new Set(this.blockOf(L));
      return this.layers.filter(x => !block.has(x)).indexOf(X);
    }

    // Moves L (with its contents) to stack position `index`, counted without it, inside `parent`.
    moveBlock(L, index, parent) {
      const block = this.blockOf(L), start = this.layers.indexOf(block[0]);
      if (parent && block.some(x => x.id === parent)) return false;
      this.layers.splice(start, block.length);
      this.layers.splice(PW.util.clamp(index, 0, this.layers.length), 0, ...block);
      L.parent = parent || null;
      PW.bus.emit('layers:changed', this);
      return true;
    }

    // Puts the given layers (each with its contents) into a new group at the place of the
    // topmost one. Returns the group.
    groupLayers(list, name) {
      const set = new Set(list.map(l => l.id));
      // Only the outermost of the chosen layers move; their contents come along.
      const tops = list.filter(l => !this.ancestorsOf(l).some(g => set.has(g.id)));
      tops.sort((a, b) => this.layers.indexOf(a) - this.layers.indexOf(b));
      const top = tops[tops.length - 1], G = Layer.group(this.width, this.height, name || this.nextLayerName('Gruppe'));
      this.addLayer(G, this.layers.indexOf(top) + 1, top.parent);
      for (const L of tops) this.moveBlock(L, this.restIndex(L, G), G.id);
      this.activeId = G.id;
      PW.bus.emit('layers:changed', this);
      return G;
    }

    // The group goes, its contents stay where they are (one level up).
    ungroup(G) {
      if (!G || !G.isGroup) return false;
      for (const L of this.layers) if (L.parent === G.id) L.parent = G.parent;
      const kids = this.descendantsOf(G);
      this.layers.splice(this.layers.indexOf(G), 1);
      this.activeId = kids.length ? kids[kids.length - 1].id : (this.layers[0] || {}).id || null;
      PW.bus.emit('layers:changed', this);
      return true;
    }

    // Group → one pixel layer with what the group shows (Photoshop: "Gruppe zusammenfügen").
    mergeGroup(G) {
      const block = this.blockOf(G), start = this.layers.indexOf(block[0]);
      const L = new Layer(this.width, this.height, G.name), shown = G.visible;
      G.visible = true;
      this.drawLayers(L.ctx, block);
      G.visible = shown;
      L.visible = shown;
      L.touch();
      L.parent = G.parent;
      this.layers.splice(start, block.length, L);
      this.activeId = L.id;
      PW.bus.emit('layers:changed', this);
      return L;
    }

    removeLayer(id) {
      const L = this.layerById(id);
      if (!L) return;
      const block = this.blockOf(L), i = this.layers.indexOf(block[0]);
      this.layers.splice(i, block.length);
      if (block.some(x => x.id === this.activeId)) {
        const next = this.layers[Math.max(0, i - 1)];
        this.activeId = next ? next.id : null;
      }
      PW.bus.emit('layers:changed', this);
    }

    moveLayer(id, newIndex) {
      const L = this.layerById(id);
      if (!L) return;
      const block = this.blockOf(L), rest = this.layers.filter(x => !block.includes(x));
      const at = PW.util.clamp(newIndex - block.length + 1, 0, rest.length);
      const below = rest[at - 1];
      this.moveBlock(L, at, below ? below.parent : null);
    }

    // Copy of a layer; for a group, of the group and everything in it.
    duplicateLayer(id, name) {
      const src = this.layerById(id);
      if (!src) return null;
      const block = this.blockOf(src), ids = new Map(), copies = [];
      for (const s of block) {
        const L = s.isGroup ? Layer.group(this.width, this.height, s.name) : new Layer(this.width, this.height, s.name);
        if (!s.isGroup) L.ctx.drawImage(s.canvas, 0, 0);
        Object.assign(L, {
          visible: s.visible, opacity: s.opacity, blend: s.blend, type: s.type, collapsed: s.collapsed,
          text: s.text ? { ...s.text } : null,
          fx: s.fx ? JSON.parse(JSON.stringify(s.fx)) : null,
          adjust: s.adjust ? JSON.parse(JSON.stringify(s.adjust)) : null,
          maskEnabled: s.maskEnabled,
        });
        if (s.mask) {
          L.mask = cloneCanvas(s.mask);
          L.touchMask();
        }
        L.touch();
        ids.set(s.id, L.id);
        copies.push(L);
      }
      block.forEach((s, i) => (copies[i].parent = ids.get(s.parent) || s.parent));
      const copy = copies[copies.length - 1];
      copy.name = name || `${src.name} Kopie`;
      copy.parent = src.parent;
      this.layers.splice(this.layers.indexOf(src) + 1, 0, ...copies);
      this.activeId = copy.id;
      PW.bus.emit('layers:changed', this);
      return copy;
    }

    mergeDown(id) {
      const i = this.layers.findIndex(l => l.id === id);
      if (i < 0) return false;
      if (this.layers[i].isGroup) return !!this.mergeGroup(this.layers[i]);
      if (i === 0) return false;
      const upper = this.layers[i], lower = this.layers[i - 1];
      // An adjustment layer has no pixels to merge into; a group is merged with its own command.
      if (lower.adjust || lower.isGroup || lower.parent !== upper.parent) return false;
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
      const visible = this.layers.filter(l => this.shown(l));
      if (visible.filter(l => !l.isGroup).length < 2) return false;
      const tmp = createCanvas(this.width, this.height);
      this.drawLayers(tmp.getContext('2d'), this.layers);
      let target = visible.find(l => !l.isGroup && !l.adjust);
      if (!target) {
        target = this.createLayer();
        this.layers.splice(this.layers.indexOf(visible[0]), 0, target);
      }
      target.ctx.clearRect(0, 0, this.width, this.height);
      target.ctx.drawImage(tmp, 0, 0);
      Object.assign(target, { opacity: 1, blend: 'source-over', fx: null, type: 'raster', text: null, adjust: null, parent: null });
      if (target.mask) target.removeMask();
      target.touch();
      const gone = new Set(visible.filter(l => l !== target).map(l => l.id));
      this.layers = this.layers.filter(l => !gone.has(l.id));
      // Hidden layers whose group was merged move up to the next group that is left.
      for (const L of this.layers) {
        let p = L.parent;
        while (p && gone.has(p)) p = (this.layerById(p) || { parent: null }).parent;
        if (p && !this.layerById(p)) p = null;
        L.parent = p || null;
      }
      this.normalize();
      this.activeId = target.id;
      PW.bus.emit('layers:changed', this);
      return true;
    }

    // Keeps every group's contents directly below it (after removing or merging layers).
    normalize() {
      const kids = new Map(), top = [];
      for (const L of this.layers) {
        if (L.parent && !this.layerById(L.parent)) L.parent = null;
        if (L.parent) (kids.get(L.parent) || kids.set(L.parent, []).get(L.parent)).push(L);
        else top.push(L);
      }
      const out = [];
      const put = L => {
        for (const k of kids.get(L.id) || []) put(k);
        out.push(L);
      };
      top.forEach(put);
      if (out.length === this.layers.length) this.layers = out;
    }

    flatten() {
      const L = new Layer(this.width, this.height, 'Hintergrund');
      L.parent = null;
      L.ctx.fillStyle = '#ffffff';
      L.ctx.fillRect(0, 0, this.width, this.height);
      this.drawLayers(L.ctx, this.layers);
      L.touch();
      this.layers = [L];
      this.activeId = L.id;
      PW.bus.emit('layers:changed', this);
    }

    // ─── Compositing ───
    // cache: the main composite — adjustment results are kept while nothing below them changes.
    // Groups: "Hindurchwirken" (pass-through) draws the contents straight into the picture;
    // any other mode, opacity below 100 % or a mask first combine the contents on their own.
    drawLayers(ctx, layers, cache = false) {
      const ids = new Set(layers.map(l => l.id)), kids = new Map(), top = [];
      for (const L of layers) {
        if (L.parent && ids.has(L.parent)) (kids.get(L.parent) || kids.set(L.parent, []).get(L.parent)).push(L);
        else top.push(L);
      }
      this._drawList(ctx, top, kids, cache, `${this.width}x${this.height}`, 0);
    }

    // Returns the signature of what is drawn so far (null: not cacheable).
    _drawList(ctx, layers, kids, cache, below, depth) {
      const w = this.width, h = this.height;
      for (const L of layers) {
        const sig = layerSig(L);
        if (L.renderOverride) below = null;
        if (!L.visible || L.opacity <= 0) {
          if (below !== null) below += sig;
          continue;
        }
        if (L.isGroup) {
          const list = kids.get(L.id) || [];
          const masked = L.mask && L.maskEnabled;
          if (L.blend === 'pass-through' && L.opacity >= 1 && !masked) {
            below = this._drawList(ctx, list, kids, cache, below === null ? null : below + sig, depth + 1);
            continue;
          }
          const tmp = scratch(`comp-group-${depth}`, w, h), g = tmp.getContext('2d');
          const inner = this._drawList(g, list, kids, cache, below === null ? null : `grp${sig}`, depth + 1);
          if (masked) {
            g.globalCompositeOperation = 'destination-in';
            g.drawImage(L.maskAlpha(), 0, 0);
          }
          ctx.globalAlpha = L.opacity;
          ctx.globalCompositeOperation = L.blend === 'pass-through' ? 'source-over' : L.blend;
          ctx.drawImage(tmp, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          below = below === null || inner === null ? null : below + sig + inner;
          continue;
        }
        if (L.adjust) {
          this._drawAdjust(ctx, L, cache && below !== null ? below + sig : null);
          if (below !== null) below += sig;
          continue;
        }
        if (below !== null) below += sig;
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
      return below;
    }

    // Adjustment layer: what is below, corrected, drawn back through the mask.
    _drawAdjust(ctx, L, key) {
      const w = this.width, h = this.height;
      let out = L._adjCache && key && L._adjCache.key === key ? L._adjCache.canvas : null;
      if (!out) {
        const op = PW.filters.ops[L.adjust.id];
        if (!op) return;
        const img = ctx.getImageData(0, 0, w, h);
        op(img, L.adjust.params || {}, { x0: 0, y0: 0, W: w, H: h, fg: L.adjust.fg || '#000000', bg: L.adjust.bg || '#ffffff' });
        out = key ? (L._adjCache && L._adjCache.canvas.width === w && L._adjCache.canvas.height === h ? L._adjCache.canvas : createCanvas(w, h)) : scratch('comp-adjust', w, h);
        const g = out.getContext('2d');
        g.putImageData(img, 0, 0);
        if (L.mask && L.maskEnabled) {
          g.globalCompositeOperation = 'destination-in';
          g.drawImage(L.maskAlpha(), 0, 0);
          g.globalCompositeOperation = 'source-over';
        }
        if (key) L._adjCache = { key, canvas: out };
      }
      ctx.globalAlpha = L.opacity;
      ctx.globalCompositeOperation = L.blend;
      ctx.drawImage(out, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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
        s += layerSig(L);
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
        this.drawLayers(g, this.layers, true);
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
        if (L.isGroup) {
          L._gw = nw;
          L._gh = nh;
        } else if (L.isText && textFn && textFn(L.text) !== false) {
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
          adjust: L.adjust ? JSON.parse(JSON.stringify(L.adjust)) : null,
          parent: L.parent,
          collapsed: L.collapsed,
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
        if (L && L.isGroup !== (r.type === 'group')) L = null;
        if (L && L.isGroup) {
          L._gw = this.width;
          L._gh = this.height;
        }
        if (!L || L.width !== this.width || L.height !== this.height) {
          L = r.type === 'group' ? Layer.group(this.width, this.height, r.name) : new Layer(this.width, this.height, r.name);
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
          adjust: r.adjust ? JSON.parse(JSON.stringify(r.adjust)) : null,
          parent: r.parent || null,
          collapsed: !!r.collapsed,
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
        layers: await Promise.all(this.layers.map(async L => ({ ...(await L.serialize()), parent: this.parentIndex(L) }))),
      };
    }

    // Group of L as a stack index (for files; ids are made fresh on loading), -1: none.
    parentIndex(L) {
      return L.parent ? this.layers.findIndex(x => x.id === L.parent) : -1;
    }

    static async deserialize(data) {
      const doc = new Doc(data.width, data.height, data.name);
      for (const ld of data.layers) {
        const L = await Layer.deserialize(ld, doc.width, doc.height);
        doc.layers.push(L);
      }
      data.layers.forEach((ld, i) => {
        const p = doc.layers[ld.parent];
        if (ld.parent >= 0 && p && p.isGroup) doc.layers[i].parent = p.id;
      });
      doc.normalize();
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
