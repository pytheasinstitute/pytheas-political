// ─── App state: open documents, active tool, colours, pointer routing, history commits ───
'use strict';

(function (PW) {
  const { clamp, rgbToHex } = PW.util;

  const app = {
    docs: [],
    doc: null,
    view: null,
    fg: '#000000',
    bg: '#ffffff',
    toolId: 'move',
    tempTool: null,
    prevTool: null,
    groupChoice: {},
    spaceDown: false,
    dragging: false,
    clipboard: null,
    lastFilter: null,
    _cursorOverride: null,

    // ─── Documents ───
    addDoc(doc, historyName = 'Öffnen') {
      if (!doc.history.states.length) doc.history.push(historyName, 'file');
      this.docs.push(doc);
      this.setDoc(doc);
      return doc;
    },

    newDocument(w, h, name, fill) {
      const doc = new PW.Doc(w, h, name);
      const L = new PW.Layer(doc.width, doc.height, fill ? 'Hintergrund' : 'Ebene 1');
      if (fill) {
        L.ctx.fillStyle = fill;
        L.ctx.fillRect(0, 0, doc.width, doc.height);
        L.touch();
      } else {
        doc.layerCounter = 1;
      }
      doc.layers.push(L);
      doc.activeId = L.id;
      return this.addDoc(doc, 'Neu');
    },

    setDoc(doc, force = false) {
      if (this.doc === doc && !force) return;
      this.finishToolWork();
      this.doc = doc;
      this.view.setDoc(doc);
      PW.bus.emit('doc:switched', doc);
      PW.bus.emit('layers:changed', doc);
      PW.bus.emit('history:changed', doc);
      PW.bus.emit('selection:changed', doc && doc.selection);
      this.updateCursor();
      this.render();
    },

    async closeDoc(doc = this.doc, force = false) {
      if (!doc) return;
      if (doc.dirty && !force) {
        const choice = await PW.dialogs.confirm(`Änderungen an „${doc.name}“ vor dem Schließen speichern?`, {
          title: 'Pixelwerk', ok: 'Speichern', alt: 'Nicht speichern', cancel: 'Abbrechen',
        });
        if (choice === 'cancel') return;
        if (choice === 'ok') await PW.io.saveProject(doc);
      }
      const i = this.docs.indexOf(doc);
      if (i < 0) return;
      if (doc === this.doc) this.finishToolWork();
      this.docs.splice(i, 1);
      if (doc === this.doc) this.setDoc(this.docs[Math.min(i, this.docs.length - 1)] || null, true);
      PW.bus.emit('docs:changed');
    },

    // ─── Tools ───
    activeTool() {
      return PW.tools.byId[this.tempTool || this.toolId];
    },

    setTool(id) {
      const next = PW.tools.byId[id];
      if (!next || id === this.toolId) return;
      if (this.dragging) this.pointer('cancel');
      this._switching = true;
      const old = PW.tools.byId[this.toolId];
      if (old && old.deactivate) old.deactivate();
      this._switching = false;
      this.toolId = id;
      if (!next.hidden) this.groupChoice[next.group] = id;
      if (next.activate) next.activate();
      this._cursorOverride = null;
      PW.bus.emit('tool:changed', next);
      this.updateCursor();
      this.render();
    },

    // Selects a toolbar group; Shift+shortcut cycles through its tools.
    selectGroup(group, cycle) {
      const tools = PW.tools.inGroup(group);
      if (!tools.length) return;
      const cur = PW.tools.byId[this.toolId];
      if (cycle && cur && cur.group === group) {
        const i = tools.indexOf(cur);
        return this.setTool(tools[(i + 1) % tools.length].id);
      }
      this.setTool(this.groupChoice[group] || tools[0].id);
    },

    startTransform() {
      if (!this.doc || this.toolId === 'transform') return;
      const prev = this.toolId;
      this.setTool('transform');
      if (PW.transformTool.begin()) {
        this.prevTool = prev;
      } else {
        this.toolId = prev;
        PW.bus.emit('tool:changed', PW.tools.byId[prev]);
        this.updateCursor();
      }
    },

    restoreTool() {
      if (this._switching) return;
      this.setTool(this.prevTool || 'move');
    },

    // Finish anything a tool holds open (text box, transform, crop drag) before other commands.
    finishToolWork() {
      const t = PW.tools.byId[this.toolId];
      if (!t) return;
      if (this.dragging) this.pointer('cancel');
      if (t.id === 'text' && t.editing) t.commitEdit();
      if (t.id === 'transform' && t.L) t.commitTransform();
      if (t.id === 'polyLasso' && t.points) t.cancel();
    },

    pointer(type, p, e) {
      if (!this.doc) return;
      let t = this.activeTool();
      if (type === 'down') {
        if (p.alt && t.altEyedropper) {
          this.tempTool = 'eyedropper';
          this._altTemp = true;
          t = this.activeTool();
          p.alt = false;
          this.updateCursor();
        }
        this.dragging = true;
        if (t.down) t.down(p, e);
      } else if (type === 'move') {
        if (this.dragging) {
          if (t.move) t.move(p, e);
        } else if (t.hover) {
          t.hover(p, e);
        }
      } else if (type === 'up') {
        if (this.dragging) {
          this.dragging = false;
          if (t.up) t.up(p, e);
        }
        this._endAltTemp();
      } else if (type === 'cancel') {
        if (this.dragging) {
          this.dragging = false;
          if (t.cancel) t.cancel();
        }
        this._endAltTemp();
      }
    },

    _endAltTemp() {
      if (!this._altTemp) return;
      this._altTemp = false;
      this.tempTool = null;
      this.updateCursor();
    },

    updateCursor() {
      if (!this.view) return;
      const t = this.activeTool();
      let c = 'default';
      if (this.spaceDown) c = 'grab';
      else if (this._cursorOverride) c = this._cursorOverride;
      else if (t) {
        if (t.brushCursor) c = t.cursorSize() * this.view.zoom >= 5 ? 'none' : 'crosshair';
        else c = typeof t.cursor === 'function' ? t.cursor() : t.cursor || 'default';
      }
      this.view.canvas.style.cursor = c;
    },

    setCursor(c) {
      this._cursorOverride = c;
      this.updateCursor();
    },

    // Layer that paint tools may write to (rasterises text layers like Photoshop asks to).
    paintLayer() {
      const L = this.doc && this.doc.active;
      if (!L) {
        this.toast('Keine Ebene ausgewählt.');
        return null;
      }
      if (!L.visible) {
        this.toast('Die Zielebene ist ausgeblendet.');
        return null;
      }
      if (L.locked) {
        this.toast('Die Ebene ist gesperrt.');
        return null;
      }
      if (L.isText && !L.targetIsMask) {
        // Like Photoshop: ask first, because the text stops being editable.
        if (this.dragging) this.pointer('cancel');
        PW.dialogs.confirm('Diese Textebene muss gerastert werden, bevor Sie fortfahren können. Der Text lässt sich danach nicht mehr bearbeiten. Textebene rastern?', {
          title: 'Textebene rastern', ok: 'Rastern',
        }).then(r => {
          if (r !== 'ok' || !L.isText) return;
          L.rasterize();
          this.commit('Ebene rastern', 'layers');
        });
        return null;
      }
      return L;
    },

    // ─── History ───
    commit(name, icon) {
      if (!this.doc) return;
      this.doc.history.push(name, icon);
      this.doc.dirty = true;
      PW.bus.emit('doc:changed', this.doc);
      PW.bus.emit('layers:changed', this.doc);
      this.render();
    },

    undo() {
      if (!this.doc) return;
      this.finishToolWork();
      this.doc.history.undo();
      this.render();
    },

    redo() {
      if (!this.doc) return;
      this.finishToolWork();
      this.doc.history.redo();
      this.render();
    },

    render() {
      if (this.view) this.view.requestRender();
    },

    // ─── Colours ───
    setFG(hex) {
      this.fg = hex;
      PW.bus.emit('color:changed');
      PW.bus.emit('color:fg', hex);
    },

    setBG(hex) {
      this.bg = hex;
      PW.bus.emit('color:changed');
    },

    swapColors() {
      [this.fg, this.bg] = [this.bg, this.fg];
      PW.bus.emit('color:changed');
      PW.bus.emit('color:fg', this.fg);
    },

    resetColors() {
      this.fg = '#000000';
      this.bg = '#ffffff';
      PW.bus.emit('color:changed');
      PW.bus.emit('color:fg', this.fg);
    },

    sampleColor(x, y, size = 1, all = true) {
      const doc = this.doc;
      if (!doc) return null;
      const X = Math.floor(x), Y = Math.floor(y);
      if (X < 0 || Y < 0 || X >= doc.width || Y >= doc.height) return null;
      const src = all || !doc.active ? doc.composite() : doc.active.canvas;
      const r = Math.floor(size / 2);
      const x0 = clamp(X - r, 0, doc.width - 1), y0 = clamp(Y - r, 0, doc.height - 1);
      const x1 = clamp(X + r, 0, doc.width - 1), y1 = clamp(Y + r, 0, doc.height - 1);
      const d = src.getContext('2d').getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
      let R = 0, G = 0, B = 0, A = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        R += d[i] * a;
        G += d[i + 1] * a;
        B += d[i + 2] * a;
        A += a;
      }
      if (!A) return null;
      return rgbToHex(R / A, G / A, B / A);
    },

    toast(msg) {
      if (PW.ui && PW.ui.toast) PW.ui.toast(msg);
    },
  };

  PW.app = app;
})(window.PW);
