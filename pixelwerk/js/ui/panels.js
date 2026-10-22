// ─── Panels: colour, swatches, navigator, histogram, adjustments, layers, history ───
'use strict';

(function (PW) {
  const { el, clamp, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, fmt, createCanvas } = PW.util;
  const app = () => PW.app;

  const GROUPS = [
    { id: 'g1', panels: ['quick', 'assistant', 'color', 'swatches'] },
    { id: 'g2', panels: ['navigator', 'histogram', 'adjustments'] },
    { id: 'g3', panels: ['layers', 'paths', 'history'], grow: true },
  ];
  const TITLES = { quick: 'Schnellstart', assistant: 'Claude', color: 'Farbe', swatches: 'Farbfelder', navigator: 'Navigator', histogram: 'Histogramm', adjustments: 'Korrekturen', layers: 'Ebenen', paths: 'Pfade', history: 'Protokoll' };
  const state = { active: { g1: 'quick', g2: 'navigator', g3: 'layers' }, hidden: {}, collapsed: { g2: true } };
  const bodies = {};
  const renderers = {};

  // Throttle redraws of expensive panels to one per frame.
  function throttle(fn) {
    let raf = 0;
    return () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        fn();
      });
    };
  }

  function buildDock() {
    const dock = document.getElementById('dock');
    dock.innerHTML = '';
    for (const g of GROUPS) {
      const visiblePanels = g.panels.filter(p => !state.hidden[p]);
      if (!visiblePanels.length) continue;
      if (!visiblePanels.includes(state.active[g.id])) state.active[g.id] = visiblePanels[0];
      const tabs = el('div', { class: 'panel-tabs', role: 'tablist' });
      for (const p of visiblePanels) {
        const t = el('button', { type: 'button', class: 'panel-tab', role: 'tab', text: TITLES[p], 'aria-selected': String(state.active[g.id] === p) });
        t.addEventListener('click', () => {
          if (state.active[g.id] === p && !state.collapsed[g.id]) state.collapsed[g.id] = false;
          state.active[g.id] = p;
          state.collapsed[g.id] = false;
          buildDock();
        });
        t.addEventListener('dblclick', () => {
          state.collapsed[g.id] = !state.collapsed[g.id];
          buildDock();
        });
        tabs.append(t);
      }
      const collapse = el('button', { type: 'button', class: 'panel-collapse', 'aria-label': state.collapsed[g.id] ? 'Bedienfeld ausklappen' : 'Bedienfeld einklappen', html: PW.icon('chev-down', 14) });
      collapse.addEventListener('click', () => {
        state.collapsed[g.id] = !state.collapsed[g.id];
        buildDock();
      });
      tabs.append(el('span', { class: 'spacer' }), collapse);
      const body = el('div', { class: `panel-body panel-${state.active[g.id]}`, role: 'tabpanel' });
      const group = el('section', { class: `panel-group ${g.grow ? 'grow' : ''} ${state.collapsed[g.id] ? 'collapsed' : ''}`, 'data-panel': state.active[g.id] }, [tabs, body]);
      dock.append(group);
      bodies[g.id] = body;
      if (!state.collapsed[g.id]) renderers[state.active[g.id]].build(body);
    }
    save();
  }

  function save() {
    try { localStorage.setItem('pw-panels', JSON.stringify(state)); } catch { /* optional */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('pw-panels') || 'null');
      if (s && s.active) Object.assign(state, s);
    } catch { /* optional */ }
  }

  function isVisible(id) {
    const g = GROUPS.find(x => x.panels.includes(id));
    return !state.hidden[id] && state.active[g.id] === id && !document.body.classList.contains('dock-hidden');
  }

  function show(id) {
    const g = GROUPS.find(x => x.panels.includes(id));
    if (isVisible(id)) {
      state.hidden[id] = true;
    } else {
      state.hidden[id] = false;
      state.active[g.id] = id;
      state.collapsed[g.id] = false;
      document.body.classList.remove('dock-hidden');
    }
    buildDock();
  }

  // Shows a panel without toggling it off when it is already visible.
  function showTab(id) {
    const g = GROUPS.find(x => x.panels.includes(id));
    state.hidden[id] = false;
    state.active[g.id] = id;
    state.collapsed[g.id] = false;
    document.body.classList.remove('dock-hidden');
    buildDock();
  }

  function reset() {
    state.active = { g1: 'quick', g2: 'navigator', g3: 'layers' };
    state.hidden = {};
    state.collapsed = { g2: true };
    document.body.classList.remove('dock-hidden');
    buildDock();
  }

  const mounted = id => {
    const g = GROUPS.find(x => x.panels.includes(id));
    return state.active[g.id] === id && !state.collapsed[g.id] && !state.hidden[id] ? bodies[g.id] : null;
  };

  // ─── Quick tasks for beginners (built by guide.js) ───
  renderers.quick = {
    build(body) { PW.guide.buildQuick(body); },
    update() {},
  };

  // ─── Claude assistant (assistant.js) ───
  renderers.assistant = {
    build(body) { PW.assistant.build(body); },
    update() {},
  };

  // ─── Colour panel: saturation/brightness field, hue strip, hex ───
  renderers.color = {
    build(body) {
      const sv = el('canvas', { class: 'cpanel-sv', width: 480, height: 200, 'aria-label': 'Farbfeld' });
      const hue = el('canvas', { class: 'cpanel-hue', width: 480, height: 24, 'aria-label': 'Farbton' });
      const hexId = 'cpanel-hex';
      const hexIn = el('input', { id: hexId, class: 'text hex', type: 'text', maxlength: 7 });
      const fgChip = el('button', { type: 'button', class: 'mini-chip fg', title: 'Vordergrundfarbe', 'aria-label': 'Vordergrundfarbe bearbeiten' });
      const bgChip = el('button', { type: 'button', class: 'mini-chip bg', title: 'Hintergrundfarbe', 'aria-label': 'Hintergrundfarbe bearbeiten' });
      let target = 'fg';
      const rgbRow = el('div', { class: 'cpanel-rgb' });
      body.append(el('div', { class: 'cpanel-top' }, [el('div', { class: 'mini-chips' }, [bgChip, fgChip]), el('label', { for: hexId, text: '#' }), hexIn, rgbRow]), sv, hue);

      let hsv = { h: 0, s: 0, v: 0 };
      const cur = () => (target === 'fg' ? app().fg : app().bg);
      const setCur = hex => (target === 'fg' ? app().setFG(hex) : app().setBG(hex));

      const draw = () => {
        const g = sv.getContext('2d'), W = sv.width, H = sv.height;
        g.fillStyle = rgbToHex(hsvToRgb(hsv.h, 100, 100));
        g.fillRect(0, 0, W, H);
        const wg = g.createLinearGradient(0, 0, W, 0);
        wg.addColorStop(0, '#fff');
        wg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = wg;
        g.fillRect(0, 0, W, H);
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(0,0,0,0)');
        bg.addColorStop(1, '#000');
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        g.beginPath();
        g.arc((hsv.s / 100) * W, (1 - hsv.v / 100) * H, 9, 0, Math.PI * 2);
        g.lineWidth = 3;
        g.strokeStyle = hsv.v > 60 && hsv.s < 40 ? '#000' : '#fff';
        g.stroke();
        const hg = hue.getContext('2d'), HW = hue.width;
        const gr = hg.createLinearGradient(0, 0, HW, 0);
        [0, 60, 120, 180, 240, 300, 360].forEach(h => gr.addColorStop(h / 360, `hsl(${h},100%,50%)`));
        hg.fillStyle = gr;
        hg.fillRect(0, 0, HW, hue.height);
        const hx = (hsv.h / 360) * HW;
        hg.fillStyle = '#fff';
        hg.fillRect(hx - 3, 0, 6, hue.height);
        hg.strokeStyle = '#000';
        hg.lineWidth = 1.5;
        hg.strokeRect(hx - 3, 0.75, 6, hue.height - 1.5);
      };
      const sync = () => {
        const hex = cur(), c = hexToRgb(hex), n = rgbToHsv(c.r, c.g, c.b);
        if (rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)) !== hex) {
          if (n.s > 0 && n.v > 0) hsv = n;
          else hsv = { h: hsv.h, s: n.s, v: n.v };
        }
        if (document.activeElement !== hexIn) hexIn.value = hex.slice(1);
        fgChip.style.background = app().fg;
        bgChip.style.background = app().bg;
        fgChip.classList.toggle('on', target === 'fg');
        bgChip.classList.toggle('on', target === 'bg');
        rgbRow.textContent = `R ${c.r}  G ${c.g}  B ${c.b}`;
        draw();
      };
      const pick = (canvas, fn) => canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        const on = ev => {
          const r = canvas.getBoundingClientRect();
          fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
          setCur(rgbToHex(hsvToRgb(hsv.h, hsv.s, hsv.v)));
        };
        on(e);
        const mv = ev => on(ev);
        const up = () => {
          canvas.removeEventListener('pointermove', mv);
          canvas.removeEventListener('pointerup', up);
        };
        canvas.addEventListener('pointermove', mv);
        canvas.addEventListener('pointerup', up);
      });
      pick(sv, (x, y) => {
        hsv.s = x * 100;
        hsv.v = (1 - y) * 100;
      });
      pick(hue, x => {
        hsv.h = x * 360;
        if (hsv.s < 5) hsv.s = 100;
        if (hsv.v < 5) hsv.v = 100;
      });
      hexIn.addEventListener('change', () => {
        const c = hexToRgb(hexIn.value);
        if (c) setCur(rgbToHex(c));
        else sync();
      });
      hexIn.addEventListener('keydown', e => e.stopPropagation());
      fgChip.addEventListener('click', () => {
        if (target === 'fg') PW.dialogs.colorPicker(app().fg, 'Farbwähler (Vordergrundfarbe)').then(c => c && app().setFG(c));
        target = 'fg';
        sync();
      });
      bgChip.addEventListener('click', () => {
        if (target === 'bg') PW.dialogs.colorPicker(app().bg, 'Farbwähler (Hintergrundfarbe)').then(c => c && app().setBG(c));
        target = 'bg';
        sync();
      });
      this.sync = sync;
      sync();
    },
    update() {
      if (mounted('color') && this.sync) this.sync();
    },
  };

  // ─── Swatches ───
  const DEFAULT_SWATCHES = [
    '#000000', '#3a3a3a', '#7a7a7a', '#b4b4b4', '#e0e0e0', '#ffffff',
    '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff',
    '#f26c4f', '#f68e55', '#fbaf5c', '#fff467', '#acd372', '#7cc576', '#3bb878', '#1abbb4', '#00bff3', '#438cca', '#5574b9', '#605ca8', '#855fa8', '#a763a8', '#f06ea9', '#f26d7d',
    '#9e0b0f', '#a0410d', '#a3620a', '#aba000', '#598527', '#1a7b30', '#007236', '#00746b', '#0076a3', '#004b80', '#003471', '#1b1464', '#440e62', '#630460', '#9e005d', '#9e0039',
    '#c7b299', '#998675', '#736357', '#534741', '#37302d', '#c69c6d', '#a67c52', '#8c6239', '#754c24', '#603913',
  ];
  let customSwatches = [];
  try { customSwatches = JSON.parse(localStorage.getItem('pw-swatches') || '[]'); } catch { customSwatches = []; }

  function addSwatch(hex) {
    customSwatches.push(hex);
    try { localStorage.setItem('pw-swatches', JSON.stringify(customSwatches)); } catch { /* optional */ }
    renderers.swatches.update();
    app().toast('Farbfeld hinzugefügt');
  }

  renderers.swatches = {
    build(body) {
      const grid = el('div', { class: 'swatch-grid', role: 'list' });
      const all = [...DEFAULT_SWATCHES.map(c => [c, false]), ...customSwatches.map((c, i) => [c, i])];
      for (const [c, customIdx] of all) {
        const b = el('button', { type: 'button', class: 'swatch', title: `${c}${customIdx !== false ? ' – Rechtsklick entfernt' : ''}`, 'aria-label': `Farbe ${c}` });
        b.style.background = c;
        b.addEventListener('click', e => (e.altKey ? app().setBG(c) : app().setFG(c)));
        b.addEventListener('contextmenu', e => {
          e.preventDefault();
          if (customIdx === false) return;
          customSwatches.splice(customIdx, 1);
          try { localStorage.setItem('pw-swatches', JSON.stringify(customSwatches)); } catch { /* optional */ }
          this.update();
        });
        grid.append(b);
      }
      const add = el('button', { type: 'button', class: 'swatch add', title: 'Vordergrundfarbe als Farbfeld hinzufügen', 'aria-label': 'Farbfeld hinzufügen', html: PW.icon('plus', 12) });
      add.addEventListener('click', () => addSwatch(app().fg));
      grid.append(add);
      body.append(grid, el('p', { class: 'panel-note', text: 'Klick: Vordergrundfarbe · Alt-Klick: Hintergrundfarbe' }));
    },
    update() {
      const b = mounted('swatches');
      if (b) {
        b.innerHTML = '';
        this.build(b);
      }
    },
  };

  // ─── Navigator ───
  renderers.navigator = {
    build(body) {
      const c = el('canvas', { class: 'nav-canvas', 'aria-label': 'Übersicht' });
      const zoom = el('input', { type: 'range', min: 0, max: 100, step: 0.1, class: 'nav-zoom', 'aria-label': 'Zoom' });
      const label = el('span', { class: 'nav-label' });
      body.append(c, el('div', { class: 'nav-row' }, [
        el('button', { type: 'button', class: 'tbtn', 'aria-label': 'Auszoomen', html: PW.icon('zoom-out', 14), onclick: () => app().view.zoomStep(-1) }),
        zoom,
        el('button', { type: 'button', class: 'tbtn', 'aria-label': 'Einzoomen', html: PW.icon('zoom-in', 14), onclick: () => app().view.zoomStep(1) }),
        label,
      ]));
      const toZ = t => 0.01 * Math.pow(6400, t / 100);
      const fromZ = z => (Math.log(z / 0.01) / Math.log(6400)) * 100;
      zoom.addEventListener('input', () => app().view.setZoom(toZ(Number(zoom.value))));
      const pan = e => {
        const doc = app().doc, v = app().view;
        if (!doc) return;
        const r = c.getBoundingClientRect(), k = this.k;
        const dx = (e.clientX - r.left - this.ox) / k, dy = (e.clientY - r.top - this.oy) / k;
        v.x = v.cw / 2 - dx * v.zoom;
        v.y = v.ch / 2 - dy * v.zoom;
        v.constrain();
        v.requestRender();
        this.draw();
      };
      c.addEventListener('pointerdown', e => {
        c.setPointerCapture(e.pointerId);
        pan(e);
        const mv = ev => pan(ev);
        const up = () => {
          c.removeEventListener('pointermove', mv);
          c.removeEventListener('pointerup', up);
        };
        c.addEventListener('pointermove', mv);
        c.addEventListener('pointerup', up);
      });
      this.c = c;
      this.draw = () => {
        const doc = app().doc, v = app().view, W = body.clientWidth - 16 || 240, H = 150;
        const dpr = window.devicePixelRatio || 1;
        c.width = W * dpr;
        c.height = H * dpr;
        c.style.width = `${W}px`;
        c.style.height = `${H}px`;
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        if (!doc) return;
        const k = Math.min(W / doc.width, H / doc.height);
        this.k = k;
        this.ox = (W - doc.width * k) / 2;
        this.oy = (H - doc.height * k) / 2;
        g.fillStyle = PW.util.checker(g, 4);
        g.fillRect(this.ox, this.oy, doc.width * k, doc.height * k);
        g.imageSmoothingQuality = 'high';
        g.drawImage(doc.composite(), this.ox, this.oy, doc.width * k, doc.height * k);
        const x = (-v.x / v.zoom) * k + this.ox, y = (-v.y / v.zoom) * k + this.oy;
        g.strokeStyle = '#ff3b30';
        g.lineWidth = 1.5;
        g.strokeRect(x, y, (v.cw / v.zoom) * k, (v.ch / v.zoom) * k);
        if (document.activeElement !== zoom) zoom.value = fromZ(v.zoom);
        label.textContent = `${fmt(v.zoom * 100, v.zoom < 0.1 ? 1 : 0)} %`;
      };
      this.draw();
    },
    update() {
      if (mounted('navigator') && this.draw) this.draw();
    },
  };

  // ─── Histogram ───
  renderers.histogram = {
    build(body) {
      const c = el('canvas', { class: 'hist-canvas', 'aria-label': 'Histogramm' });
      const info = el('p', { class: 'panel-note' });
      body.append(c, info);
      this.draw = () => {
        const doc = app().doc, W = body.clientWidth - 16 || 240, H = 110, dpr = window.devicePixelRatio || 1;
        c.width = W * dpr;
        c.height = H * dpr;
        c.style.width = `${W}px`;
        c.style.height = `${H}px`;
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        if (!doc) return;
        const comp = doc.composite(), k = Math.min(1, 400 / Math.max(doc.width, doc.height));
        const sw = Math.max(1, Math.round(doc.width * k)), sh = Math.max(1, Math.round(doc.height * k));
        const small = createCanvas(sw, sh);
        small.getContext('2d').drawImage(comp, 0, 0, sw, sh);
        const hist = PW.filters.histogram(small.getContext('2d').getImageData(0, 0, sw, sh));
        let max = 1;
        for (const ch of ['r', 'g', 'b']) for (let i = 0; i < 256; i++) max = Math.max(max, hist[ch][i]);
        g.globalCompositeOperation = 'screen';
        for (const [ch, col] of [['r', '#ff3b3b'], ['g', '#2fd35a'], ['b', '#3b7bff']]) {
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(0, H);
          for (let i = 0; i < 256; i++) g.lineTo((i / 255) * W, H - Math.sqrt(hist[ch][i] / max) * H);
          g.lineTo(W, H);
          g.closePath();
          g.fill();
        }
        g.globalCompositeOperation = 'source-over';
        let n = 0, sum = 0;
        for (let i = 0; i < 256; i++) {
          n += hist.l[i];
          sum += hist.l[i] * i;
        }
        let sd = 0;
        const mean = n ? sum / n : 0;
        for (let i = 0; i < 256; i++) sd += hist.l[i] * (i - mean) ** 2;
        info.textContent = n ? `Mittelwert ${fmt(mean, 1)} · Abweichung ${fmt(Math.sqrt(sd / n), 1)} · Pixel ${fmt(doc.width * doc.height)}` : 'Keine sichtbaren Pixel';
      };
      this.draw();
    },
    update() {
      if (mounted('histogram') && this.draw) this.draw();
    },
  };

  // ─── Adjustments: quick access to the colour corrections ───
  renderers.adjustments = {
    build(body) {
      const grid = el('div', { class: 'adj-grid' });
      for (const f of PW.filters.defs) {
        if (f.menu !== 'adjust' || !f.icon) continue;
        const b = el('button', { type: 'button', class: 'adj-btn', title: `${f.name.replace('…', '')} (Alt-Klick: direkt auf die Ebene)`, 'aria-label': f.name.replace('…', ''), html: PW.icon(f.icon, 18) });
        // Like Photoshop's Korrekturen panel: a click adds an adjustment layer that stays editable.
        b.addEventListener('click', e => (e.altKey ? PW.runAction(`adjust.${f.id}`) : PW.adjustLayers.create(f.id)));
        grid.append(b);
      }
      body.append(el('p', { class: 'panel-note', text: 'Einstellungsebene hinzufügen (jederzeit änderbar, Doppelklick in den Ebenen):' }), grid);
    },
    update() {},
  };

  // ─── Layers ───
  function thumb(canvas, size, isMask) {
    const c = el('canvas', { class: 'thumb' });
    const dpr = window.devicePixelRatio || 1;
    const k = Math.min(size / canvas.width, size / canvas.height);
    const w = Math.max(1, Math.round(canvas.width * k)), h = Math.max(1, Math.round(canvas.height * k));
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    if (!isMask) {
      g.fillStyle = PW.util.checker(g, 4);
      g.fillRect(0, 0, w, h);
    }
    g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, 0, 0, w, h);
    return c;
  }

  let lastClick = null;

  renderers.layers = {
    build(body) {
      const a = app(), doc = a.doc;
      const L = doc && doc.active;
      const blendOpts = L && L.isGroup ? [['pass-through', 'Hindurchwirken'], ...PW.BLEND_MODES.filter(Boolean)] : PW.BLEND_MODES.filter(Boolean);
      const blend = PW.ui.control({ type: 'select', key: 'blend', options: blendOpts, title: 'Füllmethode' }, L ? L.blend : 'source-over', v => {
        if (!doc.active) return;
        doc.active.blend = v;
        a.commit('Füllmethode ändern', 'layers');
      });
      const opacity = PW.ui.control({ type: 'range', key: 'opacity', label: 'Deckkraft', min: 0, max: 100, unit: '%' }, L ? Math.round(L.opacity * 100) : 100, (v, final) => {
        if (!doc.active) return;
        doc.active.opacity = v / 100;
        a.render();
        if (final) a.commit('Deckkraft ändern', 'layers');
      });
      const lockA = el('button', { type: 'button', class: 'tbtn', title: 'Transparente Pixel fixieren', 'aria-label': 'Transparente Pixel fixieren', html: PW.icon('lock-alpha', 15), 'aria-pressed': String(!!(L && L.lockAlpha)), onclick: () => PW.commands.toggleLockAlpha() });
      const lockAll = el('button', { type: 'button', class: 'tbtn', title: 'Alles fixieren (Ebene sperren)', 'aria-label': 'Ebene sperren', html: PW.icon('lock', 15), 'aria-pressed': String(!!(L && L.locked)), onclick: () => PW.commands.toggleLock() });
      const top = el('div', { class: 'layers-top' }, [blend, opacity, el('div', { class: 'lock-row' }, [el('span', { class: 'lbl', text: 'Fixieren:' }), lockA, lockAll])]);
      if (!L) top.classList.add('disabled');

      const list = el('div', { class: 'layer-list', role: 'listbox', 'aria-label': 'Ebenen' });
      if (doc) {
        // Contents of a closed group are not listed.
        for (let i = doc.layers.length - 1; i >= 0; i--) {
          const L2 = doc.layers[i];
          if (doc.ancestorsOf(L2).some(g => g.collapsed)) continue;
          list.append(this.row(doc, L2, i));
          if (L2.smart && L2.smart.filters.length) list.append(...this.filterRows(doc, L2));
        }
      }
      const btn = (icon, title, action, extra) => el('button', { type: 'button', class: 'tbtn', title, 'aria-label': title, html: PW.icon(icon, 16), onclick: () => PW.runAction(action), ...extra });
      const bottom = el('div', { class: 'layers-bottom' }, [
        btn('fx', 'Ebenenstil hinzufügen', 'layer.style'),
        btn('mask', 'Ebenenmaske hinzufügen', 'layer.maskRevealSel'),
        btn('adjust', 'Neue Einstellungsebene', 'window.adjustments'),
        btn('folder', 'Neue Gruppe erstellen', 'layer.newGroup'),
        btn('duplicate', 'Ebene duplizieren', 'layer.duplicate'),
        btn('new-layer', 'Neue Ebene erstellen', 'layer.new'),
        btn('trash', 'Ebene löschen', 'layer.delete'),
      ]);
      bottom.children[1].onclick = () => PW.commands.addMask(a.doc && !a.doc.selection.empty ? 'revealSel' : 'reveal');
      body.append(top, list, bottom);
      const act = list.querySelector('.layer-row.active');
      if (act) act.scrollIntoView({ block: 'nearest' });
    },

    row(doc, L, index) {
      const a = app();
      const active = L.id === doc.activeId;
      const eye = el('button', { type: 'button', class: `eye ${L.visible ? 'on' : ''}`, title: 'Ebene ein-/ausblenden (Alt: nur diese)', 'aria-label': L.visible ? 'Ebene ausblenden' : 'Ebene einblenden', 'aria-pressed': String(L.visible), html: L.visible ? PW.icon('eye', 15) : '' });
      eye.addEventListener('click', e => {
        e.stopPropagation();
        if (e.altKey) PW.commands.soloLayer(L);
        else PW.commands.toggleVisible(L);
      });
      const adef = L.adjust && PW.adjustLayers.defOf(L.adjust.id);
      const th = L.isGroup
        ? el('div', { class: 'thumb-wrap group-thumb', title: 'Gruppe · Strg/⌘-Klick: Auswahl aus dem Inhalt laden', html: PW.icon(L.collapsed ? 'folder' : 'folder-open', 20) })
        : L.adjust
          ? el('div', { class: 'thumb-wrap adjust-thumb', title: 'Doppelklick: Einstellungen ändern', html: PW.icon((adef && adef.icon) || 'adjust', 18) })
          : el('div', { class: `thumb-wrap ${active && !L.editMask ? 'target' : ''}`, title: 'Strg/⌘-Klick: Auswahl aus Ebene laden' }, L.isText ? el('div', { class: 'text-thumb', text: 'T' }) : thumb(L.canvas, 34));
      th.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey) {
          e.stopPropagation();
          PW.commands.loadLayerAlpha(L, e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace');
          return;
        }
        if (L.editMask) {
          L.editMask = false;
          if (active) PW.bus.emit('layers:changed', doc);
        }
      });

      if (L.smart) th.append(el('span', { class: 'smart-badge', title: 'Smartobjekt · Ebene › Smartobjekte › Inhalt bearbeiten', html: PW.icon('smart', 11) }));
      // Groups: indent by level, a triangle opens and closes the group.
      const depth = doc.depthOf(L);
      const twisty = L.isGroup
        ? el('button', { type: 'button', class: `twisty ${L.collapsed ? '' : 'open'}`, title: L.collapsed ? 'Gruppe öffnen' : 'Gruppe schließen', 'aria-label': L.collapsed ? 'Gruppe öffnen' : 'Gruppe schließen', 'aria-expanded': String(!L.collapsed), html: PW.icon('twisty', 12) })
        : el('span', { class: 'twisty-space' });
      if (L.isGroup) {
        twisty.addEventListener('click', e => {
          e.stopPropagation();
          PW.commands.toggleCollapsed(L);
        });
      }
      const lead = el('div', { class: 'lr-lead' }, [twisty, th]);
      lead.style.marginLeft = `${depth * 14}px`;
      const parts = [eye, lead];
      if (L.mask) {
        const mt = el('div', { class: `thumb-wrap mask ${active && (L.editMask || L.adjust) ? 'target' : ''} ${L.maskEnabled ? '' : 'off'}`, title: 'Maske bearbeiten · Umschalt-Klick: deaktivieren' }, thumb(L.mask, 34, true));
        mt.addEventListener('click', e => {
          if (e.shiftKey) {
            e.stopPropagation();
            doc.setActive(L.id);
            PW.commands.toggleMask();
            return;
          }
          if (!L.editMask) {
            L.editMask = true;
            if (active) PW.bus.emit('layers:changed', doc);
          }
        });
        parts.push(mt);
      }
      const name = el('span', { class: 'layer-name', text: L.name });
      parts.push(name);
      const badges = el('span', { class: 'badges' });
      if (L.fx && Object.values(L.fx).some(f => f.enabled)) badges.append(el('span', { class: 'badge fx', text: 'fx', title: 'Ebenenstil' }));
      if (L.lockAlpha) badges.append(el('span', { class: 'badge', html: PW.icon('lock-alpha', 13), title: 'Transparenz fixiert' }));
      if (L.locked) badges.append(el('span', { class: 'badge', html: PW.icon('lock', 13), title: 'Gesperrt' }));
      parts.push(badges);
      const picked = !active && doc.picked && doc.picked.has(L.id);
      const row = el('div', { class: `layer-row ${active ? 'active' : ''} ${picked ? 'picked' : ''} ${L.isGroup ? 'group-row' : ''} ${doc.shown(L) ? '' : 'hidden-layer'}`, role: 'option', 'aria-selected': String(active || !!picked), tabindex: active ? '0' : '-1' }, parts);
      row.dataset.index = index;
      row.dataset.id = L.id;
      // Double-clicks are matched by layer id, because the first click may re-render the list.
      row.addEventListener('click', e => {
        const zone = e.target.closest('.layer-name') ? 'name' : e.target.closest('.thumb-wrap:not(.mask)') ? 'thumb' : e.target.closest('.eye') ? 'eye' : 'row';
        // Umschalt- or Strg/⌘-click picks several layers (for grouping or deleting them together).
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (L.id !== doc.activeId) {
            doc.picked = doc.picked || new Set();
            if (doc.picked.has(L.id)) doc.picked.delete(L.id);
            else doc.picked.add(L.id);
            PW.bus.emit('layers:changed', doc);
          }
          return;
        }
        if (doc.picked && doc.picked.size) {
          doc.picked = null;
          if (doc.activeId === L.id) PW.bus.emit('layers:changed', doc);
        }
        const now = performance.now(), prev = lastClick;
        lastClick = { id: L.id, zone, t: now };
        if (doc.activeId !== L.id) doc.setActive(L.id);
        if (!prev || prev.id !== L.id || prev.zone !== zone || now - prev.t > 450) return;
        lastClick = null;
        // Wait for the re-render triggered by activation, then edit the fresh row.
        if (zone === 'name') requestAnimationFrame(() => requestAnimationFrame(() => this.renameInline(L, doc)));
        else if (zone === 'thumb' && L.isText) {
          a.setTool('text');
          PW.tools.byId.text.startEdit(L, false);
        } else if ((zone === 'thumb' || zone === 'row') && L.adjust) PW.adjustLayers.edit(L);
        else if (L.isGroup) PW.commands.toggleCollapsed(L);
        else if (zone === 'row') PW.runAction('layer.style');
      });
      row.addEventListener('keydown', e => {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && L.isGroup && L.collapsed === (e.key === 'ArrowRight')) {
          e.preventDefault();
          e.stopPropagation();
          PW.commands.toggleCollapsed(L);
          requestAnimationFrame(() => {
            const r = document.querySelector('.layer-row.active');
            if (r) r.focus();
          });
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const rows = [...row.parentElement.querySelectorAll('.layer-row')], j = rows.indexOf(row) + (e.key === 'ArrowUp' ? -1 : 1);
          if (rows[j]) {
            doc.setActive(rows[j].dataset.id);
            requestAnimationFrame(() => {
              const r = document.querySelector('.layer-row.active');
              if (r) r.focus();
            });
          }
        }
      });
      this.dragReorder(row, doc, L);
      return row;
    },

    // Smart filters under a smart object: eye switches one on/off, double-click edits, × removes.
    filterRows(doc, L) {
      const indent = doc.depthOf(L) * 14 + 46;
      const head = el('div', { class: 'filter-row head' }, [el('span', { class: 'filter-name', text: 'Smartfilter' })]);
      head.style.paddingLeft = `${indent}px`;
      const rows = L.smart.filters.map((f, k) => {
        const eye = el('button', { type: 'button', class: `eye ${f.enabled ? 'on' : ''}`, title: 'Filter ein-/ausblenden', 'aria-label': f.enabled ? 'Filter ausblenden' : 'Filter einblenden', 'aria-pressed': String(f.enabled), html: f.enabled ? PW.icon('eye', 13) : '' });
        eye.addEventListener('click', e => {
          e.stopPropagation();
          PW.smart.toggleFilter(L, k);
        });
        const del = el('button', { type: 'button', class: 'tbtn filter-del', title: 'Smartfilter löschen', 'aria-label': 'Smartfilter löschen', html: PW.icon('x', 12) });
        del.addEventListener('click', e => {
          e.stopPropagation();
          PW.smart.removeFilter(L, k);
        });
        const name = el('span', { class: 'filter-name', text: PW.smart.filterName(f), title: 'Doppelklick: Einstellungen ändern' });
        const row = el('div', { class: `filter-row ${f.enabled ? '' : 'off'}` }, [eye, name, del]);
        row.style.paddingLeft = `${indent - 26}px`;
        row.addEventListener('click', () => doc.setActive(L.id));
        row.addEventListener('dblclick', () => PW.smart.editFilter(L, k));
        return row;
      });
      return [head, ...rows];
    },

    renameInline(L, doc) {
      const a = app();
      const name = document.querySelector(`.layer-row[data-id="${L.id}"] .layer-name`);
      if (!name) return;
      const input = el('input', { class: 'text rename', type: 'text', value: L.name, 'aria-label': 'Ebenenname' });
      name.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        const v = input.value.trim();
        if (ok && v && v !== L.name) {
          L.name = v;
          a.commit('Ebene umbenennen', 'layers');
        } else PW.bus.emit('layers:changed', doc);
      };
      input.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') finish(true);
        if (ev.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    },

    // Pointer-based drag to reorder (works with mouse, pen and touch). Dropping on the middle of
    // a group row puts the layer into the group; between rows it goes to that place.
    dragReorder(row, doc, L) {
      row.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.eye') || e.target.closest('.twisty') || e.target.closest('input')) return;
        const list = row.parentElement, startY = e.clientY, own = new Set(doc.blockOf(L).map(x => x.id));
        let dragging = false, marker = null, target = null, intoRow = null;
        const move = ev => {
          if (!dragging && Math.abs(ev.clientY - startY) < 5) return;
          if (!dragging) {
            dragging = true;
            row.classList.add('dragging');
            marker = el('div', { class: 'drop-marker' });
            list.append(marker);
          }
          const rows = [...list.querySelectorAll('.layer-row')], lr = list.getBoundingClientRect();
          if (intoRow) intoRow.classList.remove('drop-into');
          intoRow = null;
          target = null;
          let line = null;
          for (const r of rows) {
            const b = r.getBoundingClientRect();
            if (ev.clientY < b.top || ev.clientY >= b.bottom) continue;
            const R = doc.layerById(r.dataset.id), rel = (ev.clientY - b.top) / b.height;
            if (R.isGroup && rel > 0.3 && rel < 0.7) {
              target = { kind: 'into', R };
              intoRow = r;
            } else if (rel < 0.5) {
              target = { kind: 'above', R };
              line = b.top;
            } else {
              target = { kind: 'below', R };
              line = b.bottom;
            }
            break;
          }
          if (!target && rows.length) {
            const last = rows[rows.length - 1], b = last.getBoundingClientRect();
            if (ev.clientY >= b.bottom) {
              target = { kind: 'bottom' };
              line = b.bottom;
            } else if (ev.clientY < rows[0].getBoundingClientRect().top) {
              target = { kind: 'above', R: doc.layerById(rows[0].dataset.id) };
              line = rows[0].getBoundingClientRect().top;
            }
          }
          if (target && target.R && own.has(target.R.id)) target = null;
          if (intoRow && target) intoRow.classList.add('drop-into');
          marker.hidden = !(target && line != null);
          if (line != null) marker.style.top = `${line - lr.top + list.scrollTop - 1}px`;
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (!dragging) return;
          row.classList.remove('dragging');
          if (marker) marker.remove();
          if (intoRow) intoRow.classList.remove('drop-into');
          if (!target) return PW.bus.emit('layers:changed', doc);
          const rest = doc.layers.filter(x => !own.has(x.id)), R = target.R;
          let at, parent;
          if (target.kind === 'bottom') {
            at = 0;
            parent = null;
          } else if (target.kind === 'into' || (target.kind === 'below' && R.isGroup && !R.collapsed)) {
            at = rest.indexOf(R);
            parent = R.id;
          } else if (target.kind === 'above') {
            at = rest.indexOf(R) + 1;
            parent = R.parent;
          } else {
            at = rest.indexOf(doc.blockOf(R)[0]);
            parent = R.parent;
          }
          const before = doc.layers.map(x => `${x.id}/${x.parent}`).join();
          doc.moveBlock(L, at, parent);
          if (doc.layers.map(x => `${x.id}/${x.parent}`).join() !== before) app().commit('Ebenen anordnen', 'layers');
          else PW.bus.emit('layers:changed', doc);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    },

    update() {
      const b = mounted('layers');
      if (!b) return;
      const scroll = b.querySelector('.layer-list') ? b.querySelector('.layer-list').scrollTop : 0;
      b.innerHTML = '';
      this.build(b);
      const list = b.querySelector('.layer-list');
      if (list) list.scrollTop = scroll;
    },
  };

  // ─── Paths (Pfade) ───
  renderers.paths = {
    build(body) {
      const a = app(), doc = a.doc;
      const list = el('div', { class: 'path-list', role: 'listbox', 'aria-label': 'Pfade' });
      if (doc) {
        for (const P of doc.paths) {
          const active = P.id === doc.activePathId;
          const th = el('div', { class: 'thumb-wrap' }, PW.paths.thumb(P, doc.width, doc.height, 34));
          const name = el('span', { class: `layer-name ${P.work ? 'work-path' : ''}`, text: P.name });
          const row = el('div', { class: `path-row ${active ? 'active' : ''}`, role: 'option', 'aria-selected': String(active), title: P.work ? 'Doppelklick: als Pfad speichern' : 'Doppelklick: umbenennen' }, [th, name]);
          row.dataset.id = P.id;
          row.addEventListener('click', e => {
            e.stopPropagation();
            if (e.ctrlKey || e.metaKey) {
              PW.pathCommands.select(P);
              return PW.pathCommands.toSelection(e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace');
            }
            if (doc.activePathId !== P.id) PW.pathCommands.select(P);
          });
          row.addEventListener('dblclick', e => {
            e.stopPropagation();
            PW.pathCommands.save(P);
          });
          list.append(row);
        }
        if (!doc.paths.length) list.append(el('p', { class: 'panel-note', text: 'Noch keine Pfade. Zeichne einen mit dem Zeichenstift (P) oder mach aus einer Auswahl einen Pfad (Knopf unten).' }));
      }
      // A click on the empty area deselects the path (its outline disappears).
      list.addEventListener('click', () => {
        if (doc && doc.activePathId) PW.pathCommands.select(null);
      });
      const btn = (icon, title, action) => el('button', { type: 'button', class: 'tbtn', title, 'aria-label': title, html: PW.icon(icon, 16), onclick: () => PW.runAction(action) });
      const bottom = el('div', { class: 'layers-bottom' }, [
        btn('path-fill', 'Pfad mit Vordergrundfarbe füllen', 'path.fill'),
        btn('path-stroke', 'Pfadkontur füllen', 'path.stroke'),
        btn('path-to-sel', 'Pfad als Auswahl laden (Strg+Enter)', 'path.toSelection'),
        btn('sel-to-path', 'Arbeitspfad aus Auswahl erstellen', 'path.fromSelection'),
        btn('new-layer', 'Neuen Pfad erstellen', 'path.new'),
        btn('trash', 'Pfad löschen', 'path.delete'),
      ]);
      body.append(list, bottom);
    },
    update() {
      const b = mounted('paths');
      if (!b) return;
      b.innerHTML = '';
      this.build(b);
    },
  };

  // ─── History ───
  renderers.history = {
    build(body) {
      const doc = app().doc;
      const list = el('div', { class: 'history-list', role: 'listbox', 'aria-label': 'Protokoll' });
      if (doc) {
        const h = doc.history;
        h.states.forEach((s, i) => {
          const item = el('button', { type: 'button', class: `history-item ${i === h.index ? 'current' : ''} ${i > h.index ? 'future' : ''}`, role: 'option', 'aria-selected': String(i === h.index) }, [
            el('span', { class: 'h-ic', html: PW.icon(s.icon || 'history', 14) }), el('span', { text: s.name }),
          ]);
          item.addEventListener('click', () => {
            app().finishToolWork();
            h.goto(i);
            app().render();
          });
          list.append(item);
        });
      }
      const note = el('p', { class: 'panel-note', text: doc ? `${doc.history.states.length} von höchstens ${doc.history.limit} Protokollobjekten` : '' });
      body.append(list, note);
      const cur = list.querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    },
    update() {
      const b = mounted('history');
      if (!b) return;
      b.innerHTML = '';
      this.build(b);
    },
  };

  function init() {
    load();
    buildDock();
    const layers = throttle(() => renderers.layers.update());
    const nav = throttle(() => {
      renderers.navigator.update();
    });
    let histTimer = 0;
    const hist = () => {
      clearTimeout(histTimer);
      histTimer = setTimeout(() => renderers.histogram.update(), 250);
    };
    PW.bus.on('layers:changed', () => {
      layers();
      nav();
      hist();
    });
    PW.bus.on('doc:changed', () => {
      layers();
      nav();
      hist();
    });
    PW.bus.on('history:changed', throttle(() => renderers.history.update()));
    const paths = throttle(() => renderers.paths.update());
    PW.bus.on('paths:changed', paths);
    PW.bus.on('history:changed', paths);
    PW.bus.on('doc:switched', paths);
    PW.bus.on('doc:switched', () => {
      layers();
      nav();
      hist();
      renderers.history.update();
    });
    PW.bus.on('view:changed', nav);
    PW.bus.on('view:zoom', nav);
    PW.bus.on('color:changed', () => renderers.color.update());
    new ResizeObserver(throttle(() => {
      renderers.navigator.update();
      renderers.histogram.update();
    })).observe(document.getElementById('dock'));
  }

  PW.panels = { init, show, showTab, isVisible, reset, addSwatch, renderers };
})(window.PW);
