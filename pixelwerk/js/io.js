// ─── File input/output: open, place, paste, drag & drop, project files, export ───
'use strict';

(function (PW) {
  const { el, createCanvas, imageFromBlob, download } = PW.util;
  const app = () => PW.app;
  const MAX_SIDE = 16000;

  function pickFiles(accept, multiple = true) {
    return new Promise(resolve => {
      const input = el('input', { type: 'file', accept, multiple, hidden: true });
      input.addEventListener('change', () => {
        resolve([...input.files]);
        input.remove();
      });
      document.body.append(input);
      input.click();
    });
  }

  const isProject = f => /\.pxw$/i.test(f.name) || f.type === 'application/json';
  const baseName = name => name.replace(/\.[a-z0-9]+$/i, '');

  async function canvasFromFile(file) {
    const img = await imageFromBlob(file);
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Das Bild hat keine gültige Größe.');
    if (w > MAX_SIDE || h > MAX_SIDE) throw new Error(`Das Bild ist mit ${w} × ${h} Pixeln zu groß (höchstens ${MAX_SIDE} Pixel pro Seite).`);
    const c = createCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  async function openFile(file) {
    try {
      if (isProject(file)) {
        const data = JSON.parse(await file.text());
        if (data.app !== 'pixelwerk') throw new Error('Die Datei ist kein Pixelwerk-Projekt.');
        const doc = await PW.ui.busy(() => PW.Doc.deserialize(data));
        doc.name = baseName(file.name);
        app().addDoc(doc, 'Öffnen');
        return;
      }
      if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(file.name)) {
        throw new Error(`„${file.name}“ ist kein unterstütztes Bildformat.`);
      }
      const c = await canvasFromFile(file);
      const doc = new PW.Doc(c.width, c.height, file.name);
      const L = new PW.Layer(c.width, c.height, 'Hintergrund');
      L.ctx.drawImage(c, 0, 0);
      L.touch();
      doc.layers.push(L);
      doc.activeId = L.id;
      app().addDoc(doc, 'Öffnen');
    } catch (err) {
      PW.dialogs.alert(`Die Datei konnte nicht geöffnet werden. ${err.message || ''}`);
    }
  }

  async function open() {
    const files = await pickFiles('image/*,.pxw,application/json');
    for (const f of files) await openFile(f);
  }

  // Places an image as a new layer, scaled down to fit when it is larger than the canvas.
  async function placeFile(file) {
    const a = app();
    if (!a.doc) return openFile(file);
    try {
      let c = await canvasFromFile(file);
      const doc = a.doc, k = Math.min(1, doc.width / c.width, doc.height / c.height);
      if (k < 1) {
        const s = createCanvas(Math.round(c.width * k), Math.round(c.height * k));
        const g = s.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(c, 0, 0, s.width, s.height);
        c = s;
      }
      PW.commands.pasteCanvas(c, baseName(file.name), { x: Math.round((doc.width - c.width) / 2), y: Math.round((doc.height - c.height) / 2) });
    } catch (err) {
      PW.dialogs.alert(`Das Bild konnte nicht platziert werden. ${err.message || ''}`);
    }
  }

  async function place() {
    const files = await pickFiles('image/*');
    for (const f of files) await placeFile(f);
  }

  // Menu "Einfügen": internal clipboard first, then the async clipboard API if allowed.
  async function pasteFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const type = it.types.find(t => t.startsWith('image/'));
          if (type) {
            const blob = await it.getType(type);
            const c = await canvasFromFile(new File([blob], 'Eingefügt', { type }));
            const internal = app().clipboard;
            if (internal && internal.canvas.width === c.width && internal.canvas.height === c.height) PW.commands.pasteInternal();
            else PW.commands.pasteCanvas(c);
            return;
          }
        }
      }
    } catch { /* permission denied or unsupported: fall back */ }
    if (!PW.commands.pasteInternal()) app().toast('Die Zwischenablage enthält kein Bild.');
  }

  async function saveProject(doc) {
    if (!doc) return;
    app().finishToolWork();
    const data = await PW.ui.busy(() => doc.serialize());
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    if (!(await download(blob, `${baseName(doc.name)}.pxw`))) return;
    doc.dirty = false;
    PW.bus.emit('docs:changed');
    app().toast(`„${baseName(doc.name)}.pxw“ wird gespeichert`);
  }

  function exportImage(doc, { format = 'png', quality = 90, scale = 100, name }) {
    if (!doc) return;
    app().finishToolWork();
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];
    let c = doc.flattened(format === 'jpeg' ? '#ffffff' : null);
    if (scale !== 100) {
      const s = createCanvas(Math.max(1, Math.round((c.width * scale) / 100)), Math.max(1, Math.round((c.height * scale) / 100)));
      const g = s.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, s.width, s.height);
      c = s;
    }
    c.toBlob(blob => {
      if (!blob) return PW.dialogs.alert('Das Bild konnte nicht exportiert werden.');
      const ext = format === 'jpeg' ? 'jpg' : format, file = `${name || baseName(doc.name)}.${ext}`;
      download(blob, file).then(ok => ok && app().toast(`Exportiert: ${file}`));
    }, mime, quality / 100);
  }

  function init() {
    // System paste (Strg+V): images from other apps, else the internal clipboard.
    document.addEventListener('paste', async e => {
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text'))) return;
      if (document.querySelector('.modal-overlay')) return;
      const items = [...(e.clipboardData ? e.clipboardData.items : [])];
      const img = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
      e.preventDefault();
      if (img) {
        try {
          const file = img.getAsFile();
          const c = await canvasFromFile(file);
          const internal = app().clipboard;
          if (internal && internal.canvas.width === c.width && internal.canvas.height === c.height) PW.commands.pasteInternal();
          else PW.commands.pasteCanvas(c);
        } catch (err) {
          PW.dialogs.alert(`Das Bild aus der Zwischenablage konnte nicht gelesen werden. ${err.message || ''}`);
        }
        return;
      }
      if (!PW.commands.pasteInternal()) app().toast('Die Zwischenablage enthält kein Bild.');
    });

    // Drag & drop: onto an open document = place as layer, otherwise open.
    const ws = document.getElementById('center');
    let depth = 0;
    ws.addEventListener('dragenter', e => {
      if (![...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files')) return;
      e.preventDefault();
      depth++;
      ws.classList.add('drop-target');
    });
    ws.addEventListener('dragover', e => {
      if ([...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files')) e.preventDefault();
    });
    ws.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) ws.classList.remove('drop-target');
    });
    ws.addEventListener('drop', async e => {
      e.preventDefault();
      depth = 0;
      ws.classList.remove('drop-target');
      const files = [...e.dataTransfer.files];
      const onTabs = e.target.closest && e.target.closest('#tabs');
      for (const f of files) {
        if (isProject(f) || !app().doc || onTabs) await openFile(f);
        else await placeFile(f);
      }
    });

    window.addEventListener('beforeunload', e => {
      if (app().docs.some(d => d.dirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  PW.io = { init, open, openFile, place, placeFile, pasteFromClipboard, saveProject, exportImage };
})(window.PW);
