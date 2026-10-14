'use strict';
/* Pytheas Studio — Oberfläche: Werkzeugleiste, Optionsleiste, Bedienfelder, Menüs, Dialoge */

const ICONS = {
  move: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  marquee: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="2.6 2.4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="2.6 2.4"/>',
  lasso: '<path d="M8.5 16.5C5 15.6 3.5 13.4 3.8 11c.5-4 6-6.6 11.2-5.8 4.6.7 6.4 3.6 4.8 6.3-1.6 2.6-6 3.9-10 3.5"/><path d="M8.5 16.5c-1.3.9-1.4 2.6-.2 3.5"/><circle cx="9.3" cy="15.4" r="1.4"/>',
  wand: '<path d="m4 20 11-11"/><path d="m13.5 7.5 3 3"/><path d="M17 3v2.5M20.5 6.5H18M19.5 3.5l-1.6 1.6M10 4l.8 1.6M21 11l-1.6-.8"/>',
  crop: '<path d="M6.5 2.5v15h15"/><path d="M2.5 6.5h15v15"/>',
  eyedropper: '<path d="m13.5 6.5 4 4"/><path d="M15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L17 11l-4-4z"/><path d="m13.5 8.5-8 8-.8 3.3 3.3-.8 8-8"/>',
  brush: '<path d="m9.5 13.5 9.8-9.8a1.6 1.6 0 0 1 2.3 2.3l-9.8 9.8"/><path d="M7.4 14.6c-2 0-3.4 1.4-3.4 3.4 0 1.1-.6 2-1.6 2.5 3.6.8 7.6-.4 7.6-3.7 0-1.2-.9-2.2-2.6-2.2z"/>',
  clone: '<path d="M9 3.5h6v4.2c0 1 .6 1.8 1.4 2.3l1.6.9c.6.4 1 1 1 1.7V14H5v-1.4c0-.7.4-1.3 1-1.7l1.6-.9c.8-.5 1.4-1.3 1.4-2.3z"/><path d="M5 17h14M7 20.5h10"/>',
  retouch: '<circle cx="15" cy="9" r="5.5"/><path d="M11.1 12.9 3.5 20.5"/><path d="M13 7a3 3 0 0 1 3-1.5" opacity=".6"/>',
  eraser: '<path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1L13.4 3.9a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L10.4 21z"/><path d="M21 21H10.4M8.5 9l7 7"/>',
  bucket: '<path d="m18.5 10.5-7.6-7.6-7.4 7.4a1.6 1.6 0 0 0 0 2.3l5.3 5.3a1.6 1.6 0 0 0 2.3 0z"/><path d="M5.5 2.5l4 4M3.5 11.5h14"/><path d="M21.5 18.5a1.8 1.8 0 0 1-3.6 0c0-1.4 1.8-3.6 1.8-3.6s1.8 2.2 1.8 3.6z"/>',
  gradient: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M7.5 4.5v15" opacity=".25"/><path d="M11 4.5v15" opacity=".45"/><path d="M14.5 4.5v15" opacity=".7"/><path d="M17.5 4.5v15" opacity=".9"/>',
  text: '<path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/>',
  shape: '<rect x="3.5" y="3.5" width="10" height="10" rx="1"/><circle cx="15.5" cy="15.5" r="5.5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5v-6a1.5 1.5 0 0 1 3 0v6M14 10.5V6a1.5 1.5 0 0 1 3 0v6M17 10.5a1.5 1.5 0 0 1 3 0v3.5a7 7 0 0 1-7 7h-1.1a7 7 0 0 1-5.4-2.6L3.6 15a1.5 1.5 0 0 1 2.3-1.9L8 15"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20.5 20.5-5.4-5.4M10.5 7.5v6M7.5 10.5h6"/>',
  swap: '<path d="M7 4 4 7l3 3"/><path d="M4 7h11a4 4 0 0 1 4 4v1"/><path d="m17 20 3-3-3-3"/><path d="M20 17H9a4 4 0 0 1-4-4v-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  merge: '<path d="M8 4v5a4 4 0 0 0 4 4 4 4 0 0 1 4 4v3"/><path d="M16 4v5a4 4 0 0 1-4 4"/><path d="m13 18 3 3 3-3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  selNew: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  selAdd: '<rect x="3" y="3" width="11" height="11" rx="1"/><rect x="10" y="10" width="11" height="11" rx="1"/>',
  selSub: '<rect x="3" y="3" width="11" height="11" rx="1"/><path d="M14 10h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6" stroke-dasharray="2 2"/>',
  selInt: '<rect x="3" y="3" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="10" y="10" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="10" y="10" width="4" height="4" fill="currentColor"/>',
  panels: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  fx: '<path d="M9 20c2 0 2.5-2 3-5l1.5-8c.4-2 1.2-3 3-3M8 9h7"/><path d="m15 13 5 5M20 13l-5 5"/>',
};

function svgIcon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

