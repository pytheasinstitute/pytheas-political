// ─── Pen tool, path selection, direct selection (Zeichenstift, Pfadauswahl, Direktauswahl) ───
// The pen adds points to the active path: click for a corner, drag for a smooth curve, click on the
// first point to close the shape. On a path without a point being drawn, a click on a segment adds
// a point and a click on a point removes it. Alt converts points; Strg/⌘ works like the direct
// selection tool for the moment. Enter ends, Strg+Enter loads the path as a selection.
'use strict';

(function (PW) {
  const app = () => PW.app;
  const P = () => PW.paths;
  const HIT = 7;

  // The path the tools work on; `create`: start the "Arbeitspfad" when there is none.
  function activePath(doc, create) {
    let path = doc.activePath;
    if (!path && create) {
      path = doc.paths.find(p => p.work);
      if (!path) {
        path = P().create('Arbeitspfad', true);
        doc.paths.push(path);
      }
      doc.activePathId = path.id;
      PW.bus.emit('paths:changed', doc);
    }
    return path;
  }

  // Point or handle under p (screen distance). Returns { kind: 'anchor'|'in'|'out', si, i } or null.
  function hitPoint(path, p, view, handlesOf = () => false) {
    if (!path) return null;
    const tol = HIT / view.zoom;
    let best = null, bd = tol;
    path.subpaths.forEach((sub, si) => {
      sub.pts.forEach((a, i) => {
        const cand = [['anchor', a.x, a.y]];
        if (handlesOf(si, i)) cand.push(['in', a.ix, a.iy], ['out', a.ox, a.oy]);
        for (const [kind, x, y] of cand) {
          if (kind !== 'anchor' && Math.hypot(x - a.x, y - a.y) < 0.01) continue;
          const d = Math.hypot(x - p.x, y - p.y);
          // Handles win over their own anchor when both are close.
          if (d < bd || (kind !== 'anchor' && d <= bd + 0.5 / view.zoom && best && best.kind === 'anchor')) {
            bd = d;
            best = { kind, si, i };
          }
        }
      });
    });
    return best;
  }
  function hitSegment(path, p, view) {
    if (!path) return null;
    const n = P().nearest(path, p);
    return n && n.d <= HIT / view.zoom ? n : null;
  }

  // Moves a handle; a smooth point keeps the opposite handle in line (Alt: independent).
  function setHandle(a, which, x, y, alt) {
    const o = which === 'in' ? 'o' : 'i', w = which === 'in' ? 'i' : 'o';
    a[`${w}x`] = x;
    a[`${w}y`] = y;
    if (alt) a.smooth = false;
    if (a.smooth) {
      const len = Math.hypot(a[`${o}x`] - a.x, a[`${o}y`] - a.y), dx = a.x - x, dy = a.y - y, L = Math.hypot(dx, dy) || 1;
      const k = len > 0.01 ? len / L : 1;
      a[`${o}x`] = a.x + dx * k;
      a[`${o}y`] = a.y + dy * k;
    }
  }
  function moveAnchor(a, dx, dy) {
    a.x += dx; a.y += dy; a.ix += dx; a.iy += dy; a.ox += dx; a.oy += dy;
  }

  const notify = doc => {
    PW.bus.emit('paths:changed', doc);
    app().render();
  };

  // ─── Direct selection (points and handles) — also used by the pen with Strg/⌘ ───
  const direct = {
    selected: new Set(),
    begin(doc, p, view) {
      const path = activePath(doc, false);
      if (!path) return false;
      const sel = this.selected, hit = hitPoint(path, p, view, (si, i) => sel.has(`${si}:${i}`));
      if (hit) {
        const k = `${hit.si}:${hit.i}`;
        if (hit.kind === 'anchor') {
          if (p.shift) sel.has(k) ? sel.delete(k) : sel.add(k);
          else if (!sel.has(k)) {
            sel.clear();
            sel.add(k);
          }
        }
        this.drag = { hit, last: p, moved: false };
        return true;
      }
      const seg = hitSegment(path, p, view);
      if (seg) {
        const sub = path.subpaths[seg.si], n = sub.pts.length;
        if (!p.shift) sel.clear();
        sel.add(`${seg.si}:${seg.seg}`);
        sel.add(`${seg.si}:${(seg.seg + 1) % n}`);
        this.drag = { hit: { kind: 'anchor' }, last: p, moved: false };
        return true;
      }
      if (!p.shift) sel.clear();
      this.drag = { box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, moved: false };
      return true;
    },
    move(doc, p) {
      const d = this.drag, path = doc.activePath;
      if (!d || !path) return;
      if (d.box) {
        d.box.x1 = p.x;
        d.box.y1 = p.y;
        d.moved = true;
        return app().render();
      }
      if (d.hit.kind === 'in' || d.hit.kind === 'out') {
        setHandle(path.subpaths[d.hit.si].pts[d.hit.i], d.hit.kind, p.x, p.y, p.alt);
      } else {
        const dx = p.x - d.last.x, dy = p.y - d.last.y;
        for (const k of this.selected) {
          const [si, i] = k.split(':').map(Number), a = path.subpaths[si] && path.subpaths[si].pts[i];
          if (a) moveAnchor(a, dx, dy);
        }
        d.last = p;
      }
      d.moved = true;
      notify(doc);
    },
    end(doc) {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const path = doc.activePath;
      if (d.box && path) {
        const x0 = Math.min(d.box.x0, d.box.x1), x1 = Math.max(d.box.x0, d.box.x1), y0 = Math.min(d.box.y0, d.box.y1), y1 = Math.max(d.box.y0, d.box.y1);
        path.subpaths.forEach((sub, si) => sub.pts.forEach((a, i) => {
          if (a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) this.selected.add(`${si}:${i}`);
        }));
        return app().render();
      }
      if (d.moved) app().commit(d.hit && d.hit.kind !== 'anchor' ? 'Griff verschieben' : 'Ankerpunkt verschieben', 'pen');
    },
    remove(doc) {
      const path = doc.activePath;
      if (!path || !this.selected.size) return false;
      const del = new Map();
      for (const k of this.selected) {
        const [si, i] = k.split(':').map(Number);
        (del.get(si) || del.set(si, new Set()).get(si)).add(i);
      }
      path.subpaths = path.subpaths
        .map((sub, si) => ({ ...sub, pts: sub.pts.filter((_, i) => !(del.get(si) && del.get(si).has(i))) }))
        .filter(sub => sub.pts.length > 1);
      this.selected.clear();
      app().commit('Ankerpunkt löschen', 'pen');
      return true;
    },
    drawBox(g, view) {
      const b = this.drag && this.drag.box;
      if (!b) return;
      const a = view.ds(b.x0, b.y0), c = view.ds(b.x1, b.y1);
      g.save();
      g.strokeStyle = '#1473e6';
      g.setLineDash([3, 3]);
      g.strokeRect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
      g.restore();
    },
  };

  const PATH_BUTTONS = [
    { type: 'action', label: 'Auswahl', title: 'Pfad als Auswahl laden (Strg+Enter)', run: () => PW.runAction('path.toSelection') },
    { type: 'action', label: 'Füllen', title: 'Pfad mit der Vordergrundfarbe füllen', run: () => PW.runAction('path.fill') },
    { type: 'action', label: 'Kontur', title: 'Pfadkontur mit der Vordergrundfarbe zeichnen', run: () => PW.runAction('path.stroke') },
  ];

  // ─── Zeichenstift ───
  PW.tools.register({
    id: 'pen', group: 'pen', name: 'Zeichenstift-Werkzeug', key: 'P', icon: 'pen', cursor: 'crosshair', drawsPath: true, altEyedropper: false,
    options: {},
    bar: [{ type: 'hint', text: 'Klicken: Ecke · Ziehen: Kurve · Klick auf den ersten Punkt schließt · Enter beendet' }, { type: 'sep' }, ...PATH_BUTTONS],
    hint: 'Setze Punkte: Klicken ergibt Ecken, Ziehen runde Kurven. Ein Klick auf den ersten Punkt schließt die Form. Danach z. B. „Auswahl“ in der Optionsleiste.',
    // this.open: { si } of the subpath being drawn.
    deactivate() {
      this.open = null;
      this.drag = null;
    },
    down(p) {
      const a = app(), doc = a.doc, view = a.view;
      if (p.mod) {
        this.direct = direct.begin(doc, p, view);
        return;
      }
      const path = activePath(doc, true), open = this.open && path.subpaths[this.open.si];
      if (open && open.pts.length > 1) {
        const first = open.pts[0];
        if (Math.hypot(first.x - p.x, first.y - p.y) * view.zoom <= HIT) {
          open.closed = true;
          this.open = null;
          this.drag = { a: first, start: p, kind: 'close', name: 'Pfad schließen' };
          return;
        }
      }
      if (!open) {
        const hit = hitPoint(path, p, view);
        if (hit) {
          const sub = path.subpaths[hit.si], end = !sub.closed && (hit.i === 0 || hit.i === sub.pts.length - 1);
          if (p.alt) {
            // Alt: drag pulls new smooth handles; a click makes it a corner.
            const A = sub.pts[hit.i];
            A.ix = A.ox = A.x;
            A.iy = A.oy = A.y;
            A.smooth = false;
            this.drag = { a: A, start: p, kind: 'convert', name: 'Punkt umwandeln' };
            notify(doc);
            return;
          }
          if (end && sub.pts.length > 1) {
            // Continue an open subpath from either end.
            if (hit.i === 0) {
              sub.pts.reverse();
              for (const A of sub.pts) [A.ix, A.iy, A.ox, A.oy] = [A.ox, A.oy, A.ix, A.iy];
            }
            this.open = { si: hit.si };
            return notify(doc);
          }
          sub.pts.splice(hit.i, 1);
          if (sub.pts.length < 2) path.subpaths.splice(hit.si, 1);
          direct.selected.clear();
          a.commit('Ankerpunkt löschen', 'pen');
          return;
        }
        const seg = hitSegment(path, p, view);
        if (seg) {
          P().split(path.subpaths[seg.si], seg.seg, seg.t);
          a.commit('Ankerpunkt hinzufügen', 'pen');
          return;
        }
      }
      const A = P().anchor(p.x, p.y);
      if (open) open.pts.push(A);
      else {
        path.subpaths.push({ closed: false, pts: [A] });
        this.open = { si: path.subpaths.length - 1 };
      }
      this.drag = { a: A, start: p, kind: 'new', name: 'Ankerpunkt hinzufügen' };
      notify(doc);
    },
    move(p) {
      const doc = app().doc;
      if (this.direct) return direct.move(doc, p);
      const d = this.drag;
      if (!d) return;
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * app().view.zoom < 2 && !d.pulled) return;
      d.pulled = true;
      const A = d.a;
      // Dragging sets the outgoing handle (for a closing click: the incoming one of the first point).
      if (d.kind === 'close') {
        A.ix = 2 * A.x - p.x;
        A.iy = 2 * A.y - p.y;
        if (!p.alt) {
          A.ox = p.x;
          A.oy = p.y;
        }
      } else {
        A.ox = p.x;
        A.oy = p.y;
        if (!p.alt) {
          A.ix = 2 * A.x - p.x;
          A.iy = 2 * A.y - p.y;
        }
      }
      A.smooth = !p.alt;
      notify(doc);
    },
    up() {
      const a = app(), doc = a.doc;
      if (this.direct) {
        this.direct = false;
        return direct.end(doc);
      }
      const d = this.drag;
      this.drag = null;
      if (d) a.commit(d.name, 'pen');
    },
    hover(p) {
      this.hoverP = p ? { x: p.x, y: p.y } : null;
      if (this.open) app().render();
    },
    cancel() {
      this.drag = null;
      this.direct = false;
    },
    onKey(e) {
      const doc = app().doc;
      if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        this.open = null;
        PW.runAction('path.toSelection');
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (!this.open) return false;
        this.open = null;
        app().render();
        return true;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && this.open) {
        const path = doc.activePath, sub = path && path.subpaths[this.open.si];
        if (!sub) return false;
        sub.pts.pop();
        if (!sub.pts.length) {
          path.subpaths.splice(this.open.si, 1);
          this.open = null;
        }
        app().commit('Ankerpunkt löschen', 'pen');
        return true;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && direct.selected.size) return direct.remove(doc);
      return false;
    },
    drawOverlay(g, view) {
      const doc = app().doc, path = doc.activePath, open = this.open;
      if (path && open && this.hoverP && !this.drag && path.subpaths[open.si]) {
        // Rubber band from the last point to the mouse.
        const sub = path.subpaths[open.si], L = sub.pts[sub.pts.length - 1], d = view.dpr;
        g.save();
        g.setTransform(d * view.zoom, 0, 0, d * view.zoom, d * view.x, d * view.y);
        g.beginPath();
        g.moveTo(L.x, L.y);
        g.bezierCurveTo(L.ox, L.oy, this.hoverP.x, this.hoverP.y, this.hoverP.x, this.hoverP.y);
        g.strokeStyle = 'rgba(20,115,230,0.7)';
        g.lineWidth = 1 / view.zoom;
        g.stroke();
        g.restore();
      }
      const last = open && path && path.subpaths[open.si] ? path.subpaths[open.si].pts.length - 1 : -1;
      P().drawOverlay(g, view, path, {
        selected: direct.selected,
        showHandles: (si, i) => (open && si === open.si && i === last) || (this.drag && this.drag.a === path.subpaths[si].pts[i]),
      });
      direct.drawBox(g, view);
    },
  });

  // ─── Direktauswahl ───
  PW.tools.register({
    id: 'directSelect', group: 'pathsel', name: 'Direktauswahl-Werkzeug', key: 'A', icon: 'direct-select', cursor: 'default', drawsPath: true,
    options: {},
    bar: [{ type: 'hint', text: 'Punkte und Griffe ziehen · Umschalt: mehrere · Alt: Griff einzeln · Entf löscht Punkte' }, { type: 'sep' }, ...PATH_BUTTONS],
    hint: 'Zieht einzelne Punkte und ihre Griffe eines Pfads. Ein Rahmen wählt mehrere Punkte aus.',
    down(p) { direct.begin(app().doc, p, app().view); },
    move(p) { direct.move(app().doc, p); },
    up() { direct.end(app().doc); },
    cancel() { direct.drag = null; },
    onKey(e) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && direct.selected.size) return direct.remove(app().doc);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        PW.runAction('path.toSelection');
        return true;
      }
      return false;
    },
    drawOverlay(g, view) {
      P().drawOverlay(g, view, app().doc.activePath, { selected: direct.selected });
      direct.drawBox(g, view);
    },
  });

  // ─── Pfadauswahl: whole subpaths ───
  PW.tools.register({
    id: 'pathSelect', group: 'pathsel', name: 'Pfadauswahl-Werkzeug', key: 'A', icon: 'path-select', cursor: 'default', drawsPath: true,
    options: {},
    bar: [{ type: 'hint', text: 'Einen Pfad anklicken und ziehen · Alt+Ziehen kopiert ihn · Entf löscht ihn' }, { type: 'sep' }, ...PATH_BUTTONS],
    hint: 'Verschiebt ganze Pfade. Klicke auf die Linie oder in die Form.',
    picked: new Set(),
    down(p) {
      const a = app(), doc = a.doc, path = doc.activePath;
      if (!path) return;
      const hit = hitSegment(path, p, a.view);
      let si = hit ? hit.si : -1;
      if (si < 0) {
        // Inside a closed subpath counts too.
        const c = PW.util.createCanvas(1, 1).getContext('2d');
        si = path.subpaths.findIndex(sub => sub.closed && c.isPointInPath(P().toPath2D({ subpaths: [sub] }), p.x, p.y));
      }
      if (si < 0) {
        this.picked.clear();
        return a.render();
      }
      if (!p.shift && !this.picked.has(si)) this.picked.clear();
      this.picked.add(si);
      if (p.alt) {
        // Alt-drag: drag a copy.
        const copies = [...this.picked].map(i => P().clone(path.subpaths[i]));
        const n = path.subpaths.length;
        path.subpaths.push(...copies);
        this.picked = new Set(copies.map((_, k) => n + k));
      }
      this.drag = { last: p, moved: false, copy: p.alt };
      direct.selected.clear();
      a.render();
    },
    move(p) {
      const d = this.drag, doc = app().doc, path = doc.activePath;
      if (!d || !path) return;
      for (const si of this.picked) if (path.subpaths[si]) P().translateSub(path.subpaths[si], p.x - d.last.x, p.y - d.last.y);
      d.last = p;
      d.moved = true;
      notify(doc);
    },
    up() {
      const d = this.drag;
      this.drag = null;
      if (d && (d.moved || d.copy)) app().commit(d.copy ? 'Pfad duplizieren' : 'Pfad verschieben', 'pen');
    },
    cancel() { this.drag = null; },
    onKey(e) {
      const doc = app().doc, path = doc.activePath;
      if ((e.key === 'Backspace' || e.key === 'Delete') && path && this.picked.size) {
        path.subpaths = path.subpaths.filter((_, i) => !this.picked.has(i));
        this.picked.clear();
        app().commit('Pfad löschen', 'pen');
        return true;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        PW.runAction('path.toSelection');
        return true;
      }
      return false;
    },
    drawOverlay(g, view) {
      const path = app().doc.activePath;
      if (!path) return;
      const sel = new Set();
      for (const si of this.picked) (path.subpaths[si] ? path.subpaths[si].pts : []).forEach((_, i) => sel.add(`${si}:${i}`));
      P().drawOverlay(g, view, path, { selected: sel });
    },
  });

  // ─── Commands ───
  function needPath(doc) {
    const path = doc && doc.activePath;
    if (P().empty(path)) {
      app().toast('Es gibt keinen Pfad. Zeichne einen mit dem Zeichenstift (P) oder wähle einen unter Fenster › Pfade.');
      return null;
    }
    return path;
  }

  const commands = {
    toSelection(mode = 'replace') {
      const a = app(), doc = a.doc, path = needPath(doc);
      if (!path) return;
      a.finishToolWork();
      doc.selection.fromAlpha(P().toAlpha(path, doc.width, doc.height), mode);
      a.commit('Pfad als Auswahl laden', 'selection');
    },
    async fromSelection() {
      const a = app(), doc = a.doc;
      if (!doc) return;
      if (doc.selection.empty) return a.toast('Es ist keine Auswahl vorhanden.');
      const v = await PW.dialogs.form('Arbeitspfad erstellen', [{ type: 'number', key: 'tol', label: 'Toleranz', min: 0.5, max: 10, step: 0.5, unit: 'Pixel' }], { tol: 2 });
      if (!v) return;
      const subpaths = await PW.ui.busy(async () => P().fromAlpha(doc.selection.alpha(), doc.width, doc.height, v.tol), 'Pfad wird erstellt …');
      let path = doc.paths.find(p => p.work);
      if (!path) {
        path = P().create('Arbeitspfad', true);
        doc.paths.push(path);
      }
      path.subpaths = subpaths;
      doc.activePathId = path.id;
      doc.selection.clear();
      a.commit('Arbeitspfad erstellen', 'pen');
    },
    fill() {
      const a = app(), doc = a.doc, path = needPath(doc);
      if (!path) return;
      const L = a.paintLayer();
      if (!L) return;
      const g = L.target.getContext('2d');
      g.save();
      g.fillStyle = L.targetIsMask ? '#000' : a.fg;
      g.fill(P().toPath2D(path), 'nonzero');
      g.restore();
      L.markTarget();
      a.commit('Pfad füllen', 'fill');
    },
    async stroke() {
      const a = app(), doc = a.doc, path = needPath(doc);
      if (!path) return;
      const v = await PW.dialogs.form('Pfadkontur füllen', [{ type: 'number', key: 'width', label: 'Breite', min: 1, max: 500, unit: 'Pixel' }], { width: Math.round((PW.tools.byId.brush.options.size || 6)) });
      if (!v) return;
      const L = a.paintLayer();
      if (!L) return;
      const g = L.target.getContext('2d');
      g.save();
      g.strokeStyle = L.targetIsMask ? '#000' : a.fg;
      g.lineWidth = v.width;
      g.lineCap = g.lineJoin = 'round';
      g.stroke(P().toPath2D(path));
      g.restore();
      L.markTarget();
      a.commit('Pfadkontur füllen', 'brush');
    },
    // The Arbeitspfad becomes a kept path with a name.
    async save(path) {
      const a = app(), doc = a.doc;
      path = path || (doc && doc.activePath);
      if (!path) return;
      const n = doc.paths.filter(p => !p.work).length + 1;
      const name = await PW.dialogs.textInput('Pfad speichern', 'Name', path.work ? `Pfad ${n}` : path.name);
      if (name == null || !name.trim()) return;
      path.name = name.trim();
      path.work = false;
      a.commit('Pfad speichern', 'pen');
    },
    newPath() {
      const a = app(), doc = a.doc;
      if (!doc) return;
      const path = P().create(`Pfad ${doc.paths.filter(p => !p.work).length + 1}`);
      doc.paths.push(path);
      doc.activePathId = path.id;
      a.commit('Neuer Pfad', 'pen');
      a.setTool('pen');
    },
    remove(path) {
      const a = app(), doc = a.doc;
      path = path || (doc && doc.activePath);
      if (!path) return;
      doc.paths = doc.paths.filter(p => p !== path);
      if (doc.activePathId === path.id) doc.activePathId = null;
      a.commit('Pfad löschen', 'trash');
    },
    select(path) {
      const doc = app().doc;
      doc.activePathId = path ? path.id : null;
      direct.selected.clear();
      PW.tools.byId.pen.open = null;
      notify(doc);
    },
  };

  PW.pathCommands = commands;
  PW.pathTools = { direct, activePath };
})(window.PW);
