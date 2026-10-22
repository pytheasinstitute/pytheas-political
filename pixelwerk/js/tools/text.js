// ─── Text tool: editable text layers with an on-canvas text box ───
'use strict';

(function (PW) {
  const { el } = PW.util;
  const app = () => PW.app;

  const TEXT_KEYS = ['font', 'size', 'bold', 'italic', 'align', 'color'];

  const tool = PW.tools.register({
    id: 'text', group: 'text', name: 'Horizontales Text-Werkzeug', key: 'T', icon: 'text', cursor: 'text',
    options: { font: 'Arial', size: 72, bold: false, italic: false, align: 'left', color: '#000000' },
    bar: [
      { type: 'select', key: 'font', label: '', options: () => PW.FONTS.map(f => [f, f]), width: 150, fontPreview: true },
      { type: 'number', key: 'size', label: '', min: 1, max: 2000, unit: 'Px', title: 'Schriftgrad' },
      { type: 'toggle', key: 'bold', icon: 'bold', title: 'Fett' },
      { type: 'toggle', key: 'italic', icon: 'italic', title: 'Kursiv' },
      { type: 'buttons', key: 'align', options: [['left', 'align-left', 'Text links ausrichten'], ['center', 'align-center', 'Text zentrieren'], ['right', 'align-right', 'Text rechts ausrichten']] },
      { type: 'color', key: 'color', title: 'Textfarbe' },
      { type: 'sep' },
      { type: 'action', icon: 'x', title: 'Abbrechen (Esc)', run: () => tool.cancelEdit(), showIf: () => !!tool.editing },
      { type: 'action', icon: 'check', title: 'Bestätigen (Strg+Enter)', run: () => tool.commitEdit(), showIf: () => !!tool.editing, primary: true },
    ],

    activate() {
      PW.fonts.request();
      this.syncFromLayer();
    },
    deactivate() {
      this.commitEdit();
    },

    // When a text layer is active, the options bar shows (and edits) its settings.
    syncFromLayer() {
      const L = app().doc && app().doc.active;
      if (L && L.isText) {
        for (const k of TEXT_KEYS) this.options[k] = L.text[k];
        PW.bus.emit('options:refresh');
      }
    },

    onOption(key, value) {
      const a = app(), L = this.editing ? this.editing.layer : a.doc && a.doc.active;
      if (!L || !L.isText || !TEXT_KEYS.includes(key)) return;
      L.text[key] = value;
      const apply = () => {
        L.renderText();
        this.positionBox();
        a.render();
        if (!this.editing) a.commit('Textoptionen', 'text');
      };
      if (key === 'font') PW.fonts.ensure(value).then(apply);
      else apply();
    },

    down(p) {
      const a = app(), doc = a.doc;
      if (this.editing) {
        const b = this.editing.layer.textBounds();
        const inside = b && p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4;
        if (inside) return;
        this.commitEdit();
        return;
      }
      // Click on an existing text layer edits it.
      for (let i = doc.layers.length - 1; i >= 0; i--) {
        const L = doc.layers[i];
        if (!L.isText || !doc.shown(L)) continue;
        const b = L.textBounds();
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          doc.setActive(L.id);
          this.syncFromLayer();
          this.startEdit(L, false);
          return;
        }
      }
      const o = this.options;
      const L = doc.createLayer('Text');
      L.type = 'text';
      L.text = { content: '', font: o.font, size: o.size, bold: o.bold, italic: o.italic, align: o.align, color: o.color, x: p.x, y: p.y - o.size * 0.86, leading: 1.2 };
      doc.addLayer(L);
      PW.fonts.ensure(o.font).then(() => L.renderText());
      this.startEdit(L, true);
    },

    startEdit(L, isNew) {
      const a = app();
      this.editing = { layer: L, isNew, orig: { ...L.text } };
      const box = el('textarea', {
        class: 'text-edit',
        spellcheck: false,
        autocomplete: 'off',
        'aria-label': 'Text eingeben',
      });
      box.value = L.text.content;
      box.addEventListener('input', () => {
        L.text.content = box.value;
        if (this.editing.isNew && box.value.trim()) L.name = box.value.trim().split('\n')[0].slice(0, 40);
        L.renderText();
        this.positionBox();
        a.render();
        PW.bus.emit('layers:changed', a.doc);
      });
      box.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          this.commitEdit();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.commitEdit();
        }
      });
      a.view.el.append(box);
      this.box = box;
      this.positionBox();
      requestAnimationFrame(() => {
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      });
      this._unsub = PW.bus.on('view:zoom', () => this.positionBox());
      PW.bus.emit('options:refresh');
      a.render();
    },

    positionBox() {
      if (!this.box || !this.editing) return;
      const v = app().view, L = this.editing.layer, t = L.text, z = v.zoom;
      const b = L.textBounds();
      const s = v.ds(b.x, b.y);
      Object.assign(this.box.style, {
        left: `${s.x - 2}px`,
        top: `${s.y - 2}px`,
        width: `${Math.max(40, (b.w + t.size * 0.8) * z) + 4}px`,
        height: `${Math.max(t.size * 1.2 * z, b.h * z) + 4}px`,
        font: `${t.italic ? 'italic ' : ''}${t.bold ? 700 : 400} ${t.size * z}px ${/\s/.test(t.font) ? `"${t.font}"` : t.font}, sans-serif`,
        lineHeight: `${t.size * (t.leading || 1.2) * z}px`,
        textAlign: t.align,
        caretColor: t.color,
      });
      if (t.align === 'center') this.box.style.left = `${s.x - 2 - (t.size * 0.4 * z)}px`;
    },

    endEdit() {
      if (this.box) this.box.remove();
      this.box = null;
      if (this._unsub) this._unsub();
      const ed = this.editing;
      this.editing = null;
      PW.bus.emit('options:refresh');
      return ed;
    },

    commitEdit() {
      if (!this.editing) return;
      const a = app(), ed = this.endEdit(), L = ed.layer;
      if (!L.text.content.trim()) {
        a.doc.removeLayer(L.id);
        if (!ed.isNew) a.commit('Ebene löschen', 'trash');
        else a.render();
        return;
      }
      const changed = ed.isNew || JSON.stringify(ed.orig) !== JSON.stringify(L.text);
      if (changed) a.commit(ed.isNew ? 'Textebene erstellen' : 'Text bearbeiten', 'text');
      a.render();
    },

    cancelEdit() {
      if (!this.editing) return;
      const a = app(), ed = this.endEdit(), L = ed.layer;
      if (ed.isNew) a.doc.removeLayer(L.id);
      else {
        L.text = ed.orig;
        L.renderText();
      }
      a.render();
    },

    cancel() {},

    drawOverlay(g, view) {
      if (!this.editing) return;
      const b = this.editing.layer.textBounds(), s = view.ds(b.x, b.y);
      g.strokeStyle = 'rgba(59,140,240,0.9)';
      g.lineWidth = 1;
      g.setLineDash([3, 3]);
      g.strokeRect(Math.round(s.x) - 2.5, Math.round(s.y) - 2.5, b.w * view.zoom + 5, b.h * view.zoom + 5);
      g.setLineDash([]);
    },
  });

  PW.bus.on('layers:changed', () => {
    if (PW.app && PW.app.toolId === 'text' && !tool.editing) tool.syncFromLayer();
  });

  // Picking a foreground colour while typing recolours the text, as in Photoshop.
  PW.bus.on('color:fg', hex => {
    if (!PW.app || PW.app.toolId !== 'text') return;
    tool.options.color = hex;
    if (tool.editing) tool.onOption('color', hex);
    PW.bus.emit('options:refresh');
  });
})(window.PW);