const TOOL_GROUPS = [
  ['move'],
  ['marquee', 'ellipse', 'lasso', 'wand'],
  ['crop', 'eyedropper'],
  ['brush', 'clone', 'retouch', 'eraser'],
  ['bucket', 'gradient'],
  ['text', 'shape'],
  ['hand', 'zoom'],
];

/* ---------- Meldungen & Statusleiste ---------- */

let toastTimer = 0;
function toast(msg, kind = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 3200);
}

function updateStatus() {
  if (!app.doc) return;
  $('#st-zoom').textContent = (app.zoom * 100).toFixed(app.zoom < 0.1 ? 1 : 0) + ' %';
  $('#st-size').textContent = `${app.doc.width} × ${app.doc.height} px`;
  const p = app.hover;
  $('#st-pos').textContent = p ? `X ${Math.floor(p.x)}  Y ${Math.floor(p.y)}` : '';
  const sel = app.doc.selection;
  $('#st-sel').textContent = sel ? `Auswahl ${sel.bounds.w} × ${sel.bounds.h}` : '';
}

function afterChange() {
  updateLayersPanel();
  updateHistoryPanel();
  updateStatus();
  requestRender();
  if (app.hIndex > 0) $('#hint').classList.add('hidden');
  Autosave.schedule();
  document.title = `${app.doc.name || 'Unbenannt'}${app.dirty ? ' •' : ''} – Pytheas Studio`;
}

/* ---------- Werkzeugleiste ---------- */

function buildToolbar() {
  const tb = $('#tools');
  for (const group of TOOL_GROUPS) {
    const g = el('div', { class: 'tool-group' });
    for (const id of group) {
      const def = TOOL_DEFS[id];
      g.append(
        el('button', {
          class: 'tool',
          'data-tool': id,
          title: `${def.name} (${def.key.toUpperCase()})`,
          'aria-label': def.name,
          onclick: () => setTool(id),
          html: svgIcon(id),
        })
      );
    }
    tb.append(g);
  }
}

function updateToolbar() {
  $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === app.tool));
}

/* ---------- Farben ---------- */

const SWATCHES = [
  '#000000', '#3a3d42', '#7a7f87', '#b9bdc3', '#ffffff', '#1b2a4a',
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5',
  '#5e35b1', '#d81b60', '#8d6e63', '#f4c7a1', '#a5d6a7', '#90caf9',
  '#ff8a80', '#ffd180', '#fff59d', '#b2dfdb', '#b39ddb', '#f8bbd0',
];

function setFG(hex) {
  app.fg = hex;
  updateColorUI();
}

function setBG(hex) {
  app.bg = hex;
  updateColorUI();
}

function swapColors() {
  [app.fg, app.bg] = [app.bg, app.fg];
  updateColorUI();
}

function resetColors() {
  app.fg = '#000000';
  app.bg = '#ffffff';
  updateColorUI();
}

function updateColorUI() {
  for (const s of $$('.sw-fg')) s.style.background = app.fg;
  for (const s of $$('.sw-bg')) s.style.background = app.bg;
  for (const i of $$('.in-fg')) i.value = app.fg;
  for (const i of $$('.in-bg')) i.value = app.bg;
  const hex = $('#hex-fg');
  if (document.activeElement !== hex) hex.value = app.fg.replace('#', '').toUpperCase();
  storageSet('pytheas-studio:colors', { fg: app.fg, bg: app.bg });
}

function buildColorPanel() {
  const grid = $('#swatch-grid');
  for (const c of SWATCHES) {
    grid.append(
      el('button', {
        class: 'swatch',
        style: `background:${c}`,
        title: `${c.toUpperCase()} – Klick: Vordergrund, Alt/Rechtsklick: Hintergrund`,
        onclick: (e) => (e.altKey ? setBG(c) : setFG(c)),
        oncontextmenu: (e) => {
          e.preventDefault();
          setBG(c);
        },
      })
    );
  }
  for (const i of $$('.in-fg')) i.addEventListener('input', () => setFG(i.value));
  for (const i of $$('.in-bg')) i.addEventListener('input', () => setBG(i.value));
  for (const b of $$('.btn-swap')) b.addEventListener('click', swapColors);
  for (const b of $$('.btn-reset')) b.addEventListener('click', resetColors);
  $('.color-mini .btn-swap').innerHTML = svgIcon('swap', 12);
  $('.color-mini .btn-reset').innerHTML = '<span class="mini-fg"></span><span class="mini-bg"></span>';
  const panels = $('#btn-panels');
  panels.innerHTML = svgIcon('panels', 18);
  panels.addEventListener('click', togglePanels);
  const hex = $('#hex-fg');
  hex.addEventListener('change', () => {
    const v = '#' + hex.value.replace(/[^0-9a-f]/gi, '').slice(0, 6);
    if (isHexColor(v)) setFG(v.toLowerCase());
    else hex.value = app.fg.replace('#', '').toUpperCase();
  });
}

/* ---------- Optionsleiste ---------- */

