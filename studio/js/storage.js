'use strict';
/* Pytheas Studio — automatische Sicherung im Browser (IndexedDB) und Wiederherstellung */

const Autosave = {
  ready: false,
  timer: 0,
  saving: false,
  blobs: new WeakMap(), // Ebenen-Canvas → PNG; Canvas im Protokoll ändern sich nie mehr

  open() {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open('pytheas-studio', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('autosave');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },

  async request(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('autosave', mode);
      const req = fn(tx.objectStore('autosave'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  get() {
    return this.request('readonly', (s) => s.get('current'));
  },

  put(value) {
    return this.request('readwrite', (s) => s.put(value, 'current'));
  },

  clear() {
    return this.request('readwrite', (s) => s.delete('current')).catch(() => {});
  },

  schedule() {
    if (!this.ready || !window.indexedDB) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 2000);
  },

  async save() {
    if (this.saving) return this.schedule();
    if (!app.dirty) return this.clear();
    this.saving = true;
    try {
      const d = app.doc;
      const meta = { time: Date.now(), name: d.name, width: d.width, height: d.height, active: d.active };
      const layers = [];
      for (const l of d.layers.slice()) {
        let blob = this.blobs.get(l.canvas);
        if (!blob) {
          blob = await canvasToBlob(l.canvas);
          this.blobs.set(l.canvas, blob);
        }
        layers.push({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, text: l.text ? { ...l.text } : null, blob });
      }
      await this.put({ ...meta, layers });
    } catch {
      /* Speicher voll oder privat – kein Absturz, nur keine Sicherung */
    } finally {
      this.saving = false;
    }
  },

  async check() {
    try {
      if (!window.indexedDB) return;
      const data = await this.get();
      if (!data || !Array.isArray(data.layers) || !data.layers.length) return;
      const when = new Date(data.time).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
      const discard = el('button', { class: 'btn' }, 'Verwerfen');
      discard.addEventListener('click', () => {
        this.clear();
        closeDialog();
      });
      const content = el(
        'div',
        { class: 'about' },
        el('p', {}, `Es gibt nicht gespeicherte Arbeit vom ${when}:`),
        el('p', {}, el('strong', {}, data.name || 'Unbenannt'), ` – ${data.width} × ${data.height} px, ${data.layers.length} ${data.layers.length === 1 ? 'Ebene' : 'Ebenen'}`),
        el('div', { class: 'dlg-inline-actions' }, discard)
      );
      openDialog({
        title: 'Letzte Sitzung wiederherstellen?',
        content,
        okLabel: 'Wiederherstellen',
        cancelLabel: 'Später',
        onOk: () => this.restore(data),
      });
    } catch {
      /* IndexedDB nicht verfügbar */
    } finally {
      this.ready = true;
    }
  },

  async restore(data) {
    const w = clamp(Math.round(+data.width) || 1, 1, MAX_SIZE);
    const h = clamp(Math.round(+data.height) || 1, 1, MAX_SIZE);
    const layers = await layersFromData(data.layers, w, h, (m) => (m.blob instanceof Blob ? m.blob : null));
    app.layerCounter = layers.length + 1;
    setDocument({ width: w, height: h, layers, active: clamp(data.active | 0, 0, layers.length - 1), selection: null, name: String(data.name || 'Wiederhergestellt').slice(0, 80) }, 'Wiederhergestellt');
    app.dirty = true;
    afterChange();
    toast('Letzte Sitzung wiederhergestellt.');
  },
};
