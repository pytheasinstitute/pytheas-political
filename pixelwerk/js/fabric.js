// ─── "Stoff blickdichter machen": cover see-through fabric so nothing shows underneath ───
// Splits the brightness into lighting, body shape, mid-scale detail (what shows through:
// skin, underwear edges, patterns) and fine knit. The see-through parts are flattened, real
// folds and the knit stay, and the knit is evened out so nothing outlines what was beneath.
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

  class FabricSession {
    // opts.refine: drop clearly warmer pixels (skin, hair) from a rough selection.
    constructor(doc, photo, opts = {}) {
      this.doc = doc;
      this.photo = photo;
      const sel = doc.selection, b = sel.bounds, W = doc.width;
      this.W = W;
      const margin = 24;
      const r = (this.region = clipRect({ x: b.x - margin, y: b.y - margin, w: b.w + margin * 2, h: b.h + margin * 2 }, doc.width, doc.height));
      const { w, h } = r, n = w * h;
      this.src = photo.ctx.getImageData(r.x, r.y, w, h);
      const d = this.src.data, selA = sel.alpha();
      const m = new Float32Array(n);
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) m[i] = selA[(r.y + y) * W + r.x + x] / 255;

      const L = new Float32Array(n), RB = new Float32Array(n);
      const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const l = luma(d[j], d[j + 1], d[j + 2]);
        L[i] = l;
        RB[i] = d[j] - d[j + 2];
        ch[0][i] = d[j] - l;
        ch[1][i] = d[j + 1] - l;
        ch[2][i] = d[j + 2] - l;
      }

      // Opaque fabric reference: the darker part of the selection.
      const darkL = percentile(L, m, 0.3);
      let rbSum = 0, rbN = 0;
      for (let i = 0; i < n; i++) if (m[i] > 0.5 && L[i] <= darkL) { rbSum += RB[i]; rbN++; }
      const refRB = rbN ? rbSum / rbN : 0;

      if (opts.refine !== false) {
        // Skin and hair are much warmer than the fabric (even where it is see-through); small specks are ignored.
        const warm = new Float32Array(n);
        for (let i = 0; i < n; i++) warm[i] = smooth(24, 38, RB[i] - refRB) * smooth(0, 1, m[i]);
        const t = new Float32Array(n);
        PW.filters.blurPlane(warm, w, h, 3, t);
        for (let i = 0; i < n; i++) m[i] *= 1 - clamp((warm[i] - 0.35) / 0.3, 0, 1);
      }
      this.m = m;
      const core = new Float32Array(n);
      for (let i = 0; i < n; i++) core[i] = m[i] > 0.5 ? 1 : 1e-3;

      const sc = Math.max(0.5, Math.max(doc.width, doc.height) / 2000), tmp = new Float32Array(n);
      const L3 = nblur(L, core, w, h, 2 * sc, tmp), L25 = nblur(L, core, w, h, 25 * sc, tmp);
      const G150 = nblur(L, core, w, h, 150 * sc, tmp), G400 = nblur(L, core, w, h, 400 * sc, tmp);
      this.tex = new Float32Array(n);
      this.mid = new Float32Array(n);
      this.large = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        this.tex[i] = L[i] - L3[i];
        this.mid[i] = L3[i] - L25[i];
        this.large[i] = L25[i] - G150[i];
      }
      // Even out the knit: its local strength everywhere like in the opaque parts.
      const tex2 = new Float32Array(n);
      for (let i = 0; i < n; i++) tex2[i] = this.tex[i] * this.tex[i];
      const sd = nblur(tex2, core, w, h, 12 * sc, tmp);
      for (let i = 0; i < n; i++) sd[i] = Math.sqrt(Math.max(sd[i], 1e-4));
      const target = percentile(sd, m, 0.3);
      this.gain = new Float32Array(n);
      for (let i = 0; i < n; i++) this.gain[i] = clamp(target / sd[i], 0.25, 1.4);
      const gMean = (() => {
        let s = 0, c = 0;
        for (let i = 0; i < n; i++) if (m[i] > 0.5) { s += G400[i]; c++; }
        return c ? s / c : 1;
      })();
      this.light = new Float32Array(n);
      for (let i = 0; i < n; i++) this.light[i] = Math.sqrt(Math.max(0.2, G400[i] / (gMean || 1)));
      this.chLf = ch.map(p => nblur(p, core, w, h, 4 * sc, tmp));
      this.ch = ch;
      // Soft inner edge so the cover blends into the photo.
      const edge = new Float32Array(m);
      PW.filters.blurPlane(edge, w, h, 1.5, tmp);
      this.alpha = new Float32Array(n);
      for (let i = 0; i < n; i++) this.alpha[i] = m[i] > 0.002 ? Math.min(m[i], edge[i]) : 0;
      this.L = L;
      this.RB = RB;
      this.refRB = refRB;
      this.refL = percentile(L, m, 0.5);
      this.baseAlpha = this.alpha;
      this.sc = sc;
      this.noise = noisePlane(n);
      this.zones = {};
      this.colors = this.analyse(darkL);
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
          const fabric = (1 - smooth(10, 20, this.RB[i] - this.refRB)) * (1 - smooth(28, 48, this.L[i] - this.refL));
          this.alpha[i] *= 1 - k[i] * (1 - fabric);
        }
      }
    }

    // Light / middle / dark fabric colour guesses from the selected pixels.
    analyse() {
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
      const avgL = s.reduce((t, p) => t + p[3], 0) / s.length;
      return { light: mean(0.7, 1), mid: mean(0.4, 0.6), dark: mean(0.1, 0.4), avgL };
    }

    defaultColor() {
      return this.colors.avgL > 140 ? this.colors.light : this.colors.avgL > 100 ? this.colors.mid : this.colors.dark;
    }

    // p: { strength 0–100, color hex, texture 0–100, hideLines bool }
    render(p) {
      const { w, h, x: rx, y: ry } = this.region, n = w * h;
      const c = hexToRgb(p.color) || hexToRgb(this.defaultColor());
      const tL = luma(c.r, c.g, c.b), tc = [c.r - tL, c.g - tL, c.b - tL];
      const s = clamp(p.strength / 100, 0, 1), tk = clamp(p.texture / 100, 0, 1.2);
      const d = this.src.data, out = new ImageData(w, h), o = out.data;
      const { line, area, keep } = this.zones;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const a = this.alpha[i];
        if (!a) continue;
        const big = this.large[i], mv = this.mid[i];
        let lg = big > 0 ? big * 0.12 : big * 0.9;
        // Faint lines and blotches (underwear edges, patterns) go; strong folds stay.
        let md;
        if (p.hideLines) md = mv > 0 ? mv * 0.2 : mv * (0.1 + 0.8 * smooth(6, 16, -mv));
        else md = mv > 0 ? mv * 0.3 : mv * 0.85;
        let tki = tk, gi = this.gain[i], hf = 0.6;
        const az = area ? area[i] : 0, lz = line ? line[i] : 0, kz = keep ? keep[i] : 0;
        if (az) {
          md += (mv * 0.25 - md) * az;
          lg += ((big > 0 ? big * 0.08 : big * 0.55) - lg) * az;
          hf *= 1 - 0.5 * az;
        }
        if (lz) {
          md += (mv * 0.08 - md) * lz;
          lg += (Math.min(lg, 0) * 0.3 - lg) * lz;
        }
        if (kz) {
          md += (mv - md) * kz;
          tki += (1 - tki) * kz;
          gi += (1 - gi) * kz;
          hf += (1 - hf) * kz;
        }
        // The photo's own grain goes back where the knit was toned down, so the area matches.
        const grain = this.noise[i] * 0.6 * Math.sqrt(Math.max(0, 1 - tki * tki));
        const Lo = tL * this.light[i] + lg + md + this.tex[i] * gi * tki + grain;
        for (let k = 0; k < 3; k++) {
          const lf = this.chLf[k][i];
          const cv = tc[k] + (lf - tc[k]) * 0.25 + (this.ch[k][i] - lf) * hf;
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
      texture: clamp(Number(params.texture ?? 85), 0, 120),
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
    const p = { strength: 100, texture: 85, hideLines: true, color: session.defaultColor() };
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
    const chips = [['Hell', cols.light], ['Mittel', cols.mid], ['Dunkel', cols.dark]].map(([label, hex]) => {
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
