// ─── Smart objects (Smartobjekte) and smart filters (Smartfilter) ───
// A smart object keeps its original pixels (source, any size) and where they sit in the document
// (matrix: source px → document px). The layer's canvas is only a rendering of that, so scaling,
// rotating, the image size and moving are redone from the original and lose nothing. Filters on a
// smart object are kept in a list (L.smart.filters) and stay editable, switchable and removable.
// "Inhalt bearbeiten" opens the original as its own document; changes there update the layer.
'use strict';

(function (PW) {
  const { createCanvas, alphaBounds } = PW.util;
  const app = () => PW.app;

  // ─── 2-D affine matrices [a, b, c, d, e, f] like canvas setTransform ───
  const mat = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (A, B) => [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
    ],
    translate: (x, y) => [1, 0, 0, 1, x, y],
    scale: (x, y) => [x, 0, 0, y, 0, 0],
    // The affine map behind a point function (used for image size, crop, rotate, flip).
    fromPoints(f) {
      const [ex, ey] = f(0, 0), [ax, ay] = f(1, 0), [cx, cy] = f(0, 1);
      return [ax - ex, ay - ey, cx - ex, cy - ey, ex, ey];
    },
    apply: (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]],
  };

  const cloneSmart = s => (s ? { source: s.source, matrix: s.matrix.slice(), filters: JSON.parse(JSON.stringify(s.filters || [])), version: s.version } : null);
  const defOf = id => PW.filters.defs.find(f => f.id === id);
  const filterName = f => {
    const d = defOf(f.id);
    return d ? (d.title || d.name).replace('…', '') : f.id;
  };

  // Bounds of the source in the document (corners through the matrix).
  function quadBounds(L) {
    const s = L.smart, w = s.source.width, h = s.source.height;
    const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => mat.apply(s.matrix, x, y));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }

  // Applies the filters list (only switched-on ones) to an ImageData of the whole layer.
  function applyFilters(img, filters, W, H) {
    for (const f of filters) {
      if (!f.enabled) continue;
      const op = PW.filters.ops[f.id];
      if (op) op(img, f.params || {}, { x0: 0, y0: 0, W, H, fg: f.fg || '#000000', bg: f.bg || '#ffffff' });
    }
    return img;
  }

  // Renders the layer from its source. extra: a matrix applied after the stored one (live
  // transform preview); filters: false skips them (fast preview), or a list to use instead.
  function render(L, opts = {}) {
    const s = L.smart, g = L.ctx, W = L.canvas.width, H = L.canvas.height;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    const M = opts.extra ? mat.mul(opts.extra, s.matrix) : s.matrix;
    g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(s.source, 0, 0);
    g.restore();
    const filters = opts.filters === false ? [] : opts.filters || s.filters;
    if (filters.some(f => f.enabled)) {
      const img = g.getImageData(0, 0, W, H);
      g.putImageData(applyFilters(img, filters, W, H), 0, 0);
    }
    L._strokeCache = null;
    L.touch();
  }

  // ─── Making and undoing smart objects ───
  // A new layer that holds `source` placed by `matrix`.
  function createLayer(doc, source, matrix, name) {
    const L = doc.createLayer(name);
    L.smart = { source, matrix, filters: [], version: 1 };
    render(L);
    return L;
  }

  function convert(doc, L) {
    let src, M;
    if (L.isGroup) {
      // A group becomes one smart object with what it shows.
      const c = createCanvas(doc.width, doc.height), shown = L.visible;
      L.visible = true;
      doc.drawLayers(c.getContext('2d'), doc.blockOf(L));
      L.visible = shown;
      src = c;
    } else src = L.canvas;
    const b = alphaBounds(src) || { x: 0, y: 0, w: 1, h: 1 };
    const source = createCanvas(b.w, b.h);
    source.getContext('2d').drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    M = mat.translate(b.x, b.y);
    if (L.isGroup) {
      const S = createLayer(doc, source, M, L.name);
      Object.assign(S, { opacity: L.opacity, blend: L.blend === 'pass-through' ? 'source-over' : L.blend, visible: L.visible });
      const block = doc.blockOf(L), start = doc.layers.indexOf(block[0]);
      S.parent = L.parent;
      doc.layers.splice(start, block.length, S);
      doc.activeId = S.id;
      PW.bus.emit('layers:changed', doc);
      return S;
    }
    if (L.isText) L.rasterize();
    L.smart = { source, matrix: M, filters: [], version: 1 };
    render(L);
    PW.bus.emit('layers:changed', doc);
    return L;
  }

  // The rendering becomes ordinary pixels.
  function rasterize(L) {
    if (!L.smart) return false;
    L.smart = null;
    L.touch();
    return true;
  }

  // ─── Smart filters ───
  // Same interface as PW.filters.FilterSession: run(params) previews, cancel() restores.
  // index: the filter being edited (null: a new one at the end).
  class FilterSession {
    constructor(doc, L, def, ctx, index = null) {
      this.doc = doc;
      this.layer = L;
      this.def = def;
      this.ctx = ctx;
      this.index = index;
      const s = L.smart, W = L.canvas.width, H = L.canvas.height;
      this.before = cloneSmart(s);
      // Everything below the filter in the list, rendered once.
      const below = index == null ? s.filters : s.filters.slice(0, index);
      render(L, { filters: below });
      this.orig = L.ctx.getImageData(0, 0, W, H);
      this.after = index == null ? [] : s.filters.slice(index + 1);
      this.applied = false;
    }

    run(params) {
      const L = this.layer, W = L.canvas.width, H = L.canvas.height;
      const img = new ImageData(new Uint8ClampedArray(this.orig.data), W, H);
      applyFilters(img, [{ id: this.def.id, params, enabled: true, fg: this.ctx.fg, bg: this.ctx.bg }, ...this.after], W, H);
      L.ctx.putImageData(img, 0, 0);
      L.touch();
      this.applied = true;
    }

    cancel() {
      this.layer.smart = cloneSmart(this.before);
      render(this.layer);
    }
  }

  // Filter menu on a smart object: the dialog previews, OK adds (or changes) the list entry.
  function runFilter(def, opts = {}) {
    const a = app(), doc = a.doc, L = doc.active, index = opts.index ?? null;
    const session = new FilterSession(doc, L, def, { fg: a.fg, bg: a.bg }, index);
    const initial = index != null ? L.smart.filters[index].params : opts.initial;
    return PW.dialogs.runFilter(def, {
      session,
      initial,
      params: opts.params,
      done: params => {
        const entry = { id: def.id, params: JSON.parse(JSON.stringify(params)), enabled: true, fg: a.fg, bg: a.bg };
        if (index != null) L.smart.filters[index] = { ...L.smart.filters[index], params: entry.params };
        else L.smart.filters.push(entry);
        render(L);
        if (index == null) a.lastFilter = { def, params };
        a.commit(index != null ? `Smartfilter „${filterName(entry)}“ ändern` : `Smartfilter „${filterName(entry)}“`, 'filter');
        PW.bus.emit('filter:last');
      },
    });
  }

  function editFilter(L, index) {
    const f = L.smart && L.smart.filters[index], def = f && defOf(f.id);
    if (!def) return;
    app().doc.setActive(L.id);
    if (!def.params && !def.dialog) return;
    runFilter(def, { index });
  }
  function toggleFilter(L, index) {
    const f = L.smart.filters[index];
    f.enabled = !f.enabled;
    render(L);
    app().commit(f.enabled ? 'Smartfilter einblenden' : 'Smartfilter ausblenden', 'filter');
  }
  function removeFilter(L, index) {
    const [f] = L.smart.filters.splice(index, 1);
    render(L);
    app().commit(`Smartfilter „${filterName(f)}“ löschen`, 'trash');
  }

  // ─── "Inhalt bearbeiten": the source as its own document, linked back ───
  function editContents(doc, L) {
    const s = L.smart, child = new PW.Doc(s.source.width, s.source.height, `${L.name} (Smartobjekt)`);
    const base = child.createLayer(L.name);
    base.ctx.drawImage(s.source, 0, 0);
    base.touch();
    child.layers.push(base);
    child.activeId = base.id;
    child.smartLink = { doc, layerId: L.id };
    app().addDoc(child, 'Smartobjekt öffnen');
    child.smartLink.synced = child.history.current;
    app().toast('Änderungen hier werden sofort ins Smartobjekt übernommen.');
  }

  // Called when the history of a linked document changes.
  function syncFrom(child) {
    const link = child.smartLink, parent = link && link.doc, L = parent && parent.layerById(link.layerId);
    if (!L || !L.smart || !app().docs.includes(parent)) return;
    // Switching tabs also reports the history; only real changes count.
    if (link.synced === child.history.current) return;
    link.synced = child.history.current;
    const c = createCanvas(child.width, child.height);
    c.getContext('2d').drawImage(child.composite(), 0, 0);
    // Keep the placement when the size changes: the old corners stay where they were.
    const sx = L.smart.source.width / child.width, sy = L.smart.source.height / child.height;
    L.smart.matrix = mat.mul(L.smart.matrix, mat.scale(sx, sy));
    L.smart.source = c;
    L.smart.version = (L.smart.version || 0) + 1;
    render(L);
    parent.history.push('Smartobjekt aktualisieren', 'smart');
    parent.dirty = true;
    PW.bus.emit('layers:changed', parent);
  }
  PW.bus.on('history:changed', d => {
    if (d && d.smartLink && d.history.states.length > 1) syncFrom(d);
  });

  PW.smart = { mat, render, createLayer, convert, rasterize, quadBounds, applyFilters, FilterSession, runFilter, editFilter, toggleFilter, removeFilter, editContents, filterName, cloneSmart };
})(window.PW);
