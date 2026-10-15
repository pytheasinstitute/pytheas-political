// ─── Actions: one registry feeds the menu bar, keyboard shortcuts and the help sheet ───
'use strict';

(function (PW) {
  const app = () => PW.app;
  const C = () => PW.commands;
  const D = () => PW.dialogs;
  const hasDoc = () => !!app().doc;
  const hasSel = () => !!app().doc && !app().doc.selection.empty;
  const hasLayer = () => !!(app().doc && app().doc.active);
  const hasMask = () => hasLayer() && !!app().doc.active.mask;

  const A = {};
  const def = (id, label, run, opts = {}) => (A[id] = { id, label, run, enabled: hasDoc, ...opts });

  // ─── File ───
  def('file.new', 'Neu …', () => D().newDocument(), { key: 'Mod+N', alt: ['Mod+Alt+N'], enabled: () => true });
  def('file.open', 'Öffnen …', () => PW.io.open(), { key: 'Mod+O', enabled: () => true });
  def('file.place', 'Eingebettet platzieren …', () => PW.io.place());
  def('file.library', 'Meine Bilder …', () => PW.library.openDialog(), { key: 'Mod+Alt+O', enabled: () => true });
  def('file.close', 'Schließen', () => app().closeDoc(), { key: 'Mod+W', alt: ['Mod+Alt+W'] });
  def('file.closeAll', 'Alle schließen', async () => {
    for (const d of [...app().docs]) await app().closeDoc(d);
  });
  def('file.save', 'Speichern (Pixelwerk-Projekt) …', () => PW.io.saveProject(app().doc), { key: 'Mod+S' });
  def('file.export', 'Exportieren als …', () => D().exportImage(), { key: 'Mod+Alt+Shift+W' });
  def('file.quickPng', 'Schnell-Export als PNG', () => PW.io.exportImage(app().doc, { format: 'png', scale: 100, name: app().doc.name.replace(/\.[a-z0-9]+$/i, '') }), { key: "Mod+Shift+'" });

  // ─── Edit ───
  def('edit.undo', 'Rückgängig', () => app().undo(), { key: 'Mod+Z', enabled: () => hasDoc() && app().doc.history.canUndo, dynamicLabel: () => (hasDoc() && app().doc.history.canUndo ? `Rückgängig: ${app().doc.history.current.name}` : 'Rückgängig') });
  def('edit.redo', 'Wiederholen', () => app().redo(), { key: 'Mod+Shift+Z', alt: ['Mod+Y'], enabled: () => hasDoc() && app().doc.history.canRedo });
  def('edit.cut', 'Ausschneiden', () => C().cut(), { key: 'Mod+X', enabled: hasSel });
  def('edit.copy', 'Kopieren', () => C().copy(false), { key: 'Mod+C', enabled: hasLayer });
  def('edit.copyMerged', 'Auf eine Ebene reduziert kopieren', () => C().copy(true), { key: 'Mod+Shift+C' });
  def('edit.paste', 'Einfügen', () => PW.io.pasteFromClipboard(), { key: 'Mod+V', enabled: () => true, nativePaste: true });
  def('edit.clear', 'Löschen', () => C().clear(), { key: 'Delete', alt: ['Backspace'] });
  def('edit.fill', 'Fläche füllen …', () => D().fill(), { key: 'Shift+F5', alt: ['Shift+Backspace'] });
  def('edit.fillFg', 'Mit Vordergrundfarbe füllen', () => C().fillWith(app().fg), { key: 'Alt+Backspace', alt: ['Alt+Delete'] });
  def('edit.fillBg', 'Mit Hintergrundfarbe füllen', () => C().fillWith(app().bg), { key: 'Mod+Backspace', alt: ['Mod+Delete'] });
  def('edit.stroke', 'Kontur …', () => D().stroke());
  def('edit.transform', 'Frei transformieren', () => app().startTransform(), { key: 'Mod+T', alt: ['Mod+Alt+T'], enabled: hasLayer });
  def('edit.flipH', 'Horizontal spiegeln', () => C().flipLayer(true), { enabled: hasLayer });
  def('edit.flipV', 'Vertikal spiegeln', () => C().flipLayer(false), { enabled: hasLayer });
  def('edit.rot180', '180° drehen', () => C().rotateLayer(180), { enabled: hasLayer });
  def('edit.rot90cw', '90° im UZS drehen', () => C().rotateLayer(90), { enabled: hasLayer });
  def('edit.rot90ccw', '90° gegen UZS drehen', () => C().rotateLayer(-90), { enabled: hasLayer });

  // ─── Image ───
  for (const f of PW.filters.defs) {
    if (f.sep || f.menu === 'filter') continue;
    def(`adjust.${f.id}`, f.name, () => D().runFilter(f), { key: f.shortcut, enabled: hasLayer });
  }
  def('image.size', 'Bildgröße …', () => D().imageSize(), { key: 'Mod+Alt+I' });
  def('image.canvas', 'Arbeitsfläche …', () => D().canvasSize(), { key: 'Mod+Alt+C' });
  def('image.rot180', '180°', () => C().rotateImage(180));
  def('image.rot90cw', '90° im UZS', () => C().rotateImage(90));
  def('image.rot90ccw', '90° gegen UZS', () => C().rotateImage(-90));
  def('image.flipH', 'Arbeitsfläche horizontal spiegeln', () => C().flipImage(true));
  def('image.flipV', 'Arbeitsfläche vertikal spiegeln', () => C().flipImage(false));
  def('image.crop', 'Freistellen', () => C().cropToSelection(), { enabled: hasSel });
  def('image.trim', 'Zuschneiden (transparente Pixel)', () => C().trim());
  def('image.fabric', 'Stoff blickdichter machen …', () => PW.fabric.start(), { enabled: () => true });

  // ─── Layer ───
  def('layer.new', 'Neue Ebene', () => C().newLayer(), { key: 'Mod+Shift+N' });
  def('layer.viaCopy', 'Ebene durch Kopie', () => C().layerVia(false), { key: 'Mod+J', enabled: hasLayer });
  def('layer.viaCut', 'Ebene durch Ausschneiden', () => C().layerVia(true), { key: 'Mod+Shift+J', enabled: hasSel });
  def('layer.duplicate', 'Ebene duplizieren', () => C().duplicateLayer(), { enabled: hasLayer });
  def('layer.delete', 'Ebene löschen', () => C().deleteLayer(), { enabled: hasLayer });
  def('layer.rename', 'Ebeneneigenschaften …', () => C().renameLayer(), { enabled: hasLayer });
  def('layer.style', 'Ebenenstil …', () => D().layerStyle(), { enabled: hasLayer });
  def('layer.maskReveal', 'Alles einblenden', () => C().addMask('reveal'), { enabled: hasLayer });
  def('layer.maskHide', 'Alles ausblenden', () => C().addMask('hide'), { enabled: hasLayer });
  def('layer.maskRevealSel', 'Auswahl einblenden', () => C().addMask('revealSel'), { enabled: () => hasLayer() && hasSel() });
  def('layer.maskHideSel', 'Auswahl ausblenden', () => C().addMask('hideSel'), { enabled: () => hasLayer() && hasSel() });
  def('layer.maskToggle', 'Maske deaktivieren/aktivieren', () => C().toggleMask(), { enabled: hasMask });
  def('layer.maskApply', 'Maske anwenden', () => C().applyMask(), { enabled: hasMask });
  def('layer.maskDelete', 'Maske löschen', () => C().deleteMask(), { enabled: hasMask });
  def('layer.front', 'In den Vordergrund', () => C().arrange('front'), { key: 'Mod+Shift+]', enabled: hasLayer });
  def('layer.forward', 'Schrittweise vorwärts', () => C().arrange('forward'), { key: 'Mod+]', enabled: hasLayer });
  def('layer.backward', 'Schrittweise rückwärts', () => C().arrange('backward'), { key: 'Mod+[', enabled: hasLayer });
  def('layer.back', 'In den Hintergrund', () => C().arrange('back'), { key: 'Mod+Shift+[', enabled: hasLayer });
  def('layer.lock', 'Ebene sperren', () => C().toggleLock(), { key: 'Mod+/', enabled: hasLayer, checked: () => hasLayer() && app().doc.active.locked });
  def('layer.lockAlpha', 'Transparente Pixel fixieren', () => C().toggleLockAlpha(), { enabled: hasLayer, checked: () => hasLayer() && app().doc.active.lockAlpha });
  def('layer.rasterize', 'Ebene rastern', () => C().rasterize(), { enabled: () => hasLayer() && app().doc.active.isText });
  def('layer.mergeDown', 'Auf eine Ebene reduzieren', () => C().mergeDown(), { key: 'Mod+E', enabled: hasLayer });
  def('layer.mergeVisible', 'Sichtbare auf eine Ebene reduzieren', () => C().mergeVisible(), { key: 'Mod+Shift+E' });
  def('layer.flatten', 'Auf Hintergrundebene reduzieren', () => C().flatten());

  // ─── Select ───
  def('select.all', 'Alles auswählen', () => C().selectAll(), { key: 'Mod+A' });
  def('select.none', 'Auswahl aufheben', () => C().deselect(), { key: 'Mod+D', enabled: hasSel });
  def('select.reselect', 'Erneut auswählen', () => C().reselect(), { key: 'Mod+Shift+D', enabled: () => hasDoc() && !!app().doc.savedSelection });
  def('select.inverse', 'Auswahl umkehren', () => C().inverse(), { key: 'Mod+Shift+I', alt: ['Shift+F7'] });
  def('select.layer', 'Auswahl aus Ebenentransparenz', () => C().loadLayerAlpha(), { enabled: hasLayer });
  def('select.expand', 'Erweitern …', () => C().modifySelection('expand'), { enabled: hasSel });
  def('select.contract', 'Verkleinern …', () => C().modifySelection('contract'), { enabled: hasSel });
  def('select.feather', 'Weiche Kante …', () => C().modifySelection('feather'), { key: 'Shift+F6', enabled: hasSel });
  def('select.border', 'Umrandung …', () => C().modifySelection('border'), { enabled: hasSel });

  // ─── Filter ───
  def('filter.last', 'Letzter Filter', () => {
    const l = app().lastFilter;
    if (l) D().runFilter(l.def, { params: l.params });
  }, { key: 'Mod+F', alt: ['Mod+Alt+F'], enabled: () => hasLayer() && !!app().lastFilter, dynamicLabel: () => (app().lastFilter ? `Letzter Filter: ${app().lastFilter.def.name.replace('…', '')}` : 'Letzter Filter') });
  for (const f of PW.filters.defs) {
    if (f.menu !== 'filter') continue;
    def(`filter.${f.id}`, f.name, () => D().runFilter(f), { enabled: hasLayer });
  }

  // ─── View ───
  def('view.zoomIn', 'Einzoomen', () => app().view.zoomStep(1), { key: 'Mod+=', alt: ['Mod++', 'Mod+Shift+='] });
  def('view.zoomOut', 'Auszoomen', () => app().view.zoomStep(-1), { key: 'Mod+-' });
  def('view.fit', 'Ganzes Bild', () => app().view.fit(true), { key: 'Mod+0' });
  def('view.actual', '100 %', () => app().view.actual(), { key: 'Mod+1' });
  def('view.extras', 'Extras', () => {
    const v = app().view;
    v.showExtras = !v.showExtras;
    v.requestRender();
  }, { key: 'Mod+H', checked: () => app().view && app().view.showExtras });
  def('view.pixelGrid', 'Pixelraster', () => {
    const v = app().view;
    v.pixelGrid = !v.pixelGrid;
    v.requestRender();
  }, { checked: () => app().view && app().view.pixelGrid });
  def('view.themeDark', 'Oberfläche: Dunkel', () => PW.ui.setTheme('dark'), { enabled: () => true, checked: () => PW.ui.theme() === 'dark' });
  def('view.themeLight', 'Oberfläche: Hell', () => PW.ui.setTheme('light'), { enabled: () => true, checked: () => PW.ui.theme() === 'light' });

  // ─── Window ───
  for (const [id, label] of [['quick', 'Schnellstart'], ['assistant', 'Claude-Assistent'], ['color', 'Farbe'], ['swatches', 'Farbfelder'], ['navigator', 'Navigator'], ['histogram', 'Histogramm'], ['adjustments', 'Korrekturen'], ['layers', 'Ebenen'], ['history', 'Protokoll']]) {
    def(`window.${id}`, label, () => PW.panels.show(id), { enabled: () => true, checked: () => PW.panels && PW.panels.isVisible(id) });
  }
  def('window.toggleDock', 'Bedienfelder ein-/ausblenden', () => PW.ui.toggleDock(), { key: 'Tab', enabled: () => true });
  def('window.reset', 'Arbeitsbereich zurücksetzen', () => PW.panels.reset(), { enabled: () => true });

  // ─── Help ───
  def('help.assistant', 'Claude fragen …', () => PW.assistant.open(), { enabled: () => true });
  def('help.basics', 'Erste Schritte …', () => PW.guide.basics(), { key: 'F1', enabled: () => true });
  def('help.tour', 'Rundgang starten', () => PW.guide.tour(), { enabled: () => true });
  def('help.tips', 'Einsteiger-Tipps anzeigen', () => PW.guide.setTips(!PW.guide.tipsOn()), { enabled: () => true, checked: () => PW.guide && PW.guide.tipsOn() });
  def('help.shortcuts', 'Tastaturbefehle …', () => D().shortcuts(), { key: 'Mod+Alt+Shift+K', enabled: () => true });
  def('help.about', 'Über Pixelwerk', () => D().about(), { enabled: () => true });

  // ─── Menu structure ───
  const adjustItems = [];
  for (const f of PW.filters.defs) {
    if (f.menu !== 'adjust') continue;
    adjustItems.push(f.sep ? '-' : `adjust.${f.id}`);
  }
  const filterGroups = [];
  for (const f of PW.filters.defs) {
    if (f.menu !== 'filter') continue;
    let g = filterGroups.find(x => x.label === f.group);
    if (!g) filterGroups.push((g = { label: f.group, items: [] }));
    g.items.push(`filter.${f.id}`);
  }

  const MENUS = [
    { label: 'Datei', items: ['file.new', 'file.open', 'file.library', 'file.place', '-', 'file.close', 'file.closeAll', '-', 'file.save', 'file.export', 'file.quickPng'] },
    { label: 'Bearbeiten', items: [
      'edit.undo', 'edit.redo', '-', 'edit.cut', 'edit.copy', 'edit.copyMerged', 'edit.paste', 'edit.clear', '-',
      'edit.fill', 'edit.fillFg', 'edit.fillBg', 'edit.stroke', '-', 'edit.transform',
      { label: 'Transformieren', items: ['edit.rot180', 'edit.rot90cw', 'edit.rot90ccw', '-', 'edit.flipH', 'edit.flipV'] },
    ] },
    { label: 'Bild', items: [
      { label: 'Korrekturen', items: adjustItems },
      '-', 'adjust.autoEnhance', 'adjust.autoTone', 'adjust.autoContrast', 'adjust.autoColor', '-', 'image.fabric', '-', 'image.size', 'image.canvas',
      { label: 'Bilddrehung', items: ['image.rot180', 'image.rot90cw', 'image.rot90ccw', '-', 'image.flipH', 'image.flipV'] },
      'image.crop', 'image.trim',
    ] },
    { label: 'Ebene', items: [
      'layer.new', 'layer.viaCopy', 'layer.viaCut', 'layer.duplicate', 'layer.delete', '-', 'layer.rename', 'layer.style', '-',
      { label: 'Ebenenmaske', items: ['layer.maskReveal', 'layer.maskHide', 'layer.maskRevealSel', 'layer.maskHideSel', '-', 'layer.maskToggle', 'layer.maskApply', 'layer.maskDelete'] },
      { label: 'Anordnen', items: ['layer.front', 'layer.forward', 'layer.backward', 'layer.back'] },
      'layer.lock', 'layer.lockAlpha', 'layer.rasterize', '-', 'layer.mergeDown', 'layer.mergeVisible', 'layer.flatten',
    ] },
    { label: 'Auswahl', items: [
      'select.all', 'select.none', 'select.reselect', 'select.inverse', '-', 'select.layer', '-',
      { label: 'Auswahl verändern', items: ['select.border', 'select.expand', 'select.contract', 'select.feather'] },
    ] },
    { label: 'Filter', items: ['filter.last', '-', ...filterGroups] },
    { label: 'Ansicht', items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.actual', '-', 'view.extras', 'view.pixelGrid', '-', 'view.themeDark', 'view.themeLight'] },
    { label: 'Fenster', items: ['window.quick', 'window.assistant', 'window.color', 'window.swatches', 'window.navigator', 'window.histogram', 'window.adjustments', 'window.layers', 'window.history', '-', 'window.toggleDock', 'window.reset'] },
    { label: 'Hilfe', items: ['help.assistant', '-', 'help.basics', 'help.tour', 'help.tips', '-', 'help.shortcuts', 'help.about'] },
  ];

  // ─── Keyboard ───
  const isMac = PW.util.isMac;
  function displayKey(combo) {
    if (!combo) return '';
    const parts = combo.split('+');
    let key = parts.pop();
    if (key === '' && combo.endsWith('++')) key = '+';
    const names = { Delete: 'Entf', Backspace: isMac ? '⌫' : 'Rück', Tab: 'Tab', Enter: '↵', Escape: 'Esc' };
    key = names[key] || key;
    if (isMac) {
      const sym = { Mod: '⌘', Alt: '⌥', Shift: '⇧' };
      return parts.filter(Boolean).map(p => sym[p]).join('') + key;
    }
    const n = { Mod: 'Strg', Alt: 'Alt', Shift: 'Umschalt' };
    return [...parts.filter(Boolean).map(p => n[p]), key].join('+');
  }

  const keymap = new Map();
  for (const a of Object.values(A)) {
    for (const k of [a.key, ...(a.alt || [])]) if (k) keymap.set(k, a);
  }

  function comboFromEvent(e, useCode) {
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Mod');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    let k;
    if (useCode) {
      const c = e.code;
      if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
      else if (/^Digit\d$/.test(c)) k = c.slice(5);
      else k = { BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Slash: '/', Quote: "'", NumpadAdd: '+', NumpadSubtract: '-', Numpad0: '0', Numpad1: '1' }[c] || e.key;
    } else {
      k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }
    return [...mods, k].join('+');
  }

  function findAction(e) {
    return keymap.get(comboFromEvent(e, false)) || keymap.get(comboFromEvent(e, true));
  }

  function run(id) {
    const a = A[id];
    if (!a) return;
    if (a.enabled && !a.enabled()) return;
    PW.ui.closeMenus && PW.ui.closeMenus();
    a.run();
  }

  function isTyping(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(t.type)) || tag === 'SELECT' || t.isContentEditable;
  }

  function initKeys() {
    window.addEventListener('keydown', e => {
      if (document.querySelector('.modal-overlay')) return;
      if (isTyping(e.target)) return;
      const a = app();
      // Space and Tab keep their usual meaning while a control has keyboard focus.
      const ae = document.activeElement;
      const onCanvas = !ae || ae === document.body || ae.classList.contains('view-canvas');
      if ((e.key === ' ' || e.key === 'Tab') && !onCanvas) return;

      if (e.key === ' ' && !e.repeat) {
        a.spaceDown = true;
        a.updateCursor();
        e.preventDefault();
        return;
      }
      if (e.key === ' ') return e.preventDefault();

      const tool = a.activeTool();
      if (tool && tool.onKey && a.doc && tool.onKey(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        PW.ui.closeMenus();
        return;
      }

      const action = findAction(e);
      if (action) {
        if (action.nativePaste) return; // handled by the paste event so system images arrive
        e.preventDefault();
        if (!action.enabled || action.enabled()) action.run();
        PW.ui.closeMenus();
        return;
      }

      if (e.ctrlKey || e.metaKey) return;
      const k = e.code && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key.toUpperCase();

      // Tool shortcuts (Shift cycles through a group)
      const tool2 = PW.tools.list.find(t => t.key === k && !t.hidden);
      if (tool2 && !e.altKey) {
        e.preventDefault();
        a.selectGroup(tool2.group, e.shiftKey);
        return;
      }
      if (k === 'X') { a.swapColors(); return; }
      if (k === 'D') { a.resetColors(); return; }

      // Brush size [ ]  and hardness Shift+[ ]
      const t = a.activeTool();
      if ((e.code === 'BracketLeft' || e.code === 'BracketRight' || e.key === '[' || e.key === ']') && t && t.options.size != null) {
        const up = e.code === 'BracketRight' || e.key === ']';
        if (e.shiftKey && t.options.hardness != null) {
          t.options.hardness = Math.max(0, Math.min(100, t.options.hardness + (up ? 25 : -25)));
        } else {
          const s = t.options.size, step = s < 10 ? 1 : s < 50 ? 5 : s < 100 ? 10 : s < 300 ? 25 : 50;
          t.options.size = Math.max(1, Math.min(2500, s + (up ? step : -step)));
        }
        PW.bus.emit('options:refresh');
        a.updateCursor();
        a.render();
        e.preventDefault();
        return;
      }
      // Digits set opacity for painting tools: 1 = 10 % … 0 = 100 %
      if (/^Digit\d$/.test(e.code) && t && t.options.opacity != null && !e.altKey) {
        const n = Number(e.code.slice(5));
        t.options.opacity = n === 0 ? 100 : n * 10;
        PW.bus.emit('options:refresh');
        a.toast(`Deckkraft ${t.options.opacity} %`);
        return;
      }
      if (e.key === 'Enter' && t && t.id === 'text') return;
    });

    window.addEventListener('keyup', e => {
      if (e.key === ' ') {
        app().spaceDown = false;
        app().updateCursor();
      }
    });
    window.addEventListener('blur', () => {
      app().spaceDown = false;
      app().updateCursor();
    });
  }

  function shortcutList() {
    const rows = [];
    for (const t of PW.tools.list) if (t.key && !t.hidden) rows.push([t.key, t.name]);
    rows.push(['Umschalt + Werkzeugtaste', 'Werkzeuge einer Gruppe durchschalten']);
    rows.push(['X', 'Vorder-/Hintergrundfarbe tauschen'], ['D', 'Standardfarben (Schwarz/Weiß)']);
    rows.push(['[  ]', 'Pinselgröße ändern'], ['Umschalt + [  ]', 'Pinselhärte ändern'], ['1 … 0', 'Deckkraft 10 … 100 %']);
    rows.push(['Leertaste', 'Hand-Werkzeug vorübergehend'], ['Alt (beim Malen)', 'Pipette vorübergehend']);
    for (const a of Object.values(A)) if (a.key) rows.push([displayKey(a.key), a.label.replace(' …', '')]);
    return rows;
  }

  PW.actions = A;
  PW.MENUS = MENUS;
  PW.runAction = run;
  PW.displayKey = displayKey;
  PW.shortcutList = shortcutList;
  PW.initKeys = initKeys;
})(window.PW);
