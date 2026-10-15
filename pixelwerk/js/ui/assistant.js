// ─── Claude-Assistent: say what you want, Claude looks at the photo and operates Pixelwerk ───
// Uses the claude.ai artifact capability "sample" (the viewer's own Claude account). Outside a
// claude.ai viewer it is simply unavailable and the panel says so.
'use strict';

(function (PW) {
  const { el, clamp } = PW.util;
  const app = () => PW.app;

  const EXAMPLES = [
    'Mach das Top blickdicht, man soll nichts durchsehen',
    'Verbessere das Foto automatisch',
    'Schneide das Bild quadratisch zu',
    'Mach das Bild etwas heller und wärmer',
  ];
  const MAX_TURNS = 16;
  const IMG_PIXELS = 1.15e6, IMG_SIDE = 1568;
  const FILTERS = ['gaussianBlur', 'unsharpMask', 'sharpen', 'addNoise', 'median', 'vignette'];
  // Who answers: an automatic tier of the `sample` capability, or a model the viewer picks.
  // A picked model the account cannot use falls back to its tier; the chat then says so.
  const MODELS = [
    { id: 'tier:quick', auto: true, name: 'Automatisch: Schnell', tier: 'quick', hint: 'Antwortet sofort. Gut für Einfaches wie heller machen oder drehen; bei Kleidung ungenauer.' },
    { id: 'tier:default', auto: true, name: 'Automatisch: Standard', tier: 'default', hint: 'Gute Genauigkeit, braucht meist eine halbe bis eine Minute.' },
    { id: 'tier:complex', auto: true, name: 'Automatisch: Gründlich', tier: 'complex', hint: 'Das stärkste Modell, das dein Konto hier nutzen darf. Denkt länger und verbraucht mehr Kontingent.' },
    { id: 'claude-opus-5-5', name: 'Opus 5.5', tier: 'complex' },
    { id: 'claude-fable-5-1', name: 'Fable 5.1', tier: 'complex' },
    { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', tier: 'default' },
    { id: 'claude-haiku-5-5', name: 'Haiku 5.5', tier: 'quick' },
  ];
  const EFFORTS = [['', 'Standard'], ['low', 'Wenig'], ['medium', 'Mittel'], ['high', 'Extra']];
  const TIER_NAMES = { quick: 'Schnell', default: 'Standard', complex: 'Gründlich' };
  const modelOf = id => MODELS.find(m => m.id === id) || MODELS[1];
  const effortName = id => (EFFORTS.find(e => e[0] === id) || EFFORTS[0])[1];

  function pref(key, allowed, fallback) {
    try {
      const v = localStorage.getItem(key);
      return allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }
  function savePref(key, value) {
    try { localStorage.setItem(key, value); } catch { /* optional */ }
  }

  const state = {
    status: 'checking', // checking | ready | unavailable | denied | notools
    sample: null,
    images: false,
    busy: false,
    ctl: null,
    chat: [], // {role, content} sent to Claude
    log: [], // {kind: 'user'|'claude'|'step'|'error'|'info', text}
    edited: false,
    reply: null, // the bubble of the answer in progress
    model: pref('pw-assistant-model', MODELS.map(m => m.id), 'tier:default'),
    effort: pref('pw-assistant-effort', EFFORTS.map(e => e[0]), ''),
    autoCheck: pref('pw-assistant-check', ['1', '0'], '1') === '1',
    maxImages: 0,
    before: null, // image of the state before the last request, for the automatic check
  };
  let ui = null;
  let samplePromise = null;

  // ─── Availability ───
  function getSample() {
    if (!samplePromise) {
      const use = window.claude && typeof window.claude.use === 'function' ? window.claude.use.bind(window.claude) : null;
      samplePromise = use ? Promise.resolve(use('sample')).catch(() => null) : Promise.resolve(null);
    }
    return samplePromise;
  }

  async function init() {
    const sample = await getSample();
    if (!sample) return setStatus('unavailable');
    let limits = null;
    try { limits = await sample.limits(); } catch { /* treat as no extras */ }
    if (!limits || !limits.tools) return setStatus('notools');
    state.sample = sample;
    state.images = !!limits.images;
    state.maxImages = limits.images ? Math.max(1, Number(limits.images.maxCount) || 1) : 0;
    setStatus('ready');
  }

  function setStatus(s) {
    state.status = s;
    PW.bus.emit('assistant:status', s);
    render();
  }

  const available = () => state.status === 'ready';

  // ─── Coordinates: Claude works in the attached image's pixel grid ───
  const map = { sx: 1, sy: 1, iw: 0, ih: 0, changed: false };

  function capture() {
    const doc = app().doc, W = doc.width, H = doc.height;
    const s = Math.min(1, Math.sqrt(IMG_PIXELS / (W * H)), IMG_SIDE / Math.max(W, H));
    const iw = Math.max(1, Math.round(W * s)), ih = Math.max(1, Math.round(H * s));
    Object.assign(map, { sx: W / iw, sy: H / ih, iw, ih, changed: false });
    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(doc.flattened('#ffffff'), 0, 0, iw, ih);
    return c;
  }

  // Same picture with a labelled 100 px grid, so Claude can read coordinates off it.
  function withGrid(src) {
    const c = document.createElement('canvas'), w = (c.width = src.width), h = (c.height = src.height);
    const g = c.getContext('2d'), step = 100;
    g.drawImage(src, 0, 0);
    const line = (x0, y0, x1, y1) => {
      for (const [style, off] of [['rgba(0,0,0,0.45)', 1], ['rgba(255,255,255,0.7)', 0]]) {
        g.strokeStyle = style;
        g.beginPath();
        g.moveTo(x0 + off, y0 + off);
        g.lineTo(x1 + off, y1 + off);
        g.stroke();
      }
    };
    g.lineWidth = 1;
    for (let x = step; x < w; x += step) line(x + 0.5, 0, x + 0.5, h);
    for (let y = step; y < h; y += step) line(0, y + 0.5, w, y + 0.5);
    g.font = 'bold 12px sans-serif';
    g.lineJoin = 'round';
    const label = (t, x, y, align, base) => {
      g.textAlign = align;
      g.textBaseline = base;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(t, x, y);
      g.fillStyle = '#fff';
      g.fillText(t, x, y);
    };
    for (let x = step; x < w; x += step) {
      label(String(x), x + 3, 3, 'left', 'top');
      label(String(x), x + 3, h - 3, 'left', 'bottom');
    }
    for (let y = step; y < h; y += step) {
      label(String(y), 3, y + 2, 'left', 'top');
      label(String(y), w - 3, y + 2, 'right', 'top');
    }
    return c;
  }

  const jpeg = c => new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.9));

  function needGeometry() {
    if (map.changed) throw new Error('Das Bild wurde gerade zugeschnitten oder gedreht, die Koordinaten passen nicht mehr. Beende diese Antwort; mit der nächsten Nachricht siehst du das neue Bild.');
  }
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const toDoc = p => [num(p[0]) * map.sx, num(p[1]) * map.sy];
  const pts = list => (Array.isArray(list) ? list.filter(p => Array.isArray(p) && p.length >= 2).map(toDoc) : []);
  const rectToDoc = r => ({ x: num(r.x) * map.sx, y: num(r.y) * map.sy, w: num(r.w) * map.sx, h: num(r.h) * map.sy });
  const rectToImg = r => ({ x: Math.round(r.x / map.sx), y: Math.round(r.y / map.sy), w: Math.round(r.w / map.sx), h: Math.round(r.h / map.sy) });
  const shapes = (list, withWidth) => (Array.isArray(list) ? list : [])
    .map(s => ({ points: pts(s && s.points), width: withWidth ? num(s && s.width, 30) * (map.sx + map.sy) / 2 : undefined }))
    .filter(s => s.points.length);

  // ─── Document state for Claude ───
  function docState() {
    const doc = app().doc;
    if (!doc) return { open: false };
    const sel = doc.selection;
    return {
      image: { width: map.iw, height: map.ih },
      layers: [...doc.layers].reverse().map(L => ({ name: L.name, visible: L.visible, opacity: Math.round(L.opacity * 100), text: L.isText || undefined })),
      active_layer: doc.active ? doc.active.name : null,
      selection: sel.empty ? null : rectToImg(sel.bounds),
      last_steps: doc.history.states.slice(Math.max(0, doc.history.index - 4), doc.history.index + 1).map(s => s.name),
      can_undo: doc.history.canUndo,
    };
  }

  // ─── Adjustment catalogue (ids Claude may use) ───
  const adjustDefs = () => PW.filters.defs.filter(d => d.id && !d.dialog && (d.menu === 'adjust' || d.menu === 'auto' || FILTERS.includes(d.id)));

  function catalogue() {
    return adjustDefs().map(d => {
      const ps = (d.params || []).map(p => {
        if (p.type === 'range') return `${p.key} ${p.min}…${p.max} (neutral/Standard ${p.value})`;
        if (p.type === 'check') return `${p.key} true|false`;
        if (p.type === 'select') return `${p.key} ${p.options.map(o => o[0]).join('|')}`;
        if (p.type === 'color') return `${p.key} #rrggbb`;
        return p.key;
      });
      return `- ${d.id}: ${(d.title || d.name).replace('…', '')}${ps.length ? ` — ${ps.join(', ')}` : ''}`;
    }).join('\n');
  }

  function rules(images = 1) {
    const doc = app().doc;
    return [
      'Du bist Claude, der eingebaute Assistent von „Pixelwerk“, einer Bildbearbeitung im Stil von Photoshop im Browser. Die Person kennt sich mit Bildbearbeitung nicht aus und sagt dir in Alltagssprache, was sie möchte.',
      'Antworte auf Deutsch, per du, kurz und freundlich. Nach getaner Arbeit höchstens drei Sätze: was du gemacht hast und ein konkretes Angebot für eine Anpassung. Keine Fachbegriffe, keine Koordinaten im Text.',
      '',
      images
        ? [
          `Bild 1 im Anhang ist das aktuelle Bild: ${map.iw} × ${map.ih} Pixel (Original ${doc.width} × ${doc.height}). Alle Koordinaten in den Werkzeugen beziehen sich auf dieses Pixelraster (x nach rechts, y nach unten, 0,0 oben links); die App rechnet sie um.`,
          images >= 2 ? 'Bild 2 ist dasselbe Bild mit einem Gitter alle 100 Pixel, die Zahlen am Rand sind die Koordinaten. Lies Punkte daran ab, schätze zwischen den Linien genau. Das Gitter ist nur eine Hilfe und nicht im Bild.' : '',
          images >= 3 ? 'Bild 3 ist der Stand vor deinen letzten Änderungen, zum Vergleich.' : '',
        ].filter(Boolean).join('\n')
        : `Das Bild (${doc.width} × ${doc.height} Pixel) kannst du in dieser Ansicht nicht sehen. Mach nur Bearbeitungen ohne Ortsangaben (adjust, Drehen, Zuschneiden per aspect) und sag das der Person, wenn sie mehr möchte.`,
      '',
      'So arbeitest du:',
      '- Führe Bearbeitungen mit den Werkzeugen selbst aus, statt sie zu erklären. Jeder Schritt lässt sich mit undo zurücknehmen.',
      '- Das Ergebnis siehst du in dieser Antwort nicht neu, die Person sieht es sofort. Wähle deshalb gleich beim ersten Mal sorgfältig.',
      '- Ist die Bitte unklar, frag kurz nach, statt zu raten.',
      '- Nach einem Zuschnitt oder Drehen passen Koordinaten erst wieder mit dem neuen Bild der nächsten Nachricht.',
      '',
      'Rezept „durchsichtigen Stoff blickdicht machen“ (Top, Shirt, Kleid, durch das Haut oder Unterwäsche scheint):',
      '1. select_garment: Punkt mitten auf eine gut deckende Stelle des Kleidungsstücks (nicht auf eine durchscheinende Stelle, keine Naht, keine Haare), Rahmen knapp um das ganze Kleidungsstück. Prüfe das Ergebnis (bounds). Fehlt ein großer Teil oder ist Haut dabei, korrigiere mit select_area (Polygon entlang des Kleidungsstücks, Haut und Haare draußen).',
      '2. make_fabric_opaque. Markiere, was durchscheint, großzügig:',
      '   - lines: Kanten, die durchscheinen (BH-Rand, Träger, Bündchen darunter) als Punktfolge entlang der Kante, width so breit, dass die Kante sicher drin ist (etwa 3 % der Bildbreite).',
      '   - areas: Polygone um durchscheinende Flächen (BH-Körbchen, helle oder dunkle Flecken).',
      '   - keep: Polygone um Haare oder Schmuck, die über dem Stoff liegen.',
      '   Farbe nur angeben, wenn die Person eine bestimmte will.',
      '3. Sag kurz, dass das Ergebnis auf der Ebene „Blickdicht“ liegt und das Original erhalten bleibt. Scheint noch etwas durch: undo und erneut mit genaueren lines/areas. Wirkt es zu künstlich: undo und strength 80–90 oder texture 100.',
      '',
      'Korrekturen und Filter für adjust (id — Parameter; fehlende Parameter bleiben neutral). Wirkt auf das ganze Bild bzw. nur auf eine vorhandene Auswahl:',
      catalogue(),
      '',
      `Aktueller Stand: ${JSON.stringify(docState())}`,
    ].join('\n');
  }

  // ─── Tools ───
  function progress(text) {
    addLog('step', text);
  }

  function selectionResult(extra = {}) {
    const doc = app().doc, sel = doc.selection;
    if (sel.empty) return { selection: null, ...extra };
    const b = sel.bounds, a = sel.alpha();
    let n = 0;
    for (let i = 0; i < a.length; i += 7) if (a[i] > 127) n++;
    return { selection: rectToImg(b), share_of_image_percent: Math.round((n * 7 * 100) / a.length), ...extra };
  }

  function flattenForAdjust(doc) {
    if (doc.layers.filter(l => l.visible).length > 1) doc.mergeVisible();
    const L = PW.guide.photoLayer();
    if (!L) throw new Error('Es gibt keine Bildebene, die bearbeitet werden kann.');
    return L;
  }

  const MODES = ['replace', 'add', 'subtract', 'intersect'];

  function tools() {
    const a = app();
    return [
      {
        name: 'get_state',
        description: 'Liefert den aktuellen Stand: Bildgröße (Anhang-Pixel), Ebenen, aktive Ebene, Auswahl-Rahmen, letzte Schritte.',
        execute: () => docState(),
      },
      {
        name: 'select_garment',
        description: 'Wählt ein Kleidungsstück automatisch aus: ausgehend von einem Punkt auf dem Stoff, begrenzt auf einen Rahmen. Haut und Haare bleiben draußen, durchscheinende Stellen werden mitgenommen. Liefert den Rahmen der Auswahl und ihren Anteil am Bild.',
        inputSchema: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Punkt auf gut deckendem Stoff' },
            y: { type: 'number' },
            box: { type: 'object', description: 'Rahmen um das ganze Kleidungsstück', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] },
          },
          required: ['x', 'y', 'box'],
        },
        execute: input => {
          needGeometry();
          const doc = a.doc, [x, y] = toDoc([input.x, input.y]);
          const box = input.box ? rectToDoc(input.box) : null;
          a.finishToolWork();
          const r = PW.fabric.selectGarment(doc, { x, y, box });
          a.commit('Kleidung auswählen', 'selection');
          progress('Kleidungsstück ausgewählt');
          return selectionResult({ share_of_box_percent: r.share });
        },
      },
      {
        name: 'select_area',
        description: 'Ändert die Auswahl mit einem Polygon oder Rechteck/Ellipse. mode: replace (Standard), add, subtract, intersect; mode "none" hebt die Auswahl auf. feather = weiche Kante in Pixeln.',
        inputSchema: {
          type: 'object',
          properties: {
            polygon: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: '[[x,y], …] mindestens 3 Punkte' },
            rect: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
            ellipse: { type: 'boolean', description: 'rect als Ellipse' },
            mode: { type: 'string', enum: ['replace', 'add', 'subtract', 'intersect', 'none'] },
            feather: { type: 'number' },
          },
        },
        execute: input => {
          const doc = a.doc, sel = doc.selection;
          a.finishToolWork();
          if (input.mode === 'none') {
            PW.selectionTools.deselect();
            progress('Auswahl aufgehoben');
            return selectionResult();
          }
          needGeometry();
          const mode = MODES.includes(input.mode) ? input.mode : 'replace';
          let name;
          if (Array.isArray(input.polygon)) {
            const p = pts(input.polygon);
            if (p.length < 3) throw new Error('Ein Polygon braucht mindestens 3 Punkte.');
            sel.polygon(p.map(([x, y]) => ({ x, y })), mode);
            name = 'Polygon-Lasso';
          } else if (input.rect) {
            const r = rectToDoc(input.rect);
            if (input.ellipse) sel.ellipse(r, mode);
            else sel.rect(r, mode);
            name = input.ellipse ? 'Elliptische Auswahl' : 'Rechteckige Auswahl';
          } else {
            throw new Error('Gib polygon oder rect an.');
          }
          const f = num(input.feather) * map.sx;
          if (f > 0.3) sel.feather(f);
          a.commit(name, 'selection');
          progress('Auswahl angepasst');
          return selectionResult();
        },
      },
      {
        name: 'make_fabric_opaque',
        description: 'Macht den ausgewählten Stoff blickdicht: Durchscheinendes verschwindet, Falten, Licht und Gewebe bleiben, damit es echt aussieht. Ergebnis auf eigener Ebene „Blickdicht“. Braucht eine Auswahl (select_garment). Liefert Ebene und Stofffarbe.',
        inputSchema: {
          type: 'object',
          properties: {
            lines: { type: 'array', description: 'Durchscheinende Kanten', items: { type: 'object', properties: { points: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, width: { type: 'number' } }, required: ['points'] } },
            areas: { type: 'array', description: 'Durchscheinende Flächen (Polygone)', items: { type: 'object', properties: { points: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['points'] } },
            keep: { type: 'array', description: 'Bereiche, deren Details bleiben (Haare)', items: { type: 'object', properties: { points: { type: 'array', items: { type: 'array', items: { type: 'number' } } } }, required: ['points'] } },
            strength: { type: 'number', description: '0–100, Standard 100' },
            texture: { type: 'number', description: 'Sichtbarkeit des Gewebes 0–120, Standard 85' },
            color: { type: 'string', description: "'light' | 'mid' | 'dark' | '#rrggbb'; weglassen = automatisch" },
            hide_lines: { type: 'boolean', description: 'Schwache Linien überall ausblenden, Standard true' },
          },
        },
        execute: async input => {
          const hasZones = ['lines', 'areas', 'keep'].some(k => Array.isArray(input[k]) && input[k].length);
          if (hasZones) needGeometry();
          a.finishToolWork();
          await new Promise(r => setTimeout(r, 0));
          const res = PW.fabric.apply({
            strength: input.strength,
            texture: input.texture,
            color: input.color,
            hide_lines: input.hide_lines,
            lines: shapes(input.lines, true),
            areas: shapes(input.areas),
            keep: shapes(input.keep),
          });
          state.edited = true;
          progress('Stoff blickdicht gemacht (Ebene „Blickdicht“)');
          return res;
        },
      },
      {
        name: 'adjust',
        description: 'Wendet eine Korrektur oder einen Filter aus der Liste im Auftrag an (id + params). Wirkt auf das ganze Bild (sichtbare Ebenen werden dafür zusammengefügt) oder nur in der Auswahl.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, params: { type: 'object' } },
          required: ['id'],
        },
        execute: input => {
          const def = adjustDefs().find(d => d.id === String(input.id));
          if (!def) throw new Error(`Unbekannte Korrektur „${input.id}“. Erlaubt: ${adjustDefs().map(d => d.id).join(', ')}`);
          const doc = a.doc;
          a.finishToolWork();
          const params = { ...PW.filters.defaults(def) };
          for (const p of def.params || []) {
            if (!input.params || input.params[p.key] === undefined) continue;
            const v = input.params[p.key];
            if (p.type === 'range') params[p.key] = clamp(num(v, p.value), p.min, p.max);
            else if (p.type === 'check') params[p.key] = v === true || v === 'true';
            else if (p.type === 'select') params[p.key] = p.options.some(o => o[0] === v) ? v : p.value;
            else if (p.type === 'color') params[p.key] = /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : p.value;
          }
          const L = flattenForAdjust(doc);
          const session = new PW.filters.FilterSession(doc, L, def, { fg: a.fg, bg: a.bg });
          session.run(params);
          const name = (def.title || def.name).replace('…', '');
          a.commit(name, def.menu === 'filter' ? 'filter' : 'adjust');
          state.edited = true;
          progress(name);
          return { done: name, params };
        },
      },
      {
        name: 'transform_image',
        description: 'Zuschneiden, Drehen oder Spiegeln. action "crop" mit rect ODER aspect (z. B. "1:1", "4:5", "16:9": größtmöglicher Ausschnitt, mittig oder um center); "rotate" mit degrees 90|-90|180; "flip" mit direction horizontal|vertical.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['crop', 'rotate', 'flip'] },
            rect: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } },
            aspect: { type: 'string' },
            center: { type: 'array', items: { type: 'number' }, description: '[x,y] Mittelpunkt für aspect' },
            degrees: { type: 'number' },
            direction: { type: 'string', enum: ['horizontal', 'vertical'] },
          },
          required: ['action'],
        },
        execute: input => {
          const doc = a.doc;
          a.finishToolWork();
          if (input.action === 'rotate') {
            const deg = [90, -90, 180].includes(num(input.degrees)) ? num(input.degrees) : 90;
            PW.commands.rotateImage(deg);
            map.changed = true;
            progress(`Bild gedreht (${deg}°)`);
            return { width: doc.width, height: doc.height };
          }
          if (input.action === 'flip') {
            PW.commands.flipImage(input.direction !== 'vertical');
            progress('Bild gespiegelt');
            return { done: true };
          }
          if (input.action !== 'crop') throw new Error('Unbekannte Aktion.');
          needGeometry();
          let r;
          if (input.rect) {
            r = rectToDoc(input.rect);
          } else {
            const m = String(input.aspect || '').match(/^\s*(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)\s*$/);
            if (!m) throw new Error('Gib rect oder aspect (z. B. "1:1") an.');
            const ar = Number(m[1]) / Number(m[2]);
            const w = Math.min(doc.width, doc.height * ar), h = w / ar;
            const [cx, cy] = Array.isArray(input.center) ? toDoc(input.center) : [doc.width / 2, doc.height / 2];
            r = { x: clamp(cx - w / 2, 0, doc.width - w), y: clamp(cy - h / 2, 0, doc.height - h), w, h };
          }
          r = PW.util.clipRect({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }, doc.width, doc.height);
          if (!r || r.w < 4 || r.h < 4) throw new Error('Der Ausschnitt ist zu klein oder liegt außerhalb des Bildes.');
          doc.crop(r);
          doc.selection.clear();
          a.commit('Freistellen', 'crop');
          a.view.fit(false);
          map.changed = true;
          state.edited = true;
          progress('Bild zugeschnitten');
          return { width: doc.width, height: doc.height };
        },
      },
      {
        name: 'add_text',
        description: 'Schreibt Text als eigene, später änderbare Textebene ins Bild. x,y = linke obere Ecke (bei align center: oben Mitte), size = Schrifthöhe in Pixeln.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            size: { type: 'number' },
            color: { type: 'string', description: '#rrggbb' },
            align: { type: 'string', enum: ['left', 'center', 'right'] },
            bold: { type: 'boolean' },
            font: { type: 'string', description: `Eine von: ${PW.FONTS.join(', ')}` },
          },
          required: ['text', 'x', 'y'],
        },
        execute: async input => {
          needGeometry();
          const doc = a.doc, text = String(input.text || '').slice(0, 500);
          if (!text.trim()) throw new Error('Der Text ist leer.');
          a.finishToolWork();
          const [x, y] = toDoc([input.x, input.y]);
          const font = PW.FONTS.includes(input.font) ? input.font : 'Arial';
          const L = doc.createLayer(text.split('\n')[0].slice(0, 40));
          L.type = 'text';
          L.text = {
            content: text, font, size: Math.max(6, num(input.size, 48) * map.sy), bold: !!input.bold, italic: false,
            align: ['left', 'center', 'right'].includes(input.align) ? input.align : 'left',
            color: /^#[0-9a-f]{6}$/i.test(String(input.color)) ? String(input.color) : '#ffffff', x, y, leading: 1.2,
          };
          doc.addLayer(L);
          await PW.fonts.ensure(font).catch(() => {});
          L.renderText();
          a.commit('Textebene erstellen', 'text');
          state.edited = true;
          progress(`Text „${text.split('\n')[0].slice(0, 30)}“ eingefügt`);
          return { layer: L.name };
        },
      },
      {
        name: 'undo',
        description: 'Nimmt die letzten Schritte zurück (steps, Standard 1). Liefert die Namen der zurückgenommenen Schritte.',
        inputSchema: { type: 'object', properties: { steps: { type: 'number' } } },
        execute: input => {
          const doc = a.doc, undone = [];
          for (let i = 0; i < clamp(Math.round(num(input.steps, 1)), 1, 10) && doc.history.canUndo; i++) {
            undone.push(doc.history.current.name);
            a.undo();
          }
          progress(undone.length ? `Rückgängig: ${undone.join(', ')}` : 'Nichts zum Rückgängigmachen');
          return { undone };
        },
      },
    ];
  }

  // ─── Conversation ───
  const ERRORS = {
    not_granted: 'Du hast Claude für diese Seite nicht erlaubt. Lade die Seite neu, wenn du es doch erlauben möchtest.',
    sampling_disabled: 'Claude ist für dein Konto gerade nicht verfügbar.',
    rate_limited: 'Gerade sind es zu viele Anfragen oder dein Nutzungslimit ist erreicht. Versuch es in ein paar Minuten noch einmal.',
    session_expired: 'Bitte melde dich bei claude.ai neu an und lade die Seite dann neu.',
    refused: 'Claude möchte diese Bitte nicht ausführen. Formuliere sie bitte anders.',
    empty_completion: 'Claude hat nichts geantwortet. Formuliere die Bitte etwas einfacher.',
    prompt_too_large: 'Der Verlauf ist zu lang geworden. Starte mit „Neu“ einen frischen Chat.',
    image_rejected: 'Das Bild konnte nicht an Claude geschickt werden.',
    tools_unavailable: 'In dieser Ansicht kann Claude Pixelwerk nicht bedienen.',
    images_unavailable: 'In dieser Ansicht kann Claude das Bild nicht sehen.',
  };

  const CHECK = 'Automatische Prüfung: Bild 1 zeigt jetzt das Ergebnis deiner Änderungen. Schau genau hin, ob die Bitte erfüllt ist. Scheint noch etwas durch (Kanten, Flecken, Formen), passt die Auswahl nicht oder wirkt etwas künstlich, dann korrigiere es jetzt mit den Werkzeugen, zum Beispiel mit undo und make_fabric_opaque mit genaueren lines und areas. Passt alles, schreib nur einen kurzen Satz.';

  // opts.auto: the automatic check after an edit (one per request, shown as a note).
  async function send(text, opts = {}) {
    text = String(text || '').trim();
    if (!text || state.busy) return;
    const a = app();
    if (!available()) return;
    if (!a.doc) {
      addLog('info', 'Öffne zuerst ein Foto, dann kann ich es bearbeiten.');
      return;
    }
    a.finishToolWork();
    const auto = !!opts.auto;
    state.busy = true;
    if (!auto) state.edited = false;
    if (auto) addLog('info', 'Claude prüft das Ergebnis …');
    else addLog('user', text);
    state.chat.push({ role: 'user', content: text });
    const reply = (state.reply = addLog('claude', ''));
    const ctl = (state.ctl = new AbortController());
    render();
    const steps = [];
    const stepWatch = PW.bus.on('assistant:step', t => steps.push(t));
    const doc = a.doc, startStep = doc.history.current;
    const model = modelOf(state.model), effort = state.effort;
    let ok = false;
    try {
      const images = [];
      if (state.images) {
        const shot = capture();
        images.push(await jpeg(shot));
        if (state.maxImages >= 2) images.push(await jpeg(withGrid(shot)));
        if (auto && state.before && state.maxImages >= 3) images.push(state.before);
        if (!auto) state.before = images[0];
      } else {
        snapshotMapOnly();
      }
      const input = [{ role: 'user', content: rules(images.length) }, ...state.chat.slice(-MAX_TURNS)];
      const call = {
        signal: ctl.signal,
        modelTier: model.tier,
        tools: tools(),
        onText: ({ text: t }) => {
          reply.text = t;
          paintEntry(reply);
        },
      };
      if (!model.auto) call.model = model.id;
      if (effort) call.effort = effort;
      if (images.length) call.images = images;
      const res = await state.sample(input, call);
      reply.text = res.text;
      ok = true;
      if (res.truncated) addLog('info', 'Die Antwort wurde abgeschnitten.');
      if (!model.auto && res.modelApplied !== model.id) {
        addLog('info', `„${model.name}“ ließ sich hier nicht direkt wählen; geantwortet hat automatisch die Stufe „${TIER_NAMES[res.modelTierApplied] || TIER_NAMES[model.tier]}“.`);
      } else if (model.auto && res.modelTierApplied && res.modelTierApplied !== model.tier) {
        addLog('info', `Dein Claude-Plan hat diesmal die Stufe „${TIER_NAMES[res.modelTierApplied]}“ statt „${TIER_NAMES[model.tier]}“ verwendet.`);
      }
      state.chat.push({ role: 'assistant', content: res.text + (steps.length ? `\n\n(Ausgeführt: ${steps.join('; ')})` : '') });
    } catch (e) {
      const code = e && e.code;
      reply.text = e && e.text && code !== 'refused' ? e.text : '';
      if (code !== 'cancelled') addLog('error', ERRORS[code] || 'Die Verbindung zu Claude ist abgebrochen. Schick die Nachricht einfach noch einmal.');
      else addLog('info', 'Angehalten.');
      if (code === 'not_granted' || code === 'sampling_disabled') setStatus('denied');
      if (code === 'tools_unavailable') setStatus('notools');
      // Keep the conversation consistent for the next call.
      state.chat.push({ role: 'assistant', content: (reply.text || '(keine Antwort)') + (steps.length ? `\n\n(Ausgeführt: ${steps.join('; ')})` : '') });
    } finally {
      stepWatch();
      if (!reply.text) state.log = state.log.filter(m => m !== reply);
      state.reply = null;
      state.busy = false;
      state.ctl = null;
      a.render();
      render();
      PW.bus.emit('assistant:changed');
    }
    // Claude cannot see its own result within one answer, so it gets one look at it.
    const changed = a.doc === doc && doc.history.current !== startStep;
    if (ok && changed && !auto && state.autoCheck && state.images) send(CHECK, { auto: true });
  }

  function snapshotMapOnly() {
    const doc = app().doc;
    Object.assign(map, { sx: 1, sy: 1, iw: doc.width, ih: doc.height, changed: false });
  }

  function stop() {
    if (state.ctl) state.ctl.abort();
  }

  function reset() {
    if (state.busy) return;
    state.chat = [];
    state.log = [];
    render();
    PW.bus.emit('assistant:changed');
  }

  // For "Meine Bilder": the conversation as plain data, and back.
  function exportChat() {
    return {
      chat: state.chat.slice(-MAX_TURNS * 2),
      log: state.log.filter(m => m.text).slice(-100).map(m => ({ kind: m.kind, text: m.text })),
    };
  }

  function importChat(data) {
    if (!data || state.busy || state.log.length) return;
    const ok = m => m && typeof m.text === 'string' && ['user', 'claude', 'step', 'error', 'info'].includes(m.kind);
    state.chat = (Array.isArray(data.chat) ? data.chat : []).filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content);
    state.log = (Array.isArray(data.log) ? data.log : []).filter(ok).map(m => ({ kind: m.kind, text: m.text }));
    render();
  }

  // Steps of a running answer go above Claude's reply bubble, so the reply reads last.
  function addLog(kind, text) {
    const m = { kind, text };
    const at = kind === 'step' && state.reply ? state.log.indexOf(state.reply) : -1;
    if (at >= 0) state.log.splice(at, 0, m);
    else state.log.push(m);
    if (kind === 'step') PW.bus.emit('assistant:step', text);
    if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
    if (ui) {
      const node = entryNode(m);
      if (at >= 0 && state.reply.node && state.reply.node.parentNode === ui.log) ui.log.insertBefore(node, state.reply.node);
      else ui.log.append(node);
      scrollDown();
    }
    return m;
  }

  // ─── Panel ───
  function entryNode(m) {
    const node = el('div', { class: `asst-msg asst-${m.kind}` });
    m.node = node;
    fillEntry(m);
    return node;
  }

  function fillEntry(m) {
    const n = m.node;
    if (!n) return;
    if (m.kind === 'step') {
      n.innerHTML = PW.icon('check', 14);
      n.append(el('span', { text: m.text }));
    } else if (m.kind === 'claude' && !m.text) {
      n.replaceChildren(el('span', { class: 'asst-thinking', text: 'Claude schaut sich das Bild an …' }));
    } else {
      n.textContent = m.text;
    }
  }

  function paintEntry(m) {
    fillEntry(m);
    scrollDown();
  }

  function scrollDown() {
    if (!ui) return;
    requestAnimationFrame(() => { ui.log.scrollTop = ui.log.scrollHeight; });
  }

  function build(body) {
    body.innerHTML = '';
    const log = el('div', { class: 'asst-log', role: 'log', 'aria-live': 'polite' });
    const box = el('textarea', { class: 'asst-text', rows: 2, placeholder: 'Was soll ich am Bild ändern?', 'aria-label': 'Nachricht an Claude' });
    const sendBtn = el('button', { type: 'submit', class: 'btn primary asst-send', text: 'Senden' });
    const stopBtn = el('button', { type: 'button', class: 'btn asst-stop', text: 'Stopp', onclick: stop });
    const newBtn = el('button', { type: 'button', class: 'linkish asst-new', text: 'Neuer Chat', onclick: reset });
    const keepKeys = e => e.stopPropagation();
    const modelSel = el('select', { class: 'asst-model-select', 'aria-label': 'Modell' }, [
      el('optgroup', { label: 'Automatisch' }, MODELS.filter(m => m.auto).map(m => el('option', { value: m.id, text: m.name.replace('Automatisch: ', '') }))),
      el('optgroup', { label: 'Bestimmtes Modell' }, MODELS.filter(m => !m.auto).map(m => el('option', { value: m.id, text: m.name }))),
    ]);
    const effortSel = el('select', { class: 'asst-effort-select', 'aria-label': 'Nachdenken' }, EFFORTS.map(([id, name]) => el('option', { value: id, text: name })));
    const check = el('input', { type: 'checkbox', class: 'asst-check' });
    for (const c of [modelSel, effortSel, check]) c.addEventListener('keydown', keepKeys);
    modelSel.addEventListener('change', () => {
      state.model = modelSel.value;
      savePref('pw-assistant-model', state.model);
      render();
    });
    effortSel.addEventListener('change', () => {
      state.effort = effortSel.value;
      savePref('pw-assistant-effort', state.effort);
      render();
    });
    check.addEventListener('change', () => {
      state.autoCheck = check.checked;
      savePref('pw-assistant-check', state.autoCheck ? '1' : '0');
      render();
    });
    const summary = el('summary', { class: 'asst-sum' });
    const hint = el('p', { class: 'asst-note asst-model-hint' });
    const settings = el('details', { class: 'asst-settings' }, [
      summary,
      el('div', { class: 'asst-set-grid' }, [
        el('label', { class: 'asst-set' }, [el('span', { text: 'Modell' }), modelSel]),
        el('label', { class: 'asst-set' }, [el('span', { text: 'Nachdenken' }), effortSel]),
        el('label', { class: 'asst-set-check' }, [check, el('span', { text: 'Ergebnis danach selbst prüfen und nachbessern' })]),
        hint,
      ]),
    ]);
    const form = el('form', { class: 'asst-form' }, [box, settings, el('div', { class: 'asst-actions' }, [el('span', { class: 'spacer' }), stopBtn, sendBtn])]);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const t = box.value;
      box.value = '';
      send(t);
    });
    box.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    const note = el('p', { class: 'asst-note' });
    body.append(log, form, el('div', { class: 'asst-foot' }, [note, newBtn]));
    ui = { body, log, box, sendBtn, stopBtn, newBtn, form, note, modelSel, effortSel, check, summary, hint };
    render();
  }

  function render() {
    if (!ui || !ui.body.isConnected) {
      ui = null;
      return;
    }
    const { log, box, sendBtn, stopBtn, newBtn, form, note, modelSel, effortSel, check, summary, hint } = ui;
    log.replaceChildren();
    const intro = el('div', { class: 'asst-msg asst-claude' });
    if (state.status === 'checking') intro.textContent = 'Verbinde mit Claude …';
    else if (state.status === 'unavailable') {
      intro.append(
        el('strong', { text: 'Claude ist hier nicht verfügbar. ' }),
        'Der Assistent funktioniert nur, wenn du Pixelwerk über deinen claude.ai-Link öffnest. Dort fragt dich claude.ai beim ersten Mal, ob die Seite Claude benutzen darf.',
      );
    } else if (state.status === 'notools') intro.textContent = 'Diese claude.ai-Ansicht kann Pixelwerk nicht von Claude bedienen lassen. Öffne den Link am besten im Browser auf dem Computer oder aktualisiere die Claude-App.';
    else if (state.status === 'denied') intro.textContent = 'Claude ist für diese Seite nicht erlaubt. Lade die Seite neu und erlaube es, wenn du den Assistenten benutzen möchtest.';
    else {
      intro.textContent = 'Hi, ich bin Claude. Sag mir einfach, was ich an deinem Foto ändern soll. Ich schaue mir das Bild an und bearbeite es direkt hier.';
    }
    log.append(intro);
    if (available() && !state.log.length) {
      log.append(el('div', { class: 'asst-chips' }, EXAMPLES.map(t => el('button', { type: 'button', class: 'chip-btn', text: t, onclick: () => send(t) }))));
    }
    for (const m of state.log) log.append(entryNode(m));
    if (available() && state.edited && !state.busy) {
      log.append(el('div', { class: 'asst-chips' }, [
        el('button', { type: 'button', class: 'chip-btn', text: 'Ergebnis prüfen und verbessern', onclick: () => send('Schau dir das Ergebnis an. Ist noch etwas zu sehen, das weg sollte, oder wirkt etwas bearbeitet? Dann korrigiere es; sonst sag kurz, dass es passt.') }),
        el('button', { type: 'button', class: 'chip-btn', text: 'Rückgängig', onclick: () => { app().undo(); state.edited = false; render(); } }),
      ]));
    }
    const off = !available();
    form.hidden = off;
    box.disabled = state.busy;
    sendBtn.hidden = state.busy;
    stopBtn.hidden = !state.busy;
    newBtn.disabled = state.busy || !state.log.length;
    newBtn.hidden = off;
    const model = modelOf(state.model);
    for (const c of [modelSel, effortSel, check]) c.disabled = state.busy;
    modelSel.value = model.id;
    effortSel.value = state.effort;
    check.checked = state.autoCheck;
    summary.textContent = `${model.auto ? model.name.replace('Automatisch: ', 'Automatisch, ') : model.name} · Nachdenken: ${effortName(state.effort)}${state.autoCheck ? ' · prüft selbst' : ''}`;
    hint.textContent = [
      model.auto ? model.hint : `Genau dieses Modell. Ist es für dein Konto nicht freigeschaltet, antwortet die Stufe „${TIER_NAMES[model.tier]}“ (steht dann im Chat).`,
      state.effort === 'high' ? 'Extra denkt am längsten nach.' : state.effort === 'low' ? 'Wenig ist schneller, aber ungenauer.' : '',
      state.autoCheck ? 'Danach prüft Claude das Ergebnis einmal selbst (zweite Anfrage).' : '',
    ].filter(Boolean).join(' ');
    note.textContent = off ? '' : state.images
      ? 'Claude sieht dazu das aktuelle Bild und nutzt dein Claude-Konto. Jeder Schritt lässt sich mit Strg+Z zurücknehmen.'
      : 'Hinweis: In dieser Ansicht kann Claude das Bild nicht sehen. Jeder Schritt lässt sich mit Strg+Z zurücknehmen.';
    scrollDown();
  }

  function open(prefill) {
    PW.ui.closeMenus();
    PW.panels.showTab('assistant');
    if (matchMedia('(max-width: 900px)').matches) document.body.classList.add('dock-open');
    if (ui) {
      if (prefill) ui.box.value = prefill;
      requestAnimationFrame(() => ui && ui.box.focus());
    }
  }

  PW.assistant = { init, build, open, send, stop, exportChat, importChat, status: () => state.status, models: MODELS.map(m => m.id), _state: state };
})(window.PW);
