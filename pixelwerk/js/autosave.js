// ─── Autosave: open pictures and the Claude chat survive a reload ───
// Kept in this browser's IndexedDB only (nothing leaves the device). Unchanged layers reuse
// their stored PNG, so saving after an edit only encodes what changed. Without storage
// (private window, blocked site data) everything simply works as before.
'use strict';

(function (PW) {
  const app = () => PW.app;
  const DB = 'pixelwerk', STORE = 'session', KEY = 'current', DELAY = 500, MAX_DOCS = 6;
  let dbPromise = null, timer = 0, running = null, pending = false;
  // Nothing is written before the last session has been read back, so it cannot be overwritten.
  let ready = false;
  const encoded = new WeakMap(); // layer → { version, blob, maskVersion, maskBlob }

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise(resolve => {
        try {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  async function store(mode, fn) {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : true);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  const toBlob = canvas => new Promise(res => canvas.toBlob(b => res(b), 'image/png'));

  async function layerData(L) {
    let e = encoded.get(L);
    if (!e) encoded.set(L, (e = {}));
    if (e.version !== L.version || !e.blob) {
      e.blob = await toBlob(L.canvas);
      e.version = L.version;
    }
    if (L.mask && (e.maskVersion !== L.maskVersion || !e.maskBlob)) {
      e.maskBlob = await toBlob(L.mask);
      e.maskVersion = L.maskVersion;
    }
    return { ...(await L.serialize(false)), pixels: e.blob, mask: L.mask ? e.maskBlob : null };
  }

  async function docData(doc) {
    return {
      name: doc.name,
      width: doc.width,
      height: doc.height,
      activeIndex: doc.activeIndex,
      layers: await Promise.all(doc.layers.map(layerData)),
    };
  }

  // The untouched sample is not worth keeping; everything the person opened or changed is.
  const worthKeeping = doc => !doc.isSample || doc.dirty;

  async function save() {
    if (!ready) return;
    if (running) {
      pending = true;
      return;
    }
    running = (async () => {
      try {
        const a = app();
        const docs = a.docs.filter(worthKeeping).slice(-MAX_DOCS);
        const payload = {
          v: 1,
          savedAt: Date.now(),
          active: docs.indexOf(a.doc),
          docs: await Promise.all(docs.map(docData)),
          chat: PW.assistant ? PW.assistant.exportChat() : null,
        };
        await store('readwrite', s => s.put(payload, KEY));
      } catch {
        /* storage is optional */
      }
    })();
    await running;
    running = null;
    if (pending) {
      pending = false;
      schedule();
    }
  }

  function schedule() {
    if (!ready) return;
    clearTimeout(timer);
    timer = setTimeout(save, DELAY);
  }

  function flush() {
    if (!timer) return;
    clearTimeout(timer);
    timer = 0;
    save();
  }

  // Brings back the pictures (and chat) from the last visit. Resolves true when something came back.
  async function restore() {
    try {
      const payload = await store('readonly', s => s.get(KEY));
      if (!payload || payload.v !== 1) return false;
      const a = app();
      const restored = [];
      for (const data of payload.docs || []) {
        const urls = [];
        const url = b => {
          if (!b) return null;
          const u = URL.createObjectURL(b);
          urls.push(u);
          return u;
        };
        try {
          const doc = await PW.Doc.deserialize({ ...data, layers: data.layers.map(l => ({ ...l, pixels: url(l.pixels), mask: url(l.mask) })) });
          doc.dirty = true;
          a.addDoc(doc, 'Wiederhergestellt');
          restored.push(doc);
        } catch {
          /* skip a picture that cannot be read back */
        } finally {
          urls.forEach(u => URL.revokeObjectURL(u));
        }
      }
      if (restored.length) {
        a.setDoc(restored[payload.active] || restored[restored.length - 1]);
        a.view.fit(false);
      }
      if (payload.chat && PW.assistant) PW.assistant.importChat(payload.chat);
      if (restored.length) a.toast(restored.length === 1 ? 'Dein Bild von vorhin ist wieder da.' : 'Deine Bilder von vorhin sind wieder da.');
      return restored.length > 0;
    } catch {
      return false;
    } finally {
      ready = true;
    }
  }

  function init() {
    for (const evt of ['history:changed', 'docs:changed', 'doc:switched', 'assistant:changed']) PW.bus.on(evt, schedule);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  PW.autosave = { init, restore, save, flush };
})(window.PW);