const MODE_OPT = { k: 'mode', t: 'segmented', options: [['new', 'selNew', 'Neue Auswahl'], ['add', 'selAdd', 'Der Auswahl hinzufügen (Umschalt)'], ['sub', 'selSub', 'Von Auswahl subtrahieren (Alt)'], ['int', 'selInt', 'Schnittmenge bilden (Umschalt+Alt)']] };
const SEL_OPTS = [MODE_OPT, { k: 'feather', t: 'num', label: 'Weiche Kante', min: 0, max: 250, unit: 'px', noRange: true }];
const SIZE_OPT = { k: 'size', t: 'num', label: 'Größe', min: 1, max: 500, unit: 'px' };
const HARD_OPT = { k: 'hardness', t: 'num', label: 'Härte', min: 0, max: 100, unit: '%' };
const OPAC_OPT = { k: 'opacity', t: 'num', label: 'Deckkraft', min: 1, max: 100, unit: '%' };
const TOL_OPT = { k: 'tolerance', t: 'num', label: 'Toleranz', min: 0, max: 255, noRange: true };

const OPTION_UI = {
  move: [{ k: 'autoSelect', t: 'check', label: 'Ebene automatisch wählen' }, { t: 'hint', text: 'Pfeiltasten verschieben um 1 px (Umschalt: 10 px)' }],
  marquee: SEL_OPTS,
  ellipse: SEL_OPTS,
  lasso: SEL_OPTS,
  wand: [MODE_OPT, TOL_OPT, { k: 'contiguous', t: 'check', label: 'Benachbart' }, { k: 'allLayers', t: 'check', label: 'Alle Ebenen aufnehmen' }],
  crop: [{ k: 'ratio', t: 'select', label: 'Verhältnis', options: [['free', 'Frei'], ['1', '1 : 1'], ['1.3333333', '4 : 3'], ['1.5', '3 : 2'], ['1.7777778', '16 : 9'], ['0.75', '3 : 4'], ['0.8', '4 : 5'], ['0.5625', '9 : 16']] }],
  eyedropper: [{ t: 'hint', text: 'Klick: Vordergrundfarbe · Alt + Klick: Hintergrundfarbe' }],
  brush: [SIZE_OPT, HARD_OPT, OPAC_OPT, { k: 'pressure', t: 'check', label: 'Stiftdruck' }],
  clone: [SIZE_OPT, HARD_OPT, OPAC_OPT, { k: 'aligned', t: 'check', label: 'Ausgerichtet' }, { k: 'allLayers', t: 'check', label: 'Alle Ebenen aufnehmen' }, { t: 'hint', text: 'Alt + Klick legt die Quelle fest' }],
  eraser: [SIZE_OPT, HARD_OPT, OPAC_OPT, { k: 'pressure', t: 'check', label: 'Stiftdruck' }],
  retouch: [
    { k: 'mode', t: 'select', label: 'Modus', options: [['dodge', 'Abwedeln (aufhellen)'], ['burn', 'Nachbelichten (abdunkeln)'], ['blur', 'Weichzeichnen'], ['sharpen', 'Scharfzeichnen'], ['sponge', 'Schwamm (entsättigen)']] },
    SIZE_OPT,
    HARD_OPT,
    { k: 'opacity', t: 'num', label: 'Stärke', min: 1, max: 100, unit: '%' },
  ],
  bucket: [TOL_OPT, { k: 'contiguous', t: 'check', label: 'Benachbart' }, { k: 'allLayers', t: 'check', label: 'Alle Ebenen aufnehmen' }, OPAC_OPT],
  gradient: [
    { k: 'type', t: 'select', label: 'Art', options: [['linear', 'Linear'], ['radial', 'Radial']] },
    { k: 'colors', t: 'select', label: 'Farben', options: [['fgbg', 'Vordergrund → Hintergrund'], ['fgtrans', 'Vordergrund → Transparent'], ['rainbow', 'Regenbogen']] },
    { k: 'reverse', t: 'check', label: 'Umkehren' },
    OPAC_OPT,
  ],
  text: [
    { k: 'family', t: 'select', label: 'Schrift', options: FONTS.map((f) => [f, f]) },
    { k: 'size', t: 'num', label: 'Größe', min: 4, max: 1000, unit: 'px', noRange: true },
    { k: 'bold', t: 'toggle', label: 'F', title: 'Fett' },
    { k: 'italic', t: 'toggle', label: 'K', title: 'Kursiv' },
    { k: 'align', t: 'segmented', options: [['left', 'alignLeft', 'Linksbündig'], ['center', 'alignCenter', 'Zentriert'], ['right', 'alignRight', 'Rechtsbündig']] },
    { k: 'color', t: 'color', label: 'Farbe' },
  ],
  shape: [
    { k: 'shape', t: 'select', label: 'Form', rebuild: true, options: [['rect', 'Rechteck'], ['rrect', 'Abgerundetes Rechteck'], ['ellipse', 'Ellipse'], ['line', 'Linie']] },
    { k: 'radius', t: 'num', label: 'Radius', min: 0, max: 1000, unit: 'px', noRange: true, showIf: (o) => o.shape === 'rrect' },
    { k: 'fill', t: 'check', label: 'Füllung', showIf: (o) => o.shape !== 'line' },
    { k: 'fillColor', t: 'color', showIf: (o) => o.shape !== 'line' },
    { k: 'stroke', t: 'check', label: 'Kontur', showIf: (o) => o.shape !== 'line' },
    { k: 'strokeColor', t: 'color', label: '' },
    { k: 'strokeWidth', t: 'num', label: 'Stärke', min: 1, max: 300, unit: 'px', noRange: true },
  ],
  hand: [{ t: 'button', label: 'Ganzes Bild', action: () => fitView() }, { t: 'button', label: '100 %', action: () => actualPixels() }],
  zoom: [{ t: 'button', label: 'Ganzes Bild', action: () => fitView() }, { t: 'button', label: '100 %', action: () => actualPixels() }, { t: 'hint', text: 'Klick: einzoomen · Alt + Klick: auszoomen' }],
};

