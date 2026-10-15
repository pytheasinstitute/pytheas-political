// ─── Beginner help: plain-language tool tips, quick tasks, guided tour, "Erste Schritte" ───
'use strict';

(function (PW) {
  const { el, clamp } = PW.util;
  const app = () => PW.app;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* optional */ } },
  };

  // ─── What each tool does, in everyday words ───
  const TOOL_HELP = {
    move: 'Verschiebt die gewählte Ebene oder den ausgewählten Bereich: ins Bild klicken und ziehen.',
    marqueeRect: 'Wählt einen rechteckigen Bereich aus. Danach wirkt alles nur dort. Strg+D hebt die Auswahl auf.',
    marqueeEllipse: 'Wählt einen runden Bereich aus. Mit gedrückter Umschalttaste wird es ein Kreis.',
    lasso: 'Umfahre mit gedrückter Maustaste einen Bereich, um ihn frei Hand auszuwählen.',
    polyLasso: 'Klicke Punkt für Punkt um einen Bereich. Doppelklick schließt die Auswahl.',
    wand: 'Klicke auf eine Farbfläche, zum Beispiel den Himmel: Alle ähnlichen Pixel daneben werden ausgewählt.',
    crop: 'Schneidet das Bild zu: Ziehe die Ecken des Rahmens und drücke dann Enter.',
    eyedropper: 'Klicke ins Bild, um genau diese Farbe als Malfarbe aufzunehmen.',
    brush: 'Malt weiche Striche in der Farbe des oberen Farbfelds (unten links). Die Größe stellst du oben ein.',
    pencil: 'Malt harte, pixelgenaue Striche, gut für Pixel-Art.',
    clone: 'Entfernt Störendes: Halte Alt gedrückt und klicke auf eine saubere Stelle. Dann male über das Störende.',
    eraser: 'Radiert auf der gewählten Ebene. Dort wird das Bild durchsichtig.',
    gradient: 'Ziehe eine Linie über das Bild: Es entsteht ein weicher Farbübergang.',
    bucket: 'Klicke in eine Fläche, um sie mit der Malfarbe zu füllen.',
    blur: 'Male über Stellen, die weicher werden sollen, zum Beispiel Haut.',
    sharpen: 'Male über Stellen, die schärfer werden sollen.',
    smudge: 'Verwischt Farben wie mit dem Finger.',
    dodge: 'Hellt die Stellen auf, über die du malst.',
    burn: 'Dunkelt die Stellen ab, über die du malst.',
    text: 'Klicke ins Bild und tippe los. Schrift, Größe und Farbe stellst du oben ein. Fertig mit dem Häkchen.',
    shapeRect: 'Ziehe im Bild, um ein Rechteck zu zeichnen. Umschalt ergibt ein Quadrat.',
    shapeEllipse: 'Ziehe im Bild, um eine Ellipse zu zeichnen. Umschalt ergibt einen Kreis.',
    shapePolygon: 'Ziehe im Bild, um ein Vieleck oder einen Stern zu zeichnen.',
    shapeLine: 'Ziehe im Bild, um eine Linie oder einen Pfeil zu zeichnen.',
    hand: 'Verschiebt nur die Ansicht. Das Bild selbst bleibt unverändert.',
    zoom: 'Klicke zum Vergrößern, mit Alt zum Verkleinern.',
    transform: 'Ziehe an den Ecken zum Vergrößern, neben dem Rahmen zum Drehen. Enter bestätigt, Esc bricht ab.',
  };

  // ─── Coach bubble: shows how the current tool works ───
  let coachEl = null, coachText = null, coachIcon = null;

  const tipsOn = () => store.get('pw-tips') !== 'off';

  function coach(text, icon) {
    if (!coachEl || !text || !app().doc) return hideCoach();
    coachIcon.innerHTML = PW.icon(icon || 'help', 18);
    coachText.textContent = text;
    coachEl.hidden = false;
  }

  function hideCoach() {
    if (coachEl) coachEl.hidden = true;
  }

  function setTips(on) {
    store.set('pw-tips', on ? 'on' : 'off');
    if (on) {
      const t = PW.tools.byId[app().toolId];
      if (t) coach(TOOL_HELP[t.id], t.icon);
    } else hideCoach();
  }

  // ─── Quick tasks ───
  // Adjustments go to a picture layer: text layers are skipped instead of asking to rasterise them.
  function photoLayer() {
    const a = app(), doc = a.doc;
    if (!doc) {
      a.toast('Öffne zuerst ein Foto (Datei › Öffnen).');
      return null;
    }
    a.finishToolWork();
    const ok = L => L && !L.isText && L.visible && !L.locked;
    let L = doc.active;
    if (!ok(L)) {
      const i = doc.activeIndex;
      L = [...doc.layers.slice(0, Math.max(0, i)).reverse(), ...doc.layers.slice(i + 1).reverse()].find(ok);
      if (!L) {
        a.toast('Es gibt keine Bildebene, die bearbeitet werden kann.');
        return null;
      }
      doc.setActive(L.id);
      a.toast(`Bearbeite Ebene „${L.name}“`);
    }
    if (L.editMask) {
      L.editMask = false;
      PW.bus.emit('layers:changed', doc);
    }
    return L;
  }

  // Painting on a text layer would destroy the text, so beginners get a fresh layer instead.
  function paintableLayer() {
    const a = app(), doc = a.doc;
    if (!doc) {
      a.toast('Öffne zuerst ein Foto oder lege ein neues Bild an.');
      return false;
    }
    a.finishToolWork();
    const L = doc.active;
    if (!L || L.isText || L.locked) {
      const N = doc.createLayer('Zeichnung');
      doc.addLayer(N);
      a.commit('Neue Ebene', 'new-layer');
    }
    return true;
  }

  function useTool(id, text, prep) {
    const a = app();
    if (!a.doc) return a.toast('Öffne zuerst ein Foto oder lege ein neues Bild an.');
    if (prep && prep() === false) return;
    a.setTool(id);
    if (text) coach(text, PW.tools.byId[id].icon);
    closeDockOnPhone();
  }

  function adjust(id, params) {
    if (!photoLayer()) return;
    const def = PW.filters.defs.find(f => f.id === id);
    PW.dialogs.runFilter(def, params ? { params } : {});
    closeDockOnPhone();
  }

  function closeDockOnPhone() {
    if (matchMedia('(max-width: 900px)').matches) document.body.classList.remove('dock-open');
  }

  const QUICK = [
    { title: 'Bild', items: [
      { icon: 'open', label: 'Foto öffnen', hint: 'Ein Bild von deinem Gerät laden', run: () => PW.runAction('file.open'), always: true },
      { icon: 'image', label: 'Meine Bilder', hint: 'Alle Bilder, die du schon bearbeitet hast', run: () => PW.library.openDialog(), always: true },
      { icon: 'file', label: 'Leeres Bild', hint: 'Mit einer leeren Fläche beginnen', run: () => PW.runAction('file.new'), always: true },
    ] },
    { title: 'Verbessern', items: [
      { icon: 'magic', label: 'Auto-Verbessern', hint: 'Helligkeit und Farben mit einem Klick', run: () => adjust('autoEnhance', {}) },
      { icon: 'sun', label: 'Heller / dunkler', hint: 'Helligkeit und Kontrast mit Reglern', run: () => adjust('brightnessContrast') },
      { icon: 'vibrance', label: 'Farben kräftiger', hint: 'Farben intensiver oder blasser machen', run: () => adjust('vibrance') },
      { icon: 'bw', label: 'Schwarzweiß', hint: 'In ein Schwarzweißbild umwandeln', run: () => adjust('blackWhite', PW.filters.defaults(PW.filters.defs.find(f => f.id === 'blackWhite'))) },
      { icon: 'filter', label: 'Warmer Look', hint: 'Ein warmer, sonniger Farbton', run: () => adjust('photoFilter', { color: '#ec8a00', density: 30, preserve: true }) },
      { icon: 'drop', label: 'Weichzeichnen', hint: 'Das Bild unschärfer machen', run: () => adjust('gaussianBlur') },
    ] },
    { title: 'Zuschneiden & Größe', items: [
      { icon: 'crop', label: 'Zuschneiden', hint: 'Ränder abschneiden', run: () => useTool('crop', 'Ziehe die Ecken des hellen Rahmens nach innen. Wenn es passt, drücke Enter oder klicke oben auf das Häkchen.', () => { PW.tools.byId.crop.options.ratio = 'free'; }) },
      { icon: 'shape-rect', label: 'Quadratisch', hint: 'Zuschneiden im Format 1 : 1, zum Beispiel für Instagram', run: () => useTool('crop', 'Der Rahmen ist quadratisch. Verschiebe ihn an die richtige Stelle und drücke Enter.', () => {
        const c = PW.tools.byId.crop;
        c.options.ratio = '1:1';
        if (app().toolId === 'crop') c.onOption('ratio');
      }) },
      { icon: 'image', label: 'Bildgröße ändern', hint: 'Das Bild kleiner oder größer rechnen', run: () => PW.runAction('image.size') },
      { icon: 'rotate', label: 'Drehen', hint: 'Um 90° im Uhrzeigersinn drehen', run: () => PW.runAction('image.rot90cw') },
    ] },
    { title: 'Hinzufügen', items: [
      { icon: 'text', label: 'Text schreiben', hint: 'Text ins Bild setzen', run: () => useTool('text', TOOL_HELP.text) },
      { icon: 'brush', label: 'Malen', hint: 'Mit dem Pinsel zeichnen', run: () => useTool('brush', 'Male mit gedrückter Maustaste. Die Farbe wählst du unten links im oberen Farbfeld, die Größe oben.', paintableLayer) },
      { icon: 'shape', label: 'Form zeichnen', hint: 'Rechteck, Kreis, Stern oder Pfeil', run: () => useTool('shapeRect', TOOL_HELP.shapeRect) },
      { icon: 'stamp', label: 'Flecken entfernen', hint: 'Flecken oder störende Dinge wegstempeln', run: () => useTool('clone', TOOL_HELP.clone, () => !!photoLayer()) },
    ] },
    { title: 'Fertig', items: [
      { icon: 'undo', label: 'Rückgängig', hint: 'Den letzten Schritt zurücknehmen (Strg+Z)', run: () => PW.runAction('edit.undo') },
      { icon: 'download', label: 'Bild speichern', hint: 'Das fertige Bild als JPG oder PNG speichern', run: () => PW.runAction('file.export'), primary: true },
    ] },
  ];

  function buildQuick(body) {
    const fabric = el('button', { type: 'button', class: 'quick-feature quick-fabric' }, [
      el('span', { class: 'quick-ic', html: PW.icon('shirt', 20) }),
      el('span', { class: 'qf-text' }, [
        el('strong', { text: 'Stoff blickdichter machen' }),
        el('span', { text: 'Durchsichtige Kleidung abdecken: Bereich umfahren, Stärke einstellen, fertig.' }),
      ]),
    ]);
    fabric.addEventListener('click', () => PW.fabric.start());
    const claude = el('button', { type: 'button', class: 'quick-feature quick-claude' }, [
      el('span', { class: 'quick-ic', html: PW.icon('chat', 20) }),
      el('span', { class: 'qf-text' }, [
        el('strong', { text: 'Claude fragen' }),
        el('span', { text: 'Schreib, was du willst, z. B. „Mach das Top blickdicht“. Claude bearbeitet das Bild für dich.' }),
      ]),
    ]);
    claude.addEventListener('click', () => PW.assistant.open());
    body.append(claude, fabric, el('p', { class: 'quick-lead', text: 'Was möchtest du tun?' }));
    for (const g of QUICK) {
      const grid = el('div', { class: 'quick-grid' });
      for (const it of g.items) {
        const b = el('button', { type: 'button', class: `quick-btn ${it.primary ? 'primary' : ''}`, title: it.hint }, [
          el('span', { class: 'quick-ic', html: PW.icon(it.icon, 16) }),
          el('span', { class: 'quick-label', text: it.label }),
        ]);
        b.addEventListener('click', it.run);
        grid.append(b);
      }
      body.append(el('div', { class: 'quick-group' }, [el('h3', { class: 'quick-title', text: g.title }), grid]));
    }
    body.append(el('div', { class: 'quick-foot' }, [
      el('button', { type: 'button', class: 'linkish', text: 'Erste Schritte', onclick: () => basics() }),
      el('span', { text: '·' }),
      el('button', { type: 'button', class: 'linkish', text: 'Rundgang starten', onclick: () => tour() }),
    ]));
  }

  // ─── "Erste Schritte": short how-tos, each with a button that does it ───
  const BASICS = [
    ['open', 'Ein Foto öffnen', 'Klicke auf „Datei › Öffnen“ oder ziehe das Foto einfach in das Fenster.', 'Foto öffnen', () => PW.runAction('file.open')],
    ['magic', 'Das Foto verbessern', 'Im Bedienfeld „Schnellstart“ rechts auf „Auto-Verbessern“ klicken. Feiner geht es mit „Heller / dunkler“ und „Farben kräftiger“.', 'Automatisch verbessern', () => adjust('autoEnhance', {})],
    ['crop', 'Zuschneiden', 'Wähle das Freistellungswerkzeug (C), ziehe die Ecken des Rahmens und drücke Enter.', 'Zuschneiden', () => useTool('crop', 'Ziehe die Ecken des hellen Rahmens nach innen. Wenn es passt, drücke Enter.')],
    ['text', 'Text hinzufügen', 'Wähle das Textwerkzeug (T), klicke ins Bild und tippe. Schrift, Größe und Farbe stehen oben.', 'Text schreiben', () => useTool('text', TOOL_HELP.text)],
    ['history', 'Fehler rückgängig machen', 'Strg+Z (am Mac ⌘Z) nimmt den letzten Schritt zurück, beliebig oft. Unter „Protokoll“ siehst du jeden Schritt und kannst zurückspringen.', 'Rückgängig', () => PW.runAction('edit.undo')],
    ['download', 'Speichern', '„Datei › Exportieren als …“ speichert dein Bild: JPG für Fotos, PNG für Grafiken mit durchsichtigen Stellen.', 'Jetzt speichern', () => PW.runAction('file.export')],
    ['layers', 'Was sind Ebenen?', 'Stell dir durchsichtige Folien vor, die übereinanderliegen: Foto, Text und Formen liegen jeweils auf einer eigenen Folie. So kannst du jedes Teil einzeln ändern, verschieben oder mit dem Auge ausblenden.', null, null],
    ['selection', 'Was ist eine Auswahl?', 'Die gestrichelte Linie markiert einen Bereich. Solange sie da ist, wirken Pinsel, Filter und Korrekturen nur innerhalb dieses Bereichs. Strg+D hebt die Auswahl auf.', null, null],
  ];

  function basics() {
    let close = null;
    const cards = BASICS.map(([icon, title, text, btn, run]) => el('div', { class: 'basic-card' }, [
      el('div', { class: 'basic-ic', html: PW.icon(icon, 20) }),
      el('div', { class: 'basic-body' }, [
        el('h3', { text: title }),
        el('p', { text }),
        btn ? el('button', { type: 'button', class: 'btn small', text: btn, onclick: () => {
          close();
          setTimeout(run, 0);
        } }) : null,
      ]),
    ]));
    const p = PW.dialogs.modal({
      title: 'Erste Schritte',
      content: el('div', { class: 'basics' }, cards),
      buttons: [['ok', 'Los geht’s', true], ['tour', 'Rundgang starten']],
      width: 640,
      className: 'dlg-basics',
    });
    close = () => {
      const b = [...document.querySelectorAll('.dlg-basics .dlg-buttons .btn')].find(x => x.textContent === 'Los geht’s');
      if (b) b.click();
    };
    return p.then(r => {
      if (r === 'tour') tour();
    });
  }

  // ─── Guided tour with a spotlight on each area ───
  const STEPS = [
    { title: 'Willkommen bei Pixelwerk', text: 'Hier bearbeitest du Fotos und Grafiken direkt im Browser. Der kurze Rundgang zeigt dir in acht Schritten, wo du was findest. Du kannst ihn jederzeit über „Hilfe“ wieder starten.' },
    { target: '#toolbar', place: 'right', title: 'Werkzeuge', text: 'Links stehen die Werkzeuge: Pinsel, Text, Zuschneiden und mehr. Klicke eins an und dann ins Bild. Fährst du mit der Maus darüber, steht da, was es macht.' },
    { target: '#optionsbar', place: 'bottom', title: 'Einstellungen', text: 'Hier oben stellst du das gewählte Werkzeug ein, zum Beispiel die Pinselgröße oder die Schriftart.' },
    { target: '#workspace', place: 'center', title: 'Dein Bild', text: 'In der Mitte liegt dein Bild. Mit dem Mausrad verschiebst du die Ansicht, mit Strg + Mausrad zoomst du. Unten steht immer ein Tipp zum gewählten Werkzeug.' },
    { target: '[data-panel="quick"]', place: 'left', title: 'Schnellstart', text: 'Die häufigsten Aufgaben mit einem Klick: Foto öffnen, automatisch verbessern, Stoff blickdichter machen, zuschneiden, Text schreiben und speichern. Am besten fängst du hier an.', before: () => PW.panels.showTab('quick') },
    { target: '#claude-btn', place: 'bottom', title: 'Claude fragen', text: 'Schreib einfach, was du am Bild ändern willst, zum Beispiel „Mach das Top blickdicht“. Claude schaut sich das Foto an und bearbeitet es für dich. Das klappt, wenn du Pixelwerk über deinen claude.ai-Link öffnest.' },
    { target: '[data-panel="layers"]', place: 'left', title: 'Ebenen', text: 'Ebenen sind wie durchsichtige Folien übereinander: Foto, Text und Formen liegen jeweils auf einer eigenen. Mit dem Auge blendest du eine aus, die oberste liegt vorn.', before: () => PW.panels.showTab('layers') },
    { target: '#menus', place: 'bottom', title: 'Rückgängig und Speichern', text: 'Ein Fehler? Strg+Z macht ihn rückgängig, so oft du willst. Zum Speichern: „Datei › Exportieren als …“. Viel Spaß!' },
  ];

  let tourEl = null;

  function endTour() {
    if (!tourEl) return;
    tourEl.remove();
    tourEl = null;
    store.set('pw-tour-done', '1');
    document.body.classList.remove('dock-open');
    window.removeEventListener('resize', tourEl_resize);
    document.removeEventListener('keydown', tourKeys, true);
  }

  let tourStep = 0, tourEl_resize = () => {}, tourKeys = () => {};

  function tour(start = 0) {
    PW.ui.closeMenus();
    if (tourEl) tourEl.remove();
    tourEl = el('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rundgang' });
    const hole = el('div', { class: 'tour-hole' });
    const bubble = el('div', { class: 'tour-bubble' });
    tourEl.append(hole, bubble);
    document.body.append(tourEl);
    tourStep = start;

    const show = () => {
      const s = STEPS[tourStep];
      if (s.before) s.before();
      const phone = matchMedia('(max-width: 900px)').matches;
      if (s.target && s.target.startsWith('[data-panel') && phone) document.body.classList.add('dock-open');
      else document.body.classList.remove('dock-open');
      bubble.innerHTML = '';
      bubble.append(
        el('div', { class: 'tour-count', text: `${tourStep + 1} / ${STEPS.length}` }),
        el('h2', { text: s.title }),
        el('p', { text: s.text }),
        el('div', { class: 'tour-actions' }, [
          el('button', { type: 'button', class: 'linkish', text: 'Überspringen', onclick: endTour }),
          el('span', { class: 'spacer' }),
          tourStep > 0 ? el('button', { type: 'button', class: 'btn', text: 'Zurück', onclick: () => go(-1) }) : null,
          el('button', { type: 'button', class: 'btn primary', text: tourStep === STEPS.length - 1 ? 'Fertig' : 'Weiter', onclick: () => go(1) }),
        ]),
      );
      // Wait a frame so panels that just opened have their final size.
      requestAnimationFrame(() => requestAnimationFrame(() => place(s)));
    };

    const place = s => {
      if (!tourEl) return;
      const t = s.target && document.querySelector(s.target);
      const r = t && t.getBoundingClientRect();
      const W = innerWidth, H = innerHeight, bw = Math.min(360, W - 32), pad = 6;
      bubble.style.width = `${bw}px`;
      const bh = bubble.offsetHeight;
      if (!r || r.width < 2 || r.height < 2) {
        hole.hidden = true;
        bubble.style.left = `${(W - bw) / 2}px`;
        bubble.style.top = `${Math.max(16, (H - bh) / 2)}px`;
        return;
      }
      hole.hidden = false;
      Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      let x, y;
      if (s.place === 'right' && r.right + 16 + bw < W) {
        x = r.right + 16;
        y = r.top + 40;
      } else if (s.place === 'left' && r.left - 16 - bw > 0) {
        x = r.left - 16 - bw;
        y = r.top + 20;
      } else if (s.place === 'bottom' && r.bottom + 16 + bh < H) {
        x = r.left + 20;
        y = r.bottom + 16;
      } else {
        x = r.left + (r.width - bw) / 2;
        y = r.top + (r.height - bh) / 2;
      }
      bubble.style.left = `${clamp(x, 16, W - bw - 16)}px`;
      bubble.style.top = `${clamp(y, 16, H - bh - 16)}px`;
    };

    const go = d => {
      tourStep += d;
      if (tourStep >= STEPS.length) return endTour();
      tourStep = clamp(tourStep, 0, STEPS.length - 1);
      show();
    };

    tourEl_resize = () => place(STEPS[tourStep]);
    tourKeys = e => {
      if (!tourEl) return;
      e.stopPropagation();
      if (e.key === 'Escape') endTour();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('resize', tourEl_resize);
    document.addEventListener('keydown', tourKeys, true);
    show();
  }

  function init() {
    coachEl = el('div', { class: 'coach', role: 'status', hidden: true }, [
      (coachIcon = el('span', { class: 'coach-ic' })),
      (coachText = el('span', { class: 'coach-text' })),
      el('button', { type: 'button', class: 'coach-close', title: 'Tipps ausblenden (Hilfe › Einsteiger-Tipps)', 'aria-label': 'Tipp schließen', html: PW.icon('x', 14), onclick: hideCoach }),
    ]);
    document.getElementById('workspace').append(coachEl);
    PW.bus.on('tool:changed', t => {
      if (tipsOn() && !t.hidden) coach(TOOL_HELP[t.id], t.icon);
      else if (t.hidden && tipsOn()) coach(TOOL_HELP[t.id], t.icon);
    });
    PW.bus.on('doc:switched', d => {
      if (!d) hideCoach();
    });
    document.getElementById('help-btn').addEventListener('click', () => basics());
    document.getElementById('start-tour').addEventListener('click', () => tour());
  }

  // First visit: start the tour once the sample is on screen.
  function maybeStartTour() {
    if (store.get('pw-tour-done')) {
      if (tipsOn()) {
        const t = PW.tools.byId[app().toolId];
        if (t) coach(TOOL_HELP[t.id], t.icon);
      }
      return;
    }
    setTimeout(() => tour(), 700);
  }

  PW.guide = { init, tour, basics, coach, hideCoach, setTips, tipsOn, maybeStartTour, buildQuick, TOOL_HELP, photoLayer };
})(window.PW);
