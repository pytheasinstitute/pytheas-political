// ─── Dialogs: modal frame, colour picker, filters, curves, levels, document sizes, styles ───
'use strict';

(function (PW) {
  const { el, clamp, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, fmt } = PW.util;
  const control = (...a) => PW.ui.control(...a);
  const app = () => PW.app;

  // ─── Modal frame (content left, buttons stacked right, like Photoshop) ───
  // Resolves with the id of the button pressed ('ok', 'cancel', …).
  function modal({ title, content, buttons = [['ok', 'OK', true], ['cancel', 'Abbrechen']], side, width, onButton, className }) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const overlay = el('div', { class: 'modal-overlay' });
      const head = el('div', { class: 'dlg-head' }, [el('span', { class: 'dlg-title', text: title })]);
      const body = el('div', { class: 'dlg-body' }, content);
      const btnCol = el('div', { class: 'dlg-buttons' });
      const dlg = el('div', { class: `dialog ${className || ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
        head,
        el('div', { class: 'dlg-main' }, [body, btnCol]),
      ]);
      if (width) dlg.style.width = `min(${width}px, calc(100vw - 24px))`;
      const close = id => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
        resolve(id);
      };
      const press = async id => {
        if (onButton) {
          const r = await onButton(id);
          if (r === false) return;
        }
        close(id);
      };
      for (const [id, label, primary] of buttons) {
        btnCol.append(el('button', { type: 'button', class: `btn ${primary ? 'primary' : ''}`, text: label, onclick: () => press(id) }));
      }
      if (side) btnCol.append(side);
      const onKey = e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          press('cancel');
        } else if (e.key === 'Enter' && !(e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON'))) {
          e.preventDefault();
          e.stopPropagation();
          if (e.target && e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
          setTimeout(() => press('ok'), 0);
        } else {
          e.stopPropagation();
        }
      };
      document.addEventListener('keydown', onKey, true);

      // Drag by the title bar.
      head.addEventListener('pointerdown', e => {
        const r = dlg.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        dlg.style.position = 'fixed';
        dlg.style.margin = '0';
        const move = ev => {
          dlg.style.left = `${clamp(ev.clientX - sx, 0, innerWidth - 60)}px`;
          dlg.style.top = `${clamp(ev.clientY - sy, 0, innerHeight - 40)}px`;
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });

      overlay.append(dlg);
      document.getElementById('dialogs').append(overlay);
      const first = dlg.querySelector('input:not([type=checkbox]):not([type=range]), select, button.primary');
      requestAnimationFrame(() => {
        if (first) {
          first.focus();
          if (first.select) first.select();
        }
      });
    });
  }

  async function confirm(message, { title = 'Pixelwerk', ok = 'OK', alt, cancel = 'Abbrechen' } = {}) {
    const buttons = [['ok', ok, true]];
    if (alt) buttons.push(['alt', alt]);
    buttons.push(['cancel', cancel]);
    return modal({ title, content: el('p', { class: 'dlg-text', text: message }), buttons, width: 440 });
  }

  function alert(message, title = 'Pixelwerk') {
    return modal({ title, content: el('p', { class: 'dlg-text', text: message }), buttons: [['ok', 'OK', true]], width: 420 });
  }

  // Small form from control defs; resolves with values or null.
  async function form(title, defs, values, opts = {}) {
    const v = { ...values };
    // Rows with showIf appear only while it holds for the current values.
    const sync = () => defs.forEach((d, i) => d.showIf && (rows[i].hidden = !d.showIf(v)));
    const rows = defs.map(d => control(d, v[d.key], val => {
      v[d.key] = val;
      sync();
    }));
    sync();
    const res = await modal({ title, content: el('div', { class: 'form-grid' }, rows), width: opts.width || 420 });
    return res === 'ok' ? v : null;
  }

  async function textInput(title, label, value) {
    const id = 'dlg-text-input';
    const input = el('input', { id, type: 'text', class: 'text', value });
    input.addEventListener('keydown', e => e.stopPropagation());
    const res = await modal({ title, content: el('div', { class: 'form-grid' }, [el('div', { class: 'ctl' }, [el('label', { for: id, text: label }), input])]), width: 420 });
    return res === 'ok' ? input.value : null;
  }

  // ─── Colour picker (Farbwähler) ───
  function colorPicker(initial = '#000000', title = 'Farbwähler') {
    const start = hexToRgb(initial) || { r: 0, g: 0, b: 0 };
    let hsv = rgbToHsv(start.r, start.g, start.b);
    let hex = rgbToHex(start);

    const SV = 256;
    const sv = el('canvas', { class: 'cp-sv', width: SV, height: SV });
    const hue = el('canvas', { class: 'cp-hue', width: 20, height: SV });
    const svg = sv.getContext('2d'), hg = hue.getContext('2d');
    const hgrad = hg.createLinearGradient(0, 0, 0, SV);
    [0, 60, 120, 180, 240, 300, 360].forEach(h => hgrad.addColorStop(1 - h / 360, `hsl(${h},100%,50%)`));
    hg.fillStyle = hgrad;
    hg.fillRect(0, 0, 20, SV);
    const hueImg = hg.getImageData(0, 0, 20, SV);

    const newSw = el('div', { class: 'cp-new' }), oldSw = el('div', { class: 'cp-old' });
    oldSw.style.background = rgbToHex(start);
    oldSw.title = 'Aktuelle Farbe – Klick zum Zurücksetzen';

    const fields = {};
    const mk = (key, label, max, unit) => {
      const id = `cp-${key}`;
      const inp = el('input', { id, type: 'number', min: 0, max, class: 'num' });
      inp.addEventListener('change', () => fromField(key));
      inp.addEventListener('keydown', e => e.stopPropagation());
      fields[key] = inp;
      return el('div', { class: 'cp-field' }, [el('label', { for: id, text: label }), inp, el('span', { class: 'unit', text: unit || '' })]);
    };
    const hexIn = el('input', { id: 'cp-hex', type: 'text', class: 'text hex', maxlength: 7 });
    hexIn.addEventListener('change', () => {
      const c = hexToRgb(hexIn.value);
      if (c) setRGB(c);
      else update();
    });
    hexIn.addEventListener('keydown', e => e.stopPropagation());

    function drawSV() {
      const base = hsvToRgb(hsv.h, 100, 100);
      svg.fillStyle = rgbToHex(base);
      svg.fillRect(0, 0, SV, SV);
      const wg = svg.createLinearGradient(0, 0, SV, 0);
      wg.addColorStop(0, '#fff');
      wg.addColorStop(1, 'rgba(255,255,255,0)');
      svg.fillStyle = wg;
      svg.fillRect(0, 0, SV, SV);
      const bg = svg.createLinearGradient(0, 0, 0, SV);
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(1, '#000');
      svg.fillStyle = bg;
      svg.fillRect(0, 0, SV, SV);
      const x = (hsv.s / 100) * SV, y = (1 - hsv.v / 100) * SV;
      svg.beginPath();
      svg.arc(x, y, 6, 0, Math.PI * 2);
      svg.strokeStyle = hsv.v > 55 && hsv.s < 45 ? '#000' : '#fff';
      svg.lineWidth = 1.5;
      svg.stroke();
      hg.putImageData(hueImg, 0, 0);
      const hy = (1 - hsv.h / 360) * SV;
      hg.fillStyle = '#fff';
      hg.strokeStyle = '#000';
      hg.fillRect(0, hy - 2, 20, 4);
      hg.strokeRect(0.5, hy - 2.5, 19, 5);
    }

    function update() {
      const c = hsvToRgb(hsv.h, hsv.s, hsv.v);
      hex = rgbToHex(c);
      fields.h.value = Math.round(hsv.h);
      fields.s.value = Math.round(hsv.s);
      fields.v.value = Math.round(hsv.v);
      fields.r.value = c.r;
      fields.g.value = c.g;
      fields.b.value = c.b;
      if (document.activeElement !== hexIn) hexIn.value = hex.slice(1);
      newSw.style.background = hex;
      drawSV();
    }

    function setRGB(c) {
      const keepH = hsv.h;
      hsv = rgbToHsv(c.r, c.g, c.b);
      if (hsv.s === 0 || hsv.v === 0) hsv.h = keepH;
      update();
    }

    function fromField(key) {
      if ('hsv'.includes(key)) {
        hsv = { h: clamp(+fields.h.value || 0, 0, 360), s: clamp(+fields.s.value || 0, 0, 100), v: clamp(+fields.v.value || 0, 0, 100) };
        update();
      } else {
        setRGB({ r: clamp(+fields.r.value || 0, 0, 255), g: clamp(+fields.g.value || 0, 0, 255), b: clamp(+fields.b.value || 0, 0, 255) });
      }
    }

    const drag = (canvas, fn) => canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const r = canvas.getBoundingClientRect();
      const on = ev => fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
      on(e);
      const mv = ev => on(ev);
      const up = () => {
        canvas.removeEventListener('pointermove', mv);
        canvas.removeEventListener('pointerup', up);
      };
      canvas.addEventListener('pointermove', mv);
      canvas.addEventListener('pointerup', up);
    });
    drag(sv, (x, y) => {
      hsv.s = x * 100;
      hsv.v = (1 - y) * 100;
      update();
    });
    drag(hue, (x, y) => {
      hsv.h = (1 - y) * 360;
      update();
    });
    oldSw.addEventListener('click', () => setRGB(start));

    const content = el('div', { class: 'cp' }, [
      sv, hue,
      el('div', { class: 'cp-side' }, [
        el('div', { class: 'cp-swatches' }, [el('span', { class: 'cp-cap', text: 'neu' }), newSw, oldSw, el('span', { class: 'cp-cap', text: 'aktuell' })]),
        el('div', { class: 'cp-fields' }, [
          mk('h', 'H:', 360, '°'), mk('r', 'R:', 255),
          mk('s', 'S:', 100, '%'), mk('g', 'G:', 255),
          mk('v', 'B:', 100, '%'), mk('b', 'B:', 255),
        ]),
        el('div', { class: 'cp-field cp-hexrow' }, [el('label', { for: 'cp-hex', text: '#' }), hexIn]),
      ]),
    ]);
    update();
    const addSwatch = el('button', { type: 'button', class: 'btn', text: 'Zu Farbfeldern hinzufügen', onclick: () => PW.panels && PW.panels.addSwatch(hex) });
    return modal({ title, content, width: 600, side: addSwatch, className: 'dlg-picker' }).then(r => (r === 'ok' ? hex : null));
  }

  // ─── Filter / adjustment dialog with live preview ───
  const lastParams = {};

  // opts.session: an own session (adjustment layers) with opts.done; opts.initial: start values.
  async function runFilter(def, opts = {}) {
    const a = app();
    if (!a.doc) return;
    a.finishToolWork();
    let session = opts.session;
    if (!session) {
      const L = a.paintLayer();
      if (!L) return;
      session = new PW.filters.FilterSession(a.doc, L, def, { fg: a.fg, bg: a.bg });
    }
    const done = opts.done || (params => {
      a.lastFilter = { def, params };
      a.commit(def.title || def.name.replace('…', ''), def.menu === 'filter' ? 'filter' : 'adjust');
      PW.bus.emit('filter:last');
    });
    const busy = PW.ui.busy;

    if (opts.params || (!def.params && !def.dialog)) {
      const params = opts.params || {};
      await busy(() => session.run(params));
      return done(params);
    }
    if (def.dialog === 'curves') return curves(session, done, opts.initial);
    if (def.dialog === 'levels') return levels(session, done, opts.initial);

    const params = { ...PW.filters.defaults(def), ...(opts.initial || lastParams[def.id] || {}) };
    if (def.randomSeed && !opts.keepSeed) params.seed = Math.floor(Math.random() * 9999) + 1;
    let previewOn = true, timer = 0, lastMs = 0, dirty = true;

    const preview = () => {
      if (!previewOn) return;
      const t0 = performance.now();
      session.run(params);
      lastMs = performance.now() - t0;
      dirty = false;
      a.render();
    };
    const schedule = final => {
      dirty = true;
      clearTimeout(timer);
      if (final || lastMs < 50) requestAnimationFrame(preview);
      else timer = setTimeout(preview, Math.min(400, lastMs * 1.5));
    };

    // Rows with showIf appear only while it holds (e.g. one colour range at a time).
    const syncRows = () => def.params.forEach((p, i) => p.showIf && (rows[i].hidden = !p.showIf(params)));
    const rows = def.params.map(p => control(p, params[p.key], (v, final) => {
      params[p.key] = v;
      syncRows();
      schedule(final);
    }));
    syncRows();
    const pv = control({ type: 'check', key: 'preview', label: 'Vorschau' }, true, v => {
      previewOn = v;
      if (v) schedule(true);
      else {
        session.cancel();
        dirty = true;
        a.render();
      }
    });

    preview();
    const res = await modal({ title: def.title || def.name.replace('…', ''), content: el('div', { class: 'form-grid' }, rows), side: pv, width: 470, className: 'dlg-side' });
    clearTimeout(timer);
    if (res === 'ok') {
      if (dirty || !previewOn || !session.applied) await busy(() => session.run(params));
      lastParams[def.id] = { ...params };
      done(params);
    } else {
      session.cancel();
      a.render();
    }
  }

  // Histogram of the current target (used by levels and curves).
  function drawHistogram(g, w, h, hist, color = 'rgba(160,160,170,0.55)') {
    let max = 0;
    for (let i = 0; i < 256; i++) max = Math.max(max, hist[i]);
    const sorted = [...hist].sort((a, b) => a - b), cap = sorted[250] * 1.4 || max;
    g.fillStyle = color;
    for (let i = 0; i < 256; i++) {
      const v = Math.min(1, hist[i] / (cap || 1));
      const x = (i / 256) * w;
      g.fillRect(x, h - v * h, w / 256 + 0.6, v * h);
    }
  }

  // ─── Curves (Gradationskurven) ───
  async function curves(session, done, initial) {
    const a = app();
    const S = 256;
    const canvas = el('canvas', { class: 'curve-canvas', width: S * 2, height: S * 2 });
    const g = canvas.getContext('2d');
    const hist = PW.filters.histogram(session.orig);
    const pts = { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] };
    if (initial) for (const k of ['rgb', 'r', 'g', 'b']) if (Array.isArray(initial[k])) pts[k] = initial[k].map(q => ({ x: q.x, y: q.y }));
    let ch = 'rgb', active = null, previewOn = true;
    const COL = { rgb: '#e8e8ee', r: '#ff5a5a', g: '#5ad65a', b: '#5a8aff' };
    const io = el('div', { class: 'curve-io' });
    const inOut = el('span', { class: 'hint', text: 'Klicken fügt Punkte hinzu · Punkt aus dem Feld ziehen entfernt ihn' });
    io.append(inOut);

    function draw() {
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, S, S);
      g.fillStyle = '#1b1b1e';
      g.fillRect(0, 0, S, S);
      g.save();
      g.translate(0, 0);
      drawHistogram(g, S, S, ch === 'rgb' ? hist.l : hist[ch], ch === 'rgb' ? 'rgba(140,140,150,0.45)' : COL[ch] + '55');
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo((i * S) / 4 + 0.5, 0);
        g.lineTo((i * S) / 4 + 0.5, S);
        g.moveTo(0, (i * S) / 4 + 0.5);
        g.lineTo(S, (i * S) / 4 + 0.5);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(0, S);
      g.lineTo(S, 0);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.stroke();
      const order = ch === 'rgb' ? ['r', 'g', 'b', 'rgb'] : [ch];
      for (const k of order) {
        const lut = PW.filters.curveLUT(pts[k]);
        g.beginPath();
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * S, y = S - (lut[i] / 255) * S;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.strokeStyle = k === ch ? COL[k] : COL[k] + '55';
        g.lineWidth = k === ch ? 1.6 : 1;
        if (k !== ch && pts[k].length === 2 && pts[k][0].y === 0 && pts[k][1].y === 255) continue;
        g.stroke();
      }
      for (const p of pts[ch]) {
        const x = (p.x / 255) * S, y = S - (p.y / 255) * S;
        g.fillStyle = p === active ? COL[ch] : '#1b1b1e';
        g.strokeStyle = COL[ch];
        g.fillRect(x - 3.5, y - 3.5, 7, 7);
        g.strokeRect(x - 3.5, y - 3.5, 7, 7);
      }
    }

    let timer = 0;
    const params = () => ({ rgb: pts.rgb, r: pts.r, g: pts.g, b: pts.b });
    const preview = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!previewOn) return;
        session.run(params());
        a.render();
      }, 16);
    };

    const toVal = e => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 255, y: (1 - (e.clientY - r.top) / r.height) * 255 };
    };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const v = toVal(e), list = pts[ch];
      active = list.find(p => Math.hypot(p.x - v.x, p.y - v.y) < 10);
      if (!active) {
        active = { x: clamp(Math.round(v.x), 1, 254), y: clamp(Math.round(v.y), 0, 255) };
        list.push(active);
        list.sort((a, b) => a.x - b.x);
      }
      draw();
      preview();
    });
    canvas.addEventListener('pointermove', e => {
      const v = toVal(e);
      inOut.textContent = `Eingabe: ${Math.round(clamp(v.x, 0, 255))}   Ausgabe: ${Math.round(clamp(v.y, 0, 255))}`;
      if (!active || !e.buttons) return;
      const list = pts[ch], i = list.indexOf(active);
      const isEnd = i === 0 || i === list.length - 1;
      const out = v.y < -25 || v.y > 280 || v.x < -25 || v.x > 280;
      if (out && !isEnd && list.length > 2) {
        list.splice(i, 1);
        active = null;
      } else {
        const lo = i > 0 ? list[i - 1].x + 1 : 0, hi = i < list.length - 1 ? list[i + 1].x - 1 : 255;
        active.x = clamp(Math.round(v.x), lo, hi);
        active.y = clamp(Math.round(v.y), 0, 255);
      }
      draw();
      preview();
    });
    canvas.addEventListener('pointerup', () => {
      active = null;
      draw();
    });

    const presets = {
      linear: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
      contrast: [{ x: 0, y: 0 }, { x: 64, y: 48 }, { x: 192, y: 208 }, { x: 255, y: 255 }],
      strong: [{ x: 0, y: 0 }, { x: 64, y: 32 }, { x: 192, y: 224 }, { x: 255, y: 255 }],
      lighter: [{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }],
      darker: [{ x: 0, y: 0 }, { x: 128, y: 96 }, { x: 255, y: 255 }],
      negative: [{ x: 0, y: 255 }, { x: 255, y: 0 }],
      fade: [{ x: 0, y: 40 }, { x: 255, y: 230 }],
    };
    const preset = control({ type: 'select', key: 'preset', label: 'Vorgabe', options: [['custom', 'Eigene'], ['linear', 'Linear (Standard)'], ['contrast', 'Mittlerer Kontrast'], ['strong', 'Starker Kontrast'], ['lighter', 'Heller'], ['darker', 'Dunkler'], ['fade', 'Verblasst'], ['negative', 'Negativ']] }, 'custom', v => {
      if (!presets[v]) return;
      pts[ch] = presets[v].map(p => ({ ...p }));
      draw();
      preview();
    });
    const chSel = control({ type: 'select', key: 'channel', label: 'Kanal', options: [['rgb', 'RGB'], ['r', 'Rot'], ['g', 'Grün'], ['b', 'Blau']] }, 'rgb', v => {
      ch = v;
      draw();
    });
    const pv = control({ type: 'check', key: 'preview', label: 'Vorschau' }, true, v => {
      previewOn = v;
      if (v) preview();
      else {
        session.cancel();
        a.render();
      }
    });
    draw();
    const res = await modal({
      title: 'Gradationskurven',
      content: el('div', { class: 'curves' }, [el('div', { class: 'row' }, [preset, chSel]), canvas, io]),
      side: pv,
      width: 470,
      className: 'dlg-side',
    });
    clearTimeout(timer);
    if (res === 'ok') {
      session.run(params());
      done(params());
    } else {
      session.cancel();
      a.render();
    }
  }

  // ─── Levels (Tonwertkorrektur) ───
  async function levels(session, done, initial) {
    const a = app();
    const p = { inBlack: 0, gamma: 1, inWhite: 255, outBlack: 0, outWhite: 255, ...(initial || {}) };
    const W = 256, H = 120;
    const hist = PW.filters.histogram(session.orig);
    const canvas = el('canvas', { class: 'levels-hist', width: W * 2, height: H * 2 });
    const g = canvas.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = '#1b1b1e';
    g.fillRect(0, 0, W, H);
    drawHistogram(g, W, H, hist.l, 'rgba(200,200,210,0.8)');

    let previewOn = true, timer = 0;
    const preview = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (previewOn) {
          session.run(p);
          a.render();
        }
      }, 16);
    };

    // Track with draggable triangle handles.
    function track(keys, cls) {
      const t = el('div', { class: `lv-track ${cls}` });
      const handles = keys.map(k => {
        const h = el('div', { class: `lv-h lv-${k}`, tabindex: 0, role: 'slider', 'aria-label': k });
        t.append(h);
        h.addEventListener('pointerdown', e => {
          h.setPointerCapture(e.pointerId);
          const r = t.getBoundingClientRect();
          const mv = ev => {
            const v = clamp(((ev.clientX - r.left) / r.width) * 255, 0, 255);
            if (k === 'gamma') {
              const tt = clamp((v - p.inBlack) / Math.max(1, p.inWhite - p.inBlack), 0.01, 0.99);
              p.gamma = clamp(Math.log(tt) / Math.log(0.5), 0.1, 9.99);
            } else if (k === 'inBlack') p.inBlack = Math.min(Math.round(v), p.inWhite - 2);
            else if (k === 'inWhite') p.inWhite = Math.max(Math.round(v), p.inBlack + 2);
            else p[k] = Math.round(v);
            sync();
            preview();
          };
          const up = () => {
            h.removeEventListener('pointermove', mv);
            h.removeEventListener('pointerup', up);
          };
          h.addEventListener('pointermove', mv);
          h.addEventListener('pointerup', up);
        });
        return [k, h];
      });
      t.handles = Object.fromEntries(handles);
      return t;
    }

    const inTrack = track(['inBlack', 'gamma', 'inWhite'], 'lv-in');
    const outTrack = track(['outBlack', 'outWhite'], 'lv-out');
    const num = (key, step = 1, min = 0, max = 255) => {
      const i = el('input', { type: 'number', class: 'num', min, max, step, 'aria-label': key });
      i.addEventListener('change', () => {
        p[key] = clamp(Number(i.value), min, max);
        sync();
        preview();
      });
      i.addEventListener('keydown', e => e.stopPropagation());
      return i;
    };
    const nums = { inBlack: num('inBlack'), gamma: num('gamma', 0.01, 0.1, 9.99), inWhite: num('inWhite'), outBlack: num('outBlack'), outWhite: num('outWhite') };

    function sync() {
      const pos = v => `${(v / 255) * 100}%`;
      inTrack.handles.inBlack.style.left = pos(p.inBlack);
      inTrack.handles.inWhite.style.left = pos(p.inWhite);
      const gx = p.inBlack + (p.inWhite - p.inBlack) * Math.pow(0.5, p.gamma);
      inTrack.handles.gamma.style.left = pos(gx);
      outTrack.handles.outBlack.style.left = pos(p.outBlack);
      outTrack.handles.outWhite.style.left = pos(p.outWhite);
      for (const k in nums) if (document.activeElement !== nums[k]) nums[k].value = k === 'gamma' ? p.gamma.toFixed(2) : p[k];
    }
    sync();

    const auto = el('button', { type: 'button', class: 'btn', text: 'Auto', onclick: () => {
      const all = new Uint32Array(256);
      for (let i = 0; i < 256; i++) all[i] = hist.r[i] + hist.g[i] + hist.b[i];
      let total = 0;
      for (let i = 0; i < 256; i++) total += all[i];
      let acc = 0, lo = 0, hi = 255;
      for (lo = 0; lo < 255; lo++) { acc += all[lo]; if (acc > total * 0.001) break; }
      acc = 0;
      for (hi = 255; hi > 0; hi--) { acc += all[hi]; if (acc > total * 0.001) break; }
      Object.assign(p, { inBlack: lo, inWhite: Math.max(hi, lo + 2), gamma: 1 });
      sync();
      preview();
    } });
    const pv = control({ type: 'check', key: 'preview', label: 'Vorschau' }, true, v => {
      previewOn = v;
      if (v) preview();
      else {
        session.cancel();
        a.render();
      }
    });

    const content = el('div', { class: 'levels' }, [
      el('div', { class: 'lv-label', text: 'Tonwertspreizung:' }),
      canvas, inTrack,
      el('div', { class: 'lv-nums' }, [nums.inBlack, nums.gamma, nums.inWhite]),
      el('div', { class: 'lv-label', text: 'Tonwertumfang:' }),
      el('div', { class: 'lv-grad' }), outTrack,
      el('div', { class: 'lv-nums two' }, [nums.outBlack, nums.outWhite]),
    ]);
    const res = await modal({ title: 'Tonwertkorrektur', content, side: el('div', { class: 'side-stack' }, [auto, pv]), width: 470, className: 'dlg-side' });
    clearTimeout(timer);
    if (res === 'ok') {
      session.run(p);
      done({ ...p });
    } else {
      session.cancel();
      a.render();
    }
  }

  // ─── New document ───
  const PRESETS = [
    ['custom', 'Benutzerdefiniert'],
    ['1920x1080', 'Full HD · 1920 × 1080'],
    ['1280x720', 'Web · 1280 × 720'],
    ['1080x1080', 'Instagram-Beitrag · 1080 × 1080'],
    ['1080x1350', 'Instagram-Hochformat · 1080 × 1350'],
    ['1080x1920', 'Story / Reel · 1080 × 1920'],
    ['1500x500', 'X-Banner · 1500 × 500'],
    ['2480x3508', 'A4 · 300 ppi · 2480 × 3508'],
    ['1748x2480', 'A5 · 300 ppi · 1748 × 2480'],
    ['800x600', 'Klein · 800 × 600'],
  ];

  async function newDocument() {
    const a = app();
    const v = { name: `Unbenannt-${a.docs.length + 1}`, preset: '1920x1080', width: 1920, height: 1080, bg: 'white' };
    const nameId = 'nd-name';
    const nameIn = el('input', { id: nameId, type: 'text', class: 'text', value: v.name });
    nameIn.addEventListener('keydown', e => e.stopPropagation());
    const wC = control({ type: 'number', key: 'width', label: 'Breite', min: 1, max: 12000, unit: 'Pixel' }, v.width, x => {
      v.width = x;
      pC.update('custom');
    });
    const hC = control({ type: 'number', key: 'height', label: 'Höhe', min: 1, max: 12000, unit: 'Pixel' }, v.height, x => {
      v.height = x;
      pC.update('custom');
    });
    const pC = control({ type: 'select', key: 'preset', label: 'Vorgabe', options: PRESETS }, v.preset, x => {
      if (x === 'custom') return;
      const [w, h] = x.split('x').map(Number);
      v.width = w;
      v.height = h;
      wC.update(w);
      hC.update(h);
    });
    const bgC = control({ type: 'select', key: 'bg', label: 'Hintergrund', options: [['white', 'Weiß'], ['black', 'Schwarz'], ['bgcolor', 'Hintergrundfarbe'], ['transparent', 'Transparent']] }, v.bg, x => (v.bg = x));
    const swap = el('button', { type: 'button', class: 'btn small', html: `${PW.icon('swap', 14)} Hoch/Quer`, onclick: () => {
      [v.width, v.height] = [v.height, v.width];
      wC.update(v.width);
      hC.update(v.height);
    } });
    const content = el('div', { class: 'form-grid' }, [
      el('div', { class: 'ctl' }, [el('label', { for: nameId, text: 'Name' }), nameIn]),
      pC, wC, hC, el('div', { class: 'ctl' }, [el('span', { class: 'lbl' }), swap]), bgC,
    ]);
    const res = await modal({ title: 'Neues Dokument', content, buttons: [['ok', 'Erstellen', true], ['cancel', 'Abbrechen']], width: 480 });
    if (res !== 'ok') return;
    const fill = { white: '#ffffff', black: '#000000', bgcolor: a.bg, transparent: null }[v.bg];
    a.newDocument(clamp(Math.round(v.width), 1, 12000), clamp(Math.round(v.height), 1, 12000), nameIn.value.trim() || 'Unbenannt', fill);
  }

  // ─── Image size ───
  async function imageSize() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    const v = { width: doc.width, height: doc.height, pw: 100, ph: 100, link: true, method: 'smooth' };
    const ratio = doc.width / doc.height;
    let wC, hC, pwC, phC;
    const setW = (x, src) => {
      v.width = Math.max(1, Math.round(x));
      v.pw = (v.width / doc.width) * 100;
      if (v.link) {
        v.height = Math.max(1, Math.round(v.width / ratio));
        v.ph = v.pw;
      }
      refresh(src);
    };
    const setH = (x, src) => {
      v.height = Math.max(1, Math.round(x));
      v.ph = (v.height / doc.height) * 100;
      if (v.link) {
        v.width = Math.max(1, Math.round(v.height * ratio));
        v.pw = v.ph;
      }
      refresh(src);
    };
    const refresh = src => {
      if (src !== 'w') wC.update(v.width);
      if (src !== 'h') hC.update(v.height);
      if (src !== 'pw') pwC.update(v.pw);
      if (src !== 'ph') phC.update(v.ph);
      info.textContent = `Bildgröße: ${fmt((v.width * v.height * 4) / 1048576, 1)} MB (vorher ${fmt((doc.width * doc.height * 4) / 1048576, 1)} MB)`;
    };
    wC = control({ type: 'number', key: 'w', label: 'Breite', min: 1, max: 20000, unit: 'Pixel' }, v.width, x => setW(x, 'w'));
    hC = control({ type: 'number', key: 'h', label: 'Höhe', min: 1, max: 20000, unit: 'Pixel' }, v.height, x => setH(x, 'h'));
    pwC = control({ type: 'number', key: 'pw', label: 'Breite', min: 0.1, max: 2000, step: 0.1, unit: '%' }, 100, x => setW((doc.width * x) / 100, 'pw'));
    phC = control({ type: 'number', key: 'ph', label: 'Höhe', min: 0.1, max: 2000, step: 0.1, unit: '%' }, 100, x => setH((doc.height * x) / 100, 'ph'));
    const link = control({ type: 'check', key: 'link', label: 'Proportionen beibehalten' }, true, x => (v.link = x));
    const method = control({ type: 'select', key: 'method', label: 'Neu berechnen', options: [['smooth', 'Bikubisch (glatte Verläufe)'], ['nearest', 'Pixelwiederholung (harte Kanten)']] }, 'smooth', x => (v.method = x));
    const info = el('p', { class: 'dlg-info' });
    refresh();
    const res = await modal({ title: 'Bildgröße', content: el('div', { class: 'form-grid' }, [info, wC, hC, pwC, phC, link, method]), width: 470 });
    if (res !== 'ok' || (v.width === doc.width && v.height === doc.height)) return;
    await PW.ui.busy(() => doc.resizeImage(v.width, v.height, v.method === 'smooth'));
    a.commit('Bildgröße', 'image');
    a.view.fit(false);
  }

  // ─── Canvas size ───
  async function canvasSize() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    const v = { width: doc.width, height: doc.height, relative: false, ax: 0.5, ay: 0.5, fill: 'transparent' };
    const wC = control({ type: 'number', key: 'w', label: 'Breite', min: -20000, max: 20000, unit: 'Pixel' }, v.width, x => (v.width = x));
    const hC = control({ type: 'number', key: 'h', label: 'Höhe', min: -20000, max: 20000, unit: 'Pixel' }, v.height, x => (v.height = x));
    const rel = control({ type: 'check', key: 'rel', label: 'Relativ' }, false, x => {
      v.relative = x;
      v.width = x ? 0 : doc.width;
      v.height = x ? 0 : doc.height;
      wC.update(v.width);
      hC.update(v.height);
    });
    const anchor = el('div', { class: 'anchor-grid', role: 'group', 'aria-label': 'Anker' });
    const cells = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const b = el('button', { type: 'button', class: 'anchor-cell', 'aria-label': `Anker ${x + 1}/${y + 1}` });
        b.addEventListener('click', () => {
          v.ax = x / 2;
          v.ay = y / 2;
          cells.forEach(c => c.classList.remove('on'));
          b.classList.add('on');
        });
        if (x === 1 && y === 1) b.classList.add('on');
        cells.push(b);
        anchor.append(b);
      }
    }
    const fillC = control({ type: 'select', key: 'fill', label: 'Erweiterungsfarbe', options: [['transparent', 'Transparent'], ['bg', 'Hintergrundfarbe'], ['fg', 'Vordergrundfarbe'], ['white', 'Weiß'], ['black', 'Schwarz']] }, 'transparent', x => (v.fill = x));
    const info = el('p', { class: 'dlg-info', text: `Aktuelle Größe: ${doc.width} × ${doc.height} Pixel` });
    const res = await modal({
      title: 'Arbeitsfläche',
      content: el('div', { class: 'form-grid' }, [info, wC, hC, rel, el('div', { class: 'ctl' }, [el('span', { class: 'lbl', text: 'Anker' }), anchor]), fillC]),
      width: 470,
    });
    if (res !== 'ok') return;
    const nw = Math.round(v.relative ? doc.width + v.width : v.width), nh = Math.round(v.relative ? doc.height + v.height : v.height);
    if (nw < 1 || nh < 1 || (nw === doc.width && nh === doc.height)) return;
    const dx = (nw - doc.width) * v.ax, dy = (nh - doc.height) * v.ay;
    const fill = { transparent: null, bg: a.bg, fg: a.fg, white: '#ffffff', black: '#000000' }[v.fill];
    doc.resizeCanvas(nw, nh, dx, dy, fill);
    a.commit('Arbeitsfläche', 'image');
    a.view.fit(false);
  }

  // ─── Fill (Fläche füllen) ───
  async function fill() {
    const a = app();
    if (!a.doc) return;
    a.finishToolWork();
    const v = { use: 'fg', blend: 'source-over', opacity: 100, preserve: false, color: a.fg };
    const res = await form('Fläche füllen', [
      { type: 'select', key: 'use', label: 'Inhalt', options: [['fg', 'Vordergrundfarbe'], ['bg', 'Hintergrundfarbe'], ['color', 'Farbe …'], ['content', 'Inhaltsbasiert'], ['black', 'Schwarz'], ['gray', '50 % Grau'], ['white', 'Weiß']] },
      { type: 'color', key: 'color', label: 'Farbe', title: 'Füllfarbe', showIf: o => o.use === 'color' },
      { type: 'select', key: 'blend', label: 'Modus', options: PW.BLEND_MODES.filter(Boolean) },
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
      { type: 'check', key: 'preserve', label: 'Transparente Bereiche schützen' },
    ], v);
    if (!res) return;
    if (res.use === 'content') return PW.retouch.contentAwareFill();
    const color = { fg: a.fg, bg: a.bg, color: res.color, black: '#000000', gray: '#808080', white: '#ffffff' }[res.use];
    PW.commands.fillWith(color, res.opacity / 100, res.blend, res.preserve);
  }

  // ─── Stroke (Kontur) ───
  async function stroke() {
    const a = app();
    if (!a.doc) return;
    a.finishToolWork();
    const res = await form('Kontur', [
      { type: 'number', key: 'width', label: 'Breite', min: 1, max: 250, unit: 'Px' },
      { type: 'color', key: 'color', label: 'Farbe', title: 'Konturfarbe' },
      { type: 'select', key: 'position', label: 'Position', options: [['inside', 'Innen'], ['center', 'Mitte'], ['outside', 'Außen']] },
      { type: 'range', key: 'opacity', label: 'Deckkraft', min: 1, max: 100, unit: '%' },
    ], { width: 4, color: a.fg, position: 'center', opacity: 100 });
    if (!res) return;
    PW.commands.strokeSelection(res);
  }

  // ─── Layer style (Ebenenstil) ───
  async function layerStyle() {
    const a = app(), L = a.doc && a.doc.active;
    if (!L) return;
    a.finishToolWork();
    const orig = L.fx ? JSON.parse(JSON.stringify(L.fx)) : null;
    const fx = JSON.parse(JSON.stringify({ ...PW.FX_DEFAULTS, ...(L.fx || {}) }));
    L.fx = fx;
    const live = () => a.render();
    const section = (key, title, defs) => {
      const box = el('fieldset', { class: 'fx-sec' });
      const head = control({ type: 'check', key: `${key}-on`, label: title }, fx[key].enabled, v => {
        fx[key].enabled = v;
        live();
      });
      box.append(el('legend', {}, head));
      defs.forEach(d => box.append(control(d, d.scale ? fx[key][d.key] * d.scale : fx[key][d.key], v => {
        fx[key][d.key] = d.scale ? v / d.scale : v;
        if (!fx[key].enabled) {
          fx[key].enabled = true;
          head.update(true);
        }
        live();
      })));
      return box;
    };
    const content = el('div', { class: 'fx' }, [
      section('shadow', 'Schlagschatten', [
        { type: 'color', key: 'color', label: 'Farbe', title: 'Schattenfarbe' },
        { type: 'range', key: 'opacity', label: 'Deckkraft', min: 0, max: 100, unit: '%', scale: 100 },
        { type: 'range', key: 'angle', label: 'Winkel', min: -180, max: 180, unit: '°' },
        { type: 'range', key: 'distance', label: 'Distanz', min: 0, max: 300, unit: 'Px' },
        { type: 'range', key: 'size', label: 'Größe', min: 0, max: 250, unit: 'Px' },
      ]),
      section('glow', 'Schein nach außen', [
        { type: 'color', key: 'color', label: 'Farbe', title: 'Farbe des Scheins' },
        { type: 'range', key: 'opacity', label: 'Deckkraft', min: 0, max: 100, unit: '%', scale: 100 },
        { type: 'range', key: 'size', label: 'Größe', min: 0, max: 250, unit: 'Px' },
      ]),
      section('stroke', 'Kontur', [
        { type: 'color', key: 'color', label: 'Farbe', title: 'Konturfarbe' },
        { type: 'range', key: 'size', label: 'Größe', min: 1, max: 50, unit: 'Px' },
        { type: 'range', key: 'opacity', label: 'Deckkraft', min: 0, max: 100, unit: '%', scale: 100 },
      ]),
    ]);
    live();
    const res = await modal({ title: `Ebenenstil – ${L.name}`, content, width: 520 });
    if (res === 'ok') {
      const any = Object.values(fx).some(f => f.enabled);
      L.fx = any ? fx : null;
      a.commit('Ebenenstil', 'fx');
    } else {
      L.fx = orig;
      a.render();
    }
  }

  // ─── Export ───
  async function exportImage() {
    const a = app(), doc = a.doc;
    if (!doc) return;
    a.finishToolWork();
    // A photo goes out as a photo (JPEG, high quality, ready to send); everything else as PNG.
    const photo = /\.(jpe?g|heic|heif)$/i.test(doc.name);
    const v = { format: photo ? 'jpeg' : 'png', quality: 92, scale: 100, name: doc.name.replace(/\.[a-z0-9]+$/i, '') };
    const nameId = 'ex-name';
    const nameIn = el('input', { id: nameId, type: 'text', class: 'text', value: v.name });
    nameIn.addEventListener('keydown', e => e.stopPropagation());
    const info = el('p', { class: 'dlg-info' });
    const upd = () => (info.textContent = `Ausgabe: ${Math.max(1, Math.round((doc.width * v.scale) / 100))} × ${Math.max(1, Math.round((doc.height * v.scale) / 100))} Pixel`);
    const q = control({ type: 'range', key: 'quality', label: 'Qualität', min: 1, max: 100, unit: '%' }, v.quality, x => (v.quality = x));
    const fmtC = control({ type: 'select', key: 'format', label: 'Format', options: [['jpeg', 'JPG – für Fotos'], ['png', 'PNG – mit Transparenz'], ['webp', 'WebP']] }, v.format, x => {
      v.format = x;
      q.hidden = x === 'png';
    });
    q.hidden = v.format === 'png';
    const sc = control({ type: 'number', key: 'scale', label: 'Skalierung', min: 1, max: 400, unit: '%' }, v.scale, x => {
      v.scale = x;
      upd();
    });
    upd();
    const res = await modal({
      title: 'Bild speichern',
      content: el('div', { class: 'form-grid' }, [el('div', { class: 'ctl' }, [el('label', { for: nameId, text: 'Dateiname' }), nameIn]), fmtC, q, sc, info]),
      buttons: [['ok', 'Speichern', true], ['cancel', 'Abbrechen']],
      width: 470,
    });
    if (res !== 'ok') return;
    PW.io.exportImage(doc, { ...v, name: nameIn.value.trim() || 'Bild' });
  }

  // ─── Help ───
  function shortcuts() {
    const rows = PW.shortcutList().map(([k, label]) => el('tr', {}, [el('td', { text: label }), el('td', {}, el('kbd', { text: k }))]));
    return modal({
      title: 'Tastaturbefehle',
      content: el('div', { class: 'shortcut-table' }, el('table', {}, el('tbody', {}, rows))),
      buttons: [['ok', 'Schließen', true]],
      width: 560,
    });
  }

  function about() {
    return modal({
      title: 'Über Pixelwerk',
      content: el('div', { class: 'about' }, [
        el('div', { class: 'about-logo', text: 'Pw' }),
        el('p', {}, [el('strong', { text: 'Pixelwerk' }), ' – Bildbearbeitung im Browser.']),
        el('p', { class: 'dlg-text', text: 'Ebenen mit Masken, Füllmethoden und Stilen, Auswahlwerkzeuge, Pinsel, Kopierstempel, Verläufe, Text, Frei transformieren, Korrekturen, Filter und ein vollständiges Protokoll. Alles läuft lokal in deinem Browser – deine Bilder verlassen das Gerät nicht.' }),
      ]),
      buttons: [['ok', 'OK', true]],
      width: 460,
    });
  }

  PW.dialogs = {
    modal, confirm, alert, form, textInput, colorPicker, runFilter,
    newDocument, imageSize, canvasSize, fill, stroke, layerStyle, exportImage, shortcuts, about,
  };
})(window.PW);