function onOptionChanged(tool, spec) {
  saveToolOptions();
  if (tool === 'text') applyTextOptions();
  if (spec.rebuild) buildOptionsBar();
  requestOverlay();
}

function numberField(value, min, max, step, onChange) {
  const input = el('input', { type: 'number', class: 'num', min, max, step: step || 1, value });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (!isFinite(v)) v = value;
    v = clamp(v, min, max);
    input.value = v;
    onChange(v);
  });
  return input;
}

function optionControl(tool, o, spec) {
  const changed = (v) => {
    o[spec.k] = v;
    onOptionChanged(tool, spec);
  };
  switch (spec.t) {
    case 'num': {
      const wrap = el('label', { class: 'opt' }, spec.label ? el('span', { class: 'opt-label' }, spec.label) : null);
      const num = numberField(o[spec.k], spec.min, spec.max, spec.step, (v) => {
        if (range) range.value = v;
        changed(v);
      });
      num.dataset.opt = spec.k;
      let range = null;
      if (!spec.noRange) {
        range = el('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step || 1, value: o[spec.k] });
        range.addEventListener('input', () => {
          num.value = range.value;
          changed(parseFloat(range.value));
        });
        wrap.append(range);
      }
      wrap.append(num);
      if (spec.unit) wrap.append(el('span', { class: 'opt-unit' }, spec.unit));
      return wrap;
    }
    case 'check': {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = !!o[spec.k];
      cb.addEventListener('change', () => changed(cb.checked));
      return el('label', { class: 'opt opt-check' }, cb, el('span', {}, spec.label));
    }
    case 'toggle': {
      const b = el('button', { class: 'opt-toggle' + (o[spec.k] ? ' on' : ''), title: spec.title, 'aria-pressed': String(!!o[spec.k]) }, spec.label);
      b.style.fontWeight = spec.k === 'bold' ? '700' : '';
      b.style.fontStyle = spec.k === 'italic' ? 'italic' : '';
      b.addEventListener('click', () => {
        const v = !o[spec.k];
        b.classList.toggle('on', v);
        b.setAttribute('aria-pressed', String(v));
        changed(v);
      });
      return b;
    }
    case 'select': {
      const s = el('select', {}, spec.options.map(([v, label]) => el('option', { value: v }, label)));
      s.value = String(o[spec.k]);
      s.addEventListener('change', () => changed(s.value));
      return el('label', { class: 'opt' }, spec.label ? el('span', { class: 'opt-label' }, spec.label) : null, s);
    }
    case 'segmented': {
      const wrap = el('div', { class: 'segmented', role: 'group' });
      for (const [v, icon, title] of spec.options) {
        const b = el('button', { class: o[spec.k] === v ? 'on' : '', title, 'aria-label': title, html: svgIcon(icon, 18) });
        b.addEventListener('click', () => {
          $$('button', wrap).forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          changed(v);
        });
        wrap.append(b);
      }
      return wrap;
    }
    case 'color': {
      const c = el('input', { type: 'color', class: 'opt-color', value: o[spec.k], title: spec.label || 'Farbe' });
      c.addEventListener('input', () => changed(c.value));
      return el('label', { class: 'opt' }, spec.label ? el('span', { class: 'opt-label' }, spec.label) : null, c);
    }
    case 'button':
      return el('button', { class: 'btn btn-small', onclick: spec.action }, spec.label);
    case 'hint':
      return el('span', { class: 'opt-hint' }, spec.text);
  }
  return null;
}

function applyButtons(onApply, onCancel) {
  return [
    el('button', { class: 'btn btn-small btn-icon', title: 'Abbrechen (Esc)', 'aria-label': 'Abbrechen', onclick: onCancel, html: svgIcon('close', 16) }),
    el('button', { class: 'btn btn-small btn-primary btn-icon', title: 'Anwenden (Eingabe)', 'aria-label': 'Anwenden', onclick: onApply, html: svgIcon('check', 16) }),
  ];
}

function buildOptionsBar() {
  const bar = $('#optionsbar');
  if (!bar) return;
  bar.innerHTML = '';
  const id = Transform.active ? null : app.tool;
  const head = el('div', { class: 'opt-head', html: svgIcon(Transform.active ? 'move' : id, 18) }, el('span', {}, Transform.active ? 'Frei transformieren' : TOOL_DEFS[id].name));
  bar.append(head, el('div', { class: 'opt-sep' }));
  if (Transform.active) {
    const s = Transform.s;
    const field = (key, label, value, unit) =>
      el('label', { class: 'opt' }, el('span', { class: 'opt-label' }, label), (() => {
        const n = numberField(value, -100000, 100000, 0.1, (v) => Transform.setNumeric(key, v));
        n.dataset.tf = key;
        return n;
      })(), el('span', { class: 'opt-unit' }, unit));
    bar.append(
      field('w', 'B', +(Math.abs(s.sx) * 100).toFixed(1), '%'),
      field('h', 'H', +(Math.abs(s.sy) * 100).toFixed(1), '%'),
      field('angle', 'Winkel', +((s.angle * 180) / Math.PI).toFixed(1), '°'),
      el('span', { class: 'opt-hint' }, 'Umschalt: proportional · Alt: vom Mittelpunkt'),
      el('div', { class: 'spacer' }),
      ...applyButtons(() => Transform.apply(), () => Transform.cancel())
    );
    return;
  }
  const o = toolOpts(id);
  for (const spec of OPTION_UI[id] || []) {
    if (spec.showIf && !spec.showIf(o)) continue;
    const c = optionControl(id, o, spec);
    if (c) bar.append(c);
  }
  if (id === 'crop' && Crop.rect) {
    bar.append(el('span', { class: 'opt-hint', id: 'crop-info' }), el('div', { class: 'spacer' }), ...applyButtons(applyCrop, cancelCrop));
    updateCropInfo();
  }
  if (id === 'text' && TextEdit.active) {
    bar.append(el('div', { class: 'spacer' }), ...applyButtons(commitText, cancelText));
  }
}

function updateTransformFields() {
  const s = Transform.s;
  if (!s) return;
  const set = (k, v) => {
    const n = $(`[data-tf="${k}"]`);
    if (n && document.activeElement !== n) n.value = v;
  };
  set('w', +(Math.abs(s.sx) * 100).toFixed(1));
  set('h', +(Math.abs(s.sy) * 100).toFixed(1));
  set('angle', +((s.angle * 180) / Math.PI).toFixed(1));
}

function updateCropInfo() {
  const info = $('#crop-info');
  if (info && Crop.rect) info.textContent = `${Math.round(Crop.rect.w)} × ${Math.round(Crop.rect.h)} px`;
}

function changeBrushSize(delta) {
  if (!TOOL_DEFS[app.tool].brushCursor) return;
  const o = toolOpts(app.tool);
  const step = o.size < 10 ? 1 : o.size < 50 ? 5 : o.size < 100 ? 10 : 25;
  o.size = clamp(o.size + delta * step, 1, 500);
  saveToolOptions();
  buildOptionsBar();
  requestOverlay();
}

function setToolOpacity(v) {
  const o = toolOpts(app.tool);
  if (!('opacity' in o)) return;
  o.opacity = v;
  saveToolOptions();
  buildOptionsBar();
  toast(`Deckkraft ${v} %`);
}

/* ---------- Ebenen-Bedienfeld ---------- */

// Miniaturen je Ebenen-Canvas zwischenspeichern: Pixeländerungen erzeugen immer eine neue Canvas
const thumbCache = new WeakMap();

function drawThumb(canvas, layerCanvas) {
  let small = thumbCache.get(layerCanvas);
  if (!small) {
    const s = Math.min(40 / layerCanvas.width, 40 / layerCanvas.height);
    small = createCanvas(layerCanvas.width * s, layerCanvas.height * s);
    const g = ctxOf(small);
    g.imageSmoothingQuality = 'high';
    g.drawImage(layerCanvas, 0, 0, small.width, small.height);
    thumbCache.set(layerCanvas, small);
  }
  canvas.width = small.width;
  canvas.height = small.height;
  ctxOf(canvas).drawImage(small, 0, 0);
}

let dragLayerIndex = -1;

function updateLayersPanel() {
  const d = app.doc;
  const list = $('#layer-list');
  list.innerHTML = '';
  for (let i = d.layers.length - 1; i >= 0; i--) {
    const l = d.layers[i];
    const thumb = createCanvas(1, 1);
    thumb.className = 'thumb';
    drawThumb(thumb, l.canvas);
    const eye = el('button', {
      class: 'eye' + (l.visible ? '' : ' off'),
      title: l.visible ? 'Ebene ausblenden' : 'Ebene einblenden',
      'aria-label': l.visible ? 'Ebene ausblenden' : 'Ebene einblenden',
      html: svgIcon(l.visible ? 'eye' : 'eyeOff', 16),
    });
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      finishInteractions();
      setLayerProp(i, 'visible', !l.visible, l.visible ? 'Ebene ausblenden' : 'Ebene einblenden');
    });
    const name = el('span', { class: 'lname', title: 'Doppelklick zum Umbenennen' }, l.name);
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(name, i);
    });
    const meta = [];
    if (l.text) meta.push(el('span', { class: 'badge', title: 'Textebene (bearbeitbar)' }, 'T'));
    if (l.blend !== 'source-over' || l.opacity < 1) {
      const bm = BLEND_MODES.find((b) => b[0] === l.blend);
      meta.push(el('span', { class: 'lmeta' }, `${l.blend !== 'source-over' ? bm[1] + ' · ' : ''}${Math.round(l.opacity * 100)} %`));
    }
    const li = el('li', { class: 'layer' + (i === d.active ? ' active' : ''), draggable: 'true', 'data-index': i }, eye, el('span', { class: 'thumb-wrap' }, thumb), el('span', { class: 'lcol' }, name, ...meta));
    li.addEventListener('click', () => {
      if (d.active === i) return;
      finishInteractions();
      d.active = i;
      updateLayersPanel();
    });
    li.addEventListener('dragstart', (e) => {
      dragLayerIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    li.addEventListener('dragover', (e) => {
      if (dragLayerIndex < 0) return;
      e.preventDefault();
      li.classList.add('drop-target');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('drop-target');
      const from = dragLayerIndex;
      dragLayerIndex = -1;
      if (from >= 0 && from !== i) {
        finishInteractions();
        moveLayer(from, i);
      }
    });
    list.append(li);
  }
  const L = activeLayer();
  $('#blend-mode').value = L.blend;
  $('#layer-opacity').value = Math.round(L.opacity * 100);
  $('#layer-opacity-val').textContent = Math.round(L.opacity * 100) + ' %';
  $('#btn-merge').disabled = d.active === 0;
  $('#btn-delete').disabled = d.layers.length <= 1;
  $('#btn-up').disabled = d.active >= d.layers.length - 1;
  $('#btn-down').disabled = d.active === 0;
}

