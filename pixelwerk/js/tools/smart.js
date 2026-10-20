// ─── Smart selections: Motiv auswählen, Objektauswahl, Schnellauswahl, Farbbereich ───
// All run on a working copy of the visible picture (at most ~3 MP, so big photos stay quick);
// the result is scaled back up with a soft edge. The cut itself is PW.segment (GrabCut).
'use strict';

(function (PW) {
  const { createCanvas, clamp, dist, normRect } = PW.util;
  const app = () => PW.app;
  const WORK_PIXELS = 3000000;
  let cache = null;

  // Working copy: { doc, key, f (doc px per work px), w, h, rgb (Float32, 3 per pixel) }.
  function work(doc) {
    const key = doc.history.current;
    if (cache && cache.doc === doc && cache.key === key && cache.W === doc.width && cache.H === doc.height) return cache;
    const f = Math.max(1, Math.sqrt((doc.width * doc.height) / WORK_PIXELS));
    const w = Math.max(1, Math.round(doc.width / f)), h = Math.max(1, Math.round(doc.height / f));
    const c = createCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(doc.composite(), 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, rgb = new Float32Array(w * h * 3);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      rgb[i * 3] = d[j];
      rgb[i * 3 + 1] = d[j + 1];
      rgb[i * 3 + 2] = d[j + 2];
    }
    cache = { doc, key, W: doc.width, H: doc.height, f: doc.width / w, fy: doc.height / h, w, h, rgb };
    return cache;
  }

  // Current selection at working size (0–1).
  function selAtWork(doc, wk) {
    const out = new Float32Array(wk.w * wk.h);
    if (doc.selection.empty) return out;
    const c = createCanvas(wk.w, wk.h), g = c.getContext('2d');
    g.drawImage(doc.selection.mask, 0, 0, wk.w, wk.h);
    const d = g.getImageData(0, 0, wk.w, wk.h).data;
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
    return out;
  }

  // Working-size mask (Uint8 0/1) → document-size alpha with a soft, about one-pixel edge.
  function toDocAlpha(doc, wk, mask) {
    const c = createCanvas(wk.w, wk.h), g = c.getContext('2d'), img = g.createImageData(wk.w, wk.h);
    for (let i = 0; i < mask.length; i++) {
      img.data[i * 4 + 3] = mask[i] ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    const big = createCanvas(doc.width, doc.height), bg = big.getContext('2d');
    bg.imageSmoothingEnabled = true;
    bg.imageSmoothingQuality = 'high';
    bg.drawImage(c, 0, 0, doc.width, doc.height);
    const d = bg.getImageData(0, 0, doc.width, doc.height).data, out = new Uint8Array(doc.width * doc.height);
    // Steeper than the bilinear ramp, so the edge stays crisp after scaling up.
    const k = Math.max(1, wk.f) * 1.2;
    for (let i = 0; i < out.length; i++) out[i] = clamp(Math.round(((d[i * 4 + 3] / 255 - 0.5) * k + 0.5) * 255), 0, 255);
    return out;
  }

  const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  // ─── Motiv auswählen ───
  // box (document px, optional) around the subject; mode replace/add/subtract/intersect.
  async function selectSubject(opts = {}) {
    const a = app(), doc = a.doc;
    if (!doc) return null;
    a.finishToolWork();
    const res = await PW.ui.busy(async () => {
      await tick();
      const wk = work(doc);
      const box = opts.box ? { x: opts.box.x / wk.f, y: opts.box.y / wk.fy, w: opts.box.w / wk.f, h: opts.box.h / wk.fy } : null;
      const mask = PW.segment.subject(wk.rgb, wk.w, wk.h, box);
      return toDocAlpha(doc, wk, mask);
    }, 'Motiv wird gesucht …');
    doc.selection.fromAlpha(res, opts.mode || 'replace');
    a.commit(opts.name || 'Motiv auswählen', 'selection');
    return doc.selection.bounds;
  }

  // ─── Object selection in a rectangle: the object inside is found and cut out ───
  async function selectObject(rect, mode = 'replace') {
    const a = app(), doc = a.doc, wk = work(doc);
    const r = { x: rect.x / wk.f, y: rect.y / wk.fy, w: rect.w / wk.f, h: rect.h / wk.fy };
    if (r.w < 4 || r.h < 4) return null;
    // Work in the rectangle plus a margin; the margin is background.
    const m = Math.max(8, Math.round(Math.max(r.w, r.h) * 0.12));
    const x0 = Math.max(0, Math.floor(r.x - m)), y0 = Math.max(0, Math.floor(r.y - m));
    const x1 = Math.min(wk.w, Math.ceil(r.x + r.w + m)), y1 = Math.min(wk.h, Math.ceil(r.y + r.h + m));
    const cw = x1 - x0, ch = y1 - y0, rgb = new Float32Array(cw * ch * 3), tri = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y0 + y) * wk.w + x0 + x, o = y * cw + x;
        rgb[o * 3] = wk.rgb[i * 3];
        rgb[o * 3 + 1] = wk.rgb[i * 3 + 1];
        rgb[o * 3 + 2] = wk.rgb[i * 3 + 2];
        const X = x0 + x, Y = y0 + y;
        tri[o] = X >= r.x && X < r.x + r.w && Y >= r.y && Y < r.y + r.h ? 2 : 0;
      }
    }
    // If the rectangle touches the picture edge there is no margin: that side stays open.
    let cut = PW.segment.cutOut(rgb, cw, ch, tri);
    cut = PW.segment.fillHoles(PW.segment.keepMain(cut, cw, ch), cw, ch, cw * ch * 0.05);
    const full = new Uint8Array(wk.w * wk.h);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) full[(y0 + y) * wk.w + x0 + x] = cut[y * cw + x];
    doc.selection.fromAlpha(toDocAlpha(doc, wk, full), mode);
    return doc.selection.bounds;
  }

  // ─── Quick selection: strokes grow (or shrink) the selection to the edges nearby ───
  // strokes: [{points: [[x,y],…] in doc px, size: doc px}], mode 'add' | 'subtract'.
  function quickSelect(strokes, mode) {
    const a = app(), doc = a.doc, wk = work(doc);
    const cur = selAtWork(doc, wk);
    // Stroke pixels at working size.
    const sc = createCanvas(wk.w, wk.h), sg = sc.getContext('2d');
    sg.strokeStyle = sg.fillStyle = '#fff';
    sg.lineCap = sg.lineJoin = 'round';
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxR = 4;
    for (const s of strokes) {
      const r = Math.max(1.5, s.size / 2 / wk.f);
      maxR = Math.max(maxR, r);
      sg.lineWidth = r * 2;
      sg.beginPath();
      s.points.forEach(([x, y], i) => {
        const X = x / wk.f, Y = y / wk.fy;
        if (i) sg.lineTo(X, Y);
        else sg.moveTo(X, Y);
        bx0 = Math.min(bx0, X); by0 = Math.min(by0, Y); bx1 = Math.max(bx1, X); by1 = Math.max(by1, Y);
      });
      if (s.points.length === 1) {
        sg.beginPath();
        sg.arc(s.points[0][0] / wk.f, s.points[0][1] / wk.fy, r, 0, Math.PI * 2);
        sg.fill();
      } else sg.stroke();
    }
    if (!isFinite(bx0)) return null;
    const sd = sg.getImageData(0, 0, wk.w, wk.h).data;
    // Only pixels near the stroke may change, like Photoshop's quick selection: adding reaches
    // further into even areas, subtracting stays close to the brush so it stays precise.
    const reach = mode === 'subtract' ? maxR * 4 : Math.max(maxR * 4, Math.max(wk.w, wk.h) / 10);
    const D = clamp(reach, 12, Math.max(wk.w, wk.h) / 4);
    const x0 = Math.max(0, Math.floor(bx0 - D - 2)), y0 = Math.max(0, Math.floor(by0 - D - 2));
    const x1 = Math.min(wk.w, Math.ceil(bx1 + D + 2)), y1 = Math.min(wk.h, Math.ceil(by1 + D + 2));
    const cw = x1 - x0, ch = y1 - y0, rgb = new Float32Array(cw * ch * 3), tri = new Uint8Array(cw * ch), painted = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) painted[y * cw + x] = sd[((y0 + y) * wk.w + x0 + x) * 4 + 3] > 127 ? 1 : 0;
    const d2 = PW.distanceField(painted, cw, ch), D2 = D * D;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y0 + y) * wk.w + x0 + x, o = y * cw + x;
        rgb[o * 3] = wk.rgb[i * 3];
        rgb[o * 3 + 1] = wk.rgb[i * 3 + 1];
        rgb[o * 3 + 2] = wk.rgb[i * 3 + 2];
        const inSel = cur[i] > 0.5, near = d2[o] <= D2;
        // Adding only adds and subtracting only removes; far from the stroke nothing changes.
        if (mode === 'subtract') tri[o] = painted[o] || !inSel ? 0 : near ? 2 : 3;
        else tri[o] = painted[o] || inSel ? 3 : near ? 1 : 0;
      }
    }
    let cut = PW.segment.cutOut(rgb, cw, ch, tri, { iterations: 3, coarsePixels: 40000 });
    if (mode !== 'subtract') cut = PW.segment.fillHoles(cut, cw, ch, Math.max(64, maxR * maxR * 4));
    const full = new Uint8Array(wk.w * wk.h);
    for (let i = 0; i < full.length; i++) full[i] = cur[i] > 0.5 ? 1 : 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) full[(y0 + y) * wk.w + x0 + x] = cut[y * cw + x];
    doc.selection.fromAlpha(toDocAlpha(doc, wk, full), 'replace');
    return doc.selection.bounds;
  }

  // ─── Tools ───
  const MODES = {
    type: 'buttons', key: 'mode', options: [
      ['replace', 'sel-new', 'Neue Auswahl'],
      ['add', 'sel-add', 'Der Auswahl hinzufügen (Umschalt)'],
      ['subtract', 'sel-sub', 'Von Auswahl subtrahieren (Alt)'],
    ],
  };
  const SUBJECT_BTN = { type: 'action', label: 'Motiv auswählen', icon: 'subject', run: () => selectSubject() };
  const MASK_BTN = { type: 'action', label: 'Auswählen und maskieren …', run: () => PW.runAction('select.refine') };

  function pickMode(tool, p) {
    if (p.alt) return 'subtract';
    if (p.shift) return 'add';
    return tool.options.mode;
  }

  PW.tools.register({
    id: 'quickSelect', group: 'wand', name: 'Schnellauswahlwerkzeug', key: 'W', icon: 'quick-select', brushCursor: true,
    options: { size: 40, mode: 'add' },
    bar: [MODES, { type: 'sep' }, { type: 'range', key: 'size', label: 'Größe', min: 3, max: 600, unit: 'Px', log: true }, { type: 'sep' }, SUBJECT_BTN, MASK_BTN],
    hint: 'Über das Motiv malen: die Auswahl wächst bis zu den Kanten. Alt + Malen nimmt weg.',
    cursorSize() { return this.options.size; },
    down(p) {
      if (this.working) return;
      let mode = pickMode(this, p);
      // "New" starts fresh with the first stroke, then keeps adding (like Photoshop).
      if (mode === 'replace') {
        app().doc.selection.clear();
        mode = 'add';
        this.options.mode = 'add';
        PW.bus.emit('options:refresh');
      }
      this.stroke = { mode, points: [[p.x, p.y]] };
      app().render();
    },
    move(p) {
      if (!this.stroke) return;
      const last = this.stroke.points[this.stroke.points.length - 1];
      if (dist({ x: last[0], y: last[1] }, p) * app().view.zoom >= 3) this.stroke.points.push([p.x, p.y]);
      app().render();
    },
    async up() {
      if (!this.stroke || this.working) return;
      const s = this.stroke;
      this.stroke = null;
      this.working = true;
      try {
        await PW.ui.busy(async () => {
          await tick();
          quickSelect([{ points: s.points, size: this.options.size }], s.mode);
        }, 'Auswahl wird angepasst …');
        app().commit('Schnellauswahl', 'selection');
      } catch (e) {
        app().toast(e.message || String(e));
      } finally {
        this.working = false;
        app().render();
      }
    },
    cancel() {
      this.stroke = null;
      app().render();
    },
    drawOverlay(g, view) {
      if (this.stroke && this.stroke.points.length) {
        g.save();
        g.lineCap = g.lineJoin = 'round';
        g.lineWidth = Math.max(2, this.options.size * view.zoom);
        g.strokeStyle = this.stroke.mode === 'subtract' ? 'rgba(233,60,110,0.35)' : 'rgba(59,140,240,0.35)';
        g.beginPath();
        this.stroke.points.forEach(([x, y], i) => {
          const s = view.ds(x, y);
          if (i) g.lineTo(s.x, s.y);
          else g.moveTo(s.x, s.y);
        });
        if (this.stroke.points.length === 1) {
          const s = view.ds(...this.stroke.points[0]);
          g.lineTo(s.x + 0.01, s.y);
        }
        g.stroke();
        g.restore();
      }
      const h = view.hover;
      if (!h) return;
      const s = view.ds(h.x, h.y), r = Math.max(3, (this.options.size / 2) * view.zoom);
      g.beginPath();
      g.arc(s.x, s.y, r, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.lineWidth = 2.5;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(s.x - 4, s.y);
      g.lineTo(s.x + 4, s.y);
      if (this.options.mode !== 'subtract') {
        g.moveTo(s.x, s.y - 4);
        g.lineTo(s.x, s.y + 4);
      }
      g.stroke();
    },
  });

  PW.tools.register({
    id: 'objectSelect', group: 'wand', name: 'Objektauswahlwerkzeug', key: 'W', icon: 'object-select',
    options: { mode: 'replace' },
    bar: [MODES, { type: 'sep' }, SUBJECT_BTN, MASK_BTN],
    hint: 'Ein Rechteck um das Objekt ziehen: es wird genau ausgewählt.',
    down(p) {
      if (this.working) return;
      this.mode = pickMode(this, p);
      this.start = { x: p.x, y: p.y };
      this.cur = { x: p.x, y: p.y };
    },
    move(p) {
      if (!this.start) return;
      this.cur = { x: p.x, y: p.y };
      app().render();
    },
    async up() {
      if (!this.start || this.working) return;
      const r = normRect(this.start.x, this.start.y, this.cur.x, this.cur.y), mode = this.mode;
      this.start = this.cur = null;
      if (r.w * app().view.zoom < 6 || r.h * app().view.zoom < 6) return app().render();
      this.working = true;
      try {
        await PW.ui.busy(async () => {
          await tick();
          selectObject(r, mode);
        }, 'Objekt wird gesucht …');
        app().commit('Objektauswahl', 'selection');
      } catch (e) {
        app().toast(e.message || String(e));
      } finally {
        this.working = false;
        app().render();
      }
    },
    cancel() {
      this.start = this.cur = null;
      app().render();
    },
    drawOverlay(g, view) {
      if (!this.start) return;
      const a = view.ds(this.start.x, this.start.y), b = view.ds(this.cur.x, this.cur.y);
      g.save();
      g.lineWidth = 1;
      g.strokeStyle = '#fff';
      g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.setLineDash([4, 4]);
      g.strokeStyle = '#000';
      g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.restore();
    },
  });

  // ─── Farbbereich: select by colour (sampled or a preset range) ───
  // spec: { colors: [[r,g,b]…], fuzziness 0–200 } or { preset: 'reds'|…|'skin'|'highlights'|'midtones'|'shadows' }
  function colorRangeAlpha(data, n, spec) {
    const out = new Uint8Array(n);
    const fz = clamp(spec.fuzziness ?? 40, 0, 200);
    const hueOf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d) return { h: 0, s: 0, l: (mx + mn) / 510 };
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      return { h, s: d / Math.max(1, mx), l: (mx + mn) / 510 };
    };
    const HUES = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 };
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      let v = 0;
      if (spec.colors && spec.colors.length) {
        // Distance in a roughly perceptual space; fuzziness sets how far still counts.
        let best = Infinity;
        for (const c of spec.colors) {
          const dr = r - c[0], dg = g - c[1], db = b - c[2], rm = (r + c[0]) / 2;
          const d = Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3;
          if (d < best) best = d;
        }
        v = 1 - clamp((best - fz * 0.25) / Math.max(1, fz * 0.5), 0, 1);
      } else if (spec.preset in HUES) {
        const c = hueOf(r, g, b);
        let dh = Math.abs(c.h - HUES[spec.preset]);
        if (dh > 180) dh = 360 - dh;
        // Full inside ±8°, gone at ±25° (oranges and skin are not reds).
        v = clamp((25 - dh) / 17, 0, 1) * clamp((c.s - 0.15) / 0.2, 0, 1);
      } else if (spec.preset === 'skin') {
        const c = hueOf(r, g, b);
        v = clamp(1 - Math.abs(c.h - 22) / 22, 0, 1) * clamp((c.s - 0.12) / 0.15, 0, 1) * clamp(1 - Math.abs(c.s - 0.4) / 0.35, 0, 1) * clamp((c.l - 0.15) / 0.15, 0, 1);
      } else {
        const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (spec.preset === 'highlights') v = clamp((L - 0.6) / 0.15, 0, 1);
        else if (spec.preset === 'shadows') v = clamp((0.35 - L) / 0.15, 0, 1);
        else v = clamp(1 - Math.abs(L - 0.5) / 0.25, 0, 1);
      }
      out[i] = Math.round(v * 255);
    }
    return out;
  }

  async function colorRangeDialog() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    const el = PW.util.el;
    // Preview at most 360 px wide: click to pick a colour, Shift-click adds one, Alt-click removes.
    const s = Math.min(1, 360 / doc.width, 260 / doc.height), pw = Math.max(1, Math.round(doc.width * s)), ph = Math.max(1, Math.round(doc.height * s));
    const pic = createCanvas(pw, ph), pg = pic.getContext('2d');
    pg.drawImage(doc.composite(), 0, 0, pw, ph);
    const pd = pg.getImageData(0, 0, pw, ph).data;
    const maskC = el('canvas', { class: 'cr-mask', width: pw, height: ph });
    const picC = el('canvas', { class: 'cr-pic', width: pw, height: ph });
    picC.getContext('2d').drawImage(pic, 0, 0);
    const v = { preset: 'sampled', fuzziness: 40, colors: [hexRgb(a.fg)], invert: false };
    const draw = () => {
      const spec = v.preset === 'sampled' ? { colors: v.colors, fuzziness: v.fuzziness } : { preset: v.preset };
      const m = colorRangeAlpha(pd, pw * ph, spec), g = maskC.getContext('2d'), img = g.createImageData(pw, ph);
      for (let i = 0; i < m.length; i++) {
        const x = v.invert ? 255 - m[i] : m[i];
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = x;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    const pick = e => {
      const r = e.target.getBoundingClientRect();
      const x = clamp(Math.floor(((e.clientX - r.left) / r.width) * pw), 0, pw - 1), y = clamp(Math.floor(((e.clientY - r.top) / r.height) * ph), 0, ph - 1);
      const j = (y * pw + x) * 4, c = [pd[j], pd[j + 1], pd[j + 2]];
      if (e.altKey) v.colors = v.colors.filter(k => Math.hypot(k[0] - c[0], k[1] - c[1], k[2] - c[2]) > 30);
      else if (e.shiftKey) v.colors.push(c);
      else v.colors = [c];
      if (!v.colors.length) v.colors = [c];
      v.preset = 'sampled';
      presetCtl.update('sampled');
      draw();
    };
    picC.addEventListener('click', pick);
    maskC.addEventListener('click', pick);
    const presetCtl = PW.ui.control({ type: 'select', key: 'preset', label: 'Auswahl', options: [
      ['sampled', 'Aufgenommene Farben'], ['reds', 'Rottöne'], ['yellows', 'Gelbtöne'], ['greens', 'Grüntöne'], ['cyans', 'Cyantöne'], ['blues', 'Blautöne'], ['magentas', 'Magentatöne'],
      ['skin', 'Hauttöne'], ['highlights', 'Lichter'], ['midtones', 'Mitteltöne'], ['shadows', 'Tiefen'],
    ] }, v.preset, x => { v.preset = x; draw(); });
    const fuzz = PW.ui.control({ type: 'range', key: 'fuzziness', label: 'Toleranz', min: 0, max: 200 }, v.fuzziness, x => { v.fuzziness = x; draw(); });
    const inv = PW.ui.control({ type: 'check', key: 'invert', label: 'Umkehren' }, v.invert, x => { v.invert = x; draw(); });
    draw();
    const res = await PW.dialogs.modal({
      title: 'Farbbereich',
      content: el('div', { class: 'form-grid cr' }, [
        presetCtl, fuzz, inv,
        el('p', { class: 'dlg-info', text: 'Klicke ins Bild, um eine Farbe aufzunehmen. Umschalt-Klick fügt eine Farbe hinzu, Alt-Klick nimmt sie weg. Rechts siehst du die Auswahl (weiß = ausgewählt).' }),
        el('div', { class: 'cr-views' }, [picC, maskC]),
      ]),
      buttons: [['ok', 'OK', true], ['cancel', 'Abbrechen']],
      width: 800,
    });
    if (res !== 'ok') return;
    const full = doc.composite().getContext('2d').getImageData(0, 0, doc.width, doc.height).data;
    const spec = v.preset === 'sampled' ? { colors: v.colors, fuzziness: v.fuzziness } : { preset: v.preset };
    let m = colorRangeAlpha(full, doc.width * doc.height, spec);
    if (v.invert) m = m.map(x => 255 - x);
    doc.selection.fromAlpha(m, 'replace');
    a.commit('Farbbereich', 'selection');
  }

  function hexRgb(hex) {
    const c = PW.util.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
    return [c.r, c.g, c.b];
  }

  // ─── Hintergrund entfernen: subject → refined edge → mask on the photo layer (non-destructive) ───
  // opts.useSelection: take the current selection instead of finding the subject.
  async function removeBackground(opts = {}) {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    const L = doc.active && !doc.active.isText ? doc.active : PW.guide.photoLayer();
    if (!L) return a.toast('Keine Bildebene gefunden.');
    if (L.mask) return a.toast('Die Ebene hat schon eine Maske. Lösche sie zuerst oder nimm eine Kopie der Ebene.');
    if (!(opts.useSelection && !doc.selection.empty)) await selectSubject({ name: 'Motiv auswählen' });
    if (doc.selection.empty) return a.toast('Es wurde kein Motiv gefunden.');
    await PW.ui.busy(async () => {
      await tick();
      const W = doc.width, H = doc.height, sc = Math.max(1, Math.max(W, H) / 2000);
      const full = doc.composite().getContext('2d').getImageData(0, 0, W, H).data, sa = doc.selection.alpha(), al0 = new Float32Array(W * H);
      for (let i = 0; i < al0.length; i++) al0[i] = sa[i] / 255;
      const al = PW.refineEdge.refine(al0, full, W, H, { radius: 6 * sc, smooth: 0, feather: 0, contrast: 0, shift: 0, scale: sc });
      L.addMask(null, true);
      const g = L.mask.getContext('2d'), img = g.createImageData(W, H);
      for (let i = 0; i < al.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(al[i] * 255);
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      L.editMask = false;
      L.invalidateMask();
      L.touchMask();
      doc.setActive(L.id);
      doc.selection.clear();
    }, 'Kante wird verbessert …');
    a.commit('Hintergrund entfernen', 'mask');
  }

  PW.smartSelect = { removeBackground, work, selectSubject, selectObject, quickSelect, colorRangeAlpha, colorRangeDialog, toDocAlpha };
})(window.PW);
