// ─── Shell: menu bar, toolbox, options bar, document tabs, status bar, toasts ───
'use strict';

(function (PW) {
  const { el, fmt } = PW.util;
  const app = () => PW.app;
  const $ = id => document.getElementById(id);

  // ─── Menu bar ───
  let openMenu = null;

  function closeMenus() {
    document.querySelectorAll('.menu-pop').forEach(m => m.remove());
    document.querySelectorAll('.menubar-item.open').forEach(b => b.classList.remove('open'));
    openMenu = null;
  }

  function buildMenu(items, x, y, level = 0) {
    const pop = el('div', { class: 'menu-pop', role: 'menu' });
    pop.dataset.level = level;
    for (const it of items) {
      if (it === '-') {
        pop.append(el('div', { class: 'menu-sep', role: 'separator' }));
        continue;
      }
      if (typeof it === 'object') {
        const sub = el('button', { type: 'button', class: 'menu-item has-sub', role: 'menuitem', 'aria-haspopup': 'true' }, [
          el('span', { class: 'mi-check' }), el('span', { class: 'mi-label', text: it.label }), el('span', { class: 'mi-key', html: PW.icon('chev-right', 12) }),
        ]);
        const openSub = () => {
          document.querySelectorAll(`.menu-pop`).forEach(m => {
            if (Number(m.dataset.level) > level) m.remove();
          });
          pop.querySelectorAll('.menu-item.sub-open').forEach(m => m.classList.remove('sub-open'));
          sub.classList.add('sub-open');
          const r = sub.getBoundingClientRect();
          buildMenu(it.items, r.right - 2, r.top - 4, level + 1);
        };
        sub.addEventListener('mouseenter', openSub);
        sub.addEventListener('click', openSub);
        sub.addEventListener('keydown', e => {
          if (e.key === 'ArrowRight') {
            openSub();
            const next = document.querySelector(`.menu-pop[data-level="${level + 1}"] .menu-item:not([disabled])`);
            if (next) next.focus();
          }
        });
        pop.append(sub);
        continue;
      }
      const a = PW.actions[it];
      if (!a) continue;
      const enabled = !a.enabled || a.enabled();
      const checked = a.checked && a.checked();
      const b = el('button', { type: 'button', class: 'menu-item', role: 'menuitem', disabled: !enabled }, [
        el('span', { class: 'mi-check', html: checked ? PW.icon('check', 13) : '' }),
        el('span', { class: 'mi-label', text: a.dynamicLabel ? a.dynamicLabel() : a.label }),
        el('span', { class: 'mi-key', text: PW.displayKey(a.key) }),
      ]);
      b.addEventListener('mouseenter', () => {
        document.querySelectorAll('.menu-pop').forEach(m => {
          if (Number(m.dataset.level) > level) m.remove();
        });
        pop.querySelectorAll('.menu-item.sub-open').forEach(m => m.classList.remove('sub-open'));
      });
      b.addEventListener('click', () => {
        closeMenus();
        a.run();
      });
      pop.append(b);
    }
    pop.addEventListener('keydown', e => {
      const items = [...pop.querySelectorAll(':scope > .menu-item:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        (items[i + 1] || items[0]).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (items[i - 1] || items[items.length - 1]).focus();
      } else if (e.key === 'ArrowLeft' && level > 0) {
        pop.remove();
      } else if (e.key === 'Escape') {
        closeMenus();
      }
    });
    $('menu-layer').append(pop);
    const r = pop.getBoundingClientRect();
    const px = Math.max(4, Math.min(x, innerWidth - r.width - 4));
    const py = Math.max(4, Math.min(y, innerHeight - r.height - 4));
    if (level > 0 && x + r.width > innerWidth) pop.style.left = `${Math.max(4, x - r.width - 220)}px`;
    else pop.style.left = `${px}px`;
    pop.style.top = `${py}px`;
    return pop;
  }

  function initMenubar() {
    const bar = $('menus');
    PW.MENUS.forEach((m, idx) => {
      const b = el('button', { type: 'button', class: 'menubar-item', text: m.label, 'aria-haspopup': 'true' });
      const open = () => {
        closeMenus();
        openMenu = idx;
        b.classList.add('open');
        const r = b.getBoundingClientRect();
        const pop = buildMenu(m.items, r.left, r.bottom);
        return pop;
      };
      b.addEventListener('click', () => (openMenu === idx ? closeMenus() : open()));
      b.addEventListener('mouseenter', () => {
        if (openMenu !== null && openMenu !== idx) open();
      });
      b.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const pop = open();
          const first = pop.querySelector('.menu-item:not([disabled])');
          if (first) first.focus();
        }
      });
      bar.append(b);
    });
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('.menu-pop') && !e.target.closest('.menubar-item')) closeMenus();
    });
  }

  // ─── Toolbox ───
  let flyout = null;

  function closeFlyout() {
    if (flyout) flyout.remove();
    flyout = null;
  }

  function initToolbar() {
    const box = $('toolbar');
    const groups = PW.tools.groups.filter(g => PW.tools.inGroup(g).length);
    const seps = new Set(['crop', 'eyedropper', 'dodge', 'shape']);
    for (const g of groups) {
      const tools = PW.tools.inGroup(g);
      const btn = el('button', { type: 'button', class: 'tool-btn', 'data-group': g });
      if (tools.length > 1) btn.classList.add('multi');
      const showFly = () => {
        closeFlyout();
        const r = btn.getBoundingClientRect();
        flyout = el('div', { class: 'tool-flyout', role: 'menu' }, tools.map(t => {
          const it = el('button', { type: 'button', class: 'fly-item', role: 'menuitemradio', 'aria-checked': String(app().toolId === t.id) }, [
            el('span', { class: 'fly-ic', html: PW.icon(t.icon, 18) }), el('span', { class: 'fly-name', text: t.name }), el('span', { class: 'mi-key', text: t.key }),
          ]);
          it.addEventListener('click', () => {
            app().setTool(t.id);
            closeFlyout();
          });
          return it;
        }));
        $('menu-layer').append(flyout);
        flyout.style.left = `${r.right + 4}px`;
        flyout.style.top = `${Math.min(r.top, innerHeight - flyout.offsetHeight - 8)}px`;
      };
      let pressTimer = 0;
      btn.addEventListener('pointerdown', () => {
        if (tools.length > 1) pressTimer = setTimeout(showFly, 450);
      });
      btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
      btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
      btn.addEventListener('click', () => {
        if (flyout) return;
        app().selectGroup(g, false);
      });
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (tools.length > 1) showFly();
      });
      box.append(btn);
      if (seps.has(g)) box.append(el('div', { class: 'tool-sep' }));
    }

    // Foreground / background colour chips
    const colors = el('div', { class: 'color-chips' }, [
      el('button', { type: 'button', class: 'chip-bg', id: 'chip-bg', title: 'Hintergrundfarbe festlegen', 'aria-label': 'Hintergrundfarbe festlegen' }),
      el('button', { type: 'button', class: 'chip-fg', id: 'chip-fg', title: 'Vordergrundfarbe festlegen', 'aria-label': 'Vordergrundfarbe festlegen' }),
      el('button', { type: 'button', class: 'chip-swap', title: 'Farben tauschen (X)', 'aria-label': 'Farben tauschen', html: PW.icon('swap-small', 12), onclick: () => app().swapColors() }),
      el('button', { type: 'button', class: 'chip-reset', title: 'Standardfarben (D)', 'aria-label': 'Standardfarben', html: PW.icon('reset', 12), onclick: () => app().resetColors() }),
    ]);
    box.append(colors);
    $('chip-fg').addEventListener('click', async () => {
      const c = await PW.dialogs.colorPicker(app().fg, 'Farbwähler (Vordergrundfarbe)');
      if (c) app().setFG(c);
    });
    $('chip-bg').addEventListener('click', async () => {
      const c = await PW.dialogs.colorPicker(app().bg, 'Farbwähler (Hintergrundfarbe)');
      if (c) app().setBG(c);
    });

    const sync = () => {
      const cur = PW.tools.byId[app().toolId];
      box.querySelectorAll('.tool-btn').forEach(b => {
        const g = b.dataset.group;
        const t = PW.tools.byId[app().groupChoice[g]] || PW.tools.inGroup(g)[0];
        b.innerHTML = PW.icon(t.icon, 20);
        b.title = `${t.name} (${t.key})${PW.guide && PW.guide.TOOL_HELP[t.id] ? `\n${PW.guide.TOOL_HELP[t.id]}` : ''}`;
        b.setAttribute('aria-label', t.name);
        b.setAttribute('aria-pressed', String(!!cur && cur.group === g));
      });
      $('chip-fg').style.background = app().fg;
      $('chip-bg').style.background = app().bg;
    };
    PW.bus.on('tool:changed', sync);
    PW.bus.on('color:changed', sync);
    document.addEventListener('pointerdown', e => {
      if (flyout && !e.target.closest('.tool-flyout') && !e.target.closest('.tool-btn')) closeFlyout();
    });
    sync();
  }

  // ─── Options bar ───
  let optCtls = [];

  function renderOptions() {
    const bar = $('optionsbar');
    const t = PW.tools.byId[app().toolId];
    bar.innerHTML = '';
    optCtls = [];
    if (!t) return;
    bar.append(el('div', { class: 'opt-tool', title: t.name, html: PW.icon(t.icon, 20) }));
    bar.append(el('div', { class: 'ctl-sep' }));
    const o = t.options;
    const change = (key, v) => {
      o[key] = v;
      if (t.onOption) t.onOption(key, v);
      if (key === 'size') app().updateCursor();
      refreshOptions();
      app().render();
    };
    for (const d of t.bar || []) {
      if (d.type === 'brush') {
        const size = PW.ui.control({ type: 'range', key: 'size', label: 'Größe', min: 1, max: 1000, unit: 'Px', log: true }, o.size, v => change('size', v));
        optCtls.push({ d: { key: 'size' }, c: size });
        bar.append(size);
        if (!d.noHardness) {
          const hard = PW.ui.control({ type: 'range', key: 'hardness', label: 'Härte', min: 0, max: 100, unit: '%' }, o.hardness, v => change('hardness', v));
          optCtls.push({ d: { key: 'hardness' }, c: hard });
          bar.append(hard);
        }
        continue;
      }
      if (d.type === 'action') {
        const b = el('button', { type: 'button', class: `btn small ${d.primary ? 'primary' : ''} ${d.icon && !d.label ? 'icon-only' : ''}`, title: d.title || d.label, 'aria-label': d.title || d.label, html: (d.icon ? PW.icon(d.icon, 16) : '') + (d.label ? `<span>${d.label}</span>` : '') });
        b.addEventListener('click', () => (d.run ? d.run() : PW.runAction(d.action)));
        const w = el('div', { class: 'ctl' }, b);
        optCtls.push({ d, c: w });
        bar.append(w);
        continue;
      }
      if (d.type === 'tnum') {
        const c = PW.ui.control(d, t.value(d.key), v => t.setValue(d.key, v));
        optCtls.push({ d, c, tnum: true });
        bar.append(c);
        continue;
      }
      const c = PW.ui.control(d, o[d.key], v => change(d.key, v));
      optCtls.push({ d, c });
      bar.append(c);
    }
    if (t.hint) bar.append(el('span', { class: 'hint', text: t.hint }));
    refreshOptions();
  }

  function refreshOptions() {
    const t = PW.tools.byId[app().toolId];
    if (!t) return;
    for (const { d, c, tnum } of optCtls) {
      if (d.showIf) c.hidden = !d.showIf(t.options);
      if (!c.update) continue;
      c.update(tnum ? t.value(d.key) : t.options[d.key]);
    }
  }

  // ─── Document tabs ───
  function renderTabs() {
    const tabs = $('tabs');
    tabs.innerHTML = '';
    for (const d of app().docs) {
      const zoom = d === app().doc ? app().view.zoom : d.view ? d.view.zoom : 1;
      const tab = el('div', { class: `doc-tab ${d === app().doc ? 'active' : ''}`, role: 'tab', 'aria-selected': String(d === app().doc), title: `${d.name} – ${d.width} × ${d.height} Px` }, [
        el('button', { type: 'button', class: 'tab-name', text: `${d.name} @ ${fmt(zoom * 100, zoom < 0.1 ? 1 : 0)} %${d.dirty ? ' *' : ''}`, onclick: () => app().setDoc(d) }),
        el('button', { type: 'button', class: 'tab-close', 'aria-label': `${d.name} schließen`, html: PW.icon('x', 12), onclick: e => {
          e.stopPropagation();
          app().closeDoc(d);
        } }),
      ]);
      tabs.append(tab);
    }
    $('start-screen').hidden = app().docs.length > 0;
  }

  // ─── Status bar ───
  function initStatus() {
    const zoomIn = $('status-zoom');
    zoomIn.addEventListener('change', () => {
      const v = parseFloat(String(zoomIn.value).replace(',', '.'));
      if (isFinite(v) && v > 0) app().view.setZoom(v / 100);
      zoomIn.blur();
    });
    zoomIn.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') zoomIn.dispatchEvent(new Event('change'));
    });
    const upd = () => {
      const v = app().view, d = app().doc;
      zoomIn.value = d ? `${fmt(v.zoom * 100, v.zoom < 0.1 ? 2 : 1)} %` : '';
      $('status-doc').textContent = d ? `${d.width} × ${d.height} Px` : '';
      renderTabs();
    };
    PW.bus.on('view:zoom', upd);
    PW.bus.on('doc:switched', upd);
    PW.bus.on('doc:resized', upd);
    PW.bus.on('doc:changed', renderTabs);
    PW.bus.on('docs:changed', upd);
    let raf = 0;
    PW.bus.on('cursor:moved', p => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const pos = $('status-pos'), col = $('status-color');
        if (!p || !app().doc) {
          pos.textContent = '';
          col.hidden = true;
          return;
        }
        pos.textContent = `X: ${Math.floor(p.x)}  Y: ${Math.floor(p.y)}`;
        const c = app().sampleColor(p.x, p.y, 1, true);
        col.hidden = !c;
        if (c) {
          const rgb = PW.util.hexToRgb(c);
          col.querySelector('i').style.background = c;
          col.querySelector('span').textContent = `R ${rgb.r}  G ${rgb.g}  B ${rgb.b}`;
        }
      });
    });
    PW.bus.on('tool:changed', t => ($('status-hint').textContent = t.name));
    upd();
  }

  // ─── Toasts & busy indicator ───
  function toast(msg) {
    const box = $('toasts');
    const t = el('div', { class: 'toast', role: 'status', text: msg });
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3000);
  }

  async function busy(fn) {
    const b = $('busy');
    b.hidden = false;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      return await fn();
    } finally {
      b.hidden = true;
    }
  }

  // ─── Theme & dock ───
  function theme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('pw-theme', t); } catch { /* storage is optional */ }
    if (app().view) app().view.readTheme();
  }

  function applySavedTheme() {
    let t = null;
    try { t = localStorage.getItem('pw-theme'); } catch { /* ignore */ }
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  }

  // Wide screens hide/show the docked panels; narrow screens slide them in as an overlay.
  function toggleDock() {
    if (matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('dock-open');
    else document.body.classList.toggle('dock-hidden');
    if (app().view) app().view.resize();
  }

  function initShell() {
    initMenubar();
    initToolbar();
    initStatus();
    PW.bus.on('tool:changed', renderOptions);
    PW.bus.on('options:refresh', refreshOptions);
    PW.bus.on('doc:switched', renderTabs);
    $('dock-toggle').addEventListener('click', toggleDock);
    $('claude-btn').addEventListener('click', () => PW.assistant.open());
    $('quick-btn').addEventListener('click', () => {
      PW.panels.showTab('quick');
      if (matchMedia('(max-width: 900px)').matches) document.body.classList.add('dock-open');
    });
    $('start-new').addEventListener('click', () => PW.runAction('file.new'));
    $('start-open').addEventListener('click', () => PW.runAction('file.open'));
    $('start-sample').addEventListener('click', () => PW.sample.create());
    $('start-library').addEventListener('click', () => PW.library.openDialog());
    renderOptions();
    renderTabs();
  }

  Object.assign(PW.ui, { initShell, closeMenus, toast, busy, theme, setTheme, applySavedTheme, toggleDock, renderTabs });
})(window.PW);