function startRename(span, i) {
  const l = app.doc.layers[i];
  const input = el('input', { class: 'rename', value: l.name });
  span.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (ok && v && v !== l.name) setLayerProp(i, 'name', v.slice(0, 60), 'Ebene umbenennen');
    else updateLayersPanel();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

function buildLayersPanel() {
  const blend = $('#blend-mode');
  for (const [v, label] of BLEND_MODES) blend.append(el('option', { value: v }, label));
  blend.addEventListener('change', () => {
    finishInteractions();
    setLayerProp(app.doc.active, 'blend', blend.value, 'Füllmethode ändern');
  });
  const op = $('#layer-opacity');
  op.addEventListener('input', () => {
    activeLayer().opacity = op.value / 100;
    $('#layer-opacity-val').textContent = op.value + ' %';
    requestRender();
  });
  op.addEventListener('change', () => {
    const l = activeLayer();
    const prev = app.history[app.hIndex].layers.find((m) => m.id === l.id);
    if (!prev || prev.opacity !== l.opacity) commit('Deckkraft ändern');
  });
  const btn = (id, icon, title, fn) => {
    const b = $(id);
    b.innerHTML = svgIcon(icon, 17);
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', () => {
      finishInteractions();
      fn();
    });
  };
  btn('#btn-new', 'plus', 'Neue Ebene', newLayer);
  btn('#btn-dup', 'duplicate', 'Ebene duplizieren (Strg+J)', duplicateLayer);
  btn('#btn-up', 'up', 'Ebene nach oben', () => moveLayer(app.doc.active, app.doc.active + 1));
  btn('#btn-down', 'down', 'Ebene nach unten', () => moveLayer(app.doc.active, app.doc.active - 1));
  btn('#btn-merge', 'merge', 'Mit darunterliegender Ebene zusammenfügen (Strg+E)', mergeDown);
  btn('#btn-fx', 'fx', 'Ebenenstil: Schlagschatten', dlgDropShadow);
  btn('#btn-delete', 'trash', 'Ebene löschen', () => deleteLayer());
}

