// ─── "Stoff blickdichter machen": cover see-through fabric so nothing shows underneath ───
// First the skin that shows through is taken out of the colour: thin fabric over skin is a mix
// of both, and how warm a spot is tells how much skin is in it. Then the brightness is split into
// lighting, body shape, mid-scale detail (underwear edges, patterns) and fine knit: lighting,
// shape and real folds stay, faint lines and blotches go, and the knit is evened out so nothing
// outlines what was beneath. Hair over the fabric and open edges of the selection stay original.
// Optional zones (from the assistant, in document pixels) work like a retoucher's local masks:
// `lines` remove a showing-through edge completely, `areas` flatten blotches but keep broad
// shading, `keep` protects fine detail such as hair over the fabric.
// The result lives on its own layer above the photo, so the original stays untouched.
'use strict';

(function (PW) {
  const { el, clamp, clipRect, hexToRgb, rgbToHex } = PW.util;
  const app = () => PW.app;
  const SELECT_STEPS = ['Lasso', 'Polygon-Lasso', 'Rechteckige Auswahl', 'Elliptische Auswahl', 'Zauberstab', 'Kleidung auswählen'];
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  let pending = null, pendingAt = 0;

  // Gaussian-like blur of a plane, normalised by a weight plane (colours outside never bleed in).
  function nblur(plane, weight, w, h, sigma, tmp) {
    const num = new Float32Array(plane.length), den = new Float32Array(weight);
    for (let i = 0; i < plane.length; i++) num[i] = plane[i] * weight[i];
    PW.filters.blurPlane(num, w, h, sigma, tmp);
    PW.filters.blurPlane(den, w, h, sigma, tmp);
    for (let i = 0; i < num.length; i++) num[i] = den[i] > 1e-4 ? num[i] / den[i] : plane[i];
    return num;
  }

  function percentile(values, mask, q) {
    const pick = [];
    const step = Math.max(1, Math.floor(values.length / 60000));
    for (let i = 0; i < values.length; i += step) if (mask[i] > 0.5) pick.push(values[i]);
    if (!pick.length) return 0;
    pick.sort((a, b) => a - b);
    return pick[Math.min(pick.length - 1, Math.floor(pick.length * q))];
  }

  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Soft mask (0–1) of polygons or polylines, in region coordinates.
  function zoneMask(region, shapes, kind, sigma) {
    if (!shapes || !shapes.length) return null;
    const { x: rx, y: ry, w, h } = region;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = g.strokeStyle = '#fff';
    g.lineCap = g.lineJoin = 'round';
    let any = false;
    for (const s of shapes) {
      const pts = (s.points || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
      if (!pts.length) continue;
      g.beginPath();
      g.moveTo(pts[0][0] - rx, pts[0][1] - ry);
      for (const p of pts.slice(1)) g.lineTo(p[0] - rx, p[1] - ry);
      if (kind === 'line') {
        g.lineWidth = Math.max(2, Number(s.width) || 30);
        if (pts.length === 1) g.lineTo(pts[0][0] - rx + 0.01, pts[0][1] - ry);
        g.stroke();
      } else {
        if (pts.length < 3) continue;
        g.closePath();
        g.fill();
      }
      any = true;
    }
    if (!any) return null;
    const d = g.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
    PW.filters.blurPlane(m, w, h, sigma);
    return m;
  }

  function noisePlane(n, seed = 7) {
    let t = seed >>> 0;
    const rnd = () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
    const out = new Float32Array(n);
    // Sum of three uniforms ≈ normal, sd 1.
    for (let i = 0; i < n; i++) out[i] = (rnd() + rnd() + rnd() - 1.5) * 2;
    return out;
  }

  // Median of five (six comparisons).
  function med5(a, b, c, d, e) {
    let t;
    if (a > b) { t = a; a = b; b = t; }
    if (c > d) { t = c; c = d; d = t; }
    if (a > c) { t = a; a = c; c = t; t = b; b = d; d = t; }
    a = e;
    if (a > b) { t = a; a = b; b = t; }
    if (a > c) { t = b; b = d; d = t; c = a; }
    return Math.min(b, c);
  }

  // Strand detail: what a 5-tap median (rows, then columns) removes. Thin strands show, edges do not.
  function strandDetail(L, w, h, s) {
    const a = new Float32Array(L.length), b = new Float32Array(L.length);
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 2 * s), x1 = Math.max(0, x - s), x3 = Math.min(w - 1, x + s), x4 = Math.min(w - 1, x + 2 * s);
        a[r + x] = med5(L[r + x0], L[r + x1], L[r + x], L[r + x3], L[r + x4]);
      }
    }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - 2 * s) * w, y1 = Math.max(0, y - s) * w, y3 = Math.min(h - 1, y + s) * w, y4 = Math.min(h - 1, y + 2 * s) * w;
      for (let x = 0, r = y * w; x < w; x++) {
        const v = med5(a[y0 + x], a[y1 + x], a[r + x], a[y3 + x], a[y4 + x]);
        b[r + x] = (L[r + x] - v) ** 2;
      }
    }
    return b;
  }

  class FabricSession {
    // opts.refine: leave larger skin areas of a rough selection out (hair over the fabric is handled softly).
    constructor(doc, photo, opts = {}) {
      this.doc = doc;
      this.photo = photo;
      const sel = doc.selection, b = sel.bounds, W = doc.width;
      const sc = Math.max(0.5, Math.max(doc.width, doc.height) / 2000);
      const margin = Math.round(48 * sc);
      const r = (this.region = clipRect({ x: b.x - margin, y: b.y - margin, w: b.w + margin * 2, h: b.h + margin * 2 }, doc.width, doc.height));
      const { w, h } = r, n = w * h, tmp = new Float32Array(n);
      const blur = (plane, sigma) => {
        PW.filters.blurPlane(plane, w, h, sigma, tmp);
        return plane;
      };
      this.src = photo.ctx.getImageData(r.x, r.y, w, h);
      const d = this.src.data, selA = sel.alpha();
      const m = new Float32Array(n);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) m[i] = selA[(r.y + y) * W + r.x + x] / 255;

      // Warmth (R−B relative to brightness) tells how much skin shows through: skin is warm, most fabrics are not.
      const L = new Float32Array(n), rho = new Float32Array(n);
      const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const l = luma(d[j], d[j + 1], d[j + 2]);
        L[i] = l;
        rho[i] = (d[j] - d[j + 2]) / (l + 8);
        for (let k = 0; k < 3; k++) ch[k][i] = d[j + k] - l;
      }
      const inside = new Float32Array(n), selW = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        inside[i] = m[i] > 0.9 ? 1 : 0;
        selW[i] = m[i] > 0.5 ? 1 : 1e-3;
      }
      const rhoL = nblur(rho, selW, w, h, 14 * sc, tmp);
      const rhoF = percentile(rhoL, inside, 0.25), rhoF10 = percentile(rhoL, inside, 0.1);
      // Opaque reference: the least warm tenth of the fabric.
      const opaque = new Float32Array(n), opaqueStrict = new Float32Array(n);
      const ref = [0, 0, 0];
      let refN = 0;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        if (!inside[i]) continue;
        if (rhoL[i] < rhoF) opaqueStrict[i] = 1;
        if (rhoL[i] >= rhoF10 + 0.01) continue;
        opaque[i] = 1;
        ref[0] += d[j]; ref[1] += d[j + 1]; ref[2] += d[j + 2];
        refN++;
      }
      if (refN) for (let k = 0; k < 3; k++) ref[k] /= refN;
      const fL = percentile(L, opaque, 0.5) || percentile(L, inside, 0.3);
      // Skin reference: clearly warmer pixels just outside the selection.
      const near = blur(Float32Array.from(selW, v => (v > 0.5 ? 1 : 0)), 25 * sc);
      const skinRho = [], skinL = [];
      const step = Math.max(1, Math.floor(n / 200000));
      for (let i = 0; i < n; i += step) {
        if (near[i] > 0.02 && m[i] < 0.05 && rho[i] > rhoF + 0.12 && L[i] > 40) {
          skinRho.push(rho[i]);
          skinL.push(L[i]);
        }
      }
      const median = a => a.sort((x, y) => x - y)[a.length >> 1];
      let rhoS = skinRho.length > 200 / step ? median(skinRho) : rhoF + 0.38;
      const sL = skinL.length > 200 / step ? median(skinL) : fL * 3;
      // A warm fabric (red, brown, beige) leaves no room to tell skin apart: then only brightness is evened out.
      const unmix = rhoS - rhoF > 0.08;
      if (!unmix) rhoS = rhoF + 1;
      const rr = clamp(fL / Math.max(1, sL), 0.1, 3);

      // Hair or skin on top of the fabric: (almost) pure skin warmth.
      const wRaw = blur(new Float32Array(rho), 1);
      for (let i = 0; i < n; i++) wRaw[i] = (wRaw[i] - rhoF) / (rhoS - rhoF);
      const hot = new Float32Array(n);
      for (let i = 0; i < n; i++) hot[i] = unmix && wRaw[i] > 0.6 && m[i] > 0.05 ? 1 : 0;
      const strands = opts.refine !== false || unmix ? strandDetail(L, w, h, Math.max(1, Math.round(sc))) : null;
      if (opts.refine !== false) {
        // A rough selection may hold skin or hair: along its edge (skin there is also far brighter than a
        // dark fabric gets) and as larger areas inside (warm, or bright and perfectly smooth: fabric that
        // lets skin through always shows its knit). Those leave the selection; hair is caught again below.
        const outside = new Uint8Array(n);
        for (let i = 0; i < n; i++) outside[i] = m[i] < 0.5 ? 1 : 0;
        const dOut = PW.distanceField(outside, w, h), d2 = (20 * sc) ** 2, bright = Math.max(fL * 2.2, fL + 60);
        // Brighter than three quarters of the way from fabric to skin: no mix of the two gets there.
        const skinLike = sL > fL + 20 ? fL + 0.75 * (sL - fL) : Infinity;
        const plain = blur(new Float32Array(strands), 12 * sc), big = new Float32Array(n);
        for (let i = 0; i < n; i++) big[i] = hot[i] || L[i] > skinLike || (L[i] > bright && plain[i] < 0.8) ? 1 : 0;
        blur(big, 6 * sc);
        for (let i = 0; i < n; i++) big[i] = big[i] > 0.85 ? 1 : 0;
        blur(big, 6 * sc);
        for (let i = 0; i < n; i++) {
          if (m[i] > 0.05 && (big[i] > 0.15 || (dOut[i] <= d2 && (hot[i] || L[i] > bright)))) {
            m[i] = 0;
            hot[i] = 0;
          }
        }
      }
      // Hair next to the selection: warm and full of strands. Smooth skin and plain edges are not.
      if (unmix) {
        const near = blur(new Float32Array(strands), 6 * sc);
        for (let i = 0; i < n; i++) if (m[i] <= 0.05 && wRaw[i] > 0.45 && near[i] > 1.2) hot[i] = 1;
      }
      const hair = blur(hot, 4 * sc);
      for (let i = 0; i < n; i++) hair[i] = hair[i] > 0.1 ? 1 : 0;
      // Wide soft zone around hair; the warm pixels themselves (also thin skin strips at the edge) stay fully original.
      const hz = blur(new Float32Array(hair), 14 * sc), hn = blur(new Float32Array(hot), 1.5);
      for (let i = 0; i < n; i++) hz[i] = Math.min(1, Math.max(hz[i] * 1.8, hn[i] * 1.5));
      const core = new Float32Array(n);
      for (let i = 0; i < n; i++) core[i] = m[i] > 0.5 && !hair[i] ? 1 : 1e-3;
      // Where the selection stops in the middle of the fabric, the change fades out instead of leaving an edge.
      const rB = blur(new Float32Array(rho), 2), lB = blur(new Float32Array(L), 2), seam = new Float32Array(n);
      const lTol = Math.max(30, fL * 0.45);
      for (let i = 0; i < n; i++) seam[i] = m[i] < 0.5 && Math.abs(rB[i] - rhoF) < 0.12 && Math.abs(lB[i] - fL) < lTol ? 1 : 0;
      blur(seam, 14 * sc);
      for (let i = 0; i < n; i++) seam[i] = Math.min(1, seam[i] * 3);

      // Un-mixing: observed = fabric + share w of skin; the opaque fabric is darker by fabric/skin brightness.
      const wl = unmix ? nblur(rho, core, w, h, 14 * sc, tmp) : null;
      const wv = new Float32Array(n), U = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        wv[i] = unmix ? clamp((wl[i] - rhoF) / (rhoS - rhoF), 0, 0.6) * 1.6 : 0;
        U[i] = L[i] * Math.max(0.2, 1 - wv[i] * (1 - rr));
      }
      // The un-mixed brightness in layers: lighting and body shape stay, lines and blotches go, knit evened out.
      const U3 = nblur(U, core, w, h, 2 * sc, tmp), U25 = nblur(U, core, w, h, 25 * sc, tmp), U150 = nblur(U, core, w, h, 150 * sc, tmp);
      this.tex = new Float32Array(n);
      this.mid = new Float32Array(n);
      this.big = new Float32Array(n);
      const tex2 = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.tex[i] = U[i] - U3[i];
        this.mid[i] = U3[i] - U25[i];
        this.big[i] = U25[i] - U150[i];
        tex2[i] = this.tex[i] * this.tex[i];
      }
      this.base = U150;
      const sd = nblur(tex2, core, w, h, 12 * sc, tmp);
      for (let i = 0; i < n; i++) sd[i] = Math.sqrt(Math.max(sd[i], 1e-4));
      const texRef = percentile(sd, opaqueStrict, 0.5) || percentile(sd, inside, 0.3);
      this.gain = new Float32Array(n);
      for (let i = 0; i < n; i++) this.gain[i] = clamp(texRef / sd[i], 0.4, 1.4);
      this.grainAmp = 0.6 * texRef;
      this.ch = ch;
      this.chLf = ch.map(p => nblur(p, core, w, h, 4 * sc, tmp));
      this.w = wv;
      // Soft inner edge; hair zone and open edges inside the fabric stay original.
      const edge = blur(new Float32Array(m), 1.5);
      this.alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) this.alpha[i] = m[i] > 0.002 ? Math.min(m[i], edge[i]) * (1 - hz[i]) * (1 - seam[i]) : 0;
      this.baseAlpha = this.alpha;
      this.m = m;
      this.L = L;
      this.wRaw = wRaw;
      this.fL = fL;
      this.contrast = clamp(fL / 56, 0.7, 2.5);
      this.sc = sc;
      this.noise = noisePlane(n);
      this.zones = {};
      const refL = luma(ref[0], ref[1], ref[2]);
      this.refL = refN ? refL : fL;
      this.refCh = refN ? ref.map(v => v - refL) : [0, 0, 0];
      this.colors = this.analyse(refN ? rgbToHex(ref[0], ref[1], ref[2]) : null);
      this.layer = doc.createLayer('Blickdicht');
      doc.addLayer(this.layer, doc.layers.indexOf(photo) + 1);
    }

    // z: { lines: [{points, width}], areas: [{points}], keep: [{points}] } in document pixels.
    setZones(z = {}) {
      const r = this.region, sc = this.sc;
      this.zones = {
        line: zoneMask(r, z.lines, 'line', 10 * sc),
        area: zoneMask(r, z.areas, 'area', 28 * sc),
        keep: zoneMask(r, z.keep, 'area', 25 * sc),
      };
      // In "keep" zones every warm or bright pixel (single hair strands) stays original.
      const k = this.zones.keep;
      this.alpha = this.baseAlpha;
      if (k) {
        this.alpha = new Float32Array(this.baseAlpha);
        for (let i = 0; i < k.length; i++) {
          if (!k[i]) continue;
          const fabric = (1 - smooth(0.35, 0.6, this.wRaw[i])) * (1 - smooth(28, 48, this.L[i] - this.fL));
          this.alpha[i] *= 1 - k[i] * (1 - fabric);
        }
      }
    }

    // The fabric's own opaque colour plus light / middle / dark guesses from the selected pixels.
    analyse(own) {
      const d = this.src.data, s = [];
      const step = Math.max(1, Math.floor(this.m.length / 60000));
      for (let i = 0; i < this.m.length; i += step) {
        if (this.m[i] < 0.5) continue;
        const j = i * 4;
        s.push([d[j], d[j + 1], d[j + 2], this.L[i]]);
      }
      if (!s.length) return null;
      s.sort((a, b) => a[3] - b[3]);
      const mean = (from, to) => {
        const part = s.slice(Math.floor(s.length * from), Math.max(Math.floor(s.length * from) + 1, Math.floor(s.length * to)));
        const t = [0, 0, 0];
        for (const p of part) { t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; }
        return rgbToHex(t[0] / part.length, t[1] / part.length, t[2] / part.length);
      };
      const dark = mean(0.1, 0.4);
      return { own: own || dark, light: mean(0.7, 1), mid: mean(0.4, 0.6), dark };
    }

    defaultColor() {
      return this.colors.own;
    }

    // p: { strength 0–100, color hex, texture 0–120, hideLines bool }
    render(p) {
      const { w, h, x: rx, y: ry } = this.region, n = w * h;
      const own = this.colors.own;
      const c = hexToRgb(p.color) || hexToRgb(own);
      const tL = luma(c.r, c.g, c.b), tc = [c.r - tL, c.g - tL, c.b - tL];
      // Own colour: only what shows through changes. Another colour: the whole fabric takes it on.
      const custom = rgbToHex(c.r, c.g, c.b).toLowerCase() !== String(own).toLowerCase();
      const ls = custom ? tL / Math.max(1, this.refL) : 1;
      const s = clamp(p.strength / 100, 0, 1), tk = clamp(p.texture / 100, 0, 1.2);
      const t0 = 9 * this.contrast, t1 = 24 * this.contrast;
      const d = this.src.data, out = new ImageData(w, h), o = out.data;
      const { line, area, keep } = this.zones;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const a = this.alpha[i];
        if (!a) continue;
        const big = this.big[i], mv = this.mid[i];
        let lg = big > 0 ? big * 0.5 : big;
        // Faint lines and blotches (underwear edges, patterns) go; strong folds stay.
        let md;
        if (p.hideLines) md = mv > 0 ? mv * 0.2 : mv * (0.1 + 0.8 * smooth(t0, t1, -mv));
        else md = mv > 0 ? mv * 0.3 : mv * 0.9;
        let tki = tk, gi = this.gain[i], hf = 0.6;
        const az = area ? area[i] : 0, lz = line ? line[i] : 0, kz = keep ? keep[i] : 0;
        if (az) {
          md += (mv * 0.15 - md) * az;
          lg += ((big > 0 ? big * 0.15 : big * 0.6) - lg) * az;
          hf *= 1 - 0.5 * az;
        }
        if (lz) {
          md += (mv * 0.05 - md) * lz;
          lg += (Math.min(lg, 0) * 0.3 - lg) * lz;
        }
        if (kz) {
          md += (mv - md) * kz;
          tki += (1 - tki) * kz;
          gi += (1 - gi) * kz;
          hf += (1 - hf) * kz;
        }
        // The photo's own grain goes back where the knit was toned down, so the area matches.
        const e = gi * tki;
        const grain = this.noise[i] * this.grainAmp * Math.sqrt(Math.max(0, 1 - e * e));
        const Lo = (this.base[i] + lg + md + this.tex[i] * e + grain) * ls;
        const wc = custom ? 0.85 : Math.min(1, this.w[i] * 1.6);
        for (let k = 0; k < 3; k++) {
          const lf = this.chLf[k][i];
          const cv = lf + ((custom ? tc[k] : this.refCh[k]) - lf) * wc + (this.ch[k][i] - lf) * hf;
          const orig = d[j + k];
          o[j + k] = orig + (Lo + cv - orig) * s;
        }
        o[j + 3] = a * 255;
      }
      const g = this.layer.ctx;
      g.clearRect(0, 0, this.layer.width, this.layer.height);
      g.putImageData(out, rx, ry);
      this.layer.touch();
    }

    cancel() {
      this.doc.removeLayer(this.layer.id);
      this.doc.setActive(this.photo.id);
    }
  }

  // ─── Select a garment from a point on it (used by the assistant; rough box keeps it local) ───
  // Takes pixels whose colour is close to the fabric's, allowing much lighter tones (see-through
  // parts) but not warmer ones (skin, hair); enclosed holes are filled.
  function selectGarment(doc, { x, y, box, lighter = 55, darker = 45, warmer = 20 }) {
    const W = doc.width, H = doc.height;
    const b = clipRect(box || { x: 0, y: 0, w: W, h: H }, W, H);
    if (!b) throw new Error('Der Rahmen liegt außerhalb des Bildes.');
    const sx = Math.round(x), sy = Math.round(y);
    if (sx < b.x || sy < b.y || sx >= b.x + b.w || sy >= b.y + b.h) throw new Error('Der Startpunkt muss innerhalb des Rahmens liegen.');
    const img = doc.flattened().getContext('2d').getImageData(b.x, b.y, b.w, b.h);
    const d = img.data, w = b.w, h = b.h, n = w * h;
    const L = new Float32Array(n), RB = new Float32Array(n), GB = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      L[i] = luma(d[j], d[j + 1], d[j + 2]);
      RB[i] = d[j] - d[j + 2];
      GB[i] = d[j + 1] - d[j + 2];
    }
    const tmp = new Float32Array(n), Lc = new Float32Array(L);
    for (const p of [L, RB, GB]) PW.filters.blurPlane(p, w, h, 1.5, tmp);
    // Darker parts (seams, double layers) are judged on a coarser scale so the cut runs smoothly.
    PW.filters.blurPlane(Lc, w, h, (4 * Math.max(W, H)) / 2000, tmp);
    const si = (sy - b.y) * w + (sx - b.x);
    // Seed colour: median of a small window.
    const win = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const yy = clamp(sy - b.y + dy, 0, h - 1), xx = clamp(sx - b.x + dx, 0, w - 1), k = yy * w + xx;
      win.push([L[k], RB[k], GB[k]]);
    }
    const med = k => win.map(v => v[k]).sort((a, c) => a - c)[win.length >> 1];
    const L0 = med(0), RB0 = med(1), GB0 = med(2);
    const ok = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      ok[i] = L[i] - L0 <= lighter && Lc[i] - L0 >= -darker && RB[i] - RB0 <= warmer && Math.abs(GB[i] - GB0) <= warmer * 0.8 ? 1 : 0;
    }
    if (!ok[si]) throw new Error('Am Startpunkt ist kein Stoff erkennbar. Wähle einen Punkt mitten auf dem Kleidungsstück.');
    // Connected region from the seed.
    const stack = new Int32Array(n);
    const grow = (allowed, from) => {
      const sel = new Uint8Array(n);
      let sp = 0;
      stack[sp++] = from;
      sel[from] = 1;
      while (sp) {
        const i = stack[--sp], yy = (i / w) | 0, xx = i - yy * w;
        if (xx > 0 && allowed[i - 1] && !sel[i - 1]) { sel[i - 1] = 1; stack[sp++] = i - 1; }
        if (xx < w - 1 && allowed[i + 1] && !sel[i + 1]) { sel[i + 1] = 1; stack[sp++] = i + 1; }
        if (yy > 0 && allowed[i - w] && !sel[i - w]) { sel[i - w] = 1; stack[sp++] = i - w; }
        if (yy < h - 1 && allowed[i + w] && !sel[i + w]) { sel[i + w] = 1; stack[sp++] = i + w; }
      }
      return sel;
    };
    let sel = grow(ok, si);
    // Opening: thin slivers along neighbouring edges and whatever hangs on them (e.g. a shadow
    // in the neckline) fall away; the garment itself keeps its outline.
    const r = Math.max(3, Math.round((4 * Math.max(W, H)) / 2000)), r2 = r * r;
    const dOut = PW.distanceField(sel.map(v => 1 - v), w, h);
    const core = new Uint8Array(n);
    for (let i = 0; i < n; i++) core[i] = dOut[i] > r2 ? 1 : 0;
    let ci = core[si] ? si : -1;
    if (ci < 0) {
      // Seed close to an edge: start from the nearest core pixel.
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        if (!core[i]) continue;
        const yy = (i / w) | 0, xx = i - yy * w, dd = (xx - (si % w)) ** 2 + (yy - ((si / w) | 0)) ** 2;
        if (dd < best) { best = dd; ci = i; }
      }
    }
    if (ci >= 0) {
      const kept = grow(core, ci), dIn = PW.distanceField(kept, w, h);
      for (let i = 0; i < n; i++) sel[i] = dIn[i] <= r2 && sel[i] ? 1 : 0;
    }
    // Fill holes: everything not reachable from the box border through unselected pixels.
    const out = new Uint8Array(n);
    let sp = 0;
    const push = i => { if (!sel[i] && !out[i]) { out[i] = 1; stack[sp++] = i; } };
    for (let xx = 0; xx < w; xx++) { push(xx); push((h - 1) * w + xx); }
    for (let yy = 0; yy < h; yy++) { push(yy * w); push(yy * w + w - 1); }
    while (sp) {
      const i = stack[--sp], yy = (i / w) | 0, xx = i - yy * w;
      if (xx > 0) push(i - 1);
      if (xx < w - 1) push(i + 1);
      if (yy > 0) push(i - w);
      if (yy < h - 1) push(i + w);
    }
    // Smooth the outline (a ragged edge shows as blotches next to seams), then a soft edge.
    const soft = new Float32Array(n);
    for (let i = 0; i < n; i++) soft[i] = out[i] ? 0 : 1;
    PW.filters.blurPlane(soft, w, h, r * 1.5, tmp);
    let count = 0;
    for (let i = 0; i < n; i++) {
      soft[i] = soft[i] >= 0.5 ? 255 : 0;
      if (soft[i]) count++;
    }
    PW.filters.blurPlane(soft, w, h, 1.2, tmp);
    const alpha = new Uint8Array(W * H);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) alpha[(b.y + yy) * W + b.x + xx] = soft[yy * w + xx];
    doc.selection.fromAlpha(alpha, 'replace');
    return { pixels: count, share: Math.round((count / n) * 100) };
  }

  // ─── Non-interactive apply (assistant) ───
  function apply(params = {}) {
    const a = app(), doc = a.doc;
    if (!doc) throw new Error('Es ist kein Bild geöffnet.');
    if (doc.selection.empty) throw new Error('Es ist nichts ausgewählt. Wähle zuerst das Kleidungsstück aus.');
    const photo = PW.guide.photoLayer();
    if (!photo) throw new Error('Keine Bildebene gefunden.');
    const session = new FabricSession(doc, photo, { refine: params.refine !== false });
    if (!session.colors) {
      session.cancel();
      throw new Error('Im ausgewählten Bereich sind keine Pixel.');
    }
    const colorKey = params.color && session.colors[params.color] ? params.color : null;
    const p = {
      strength: clamp(Number(params.strength ?? 100), 0, 100),
      texture: clamp(Number(params.texture ?? 100), 0, 120),
      hideLines: params.hide_lines !== false,
      color: colorKey ? session.colors[colorKey] : /^#?[0-9a-f]{6}$/i.test(String(params.color || '')) ? `#${String(params.color).replace('#', '')}` : session.defaultColor(),
    };
    session.setZones({ lines: params.lines, areas: params.areas, keep: params.keep });
    session.render(p);
    doc.selection.clear();
    doc.setActive(session.layer.id);
    a.commit('Stoff blickdichter', 'shirt');
    return { layer: session.layer.name, color: p.color, strength: p.strength };
  }

  // ─── Interactive dialog ───
  async function openDialog() {
    const a = app(), doc = a.doc;
    const photo = PW.guide.photoLayer();
    if (!photo) return;
    const session = new FabricSession(doc, photo);
    if (!session.colors) {
      session.cancel();
      return a.toast('Im ausgewählten Bereich sind keine Pixel. Umfahre das Oberteil noch einmal.');
    }
    const cols = session.colors;
    const p = { strength: 100, texture: 100, hideLines: true, color: session.defaultColor() };
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        session.render(p);
        a.render();
      });
    };

    const colorCtl = PW.ui.control({ type: 'color', key: 'color', label: 'Eigene', title: 'Eigene Stofffarbe wählen' }, p.color, v => {
      p.color = v;
      chips.forEach(ch => ch.setAttribute('aria-pressed', 'false'));
      update();
    });
    let marked = false;
    const chips = [['Wie der Stoff', cols.own], ['Hell', cols.light], ['Mittel', cols.mid], ['Dunkel', cols.dark]].map(([label, hex]) => {
      const on = !marked && hex === p.color;
      if (on) marked = true;
      const b = el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(on) }, [el('i', { style: { background: hex } }), label]);
      b.addEventListener('click', () => {
        p.color = hex;
        chips.forEach(ch => ch.setAttribute('aria-pressed', String(ch === b)));
        colorCtl.update(hex);
        update();
      });
      return b;
    });

    const content = el('div', { class: 'form-grid fabric' }, [
      el('p', { class: 'dlg-info', text: 'Die Vorschau zeigt das Ergebnis sofort. Das Original bleibt erhalten, das Ergebnis liegt auf einer eigenen Ebene.' }),
      PW.ui.control({ type: 'range', key: 'strength', label: 'Stärke', min: 0, max: 100, unit: '%' }, p.strength, v => { p.strength = v; update(); }),
      el('div', { class: 'ctl ctl-chips' }, [el('span', { class: 'lbl', text: 'Farbe des Stoffs' }), el('div', { class: 'chips' }, [...chips, colorCtl])]),
      PW.ui.control({ type: 'range', key: 'texture', label: 'Stoffstruktur', min: 0, max: 120, unit: '%', title: 'Wie deutlich das Gewebe sichtbar bleibt' }, p.texture, v => { p.texture = v; update(); }),
      PW.ui.control({ type: 'check', key: 'hideLines', label: 'Linien und Muster darunter ausblenden (z. B. BH)' }, p.hideLines, v => { p.hideLines = v; update(); }),
    ]);

    session.render(p);
    a.render();
    PW.guide.hideCoach();
    const res = await PW.dialogs.modal({ title: 'Stoff blickdichter machen', content, buttons: [['ok', 'Übernehmen', true], ['cancel', 'Abbrechen']], width: 560 });
    cancelAnimationFrame(raf);
    if (res === 'ok') {
      session.render(p);
      doc.selection.clear();
      doc.setActive(session.layer.id);
      a.commit('Stoff blickdichter', 'shirt');
      a.setTool('move');
      PW.guide.coach('Fertig! Feiner einstellen: rechts bei „Ebenen“ den Regler „Deckkraft“ der Ebene „Blickdicht“ verschieben. Speichern: „Bild speichern“ im Schnellstart.', 'check');
    } else {
      session.cancel();
      a.render();
    }
  }

  // Entry point: walks the user through open → select → adjust.
  function start() {
    const a = app();
    PW.ui.closeMenus();
    if (!a.doc || (a.doc.isSample && !a.doc.dirty)) {
      pending = 'doc';
      pendingAt = Date.now();
      a.toast('Wähle zuerst das Foto aus.');
      PW.runAction('file.open');
      return;
    }
    a.finishToolWork();
    if (a.doc.selection.empty) {
      pending = 'select';
      a.setTool('lasso');
      PW.tools.byId.lasso.options.mode = 'replace';
      PW.guide.coach('Schritt 1: Fahre mit gedrückter Maustaste (oder mit dem Finger) einmal grob rund um das Oberteil. Haut und Haare werden automatisch ausgespart. Danach öffnen sich die Regler von selbst.', 'lasso');
      if (matchMedia('(max-width: 900px)').matches) document.body.classList.remove('dock-open');
      return;
    }
    pending = null;
    openDialog();
  }

  PW.bus.on('history:changed', doc => {
    const a = app();
    if (pending !== 'select' || !doc || doc !== a.doc || doc.selection.empty) return;
    const cur = doc.history.current;
    if (!cur || !SELECT_STEPS.includes(cur.name)) return;
    pending = null;
    setTimeout(openDialog, 150);
  });

  PW.bus.on('doc:switched', doc => {
    if (pending === 'doc' && doc && !doc.isSample && Date.now() - pendingAt < 5 * 60000) setTimeout(start, 200);
  });

  PW.fabric = { start, openDialog, apply, selectGarment, FabricSession };
})(window.PW);
