// ─── Meine Bilder: everything opened or edited stays in this browser, open pictures come back ───
// Each picture is one record in IndexedDB (all layers as PNG plus a small preview); the session
// record lists which pictures were open and keeps the Claude chat. Unchanged layers reuse their
// stored PNG, so saving after an edit only encodes what changed. Nothing leaves the device.
// Without storage (private window, blocked site data) everything works as before.
'use strict';

(function (PW) {
  const { el } = PW.util;
  const app = () => PW.app;
  const DB = 'pixelwerk', DB_VERSION = 2, SESSION = 'session', PICS = 'pictures', KEY = 'current', DELAY = 500;
  let dbPromise = null, timer = 0, running = null, pending = false, persistAsked = false;
  // Nothing is written before the last session has been read back, so it cannot be overwritten.
  let ready = false;
  const encoded = new WeakMap(); // layer → { version, blob, maskVersion, maskBlob }
  const savedAt = new WeakMap(); // doc → history state that is in storage

  // ─── Storage ───
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise(resolve => {
        try {
          const req = indexedDB.open(DB, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION);
            if (!db.objectStoreNames.contains(PICS)) db.createObjectStore(PICS, { keyPath: 'id' });
          };
          req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => db.close();
            resolve(db);
          };
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  // One request in its own transaction; resolves its result, or null when storage fails.
  async function run(storeName, mode, fn) {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(storeName, mode), req = fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req ? req.result : true);
        tx.onerror = tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  function askPersist() {
    if (persistAsked) return;
    persistAsked = true;
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch { /* optional */ }
  }

  // ─── Pictures ───
  const toBlob = (canvas, type = 'image/png', q) => new Promise(res => canvas.toBlob(b => res(b), type, q));
  const idOf = doc => doc.storeId || (doc.storeId = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`);

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

  async function thumbnail(doc) {
    const s = Math.min(1, 360 / Math.max(doc.width, doc.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(doc.width * s));
    c.height = Math.max(1, Math.round(doc.height * s));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(doc.flattened('#ffffff'), 0, 0, c.width, c.height);
    return toBlob(c, 'image/jpeg', 0.82);
  }

  async function record(doc) {
    const now = Date.now();
    if (!doc.storeCreated) doc.storeCreated = now;
    return {
      id: idOf(doc),
      name: doc.name,
      createdAt: doc.storeCreated,
      savedAt: now,
      width: doc.width,
      height: doc.height,
      activeIndex: doc.activeIndex,
      thumb: await thumbnail(doc),
      layers: await Promise.all(doc.layers.map(layerData)),
    };
  }

  async function docFrom(data) {
    const urls = [];
    const url = b => {
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urls.push(u);
      return u;
    };
    try {
      return await PW.Doc.deserialize({ ...data, layers: data.layers.map(l => ({ ...l, pixels: url(l.pixels), mask: url(l.mask) })) });
    } finally {
      urls.forEach(u => URL.revokeObjectURL(u));
    }
  }

  // The untouched sample is not worth keeping; everything the person opened or changed is.
  const worthKeeping = doc => !doc.isSample || doc.dirty || !!doc.storeId;

  async function writeDoc(doc) {
    const mark = doc.history.current;
    if (savedAt.get(doc) === mark && doc.storeId) return true;
    const rec = await record(doc);
    const ok = await run(PICS, 'readwrite', s => s.put(rec));
    if (ok) savedAt.set(doc, mark);
    return !!ok;
  }

  async function save() {
    if (!ready) return;
    if (running) {
      pending = true;
      return;
    }
    running = (async () => {
      try {
        const a = app();
        const docs = a.docs.filter(worthKeeping);
        let wrote = false;
        for (const doc of docs) wrote = (await writeDoc(doc)) || wrote;
        await run(SESSION, 'readwrite', s => s.put({
          v: 2,
          open: docs.map(idOf),
          active: a.doc && docs.includes(a.doc) ? idOf(a.doc) : null,
          chat: PW.assistant ? PW.assistant.exportChat() : null,
        }, KEY));
        if (wrote) askPersist();
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

  // Called before a picture is closed: true when its current state is safely in Meine Bilder,
  // so closing needs no "save changes?" question.
  async function keep(doc) {
    if (!ready || !(await openDb())) return false;
    try {
      return await writeDoc(doc);
    } catch {
      return false;
    }
  }

  async function openPicture(id) {
    const a = app();
    const already = a.docs.find(d => d.storeId === id);
    if (already) return a.setDoc(already);
    const rec = await run(PICS, 'readonly', s => s.get(id));
    if (!rec) return a.toast('Das Bild ist nicht mehr da.');
    const doc = await PW.ui.busy(() => docFrom(rec));
    doc.storeId = rec.id;
    doc.storeCreated = rec.createdAt;
    a.addDoc(doc, 'Aus „Meine Bilder“');
    savedAt.set(doc, doc.history.current);
    a.view.fit(false);
  }

  // ─── Restore on start (also takes over the first, single-record autosave) ───
  async function restore() {
    const a = app(), restored = [];
    try {
      const session = await run(SESSION, 'readonly', s => s.get(KEY));
      if (!session) return false;
      let activeDoc = null;
      if (session.v === 1) {
        for (const data of session.docs || []) {
          try {
            const doc = await docFrom(data);
            a.addDoc(doc, 'Wiederhergestellt');
            restored.push(doc);
          } catch { /* skip a picture that cannot be read back */ }
        }
        activeDoc = restored[session.active] || null;
      } else if (session.v === 2) {
        for (const id of session.open || []) {
          try {
            const rec = await run(PICS, 'readonly', s => s.get(id));
            if (!rec) continue;
            const doc = await docFrom(rec);
            doc.storeId = rec.id;
            doc.storeCreated = rec.createdAt;
            a.addDoc(doc, 'Wiederhergestellt');
            savedAt.set(doc, doc.history.current);
            restored.push(doc);
            if (id === session.active) activeDoc = doc;
          } catch { /* skip a picture that cannot be read back */ }
        }
      }
      if (restored.length) {
        a.setDoc(activeDoc || restored[restored.length - 1]);
        a.view.fit(false);
        a.toast(restored.length === 1 ? 'Dein Bild von vorhin ist wieder da.' : 'Deine Bilder von vorhin sind wieder da.');
      }
      if (session.chat && PW.assistant) PW.assistant.importChat(session.chat);
      return restored.length > 0;
    } catch {
      return false;
    } finally {
      ready = true;
      // Pictures from the first autosave move into Meine Bilder right away.
      if (restored.some(d => !d.storeId)) schedule();
    }
  }

  // ─── "Meine Bilder" dialog ───
  function when(ts) {
    const d = new Date(ts), now = new Date();
    const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `heute, ${time}`;
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `gestern, ${time}`;
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' });
  }

  async function openDialog() {
    PW.ui.closeMenus();
    await save();
    const db = await openDb();
    const urls = [];
    const body = el('div', { class: 'lib' });
    let closeDialog = null;
    const render = async () => {
      urls.splice(0).forEach(u => URL.revokeObjectURL(u));
      const items = ((await run(PICS, 'readonly', s => s.getAll())) || []).sort((x, y) => y.savedAt - x.savedAt);
      body.replaceChildren();
      if (!db) {
        body.append(el('p', { class: 'lib-empty', text: 'In diesem Browser kann Pixelwerk nichts speichern, zum Beispiel in einem privaten Fenster. Speichere deine Bilder dann über „Bild speichern“.' }));
        return;
      }
      if (!items.length) {
        body.append(el('p', { class: 'lib-empty', text: 'Noch keine Bilder. Öffne ein Foto, dann landet es automatisch hier, mit allen Änderungen.' }));
      }
      const grid = el('div', { class: 'lib-grid' });
      for (const it of items) {
        const src = it.thumb ? URL.createObjectURL(it.thumb) : '';
        if (src) urls.push(src);
        const isOpen = app().docs.some(d => d.storeId === it.id);
        const openBtn = el('button', { type: 'button', class: 'lib-open', title: `„${it.name}“ öffnen` }, [
          el('span', { class: 'lib-thumb' }, src ? [el('img', { src, alt: '' })] : []),
          el('span', { class: 'lib-name', text: it.name }),
          el('span', { class: 'lib-meta', text: `${when(it.savedAt)} · ${it.width} × ${it.height}${isOpen ? ' · geöffnet' : ''}` }),
        ]);
        openBtn.addEventListener('click', async () => {
          if (closeDialog) closeDialog();
          await openPicture(it.id);
        });
        const del = el('button', { type: 'button', class: 'tbtn lib-del', title: 'Löschen', 'aria-label': `„${it.name}“ löschen`, html: PW.icon('trash', 16) });
        del.addEventListener('click', async () => {
          const open = app().docs.find(d => d.storeId === it.id);
          const ok = await PW.dialogs.confirm(`„${it.name}“ aus „Meine Bilder“ löschen? Das lässt sich nicht rückgängig machen.${open ? ' Das Bild ist gerade geöffnet und wird dabei geschlossen.' : ''}`, { title: 'Bild löschen', ok: 'Löschen' });
          if (ok !== 'ok') return;
          if (open) {
            savedAt.delete(open);
            open.storeId = null;
            await app().closeDoc(open, true);
          }
          await run(PICS, 'readwrite', s => s.delete(it.id));
          await save();
          render();
        });
        grid.append(el('div', { class: 'lib-item' }, [openBtn, del]));
      }
      if (items.length) body.append(grid);
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
      body.append(el('p', { class: 'lib-note', text: `Deine Bilder bleiben nur in diesem Browser auf diesem Gerät, mit allen Ebenen. Was du änderst, wird von selbst gespeichert.${est && est.usage ? ` Belegt: ${Math.max(1, Math.round(est.usage / 1048576))} MB.` : ''}` }));
    };
    await render();
    const done = PW.dialogs.modal({
      title: 'Meine Bilder',
      content: body,
      buttons: [['open', 'Foto öffnen …'], ['cancel', 'Schließen', true]],
      width: 760,
      className: 'dlg-lib',
      onButton: id => {
        if (id === 'open') setTimeout(() => PW.runAction('file.open'), 0);
      },
    });
    closeDialog = () => {
      const btn = document.querySelector('.dlg-lib .dlg-buttons .btn.primary');
      if (btn) btn.click();
    };
    await done;
    urls.forEach(u => URL.revokeObjectURL(u));
  }

  function init() {
    for (const evt of ['history:changed', 'docs:changed', 'doc:switched', 'assistant:changed']) PW.bus.on(evt, schedule);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  PW.library = { init, restore, save, flush, keep, openDialog, openPicture };
})(window.PW);