/* ---------- Protokoll ---------- */

function updateHistoryPanel() {
  const list = $('#history-list');
  list.innerHTML = '';
  app.history.forEach((h, i) => {
    const li = el('li', { class: i === app.hIndex ? 'active' : i > app.hIndex ? 'future' : '' }, h.name);
    li.addEventListener('click', () => restoreState(i));
    list.append(li);
  });
  // nur die Liste selbst scrollen (scrollIntoView würde auch den Arbeitsbereich verschieben)
  const active = list.children[app.hIndex];
  if (active) {
    if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
  }
}

/* ---------- Menüs ---------- */

const KEY_LABELS = { mod: 'Strg', shift: 'Umschalt', alt: 'Alt', backspace: 'Rücktaste', delete: 'Entf', plus: '+', minus: '−', enter: 'Eingabe', escape: 'Esc', tab: 'Tab' };

function comboLabel(combo) {
  if (!combo) return '';
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  return combo
    .split('+')
    .map((p) => (p === 'mod' && isMac ? '⌘' : KEY_LABELS[p] || p.toUpperCase()))
    .join(isMac ? '' : '+');
}

function keyName(e) {
  const k = e.key;
  if (k === '+' || k === '=') return 'plus';
  if (k === '-' || k === '_') return 'minus';
  if (/^[a-zäöü]$/i.test(k)) return k.toLowerCase();
  if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (e.code && /^Digit\d$/.test(e.code)) return e.code.slice(5);
  return k.toLowerCase();
}

