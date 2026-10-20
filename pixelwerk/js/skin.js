// ─── Haut glätten: smooths skin like a retoucher's frequency separation ───
// Finds skin tones (optionally only in a box), smooths the brightness's mid frequencies with an
// edge-aware filter and puts part of the fine texture back, so pores stay and it does not look
// plastic; colour blotches are evened out separately. Only the area around the skin is computed.
// The result is its own layer with a mask, so strength and areas stay editable.
'use strict';

(function (PW) {
  const { clamp } = PW.util;
  const app = () => PW.app;

  // opts: strength 0–100 (default 60), texture 0–100 (how much fine texture stays, default 45),
  // box {x,y,w,h} in document px to limit the search (e.g. the face).
  async function smooth(opts = {}) {
    const a = app(), doc = a.doc;
    if (!doc) return null;
    a.finishToolWork();
    const strength = clamp(Number(opts.strength ?? 60), 0, 100) / 100, keep = clamp(Number(opts.texture ?? 45), 0, 100) / 100;
    let layer = null;
    await PW.ui.busy(async () => {
      await new Promise(r => setTimeout(r, 0));
      const W = doc.width, H = doc.height, n = W * H, sc = Math.max(1, Math.max(W, H) / 2000);
      const all = doc.composite().getContext('2d').getImageData(0, 0, W, H).data;
      // Skin mask: soft skin-tone range, limited to the box or the selection.
      const skin = PW.smartSelect.colorRangeAlpha(all, n, { preset: 'skin' });
      const sel = doc.selection.empty ? null : doc.selection.alpha();
      const bx = opts.box;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          let v = skin[i];
          if (bx && (x < bx.x || y < bx.y || x >= bx.x + bx.w || y >= bx.y + bx.h)) v = 0;
          if (sel) v = (v * sel[i]) / 255;
          skin[i] = v;
          if (v > 12) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) throw new Error('Im Bild wurde keine Haut gefunden.');
      // Work only around the skin (with room for the filters).
      const r = Math.max(2, Math.round(6 * sc)), pad = r * 3 + Math.round(4 * sc);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Float32Array(w * h);
      const Y = new Float32Array(w * h), Cb = new Float32Array(w * h), Cr = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y0 + y) * W + x0 + x, o = y * w + x, j = i * 4;
          m[o] = skin[i] / 255;
          const R = all[j] / 255, G = all[j + 1] / 255, B = all[j + 2] / 255;
          Y[o] = 0.299 * R + 0.587 * G + 0.114 * B;
          Cb[o] = B - Y[o];
          Cr[o] = R - Y[o];
        }
      }
      PW.filters.blurPlane(m, w, h, 2.5 * sc);
      // Brightness: mid frequencies smoothed edge-aware, part of the fine texture kept (pores).
      const sm = PW.filters.guided(Y, Y, w, h, r, 0.0025);
      const fine = new Float32Array(Y);
      PW.filters.blurPlane(fine, w, h, 0.9 * sc);
      // Colour: blotches and redness evened out with a plain blur.
      PW.filters.blurPlane(Cb, w, h, 3 * sc);
      PW.filters.blurPlane(Cr, w, h, 3 * sc);
      const out = new ImageData(w, h), o = out.data;
      for (let i = 0; i < w * h; i++) {
        const y = sm[i] + (Y[i] - fine[i]) * keep, R = Cr[i] + y, B = Cb[i] + y, G = (y - 0.299 * R - 0.114 * B) / 0.587;
        o[i * 4] = R * 255;
        o[i * 4 + 1] = G * 255;
        o[i * 4 + 2] = B * 255;
        o[i * 4 + 3] = Math.round(clamp(m[i] * 1.6, 0, 1) * strength * 255);
      }
      layer = doc.createLayer('Haut geglättet');
      layer.canvas.getContext('2d').putImageData(out, x0, y0);
      layer.touch();
      doc.addLayer(layer, doc.layers.length);
    }, 'Haut wird geglättet …');
    a.commit('Haut glätten', 'brush');
    return layer;
  }

  PW.skin = { smooth };
})(window.PW);
