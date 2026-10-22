// ─── Commands behind menus and shortcuts (each records one history step) ───
'use strict';

(function (PW) {
  const { createCanvas, cloneCanvas, alphaBounds, clamp } = PW.util;
  const app = () => PW.app;

  function needDoc() {
    const a = app();
    if (!a.doc) return null;
    a.finishToolWork();
    return a.doc;
  }

  function needLayer() {
    const doc = needDoc();
    if (!doc || !doc.active) return null;
    return doc.active;
  }

  // The active layer plus those picked in the panel (Strg/Umschalt-Klick), bottom to top.
  function pickedLayers(doc) {
    const ids = new Set([doc.activeId, ...(doc.picked || [])]);
    return doc.layers.filter(l => ids.has(l.id));
  }

  // Applies fn(ctx, srcCanvas, bounds) around the content of the active layer or selection.
  function transformLayer(name, fn) {
    const a = app(), doc = needDoc();
    if (!doc) return;
    const L = a.paintLayer();
    if (!L) return;
    const target = L.target, W = target.width, H = target.height, sel = doc.selection;
    const src = createCanvas(W, H), sg = src.getContext('2d');
    sg.drawImage(target, 0, 0);
    if (!sel.empty) {
      sg.globalCompositeOperation = 'destination-in';
      sg.drawImage(sel.mask, 0, 0);
    }
    const b = sel.empty ? alphaBounds(src) : sel.bounds;
    if (!b) return a.toast('Die Ebene ist leer.');
    const g = target.getContext('2d');
    g.save();
    if (sel.empty) {
      if (L.targetIsMask) {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, W, H);
      } else g.clearRect(0, 0, W, H);
    } else {
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(sel.mask, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }
    g.translate(b.x + b.w / 2, b.y + b.h / 2);
    fn(g);
    g.drawImage(src, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
    g.restore();
    if (!sel.empty) {
      const m = cloneCanvas(sel.mask);
      sel.remap(doc.width, doc.height, sm => {
        sm.save();
        sm.translate(b.x + b.w / 2, b.y + b.h / 2);
        fn(sm);
        sm.drawImage(m, b.x, b.y, b.w, b.h, -b.w / 2, -b.h / 2, b.w, b.h);
        sm.restore();
      });
    }
    L.markTarget();
    a.commit(name, 'transform');
  }

  const commands = {
    // ─── Edit ───
    fillWith(color, opacity = 1, blend = 'source-over', preserve = false) {
      const a = app(), doc = needDoc();
      if (!doc) return;
      const L = a.paintLayer();
      if (!L) return;
      const target = L.target, W = target.width, H = target.height, sel = doc.selection;
      const buf = createCanvas(W, H), bg = buf.getContext('2d');
      bg.fillStyle = PW.paint.targetColor(L, color);
      bg.fillRect(0, 0, W, H);
      if (!sel.empty) {
        bg.globalCompositeOperation = 'destination-in';
        bg.drawImage(sel.mask, 0, 0);
      }
      const g = target.getContext('2d');
      const keepAlpha = !L.targetIsMask && (preserve || L.lockAlpha);
      if (keepAlpha) {
        const tmp = cloneCanvas(target), tg = tmp.getContext('2d');
        tg.globalAlpha = opacity;
        tg.globalCompositeOperation = blend;
        tg.drawImage(buf, 0, 0);
        tg.globalAlpha = 1;
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(target, 0, 0);
        g.save();
        g.globalCompositeOperation = 'copy';
        g.drawImage(tmp, 0, 0);
        g.restore();
      } else {
        g.save();
        g.globalAlpha = opacity;
        g.globalCompositeOperation = blend;
        g.drawImage(buf, 0, 0);
        g.restore();
      }
      L.markTarget();
      a.commit('Fläche füllen', 'bucket');
    },

    strokeSelection({ width, color, position, opacity }) {
      const a = app(), doc = needDoc();
      if (!doc) return;
      const L = a.paintLayer();
      if (!L) return;
      const W = doc.width, H = doc.height, sel = doc.selection;
      let alpha;
      if (!sel.empty) alpha = sel.alpha();
      else {
        const d = L.canvas.getContext('2d').getImageData(0, 0, W, H).data;
        alpha = new Uint8Array(W * H);
        for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
      }
      const inside = new Uint8Array(W * H), outside = new Uint8Array(W * H);
      for (let i = 0; i < alpha.length; i++) {
        inside[i] = alpha[i] >= 128 ? 1 : 0;
        outside[i] = 1 - inside[i];
      }
      if (!inside.some(v => v)) return a.toast('Es gibt keine Auswahl und keine Pixel, die umrandet werden könnten.');
      const dToOut = PW.distanceField(outside, W, H), dToIn = PW.distanceField(inside, W, H);
      const wIn = position === 'inside' ? width : position === 'center' ? width / 2 : 0;
      const wOut = position === 'outside' ? width : position === 'center' ? width / 2 : 0;
      const c = PW.util.hexToRgb(PW.paint.targetColor(L, color));
      const buf = createCanvas(W, H), bg = buf.getContext('2d'), img = bg.createImageData(W, H), d = img.data;
      for (let i = 0; i < alpha.length; i++) {
        const dist = inside[i] ? Math.sqrt(dToOut[i]) - 0.5 : Math.sqrt(dToIn[i]) - 0.5;
        const lim = inside[i] ? wIn : wOut;
        const v = clamp(lim - dist + 0.5, 0, 1);
        if (v <= 0) continue;
        const j = i * 4;
        d[j] = c.r;
        d[j + 1] = c.g;
        d[j + 2] = c.b;
        d[j + 3] = v * 255;
      }
      bg.putImageData(img, 0, 0);
      const g = L.target.getContext('2d');
      g.save();
      g.globalAlpha = opacity / 100;
      g.drawImage(buf, 0, 0);
      g.restore();
      L.markTarget();
      a.commit('Kontur', 'brush');
    },

    clear() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      const sel = doc.selection;
      if (sel.empty) return commands.deleteLayer();
      const L = a.paintLayer();
      if (!L) return;
      const g = L.target.getContext('2d');
      g.save();
      if (L.targetIsMask) {
        const buf = createCanvas(doc.width, doc.height), bg = buf.getContext('2d');
        bg.fillStyle = PW.paint.targetColor(L, a.bg);
        bg.fillRect(0, 0, doc.width, doc.height);
        bg.globalCompositeOperation = 'destination-in';
        bg.drawImage(sel.mask, 0, 0);
        g.drawImage(buf, 0, 0);
      } else {
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(sel.mask, 0, 0);
      }
      g.restore();
      L.markTarget();
      a.commit('Löschen', 'trash');
    },

    copy(merged = false, silent = false) {
      const a = app(), doc = needDoc();
      if (!doc || (!merged && !doc.active)) return false;
      const sel = doc.selection;
      const src = merged ? doc.flattened() : doc.active.canvas;
      const b = sel.empty ? { x: 0, y: 0, w: doc.width, h: doc.height } : sel.bounds;
      const out = createCanvas(b.w, b.h), g = out.getContext('2d');
      g.drawImage(src, -b.x, -b.y);
      if (!sel.empty) {
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(sel.mask, -b.x, -b.y);
      }
      a.clipboard = { canvas: out, x: b.x, y: b.y, docId: doc.id, w: doc.width, h: doc.height };
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          out.toBlob(blob => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
          }, 'image/png');
        }
      } catch { /* system clipboard is optional */ }
      if (!silent) a.toast(merged ? 'Auf eine Ebene reduziert kopiert' : 'Kopiert');
      return true;
    },

    cut() {
      const doc = needDoc();
      if (!doc || doc.selection.empty) return app().toast('Zum Ausschneiden zuerst einen Bereich auswählen.');
      if (commands.copy(false, true)) commands.clear();
    },

    // Pastes as a new layer: at the copied position in the same document, else centred.
    pasteCanvas(canvas, name = 'Eingefügt', pos) {
      const a = app();
      if (!a.doc) {
        a.newDocument(canvas.width, canvas.height, name, null);
        const L = a.doc.active;
        L.name = 'Ebene 1';
        L.ctx.drawImage(canvas, 0, 0);
        L.touch();
        a.doc.history.states[0].snap = a.doc.capture(null);
        a.render();
        PW.bus.emit('layers:changed', a.doc);
        return;
      }
      a.finishToolWork();
      const doc = a.doc;
      let x, y;
      if (pos) ({ x, y } = pos);
      else {
        const v = a.view, c = { x: (v.cw / 2 - v.x) / v.zoom, y: (v.ch / 2 - v.y) / v.zoom };
        const inside = c.x > 0 && c.y > 0 && c.x < doc.width && c.y < doc.height;
        const cx = inside ? c.x : doc.width / 2, cy = inside ? c.y : doc.height / 2;
        x = Math.round(cx - canvas.width / 2);
        y = Math.round(cy - canvas.height / 2);
      }
      const L = doc.createLayer(name === 'Eingefügt' ? undefined : name);
      L.ctx.drawImage(canvas, x, y);
      L.touch();
      doc.addLayer(L);
      doc.selection.clear();
      a.commit(name === 'Eingefügt' ? 'Einfügen' : 'Platzieren', 'image');
    },

    pasteInternal() {
      const a = app(), c = a.clipboard;
      if (!c) return false;
      const same = a.doc && a.doc.id === c.docId && a.doc.width === c.w && a.doc.height === c.h;
      commands.pasteCanvas(c.canvas, 'Eingefügt', same ? { x: c.x, y: c.y } : null);
      return true;
    },

    // ─── Layers ───
    newLayer() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.addLayer(doc.createLayer());
      a.commit('Neue Ebene', 'new-layer');
    },

    layerVia(cut) {
      const a = app(), doc = needDoc();
      if (!doc || !doc.active) return;
      const src = doc.active, sel = doc.selection;
      if (sel.empty && cut) return a.toast('Zum Ausschneiden zuerst einen Bereich auswählen.');
      if (sel.empty) {
        doc.duplicateLayer(src.id);
        return a.commit('Ebene durch Kopie', 'duplicate');
      }
      const L = doc.createLayer();
      L.ctx.drawImage(src.canvas, 0, 0);
      L.ctx.globalCompositeOperation = 'destination-in';
      L.ctx.drawImage(sel.mask, 0, 0);
      L.ctx.globalCompositeOperation = 'source-over';
      L.touch();
      if (cut) {
        if (src.isText) src.rasterize();
        src.ctx.save();
        src.ctx.globalCompositeOperation = 'destination-out';
        src.ctx.drawImage(sel.mask, 0, 0);
        src.ctx.restore();
        src.touch();
      }
      doc.addLayer(L, doc.layers.indexOf(src) + 1);
      a.commit(cut ? 'Ebene durch Ausschneiden' : 'Ebene durch Kopie', 'duplicate');
    },

    duplicateLayer() {
      const a = app(), L = needLayer();
      if (!L) return;
      a.doc.duplicateLayer(L.id);
      a.commit('Ebene duplizieren', 'duplicate');
    },

    async deleteLayer() {
      const a = app(), doc = needDoc(), L = doc && doc.active;
      if (!L) return;
      const list = pickedLayers(doc), gone = new Set(list.flatMap(x => doc.blockOf(x)).map(x => x.id));
      if (gone.size >= doc.layers.length) return a.toast('Die letzte Ebene kann nicht gelöscht werden.');
      for (const x of list) if (doc.layerById(x.id)) doc.removeLayer(x.id);
      doc.picked = null;
      a.commit(list.length > 1 ? 'Ebenen löschen' : L.isGroup ? 'Gruppe löschen' : 'Ebene löschen', 'trash');
    },

    // ─── Groups ───
    // Groups the active layer, or all layers picked with Strg/Umschalt-Klick in the panel.
    groupLayers() {
      const a = app(), doc = needDoc();
      if (!doc || !doc.active) return;
      doc.groupLayers(pickedLayers(doc));
      doc.picked = null;
      a.commit('Ebenen gruppieren', 'folder');
    },

    newGroup() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      const L = doc.active, G = PW.Layer.group(doc.width, doc.height, doc.nextLayerName('Gruppe'));
      if (L) doc.addLayer(G, doc.layers.indexOf(L) + 1, L.parent);
      else doc.addLayer(G, doc.layers.length, null);
      a.commit('Neue Gruppe', 'folder');
    },

    ungroup() {
      const a = app(), doc = needDoc(), G = doc && doc.active;
      if (!G || !G.isGroup) return a.toast('Wähle zuerst eine Gruppe aus.');
      doc.ungroup(G);
      a.commit('Gruppierung aufheben', 'folder');
    },

    mergeGroup() {
      const a = app(), doc = needDoc(), G = doc && doc.active;
      if (!G || !G.isGroup) return a.toast('Wähle zuerst eine Gruppe aus.');
      doc.mergeGroup(G);
      a.commit('Gruppe zusammenfügen', 'layers');
    },

    toggleCollapsed(G) {
      const a = app();
      if (!G || !G.isGroup) return;
      G.collapsed = !G.collapsed;
      // Opening or closing a group is not a change of the picture: no history step.
      const st = a.doc.history.current;
      if (st) {
        const r = st.snap.layers.find(x => x.id === G.id);
        if (r) r.collapsed = G.collapsed;
      }
      PW.bus.emit('layers:changed', a.doc);
    },

    async renameLayer(L) {
      const a = app();
      L = L || needLayer();
      if (!L) return;
      const name = await PW.dialogs.textInput('Ebeneneigenschaften', 'Name', L.name);
      if (name == null || !name.trim() || name === L.name) return;
      L.name = name.trim();
      a.commit('Ebene umbenennen', 'layers');
    },

    mergeDown() {
      const a = app(), doc = needDoc();
      if (!doc || !doc.active) return;
      const G = doc.active.isGroup;
      if (!doc.mergeDown(doc.activeId)) return a.toast('Unter dieser Ebene liegt keine Ebene, mit der sie verbunden werden kann.');
      a.commit(G ? 'Gruppe zusammenfügen' : 'Auf eine Ebene reduzieren', 'layers');
    },

    mergeVisible() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      if (!doc.mergeVisible()) return a.toast('Es sind weniger als zwei Ebenen sichtbar.');
      a.commit('Sichtbare auf eine Ebene reduzieren', 'layers');
    },

    flatten() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.flatten();
      a.commit('Auf Hintergrundebene reduzieren', 'layers');
    },

    // Within its own group, like Photoshop: a group counts as one step.
    arrange(where) {
      const a = app(), doc = needDoc();
      if (!doc || !doc.active) return;
      const L = doc.active, sibs = doc.layers.filter(x => x.parent === L.parent), k = sibs.indexOf(L);
      const j = { front: sibs.length - 1, forward: Math.min(sibs.length - 1, k + 1), backward: Math.max(0, k - 1), back: 0 }[where];
      if (j === k) return;
      const ref = sibs[j], rest = doc.layers.filter(x => !doc.blockOf(L).includes(x));
      // Above ref: right after its own entry; below ref: right before its whole block.
      const at = j > k ? rest.indexOf(ref) + 1 : rest.indexOf(doc.blockOf(ref)[0]);
      doc.moveBlock(L, at, L.parent);
      a.commit('Anordnen', 'layers');
    },

    rasterize() {
      const a = app(), L = needLayer();
      if (!L) return;
      if (!L.isText) return a.toast('Die Ebene enthält bereits Pixel.');
      L.rasterize();
      a.commit('Ebene rastern', 'layers');
    },

    toggleLock(L) {
      const a = app();
      L = L || needLayer();
      if (!L) return;
      L.locked = !L.locked;
      a.commit(L.locked ? 'Ebene sperren' : 'Ebene entsperren', 'lock');
    },

    toggleLockAlpha(L) {
      const a = app();
      L = L || needLayer();
      if (!L) return;
      L.lockAlpha = !L.lockAlpha;
      a.commit(L.lockAlpha ? 'Transparenz fixieren' : 'Transparenz freigeben', 'lock-alpha');
    },

    toggleVisible(L) {
      const a = app();
      if (!L) return;
      L.visible = !L.visible;
      a.commit(L.visible ? 'Ebene einblenden' : 'Ebene ausblenden', 'eye');
    },

    // Alt-click on an eye: show only this layer (or everything again).
    soloLayer(L) {
      const a = app(), doc = a.doc;
      const others = doc.layers.filter(x => x !== L);
      const solo = L.visible && others.every(x => !x.visible);
      others.forEach(x => (x.visible = solo));
      L.visible = true;
      a.commit(solo ? 'Alle Ebenen einblenden' : 'Andere Ebenen ausblenden', 'eye');
    },

    // ─── Masks ───
    addMask(mode = 'reveal') {
      const a = app(), L = needLayer();
      if (!L) return;
      if (L.mask) {
        L.editMask = true;
        PW.bus.emit('layers:changed', a.doc);
        return a.toast('Die Ebene hat bereits eine Maske.');
      }
      const sel = a.doc.selection;
      if (mode === 'revealSel' && sel.empty) mode = 'reveal';
      if (mode === 'hideSel' && sel.empty) mode = 'hide';
      if (mode === 'reveal') L.addMask(null, true);
      else if (mode === 'hide') L.addMask(null, false);
      else L.addMask(sel, mode === 'revealSel');
      if (mode === 'revealSel' || mode === 'hideSel') sel.clear();
      a.commit('Ebenenmaske hinzufügen', 'mask');
    },

    deleteMask() {
      const a = app(), L = needLayer();
      if (!L || !L.mask) return;
      L.removeMask();
      a.commit('Ebenenmaske löschen', 'mask');
    },

    applyMask() {
      const a = app(), L = needLayer();
      if (!L || !L.mask) return;
      if (L.isText) L.rasterize();
      L.ctx.save();
      L.ctx.globalCompositeOperation = 'destination-in';
      L.ctx.drawImage(L.maskAlpha(), 0, 0);
      L.ctx.restore();
      L.touch();
      L.removeMask();
      a.commit('Ebenenmaske anwenden', 'mask');
    },

    toggleMask() {
      const a = app(), L = needLayer();
      if (!L || !L.mask) return;
      L.maskEnabled = !L.maskEnabled;
      a.commit(L.maskEnabled ? 'Ebenenmaske aktivieren' : 'Ebenenmaske deaktivieren', 'mask');
    },

    // ─── Selection ───
    selectAll() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.selection.all();
      a.commit('Alles auswählen', 'selection');
    },

    deselect() {
      const doc = needDoc();
      if (!doc || doc.selection.empty) return;
      PW.selectionTools.deselect();
    },

    reselect() {
      const a = app(), doc = needDoc();
      if (!doc || !doc.savedSelection) return;
      doc.selection.restore(doc.savedSelection, doc.width, doc.height);
      a.commit('Erneut auswählen', 'selection');
    },

    inverse() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.selection.invert();
      a.commit('Auswahl umkehren', 'selection');
    },

    loadLayerAlpha(L, mode = 'replace') {
      const a = app(), doc = needDoc();
      L = L || (doc && doc.active);
      if (!L) return;
      let src = L.canvas;
      if (L.isGroup) {
        // A group: everything in it, as it shows.
        src = createCanvas(doc.width, doc.height);
        const shown = L.visible;
        L.visible = true;
        doc.drawLayers(src.getContext('2d'), doc.blockOf(L));
        L.visible = shown;
      }
      doc.selection.fromCanvasAlpha(src, mode);
      a.commit('Auswahl laden', 'selection');
    },

    async modifySelection(kind) {
      const a = app(), doc = needDoc();
      if (!doc) return;
      if (doc.selection.empty) return a.toast('Es ist keine Auswahl vorhanden.');
      const labels = { expand: ['Auswahl erweitern', 'Erweitern um'], contract: ['Auswahl verkleinern', 'Verkleinern um'], feather: ['Weiche Auswahlkante', 'Radius'], border: ['Auswahlrand', 'Breite'] };
      const [title, label] = labels[kind];
      const v = await PW.dialogs.form(title, [{ type: 'number', key: 'n', label, min: 1, max: 500, unit: 'Pixel' }], { n: kind === 'border' ? 10 : 5 });
      if (!v) return;
      await PW.ui.busy(() => doc.selection[kind](kind === 'feather' ? v.n / 2 : v.n));
      a.commit(title, 'selection');
    },

    // ─── Image ───
    rotateImage(deg) {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.rotate(deg);
      a.commit(deg === 180 ? 'Bild drehen 180°' : deg > 0 ? 'Bild drehen 90° im UZS' : 'Bild drehen 90° gegen UZS', 'image');
      a.view.fit(false);
    },

    flipImage(horizontal) {
      const a = app(), doc = needDoc();
      if (!doc) return;
      doc.flip(horizontal);
      a.commit(horizontal ? 'Arbeitsfläche horizontal spiegeln' : 'Arbeitsfläche vertikal spiegeln', 'image');
    },

    cropToSelection() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      if (doc.selection.empty) return a.toast('Zum Freistellen zuerst einen Bereich auswählen.');
      doc.crop(doc.selection.bounds);
      doc.selection.clear();
      a.commit('Freistellen', 'crop');
      a.view.fit(false);
    },

    trim() {
      const a = app(), doc = needDoc();
      if (!doc) return;
      const b = doc.trimBounds();
      if (!b) return a.toast('Das Bild ist vollständig transparent.');
      if (b.x === 0 && b.y === 0 && b.w === doc.width && b.h === doc.height) return a.toast('Es gibt keine transparenten Ränder zum Zuschneiden.');
      doc.crop(b);
      a.commit('Zuschneiden', 'crop');
      a.view.fit(false);
    },

    flipLayer(horizontal) {
      transformLayer(horizontal ? 'Horizontal spiegeln' : 'Vertikal spiegeln', g => g.scale(horizontal ? -1 : 1, horizontal ? 1 : -1));
    },

    rotateLayer(deg) {
      transformLayer(`Drehen ${deg}°`, g => g.rotate((deg * Math.PI) / 180));
    },
  };

  PW.commands = commands;
})(window.PW);