function matchCombo(e, combo) {
  const need = { mod: false, shift: false, alt: false };
  let key = '';
  for (const p of combo.split('+')) {
    if (p in need) need[p] = true;
    else key = p;
  }
  if ((e.ctrlKey || e.metaKey) !== need.mod || e.altKey !== need.alt) return false;
  const k = keyName(e);
  if (key !== 'plus' && key !== 'minus' && e.shiftKey !== need.shift) return false;
  return k === key;
}

let openMenu = null;
const menuItems = [];

function closeMenus() {
  if (openMenu) openMenu.classList.remove('open');
  openMenu = null;
}

function runMenuItem(it) {
  closeMenus();
  if (it.enabled && !it.enabled()) return;
  if (!it.keepInteractions) finishInteractions();
  it.action();
}

function renderMenuItems(items) {
  return items.map((it) => {
    if (it === '-') return el('div', { class: 'menu-sep' });
    if (it.items) {
      return el('div', { class: 'menu-sub' }, el('div', { class: 'menu-item has-sub' }, el('span', {}, it.label), el('span', { class: 'menu-arrow' }, '›')), el('div', { class: 'menu-dd sub' }, renderMenuItems(it.items)));
    }
    menuItems.push(it);
    const b = el('button', { class: 'menu-item', role: 'menuitem' }, el('span', {}, it.label), el('span', { class: 'menu-key' }, comboLabel(it.sc || it.scDisplay)));
    it.el = b;
    b.addEventListener('click', () => runMenuItem(it));
    return b;
  });
}

function buildMenus() {
  const nav = $('#menus');
  for (const m of MENUS) {
    const btn = el('button', { class: 'menu-btn', 'aria-haspopup': 'true' }, m.label);
    const wrap = el('div', { class: 'menu' }, btn, el('div', { class: 'menu-dd', role: 'menu' }, renderMenuItems(m.items)));
    const dd = wrap.querySelector('.menu-dd');
    const open = () => {
      closeMenus();
      finishInteractionsSoft();
      for (const it of menuItems) if (it.el && it.enabled) it.el.disabled = !it.enabled();
      wrap.classList.add('open');
      openMenu = wrap;
      const r = btn.getBoundingClientRect();
      dd.style.top = r.bottom + 2 + 'px';
      dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - dd.offsetWidth - 4)) + 'px';
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (openMenu === wrap) closeMenus();
      else open();
    });
    btn.addEventListener('pointerenter', () => {
      if (openMenu && openMenu !== wrap) open();
    });
    nav.append(wrap);
  }
  document.addEventListener('pointerdown', (e) => {
    if (openMenu && !openMenu.contains(e.target)) closeMenus();
  });
}

// Beim Öffnen eines Menüs nur den Text übernehmen (Transformation bleibt offen, bis ein Befehl läuft)
function finishInteractionsSoft() {
  if (TextEdit.active) commitText();
}

/* ---------- Dialoge ---------- */

let currentDialog = null;

function modalOpen() {
  return !!currentDialog;
}

function closeDialog() {
  if (!currentDialog) return;
  currentDialog.el.remove();
  currentDialog = null;
}

