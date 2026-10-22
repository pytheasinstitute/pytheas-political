// ─── Auswählen und maskieren: refine a selection's edge (hair, fur), then output it ───
// Edge detection runs a guided filter in a band around the edge: inside the band the mask
// follows the picture's own edges, so strands of hair become soft and partly selected.
// Then smoothing, feather, contrast and edge shift like Photoshop; "Farben dekontaminieren"
// replaces the colour fringe in semi-transparent edge pixels with the object's own colour.
'use strict';

(function (PW) {
  const { el, createCanvas, clamp } = PW.util;
  const app = () => PW.app;
  const S = () => PW.segment;

  function gauss(a, w, h, sigma) {
    if (sigma < 0.3) return a;
    const out = new Float32Array(a);
    PW.filters.blurPlane(out, w, h, sigma);
    return out;
  }

  // alpha0: Float32Array 0–1, rgba: Uint8ClampedArray of the picture, p: params in pixels of this size.
  function refine(alpha0, rgba, w, h, p) {
    const n = w * h;
    let a = new Float32Array(alpha0);
    // Glätten: blur and re-threshold, so jagged outlines become calm curves.
    if (p.smooth > 0) {
      const b = gauss(a, w, h, (p.smooth / 100) * 6 * p.scale + 0.5);
      for (let i = 0; i < n; i++) a[i] = clamp((b[i] - 0.5) * 3 + 0.5, 0, 1);
    }
    // Kantenerkennung: guided filter in a band of width `radius` around the edge.
    if (p.radius > 0.5) {
      const R = Math.max(1, Math.round(p.radius));
      const hard = new Float32Array(n);
      for (let i = 0; i < n; i++) hard[i] = a[i] > 0.5 ? 1 : 0;
      const near = S().boxBlur(hard, w, h, R);
      const I = new Float32Array(n);
      for (let i = 0; i < n; i++) I[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
      const q = S().guidedFilter(I, hard, w, h, Math.max(2, Math.round(R * 0.6)), 1e-3);
      for (let i = 0; i < n; i++) {
        if (near[i] <= 0.01 || near[i] >= 0.99) continue;
        // The further from the edge, the more the original side counts (no halo at the band's rim).
        const t = Math.min(near[i], 1 - near[i]) * 2;
        a[i] = clamp(a[i] * (1 - t) + clamp(q[i], 0, 1) * t, 0, 1);
      }
    }
    // Weiche Kante
    if (p.feather > 0) a = gauss(a, w, h, p.feather / 2);
    // Kontrast
    if (p.contrast > 0) {
      const k = 1 + (p.contrast / 100) * 9;
      for (let i = 0; i < n; i++) a[i] = clamp((a[i] - 0.5) * k + 0.5, 0, 1);
    }
    // Kante verschieben: blur by a few pixels and move the threshold.
    if (p.shift) {
      const r = Math.max(1, Math.round((Math.max(3, p.radius) * Math.abs(p.shift)) / 50));
      const b = S().boxBlur(a, w, h, r), lo = p.shift > 0 ? 0 : 0.5, hi = p.shift > 0 ? 0.5 : 1;
      for (let i = 0; i < n; i++) a[i] = clamp((b[i] - lo) / (hi - lo), 0, 1);
    }
    return a;
  }

  // Edge colours: semi-transparent pixels take the colour of the nearby fully selected object.
  function decontaminate(rgba, a, w, h, amount, radius) {
    const n = w * h, out = new Uint8ClampedArray(rgba);
    const sure = new Float32Array(n);
    for (let i = 0; i < n; i++) sure[i] = a[i] > 0.95 ? 1 : 0;
    const sw = S().boxBlur(sure, w, h, radius);
    const ch = [0, 1, 2].map(c => {
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) v[i] = sure[i] * rgba[i * 4 + c];
      return S().boxBlur(v, w, h, radius);
    });
    for (let i = 0; i < n; i++) {
      if (a[i] <= 0.01 || a[i] >= 0.95 || sw[i] < 1e-3) continue;
      const k = amount * (1 - a[i]);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = rgba[i * 4 + c] + (ch[c][i] / sw[i] - rgba[i * 4 + c]) * k;
    }
    return out;
  }

  async function open() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    if (doc.selection.empty) return a.toast('Wähle zuerst etwas aus, z. B. mit „Motiv auswählen“ oder dem Schnellauswahlwerkzeug.');
    const W = doc.width, H = doc.height, sc = Math.max(1, Math.max(W, H) / 2000);
    // Preview at up to ~1.2 MP.
    const ps = Math.min(1, Math.sqrt(1200000 / (W * H)));
    const pw = Math.max(1, Math.round(W * ps)), ph = Math.max(1, Math.round(H * ps));
    const pc = createCanvas(pw, ph), pg = pc.getContext('2d');
    pg.drawImage(doc.composite(), 0, 0, pw, ph);
    const prgba = pg.getImageData(0, 0, pw, ph).data;
    pg.clearRect(0, 0, pw, ph);
    pg.drawImage(doc.selection.mask, 0, 0, pw, ph);
    const md = pg.getImageData(0, 0, pw, ph).data, palpha = new Float32Array(pw * ph);
    for (let i = 0; i < palpha.length; i++) palpha[i] = md[i * 4 + 3] / 255;

    const v = { view: 'overlay', radius: Math.round(8 * sc), smooth: 0, feather: 0, contrast: 0, shift: 0, decon: false, deconAmount: 100, output: 'selection' };
    const view = a.view, out = createCanvas(pw, ph), og = out.getContext('2d'), oimg = og.createImageData(pw, ph);
    let raf = 0;
    const params = s => ({ radius: v.radius * s, smooth: v.smooth, feather: v.feather * s, contrast: v.contrast, shift: v.shift, scale: s * sc });
    const render = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const al = refine(palpha, prgba, pw, ph, params(ps));
        const col = v.decon ? decontaminate(prgba, al, pw, ph, v.deconAmount / 100, Math.max(2, Math.round(v.radius * ps))) : prgba;
        const d = oimg.data;
        for (let i = 0; i < al.length; i++) {
          const j = i * 4, k = al[i];
          if (v.view === 'mask') { d[j] = d[j + 1] = d[j + 2] = k * 255; d[j + 3] = 255; continue; }
          const bg = v.view === 'black' ? [0, 0, 0] : v.view === 'white' ? [255, 255, 255] : null;
          for (let c = 0; c < 3; c++) {
            const fg = col[j + c];
            d[j + c] = bg ? fg * k + bg[c] * (1 - k) : fg * k + (fg * 0.45 + (c === 0 ? 255 : 0) * 0.55) * (1 - k);
          }
          d[j + 3] = 255;
        }
        og.putImageData(oimg, 0, 0);
        view.preview = out;
        view.requestRender();
      });
    };
    const rows = [];
    const ctl = (def, key) => {
      const c = PW.ui.control({ ...def, key }, v[key], x => {
        v[key] = x;
        for (const r of rows) r.c.hidden = !r.show(v);
        render();
      });
      if (def.showIf) {
        rows.push({ c, show: def.showIf });
        c.hidden = !def.showIf(v);
      }
      return c;
    };
    const content = el('div', { class: 'form-grid refine' }, [
      ctl({ type: 'select', label: 'Ansicht', options: [['overlay', 'Überlagerung (rot)'], ['black', 'Auf Schwarz'], ['white', 'Auf Weiß'], ['mask', 'Schwarzweiß']] }, 'view'),
      el('div', { class: 'dlg-sub', text: 'Kantenerkennung' }),
      ctl({ type: 'range', label: 'Radius', min: 0, max: 250, unit: 'Px', log: true, title: 'Wie breit der Bereich um die Kante ist, in dem Haare und feine Details erkannt werden' }, 'radius'),
      el('div', { class: 'dlg-sub', text: 'Globale Verbesserungen' }),
      ctl({ type: 'range', label: 'Abrunden', min: 0, max: 100 }, 'smooth'),
      ctl({ type: 'range', label: 'Weiche Kante', min: 0, max: 250, unit: 'Px', log: true }, 'feather'),
      ctl({ type: 'range', label: 'Kontrast', min: 0, max: 100, unit: '%' }, 'contrast'),
      ctl({ type: 'range', label: 'Kante verschieben', min: -100, max: 100, unit: '%' }, 'shift'),
      el('div', { class: 'dlg-sub', text: 'Ausgabe' }),
      ctl({ type: 'check', label: 'Farben dekontaminieren' }, 'decon'),
      ctl({ type: 'range', label: 'Stärke', min: 0, max: 100, unit: '%', showIf: o => o.decon }, 'deconAmount'),
      ctl({ type: 'select', label: 'Ausgabe an', options: [['selection', 'Auswahl'], ['mask', 'Ebenenmaske'], ['layer', 'Neue Ebene'], ['layerMask', 'Neue Ebene mit Ebenenmaske']] }, 'output'),
    ]);
    render();
    const res = await PW.dialogs.modal({ title: 'Auswählen und maskieren', content, width: 400, className: 'dlg-refine dlg-side' });
    cancelAnimationFrame(raf);
    view.preview = null;
    if (res !== 'ok') return a.render();
    await PW.ui.busy(async () => {
      const full = doc.composite().getContext('2d').getImageData(0, 0, W, H).data;
      const sa = doc.selection.alpha(), al0 = new Float32Array(W * H);
      for (let i = 0; i < al0.length; i++) al0[i] = sa[i] / 255;
      const al = refine(al0, full, W, H, params(1));
      const u8 = new Uint8Array(W * H);
      for (let i = 0; i < u8.length; i++) u8[i] = Math.round(al[i] * 255);
      if (v.output === 'selection') {
        doc.selection.fromAlpha(u8, 'replace');
        a.commit('Auswählen und maskieren', 'selection');
        return;
      }
      const src = PW.guide.photoLayer() || doc.active;
      if (v.output === 'mask') {
        const L = doc.active;
        if (!L) return;
        writeMask(L, u8, W, H);
        doc.selection.clear();
        a.commit('Ebenenmaske aus Auswahl', 'mask');
        return;
      }
      // New layer: a copy of what is visible (with decontaminated edge colours if asked).
      const L = doc.createLayer(src ? `${src.name} (freigestellt)` : 'Freigestellt');
      let px = full;
      if (v.decon) px = decontaminate(full, al, W, H, v.deconAmount / 100, Math.max(2, v.radius));
      const g = L.canvas.getContext('2d'), img = g.createImageData(W, H);
      img.data.set(px);
      if (v.output === 'layer') for (let i = 0; i < u8.length; i++) img.data[i * 4 + 3] = (img.data[i * 4 + 3] * u8[i]) / 255;
      g.putImageData(img, 0, 0);
      L.touch();
      doc.addLayer(L, doc.layers.length);
      if (v.output === 'layerMask') writeMask(L, u8, W, H);
      // Like Photoshop, the original below is hidden so the result shows on its own.
      for (const o of doc.layers) if (o !== L) o.visible = false;
      doc.selection.clear();
      a.commit('Auswählen und maskieren', 'layer');
    }, 'Kante wird verbessert …');
  }

  function writeMask(L, u8, W, H) {
    if (!L.mask) L.addMask(null, true);
    const g = L.mask.getContext('2d'), img = g.createImageData(W, H);
    for (let i = 0; i < u8.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = u8[i];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    L.maskEnabled = true;
    L.editMask = false;
    L.invalidateMask();
    L.touchMask();
  }

  PW.refineEdge = { open, refine, decontaminate };
})(window.PW);
