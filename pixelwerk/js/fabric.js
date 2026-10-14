// ─── "Stoff blickdichter machen": cover see-through fabric inside a selection ───
// Works on its own layer above the photo, so the original stays untouched.
'use strict';

(function (PW) {
  const { el, clamp, clipRect, hexToRgb, rgbToHex } = PW.util;
  const app = () => PW.app;
  const SELECT_STEPS = ['Lasso', 'Polygon-Lasso', 'Rechteckige Auswahl', 'Elliptische Auswahl', 'Zauberstab'];
  let pending = null, pendingAt = 0;

  // Light / middle / dark fabric colour guesses from the selected pixels.
  function analyse(img, region, selA, W) {
    const d = img.data, samples = [];
    const step = Math.max(1, Math.floor(Math.sqrt((region.w * region.h) / 60000)));
    for (let y = 0; y < region.h; y += step) {
      for (let x = 0; x < region.w; x += step) {
        if (selA[(region.y + y) * W + region.x + x] < 128) continue;
        const j = (y * region.w + x) * 4;
        samples.push([d[j], d[j + 1], d[j + 2], 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]]);
      }
    }
    if (!samples.length) return null;
    samples.sort((a, b) => a[3] - b[3]);
    const mean = (from, to) => {
      const part = samples.slice(Math.floor(samples.length * from), Math.max(Math.floor(samples.length * from) + 1, Math.floor(samples.length * to)));
      const s = [0, 0, 0];
      for (const p of part) {
        s[0] += p[0];
        s[1] += p[1];
        s[2] += p[2];
      }
      return rgbToHex(s[0] / part.length, s[1] / part.length, s[2] / part.length);
    };
    const avgL = samples.reduce((t, p) => t + p[3], 0) / samples.length;
    return { light: mean(0.7, 1), mid: mean(0.4, 0.6), dark: mean(0, 0.3), avgL };
  }

  class FabricSession {
    constructor(doc, photo) {
      this.doc = doc;
      this.photo = photo;
      const sel = doc.selection, b = sel.bounds, W = doc.width;
      this.W = W;
      this.selA = sel.alpha();
      const margin = 90;
      this.region = clipRect({ x: b.x - margin, y: b.y - margin, w: b.w + margin * 2, h: b.h + margin * 2 }, doc.width, doc.height);
      const r = this.region;
      this.src = photo.ctx.getImageData(r.x, r.y, r.w, r.h);
      this.colors = analyse(this.src, r, this.selA, W);
      this.layer = doc.createLayer('Blickdicht');
      doc.addLayer(this.layer, doc.layers.indexOf(photo) + 1);
      this.cache = {};
      this.autoSmooth = clamp(Math.round(Math.min(b.w, b.h) / 40), 2, 25);
    }

    // Smoothed colour planes (hide what shows through) and a broad shading map (keep folds and light).
    // Blurs are normalised by the selection mask, so colours from outside never bleed in.
    planes(radius) {
      if (this.cache.r === radius) return this.cache;
      const { w, h, x: rx, y: ry } = this.region, n = w * h, d = this.src.data;
      const rgb = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], lum = new Float32Array(n);
      const m = new Float32Array(n);
      for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
          const k = this.selA[(ry + y) * this.W + rx + x] / 255, j = i * 4;
          m[i] = k;
          rgb[0][i] = d[j] * k;
          rgb[1][i] = d[j + 1] * k;
          rgb[2][i] = d[j + 2] * k;
          lum[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) * k;
        }
      }
      const tmp = new Float32Array(n), mSmall = new Float32Array(m), mBig = new Float32Array(m), edge = new Float32Array(m);
      const big = Math.max(8, radius * 3);
      for (const p of rgb) PW.filters.blurPlane(p, w, h, radius, tmp);
      PW.filters.blurPlane(mSmall, w, h, radius, tmp);
      PW.filters.blurPlane(lum, w, h, big, tmp);
      PW.filters.blurPlane(mBig, w, h, big, tmp);
      PW.filters.blurPlane(edge, w, h, 1.5, tmp);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const ms = mSmall[i], mb = mBig[i];
        for (let c = 0; c < 3; c++) rgb[c][i] = ms > 0.001 ? rgb[c][i] / ms : d[j + c];
        lum[i] = mb > 0.001 ? lum[i] / mb : 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
      }
      let sum = 0, cnt = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (this.selA[(this.region.y + y) * this.W + this.region.x + x] < 128) continue;
          sum += lum[y * w + x];
          cnt++;
        }
      }
      this.cache = { r: radius, rgb, lum, edge, meanL: cnt ? sum / cnt : 128 };
      return this.cache;
    }

    render(p) {
      const { w, h, x: rx, y: ry } = this.region, W = this.W;
      const { rgb, lum, edge, meanL } = this.planes(p.smooth);
      const s = p.strength / 100, tex = p.texture / 100, hide = Math.min(1, s * 1.6);
      const c = hexToRgb(p.color) || { r: 200, g: 200, b: 200 };
      const d = this.src.data, out = new ImageData(w, h), o = out.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = this.selA[(ry + y) * W + rx + x];
          if (!a) continue;
          const i = y * w + x, j = i * 4;
          const shade = Math.pow(clamp(lum[i] / (meanL || 1), 0.55, 1.45), 0.8);
          for (let k = 0; k < 3; k++) {
            const orig = d[j + k], smooth = rgb[k][i];
            const fabric = [c.r, c.g, c.b][k] * shade;
            const base = orig + (smooth - orig) * hide;
            o[j + k] = base + (fabric - base) * s + (orig - smooth) * tex * s;
          }
          // Soft inner edge (about 2 px) so the cover blends into the photo.
          o[j + 3] = Math.min(a, edge[i] * 255);
        }
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
    const p = { strength: 60, smooth: session.autoSmooth, texture: 35, color: cols.avgL > 120 ? cols.light : cols.dark };
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
      el('p', { class: 'dlg-info', text: 'Schiebe die Regler, bis der Stoff natürlich und blickdicht aussieht. Das Original bleibt erhalten, das Ergebnis liegt auf einer eigenen Ebene.' }),
      PW.ui.control({ type: 'range', key: 'strength', label: 'Stärke', min: 0, max: 100, unit: '%' }, p.strength, v => { p.strength = v; update(); }),
      el('div', { class: 'ctl ctl-chips' }, [el('span', { class: 'lbl', text: 'Farbe des Stoffs' }), el('div', { class: 'chips' }, [...chips, colorCtl])]),
      PW.ui.control({ type: 'range', key: 'smooth', label: 'Glätten', min: 0, max: 40, unit: 'Px', title: 'Verwischt, was durch den Stoff durchscheint' }, p.smooth, v => { p.smooth = v; update(); }),
      PW.ui.control({ type: 'range', key: 'texture', label: 'Stoffstruktur', min: 0, max: 100, unit: '%', title: 'Wie viel von Falten und Gewebe sichtbar bleibt' }, p.texture, v => { p.texture = v; update(); }),
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
      PW.guide.coach('Schritt 1: Fahre mit gedrückter Maustaste (oder mit dem Finger) einmal rund um den durchsichtigen Teil des Oberteils. Danach öffnen sich die Regler von selbst.', 'lasso');
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

  PW.fabric = { start, openDialog, FabricSession };
})(window.PW);