function dialogField(f, values, refs, changed) {
  const row = el('div', { class: 'dlg-row' + (f.type === 'note' ? ' note' : '') });
  if (f.label) row.append(el('label', { class: 'dlg-label', for: 'f-' + f.key }, f.label));
  let control;
  switch (f.type) {
    case 'range': {
      const range = el('input', { type: 'range', id: 'f-' + f.key, min: f.min, max: f.max, step: f.step || 1, value: f.value });
      const num = el('input', { type: 'number', class: 'num', min: f.min, max: f.max, step: f.step || 1, value: f.value });
      range.addEventListener('input', () => {
        num.value = range.value;
        values[f.key] = parseFloat(range.value);
        changed(f.key);
      });
      num.addEventListener('change', () => {
        const v = clamp(parseFloat(num.value) || 0, f.min, f.max);
        num.value = v;
        range.value = v;
        values[f.key] = v;
        changed(f.key);
      });
      refs[f.key] = (v) => {
        range.value = v;
        num.value = v;
      };
      control = el('div', { class: 'dlg-range' }, range, num, f.unit ? el('span', { class: 'opt-unit' }, f.unit) : null);
      break;
    }
    case 'number': {
      const num = el('input', { type: 'number', class: 'num wide', id: 'f-' + f.key, min: f.min, max: f.max, step: f.step || 1, value: f.value });
      num.addEventListener('input', () => {
        const v = parseFloat(num.value);
        if (isFinite(v)) {
          values[f.key] = v;
          changed(f.key);
        }
      });
      num.addEventListener('change', () => {
        const v = clamp(parseFloat(num.value) || f.min || 0, f.min, f.max);
        num.value = v;
        values[f.key] = v;
        changed(f.key);
      });
      refs[f.key] = (v) => (num.value = v);
      control = el('div', { class: 'dlg-range' }, num, f.unit ? el('span', { class: 'opt-unit' }, f.unit) : null);
      break;
    }
    case 'select': {
      const s = el('select', { id: 'f-' + f.key }, f.options.map(([v, label]) => el('option', { value: v }, label)));
      s.value = f.value;
      s.addEventListener('change', () => {
        values[f.key] = s.value;
        changed(f.key);
      });
      refs[f.key] = (v) => (s.value = v);
      control = s;
      break;
    }
    case 'check': {
      const cb = el('input', { type: 'checkbox', id: 'f-' + f.key });
      cb.checked = !!f.value;
      cb.addEventListener('change', () => {
        values[f.key] = cb.checked;
        changed(f.key);
      });
      refs[f.key] = (v) => (cb.checked = !!v);
      control = el('label', { class: 'dlg-check' }, cb, el('span', {}, f.text || ''));
      break;
    }
    case 'color': {
      const c = el('input', { type: 'color', id: 'f-' + f.key, value: f.value });
      c.addEventListener('input', () => {
        values[f.key] = c.value;
        changed(f.key);
      });
      refs[f.key] = (v) => (c.value = v);
      control = c;
      break;
    }
    case 'text': {
      const t = el('input', { type: 'text', class: 'text', id: 'f-' + f.key, value: f.value, maxlength: 120 });
      t.addEventListener('input', () => {
        values[f.key] = t.value;
        changed(f.key);
      });
      refs[f.key] = (v) => (t.value = v);
      control = t;
      break;
    }
    case 'anchor': {
      const grid = el('div', { class: 'anchor-grid' });
      const cells = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          const v = `${x / 2},${y / 2}`;
          const b = el('button', { type: 'button', class: v === values[f.key] ? 'on' : '', title: 'Ausrichtung' });
          b.addEventListener('click', () => {
            cells.forEach((c) => c.classList.remove('on'));
            b.classList.add('on');
            values[f.key] = v;
            changed(f.key);
          });
          cells.push(b);
          grid.append(b);
        }
      }
      control = grid;
      break;
    }
    case 'note': {
      const n = el('div', { class: 'dlg-note' }, f.value || '');
      refs[f.key] = (v) => (n.textContent = v);
      control = n;
      break;
    }
  }
  if (control) row.append(control);
  return row;
}

function openDialog({ title, fields = [], content = null, okLabel = 'OK', cancelLabel = 'Abbrechen', onInput, onOk, onCancel, dim = true, wide = false, noCancel = false }) {
  closeDialog();
  const values = {};
  const refs = {};
  for (const f of fields) if (f.key) values[f.key] = f.value;
  const set = (k, v) => {
    values[k] = v;
    if (refs[k]) refs[k](v);
  };
  const changed = (key) => onInput && onInput(values, key, set);
  const body = el('div', { class: 'dlg-body' });
  for (const f of fields) body.append(dialogField(f, values, refs, changed));
  if (content) body.append(content);
  let busy = false;
  const ok = async () => {
    if (busy) return;
    busy = true;
    try {
      const res = onOk ? await onOk({ ...values }) : undefined;
      if (res !== false) closeDialog();
    } catch (err) {
      toast(err.message || String(err), 'error');
    } finally {
      busy = false;
    }
  };
  const cancel = () => {
    closeDialog();
    if (onCancel) onCancel();
  };
  const footer = el(
    'div',
    { class: 'dlg-footer' },
    noCancel ? null : el('button', { class: 'btn', onclick: cancel }, cancelLabel),
    el('button', { class: 'btn btn-primary', onclick: ok }, okLabel)
  );
  const box = el('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { class: 'dlg-title' }, title), body, footer);
  const backdrop = el('div', { class: 'modal' + (dim ? ' dim' : '') }, box);
  if (dim) backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && cancel());
  $('#modal-root').append(backdrop);
  currentDialog = { el: backdrop, ok, cancel, values, set };
  const first = box.querySelector('input:not([type=range]), select, button.btn-primary');
  if (first) setTimeout(() => first.focus(), 0);
  return currentDialog;
}
