// ─── Adjustment layers (Einstellungsebenen): corrections that stay editable ───
// The layer holds only the correction and a mask; the document applies it to everything below
// when compositing (see Doc.drawLayers). Creating or editing one reuses the correction dialogs
// with a session that changes the layer's settings instead of pixels.
'use strict';

(function (PW) {
  const { createCanvas } = PW.util;
  const app = () => PW.app;
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const defOf = id => PW.filters.defs.find(f => f.id === id);
  const nameOf = def => (def.title || def.name).replace('…', '');

  // Same interface as FilterSession (run / cancel / orig for histograms).
  class AdjustSession {
    constructor(doc, layer) {
      this.doc = doc;
      this.layer = layer;
      this.before = clone(layer.adjust.params);
      this.applied = false;
      const c = createCanvas(doc.width, doc.height);
      doc.drawLayers(c.getContext('2d'), doc.layers.slice(0, doc.layers.indexOf(layer)));
      this.orig = c.getContext('2d').getImageData(0, 0, doc.width, doc.height);
    }

    run(params) {
      this.layer.adjust.params = clone(params);
      this.applied = true;
    }

    cancel() {
      this.layer.adjust.params = clone(this.before);
    }
  }

  // Corrections that work as adjustment layers: the ones in Bild › Korrekturen.
  const supported = () => PW.filters.defs.filter(f => f.menu === 'adjust' && f.id);

  async function create(id, params) {
    const a = app(), doc = a.doc, def = defOf(id);
    if (!doc || !def) return null;
    a.finishToolWork();
    const L = doc.createLayer(nameOf(def));
    L.adjust = { id, params: clone(params || PW.filters.defaults(def)), fg: a.fg, bg: a.bg };
    // A selection becomes the mask, like in Photoshop; without one the mask is made when first painted on.
    if (!doc.selection.empty) L.addMask(doc.selection, true);
    doc.addLayer(L, doc.active ? null : doc.layers.length);
    let ok = !!params || (!def.params && !def.dialog);
    if (!ok) {
      await PW.dialogs.runFilter(def, { session: new AdjustSession(doc, L), initial: L.adjust.params, done: p => { L.adjust.params = clone(p); ok = true; } });
    }
    if (!ok) {
      doc.removeLayer(L.id);
      a.render();
      return null;
    }
    if (!doc.selection.empty) doc.selection.clear();
    doc.setActive(L.id);
    a.commit(`Einstellungsebene „${nameOf(def)}“`, 'adjust');
    return L;
  }

  async function edit(L) {
    const a = app(), doc = a.doc;
    if (!doc || !L || !L.adjust) return;
    const def = defOf(L.adjust.id);
    if (!def) return;
    if (!def.params && !def.dialog) return a.toast('Diese Einstellungsebene hat keine Regler. Über Deckkraft und Maske lässt sich ihre Wirkung steuern.');
    const before = clone(L.adjust.params);
    let ok = false;
    await PW.dialogs.runFilter(def, { session: new AdjustSession(doc, L), initial: before, done: p => { L.adjust.params = clone(p); ok = true; } });
    if (ok) a.commit(`${nameOf(def)} ändern`, 'adjust');
    else {
      L.adjust.params = before;
      a.render();
    }
  }

  PW.adjustLayers = { create, edit, supported, defOf, AdjustSession };
})(window.PW);
