// ─── Verflüssigen (Liquify): push, pull, swirl, pinch and bloat pixels with a brush ───
// Works on a displacement field: every output pixel shows the source pixel at (x + dx, y + dy).
// Brushes change the field (semi-Lagrangian, so long strokes stay smooth), "Rekonstruieren"
// pulls it back to zero, "Maske fixieren" protects areas. The field lives on a grid of at
// most ~1.5 MP; the preview is drawn at screen size, the result at full size on OK.
'use strict';

(function (PW) {
  const { el, createCanvas, clamp } = PW.util;
  const app = () => PW.app;

  const TOOLS = [
    ['warp', 'Mitziehen-Werkzeug', 'liq-warp', 'W', 'Schiebt Pixel in Zugrichtung.'],
    ['reconstruct', 'Rekonstruktionswerkzeug', 'liq-reconstruct', 'R', 'Malt Änderungen schrittweise zurück.'],
    ['smooth', 'Glättungswerkzeug', 'liq-smooth', 'E', 'Glättet unruhige Verformungen.'],
    ['twirl', 'Strudel-Werkzeug', 'liq-twirl', 'C', 'Dreht im Uhrzeigersinn, mit Alt gegen.'],
    ['pucker', 'Zusammenziehen-Werkzeug', 'liq-pucker', 'S', 'Zieht zur Pinselmitte hin, verkleinert.'],
    ['bloat', 'Aufblasen-Werkzeug', 'liq-bloat', 'B', 'Drückt von der Mitte weg, vergrößert.'],
    ['freeze', 'Maske-fixieren-Werkzeug', 'liq-freeze', 'F', 'Schützt Bereiche vor Änderungen.'],
    ['thaw', 'Maske-lösen-Werkzeug', 'liq-thaw', 'D', 'Hebt den Schutz wieder auf.'],
  ];

  // Bilinear sample of a float plane (clamped).
  function sample(f, w, h, x, y) {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0;
    const a = f[y0 * w + x0], b = f[y0 * w + x1], c = f[y1 * w + x0], d = f[y1 * w + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  // Bilinear sample of RGBA bytes into out[0..3].
  function sampleRGBA(src, w, h, x, y, out) {
    x = clamp(x, 0, w - 1);
    y = clamp(y, 0, h - 1);
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0;
    const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
    for (let c = 0; c < 4; c++) {
      const a = src[i00 + c], b = src[i10 + c], cc = src[i01 + c], d = src[i11 + c];
      out[c] = (a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty;
    }
  }

  // ─── The field: grid of displacements in document pixels ───
  class Field {
    constructor(W, H) {
      this.W = W;
      this.H = H;
      this.s = Math.max(1, Math.sqrt((W * H) / 1500000));
      this.w = Math.ceil(W / this.s) + 1;
      this.h = Math.ceil(H / this.s) + 1;
      this.dx = new Float32Array(this.w * this.h);
      this.dy = new Float32Array(this.w * this.h);
      this.freeze = new Float32Array(this.w * this.h);
    }

    // Displacement at document position (x, y).
    at(x, y, out) {
      const gx = x / this.s, gy = y / this.s;
      out[0] = sample(this.dx, this.w, this.h, gx, gy);
      out[1] = sample(this.dy, this.w, this.h, gx, gy);
    }

    // Brush step at document position (cx, cy), radius r (doc px), strength k (0–1).
    // mode: warp (with move vector mv), reconstruct, smooth, twirl (dir ±1), pucker, bloat, freeze, thaw.
    apply(mode, cx, cy, r, k, density, mv, dir) {
      const s = this.s, w = this.w, h = this.h;
      const gx0 = Math.max(0, Math.floor((cx - r) / s)), gx1 = Math.min(w - 1, Math.ceil((cx + r) / s));
      const gy0 = Math.max(0, Math.floor((cy - r) / s)), gy1 = Math.min(h - 1, Math.ceil((cy + r) / s));
      if (gx1 < gx0 || gy1 < gy0) return null;
      const bw = gx1 - gx0 + 1, bh = gy1 - gy0 + 1;
      const odx = new Float32Array(bw * bh), ody = new Float32Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = (gy0 + y) * w + gx0 + x;
        odx[y * bw + x] = this.dx[i];
        ody[y * bw + x] = this.dy[i];
      }
      // Density: how far the full strength reaches towards the rim (Photoshop's "Dichte").
      const inner = clamp(density, 0, 1) * 0.9;
      let smooth = null;
      if (mode === 'smooth') smooth = this.localBlur(gx0, gy0, bw, bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const gx = gx0 + x, gy = gy0 + y, px = gx * s, py = gy * s;
          const d = Math.hypot(px - cx, py - cy) / r;
          if (d >= 1) continue;
          let wgt = d <= inner ? 1 : 1 - (d - inner) / (1 - inner);
          wgt = wgt * wgt * (3 - 2 * wgt);
          const i = gy * w + gx, o = y * bw + x;
          // The mask builds up while the brush is held, like paint with flow.
          if (mode === 'freeze') { this.freeze[i] = Math.min(1, this.freeze[i] + wgt * k * 0.35); continue; }
          if (mode === 'thaw') { this.freeze[i] = Math.max(0, this.freeze[i] - wgt * k * 0.35); continue; }
          const f = wgt * k * (1 - this.freeze[i]);
          if (f <= 0) continue;
          if (mode === 'reconstruct') {
            this.dx[i] = odx[o] * (1 - f * 0.25);
            this.dy[i] = ody[o] * (1 - f * 0.25);
            continue;
          }
          if (mode === 'smooth') {
            this.dx[i] = odx[o] + (smooth.dx[o] - odx[o]) * f * 0.5;
            this.dy[i] = ody[o] + (smooth.dy[o] - ody[o]) * f * 0.5;
            continue;
          }
          // Move vector v at this point: the content here should travel by v.
          let vx, vy;
          if (mode === 'warp') { vx = mv[0] * f; vy = mv[1] * f; }
          else if (mode === 'twirl') { const a = dir * f * 0.08; vx = -(py - cy) * a; vy = (px - cx) * a; }
          else if (mode === 'pucker') { vx = (cx - px) * f * 0.06; vy = (cy - py) * f * 0.06; }
          else { vx = (px - cx) * f * 0.06; vy = (py - cy) * f * 0.06; }
          // Semi-Lagrangian: new field = old field fetched from where the content came from, minus v.
          const sx = (px - vx) / s - gx0, sy = (py - vy) / s - gy0;
          this.dx[i] = sample(odx, bw, bh, sx, sy) - vx;
          this.dy[i] = sample(ody, bw, bh, sx, sy) - vy;
        }
      }
      return { x: gx0 * s - s, y: gy0 * s - s, w: (bw + 2) * s, h: (bh + 2) * s };
    }

    localBlur(gx0, gy0, bw, bh) {
      const w = this.w, h = this.h, out = { dx: new Float32Array(bw * bh), dy: new Float32Array(bw * bh) };
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          let sx = 0, sy = 0, n = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const xx = clamp(gx0 + x + dx, 0, w - 1), yy = clamp(gy0 + y + dy, 0, h - 1), i = yy * w + xx;
            sx += this.dx[i]; sy += this.dy[i]; n++;
          }
          out.dx[y * bw + x] = sx / n;
          out.dy[y * bw + x] = sy / n;
        }
      }
      return out;
    }

    reset() {
      this.dx.fill(0);
      this.dy.fill(0);
    }

    // Render `src` (RGBA bytes, sw×sh, scale k = src px per doc px) displaced into `dst` (same size) within rect r (src px).
    render(src, sw, sh, k, dst, r) {
      const d = [0, 0], c = [0, 0, 0, 0];
      const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
      const x1 = Math.min(sw, Math.ceil(r.x + r.w)), y1 = Math.min(sh, Math.ceil(r.y + r.h));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          this.at(x / k, y / k, d);
          const j = (y * sw + x) * 4;
          if (!d[0] && !d[1]) {
            dst[j] = src[j]; dst[j + 1] = src[j + 1]; dst[j + 2] = src[j + 2]; dst[j + 3] = src[j + 3];
            continue;
          }
          sampleRGBA(src, sw, sh, x + d[0] * k, y + d[1] * k, c);
          dst[j] = c[0]; dst[j + 1] = c[1]; dst[j + 2] = c[2]; dst[j + 3] = c[3];
        }
      }
    }
  }

  // ─── Workspace ───
  async function open() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    const L = a.paintLayer();
    if (!L) return;
    if (L.adjust) return a.toast('Verflüssigen braucht eine Ebene mit Pixeln. Wähle in den Ebenen das Foto.');
    const W = doc.width, H = doc.height;
    const field = new Field(W, H);
    // A selection protects everything outside it (like Photoshop).
    if (!doc.selection.empty) {
      const m = createCanvas(field.w, field.h), mg = m.getContext('2d');
      mg.drawImage(doc.selection.mask, 0, 0, field.w * field.s, field.h * field.s, 0, 0, field.w, field.h);
      const md = mg.getImageData(0, 0, field.w, field.h).data;
      for (let i = 0; i < field.freeze.length; i++) field.freeze[i] = 1 - md[i * 4 + 3] / 255;
    }
    const target = L.target, full = target.getContext('2d').getImageData(0, 0, W, H);

    const o = { tool: 'warp', size: Math.round(Math.max(W, H) / 12), density: 50, pressure: 50, showMask: true, showMesh: false };
    const overlay = el('div', { class: 'liq', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Verflüssigen' });
    const canvas = el('canvas', { class: 'liq-canvas' }), cursor = el('canvas', { class: 'liq-cursor' });
    const stage = el('div', { class: 'liq-stage' }, [canvas, cursor]);
    const toolBtns = TOOLS.map(([id, name, icon, key, hint]) => {
      const b = el('button', { type: 'button', class: 'tool-btn', title: `${name} (${key}) – ${hint}`, 'aria-label': name, html: PW.icon(icon, 18) });
      b.addEventListener('click', () => setTool(id));
      b.dataset.id = id;
      return b;
    });
    const tools = el('div', { class: 'liq-tools' }, toolBtns);
    const ctl = (def, key, after) => PW.ui.control({ ...def, key }, o[key], v => { o[key] = v; if (after) after(); });
    const hint = el('p', { class: 'liq-hint' });
    const side = el('div', { class: 'liq-side' }, [
      el('div', { class: 'dlg-title', text: 'Verflüssigen' }),
      el('div', { class: 'dlg-sub', text: 'Pinsel' }),
      ctl({ type: 'range', label: 'Größe', min: 2, max: 2000, unit: 'Px', log: true }, 'size', drawCursorLast),
      ctl({ type: 'range', label: 'Dichte', min: 0, max: 100, unit: '%' }, 'density'),
      ctl({ type: 'range', label: 'Druck', min: 1, max: 100, unit: '%' }, 'pressure'),
      el('div', { class: 'dlg-sub', text: 'Ansicht' }),
      ctl({ type: 'check', label: 'Maske einblenden' }, 'showMask', () => redrawAll()),
      ctl({ type: 'check', label: 'Gitter einblenden' }, 'showMesh', () => redrawAll()),
      el('div', { class: 'liq-row' }, [
        el('button', { type: 'button', class: 'btn', text: 'Alles rekonstruieren', onclick: () => { field.reset(); redrawAll(); } }),
        el('button', { type: 'button', class: 'btn', text: 'Maske aufheben', onclick: () => { field.freeze.fill(0); redrawAll(); } }),
      ]),
      hint,
      el('div', { class: 'liq-row end' }, [
        el('button', { type: 'button', class: 'btn', text: 'Abbrechen', onclick: () => close(false) }),
        el('button', { type: 'button', class: 'btn primary', text: 'OK', onclick: () => close(true) }),
      ]),
    ]);
    overlay.append(tools, stage, side);
    document.body.append(overlay);
    PW.guide.hideCoach();

    // Preview image fitted to the stage.
    let k = 1, pw = 1, ph = 1, prev = null, out = null, img = null, g = null;
    const fit = () => {
      const r = stage.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      k = Math.min(1, (r.width * dpr - 16) / W, (r.height * dpr - 16) / H);
      pw = Math.max(1, Math.round(W * k));
      ph = Math.max(1, Math.round(H * k));
      canvas.width = cursor.width = pw;
      canvas.height = cursor.height = ph;
      canvas.style.width = cursor.style.width = `${pw / dpr}px`;
      canvas.style.height = cursor.style.height = `${ph / dpr}px`;
      const c = createCanvas(pw, ph), cg = c.getContext('2d');
      cg.imageSmoothingQuality = 'high';
      cg.drawImage(target, 0, 0, pw, ph);
      prev = cg.getImageData(0, 0, pw, ph).data;
      g = canvas.getContext('2d');
      img = g.createImageData(pw, ph);
      out = img.data;
      redrawAll();
    };
    function redraw(r) {
      field.render(prev, pw, ph, k, out, r);
      if (o.showMask) {
        const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(pw, Math.ceil(r.x + r.w)), y1 = Math.min(ph, Math.ceil(r.y + r.h));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const f = sample(field.freeze, field.w, field.h, x / k / field.s, y / k / field.s);
          if (f <= 0.01) continue;
          const j = (y * pw + x) * 4;
          out[j] += (235 - out[j]) * f * 0.55;
          out[j + 1] *= 1 - f * 0.55;
          out[j + 2] *= 1 - f * 0.55;
        }
      }
      g.putImageData(img, 0, 0, Math.max(0, Math.floor(r.x)), Math.max(0, Math.floor(r.y)), Math.ceil(r.w) + 2, Math.ceil(r.h) + 2);
      if (o.showMesh) drawMesh();
    }
    function redrawAll() {
      redraw({ x: 0, y: 0, w: pw, h: ph });
      if (o.showMesh) drawMesh();
    }
    function drawMesh() {
      const step = Math.max(12, Math.round(Math.max(pw, ph) / 40)), d = [0, 0];
      g.save();
      g.strokeStyle = 'rgba(120,180,255,0.55)';
      g.lineWidth = 1;
      for (let gy = 0; gy <= ph; gy += step) {
        g.beginPath();
        for (let gx = 0; gx <= pw; gx += 4) {
          field.at(gx / k, gy / k, d);
          const X = gx - d[0] * k, Y = gy - d[1] * k;
          if (gx) g.lineTo(X, Y); else g.moveTo(X, Y);
        }
        g.stroke();
      }
      for (let gx = 0; gx <= pw; gx += step) {
        g.beginPath();
        for (let gy = 0; gy <= ph; gy += 4) {
          field.at(gx / k, gy / k, d);
          const X = gx - d[0] * k, Y = gy - d[1] * k;
          if (gy) g.lineTo(X, Y); else g.moveTo(X, Y);
        }
        g.stroke();
      }
      g.restore();
    }
    function setTool(id) {
      o.tool = id;
      toolBtns.forEach(b => b.classList.toggle('active', b.dataset.id === id));
      hint.textContent = TOOLS.find(t => t[0] === id)[4];
    }
    let lastCursor = null;
    function drawCursor(px, py) {
      lastCursor = [px, py];
      const cg = cursor.getContext('2d');
      cg.clearRect(0, 0, pw, ph);
      if (px == null) return;
      const r = (o.size / 2) * k;
      cg.beginPath();
      cg.arc(px, py, r, 0, Math.PI * 2);
      cg.strokeStyle = 'rgba(0,0,0,0.7)';
      cg.lineWidth = 3;
      cg.stroke();
      cg.strokeStyle = 'rgba(255,255,255,0.95)';
      cg.lineWidth = 1.2;
      cg.stroke();
      cg.beginPath();
      cg.arc(px, py, r * (o.density / 100) * 0.9, 0, Math.PI * 2);
      cg.setLineDash([3, 3]);
      cg.stroke();
      cg.setLineDash([]);
    }
    function drawCursorLast() {
      if (lastCursor) drawCursor(...lastCursor);
    }

    // ─── Pointer ───
    let down = null, raf = 0;
    const toDoc = e => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, px: ((e.clientX - r.left) / r.width) * pw, py: ((e.clientY - r.top) / r.height) * ph };
    };
    const step = (p, mv) => {
      const strength = o.pressure / 100 * (p.pressure || 1);
      const dirty = field.apply(o.tool, p.x, p.y, o.size / 2, strength, o.density / 100, mv, p.alt ? -1 : 1);
      if (!dirty) return;
      // The visible change can reach as far as the largest displacement around: redraw generously.
      const pad = o.size;
      redraw({ x: (dirty.x - pad) * k, y: (dirty.y - pad) * k, w: (dirty.w + 2 * pad) * k, h: (dirty.h + 2 * pad) * k });
    };
    const loop = () => {
      if (!down) return;
      if (o.tool !== 'warp') step(down.p, null);
      raf = requestAnimationFrame(loop);
    };
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = { ...toDoc(e), pressure: e.pointerType === 'pen' ? e.pressure || 1 : 1, alt: e.altKey };
      down = { p };
      if (o.tool !== 'warp') loop();
    });
    canvas.addEventListener('pointermove', e => {
      const p = { ...toDoc(e), pressure: e.pointerType === 'pen' ? e.pressure || 1 : 1, alt: e.altKey };
      drawCursor(p.px, p.py);
      if (!down) return;
      if (o.tool === 'warp') {
        // Sub-steps of at most a tenth of the brush, so fast strokes stay smooth.
        const from = down.p, dist = Math.hypot(p.x - from.x, p.y - from.y), n = Math.max(1, Math.ceil(dist / (o.size * 0.1)));
        for (let i = 1; i <= n; i++) {
          const a0 = (i - 1) / n, a1 = i / n;
          const q = { x: from.x + (p.x - from.x) * a1, y: from.y + (p.y - from.y) * a1, pressure: p.pressure };
          step(q, [(p.x - from.x) * (a1 - a0), (p.y - from.y) * (a1 - a0)]);
        }
      }
      down.p = p;
    });
    const up = () => {
      down = null;
      cancelAnimationFrame(raf);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => drawCursor(null));

    let resolveClose;
    const finished = new Promise(r => (resolveClose = r));
    const onKey = e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      e.stopPropagation();
      if (e.key === 'Escape') return close(false);
      if (e.key === 'Enter') return close(true);
      if (e.key === '[' || e.key === ']') {
        o.size = clamp(Math.round(o.size * (e.key === ']' ? 1.15 : 1 / 1.15)), 2, 2000);
        side.querySelector('.ctl-range input.num').value = o.size;
        drawCursorLast();
        return;
      }
      const t = TOOLS.find(x => x[3].toLowerCase() === e.key.toLowerCase());
      if (t && !e.ctrlKey && !e.metaKey) setTool(t[0]);
    };
    document.addEventListener('keydown', onKey, true);
    const onResize = () => fit();
    window.addEventListener('resize', onResize);

    async function close(ok) {
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      if (ok) {
        await PW.ui.busy(async () => {
          await new Promise(r => setTimeout(r, 0));
          const res = new ImageData(W, H);
          field.render(full.data, W, H, 1, res.data, { x: 0, y: 0, w: W, h: H });
          const tg = target.getContext('2d');
          tg.putImageData(res, 0, 0);
          L.markTarget();
        }, 'Verflüssigen wird angewendet …');
        a.commit('Verflüssigen', 'liquify');
      }
      overlay.remove();
      a.render();
      resolveClose(ok);
    }

    setTool('warp');
    requestAnimationFrame(fit);
    return finished;
  }

  PW.liquify = { open, Field };
})(window.PW);
