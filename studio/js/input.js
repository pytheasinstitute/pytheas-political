'use strict';
/* Pytheas Studio — Eingaben: Zeiger, Tastatur, Mausrad, Drag & Drop, Zwischenablage */

const touches = new Map();
let pinch = null;
let pan = null;

function eventPoint(e) {
  const p = screenToDoc(e.clientX, e.clientY);
  p.pressure = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 1;
  return p;
}

function abortDrag() {
  if (dragHandler) {
    if (dragHandler.cancel) dragHandler.cancel();
    dragHandler = null;
    app.preview = null;
    app.selOffset = null;
    requestRender();
  }
  pan = null;
}

function startPinch() {
  const [a, b] = [...touches.values()];
  const r = viewport.getBoundingClientRect();
  pinch = {
    d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    z0: app.zoom,
    mx: (a.x + b.x) / 2 - r.left,
    my: (a.y + b.y) / 2 - r.top,
    px: app.panX,
    py: app.panY,
  };
}

function updatePinch() {
  const [a, b] = [...touches.values()];
  if (!a || !b) return;
  const r = viewport.getBoundingClientRect();
  const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
  const z = clamp((pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0, 0.02, 32);
  const docX = (pinch.mx - pinch.px) / pinch.z0;
  const docY = (pinch.my - pinch.py) / pinch.z0;
  setView(z, mx - docX * z, my - docY * z);
}

viewport.addEventListener('pointerdown', (e) => {
  if (modalOpen() || e.target === textEditor) return;
  closeMenus();
  const active = document.activeElement;
  if (active && active !== document.body && active !== textEditor && active.blur) active.blur();
  e.preventDefault();
  try {
    viewport.setPointerCapture(e.pointerId);
  } catch {
    /* ignorieren */
  }
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      abortDrag();
      startPinch();
      return;
    }
    if (touches.size > 2) return;
  }
  if (e.button === 1 || spaceHeld || (app.tool === 'hand' && !Transform.active)) {
    pan = { x: e.clientX, y: e.clientY, px: app.panX, py: app.panY };
    setCursor('grabbing');
    return;
  }
  if (e.button !== 0) return;
  const p = eventPoint(e);
  app.hover = p;
  const h = currentHandler();
  if (!h || !h.down) return;
  dragHandler = h;
  h.down(p, e);
});

viewport.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) {
    updatePinch();
    return;
  }
  if (pan) {
    setView(app.zoom, pan.px + e.clientX - pan.x, pan.py + e.clientY - pan.y);
    return;
  }
  const p = eventPoint(e);
  app.hover = p;
  updateStatus();
  const h = dragHandler;
  if (h) {
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    if (h.move) {
      if (events.length > 1) for (const ce of events) h.move(eventPoint(ce), ce);
      else h.move(p, e);
    }
    if (h.moveDone && dragHandler === h) h.moveDone();
  } else {
    const ch = currentHandler();
    if (ch && ch.hover && !spaceHeld) ch.hover(p, e);
  }
  requestOverlay();
});

function endPointer(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      return;
    }
  }
  if (pan) {
    pan = null;
    updateCursor();
    return;
  }
  if (dragHandler) {
    const h = dragHandler;
    dragHandler = null;
    if (h.up) h.up(eventPoint(e), e);
  }
}

viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('pointerleave', () => {
  if (dragHandler || pan) return;
  app.hover = null;
  requestOverlay();
  updateStatus();
});
viewport.addEventListener('contextmenu', (e) => e.preventDefault());

viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      zoomAt(app.zoom * Math.exp(-e.deltaY * unit * 0.0025), e.clientX - r.left, e.clientY - r.top);
    } else {
      const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
      const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
      setView(app.zoom, app.panX - dx, app.panY - dy);
    }
  },
  { passive: false }
);

/* ---------- Tastatur ---------- */

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
  if (currentDialog) {
    if (e.key === 'Escape') {
      e.preventDefault();
      currentDialog.cancel();
    } else if (e.key === 'Enter' && !(t instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (typing) t.blur();
      currentDialog.ok();
    }
    return;
  }
  if (typing) {
    if (t === textEditor) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        commitText();
      }
    } else if (e.key === 'Escape' || e.key === 'Enter') t.blur();
    return;
  }
  if (e.key === 'Escape') closeMenus();
  for (const it of menuItems) {
    if ((it.sc && matchCombo(e, it.sc)) || (it.scAlt && matchCombo(e, it.scAlt))) {
      e.preventDefault();
      runMenuItem(it);
      return;
    }
  }
  const h = currentHandler();
  if (h && h.key && h.key(e)) {
    e.preventDefault();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!spaceHeld) {
      spaceHeld = true;
      updateCursor();
      requestOverlay();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'Backspace') {
    e.preventDefault();
    clearArea();
    return;
  }
  if (k === '[' || k === ',') return changeBrushSize(-1);
  if (k === ']' || k === '.') return changeBrushSize(1);
  if (/^[0-9]$/.test(k)) return setToolOpacity(k === '0' ? 100 : +k * 10);
  const lower = k.toLowerCase();
  if (lower === 'x') return swapColors();
  if (lower === 'd') return resetColors();
  const candidates = TOOL_GROUPS.flat().filter((id) => TOOL_DEFS[id].key === lower);
  if (candidates.length) {
    e.preventDefault();
    const i = candidates.indexOf(app.tool);
    setTool(candidates[(i + 1) % candidates.length]);
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && spaceHeld) {
    spaceHeld = false;
    updateCursor();
    requestOverlay();
  }
});

window.addEventListener('blur', () => {
  if (spaceHeld) {
    spaceHeld = false;
    updateCursor();
  }
});

/* ---------- Dateien: Öffnen, Drag & Drop, Einfügen ---------- */

$('#file-open').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) await openFile(f, false);
});

$('#file-place').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) await openFile(f, true);
});

const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
let dragDepth = 0;

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dropping');
});

window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dropping');
  }
});

window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dropping');
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  finishInteractions();
  const pristine = !app.dirty && app.hIndex === 0;
  for (const [i, f] of files.entries()) {
    const isProject = /\.pstudio$/i.test(f.name);
    await openFile(f, !(isProject || (i === 0 && pristine)));
  }
});

document.addEventListener('paste', async (e) => {
  const t = e.target;
  if (modalOpen() || (t instanceof HTMLElement && t.matches('input, textarea'))) return;
  const items = e.clipboardData ? [...e.clipboardData.items] : [];
  const img = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
  e.preventDefault();
  finishInteractions();
  if (!img) return pasteInternal();
  try {
    await pasteBlob(img.getAsFile());
  } catch {
    toast('Einfügen fehlgeschlagen – Format wird nicht unterstützt.', 'error');
  }
});

window.addEventListener('resize', () => {
  resizeOverlay();
  positionTextEditor();
});

window.addEventListener('beforeunload', (e) => {
  if (app.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
