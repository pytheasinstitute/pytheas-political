// ─── Shared form controls for the options bar and dialogs ───
'use strict';

(function (PW) {
  const { el, clamp, fmt } = PW.util;
  let idc = 0;
  const nextId = prefix => `${prefix}-${++idc}`;

  // Scrubby labels: dragging a label left/right changes the value, like Photoshop.
  function scrubby(label, input, def, set) {
    label.classList.add('scrub');
    label.addEventListener('pointerdown', e => {
      e.preventDefault();
      const start = e.clientX, v0 = Number(input.value) || 0, step = def.step || 1;
      const range = (def.max ?? 100) - (def.min ?? 0);
      const k = range > 400 ? step * Math.max(1, range / 400) : step;
      const move = ev => set(clamp(v0 + Math.round((ev.clientX - start) / 2) * k, def.min ?? -Infinity, def.max ?? Infinity), false);
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        set(Number(input.value), true);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  const decimals = step => (String(step || 1).split('.')[1] || '').length;

  // def: {type, key, label, min, max, step, unit, options, gradient, title}
  // onChange(value, final) — final is true when the user lets go.
  function control(def, value, onChange) {
    const id = nextId(def.key || def.type);
    const wrap = el('div', { class: `ctl ctl-${def.type}`, title: def.title || null });

    if (def.type === 'range' || def.type === 'number' || def.type === 'tnum') {
      const dec = decimals(def.step);
      const label = def.label ? el('label', { for: id, text: def.label }) : null;
      const num = el('input', { id, type: 'number', class: 'num', min: def.min, max: def.max, step: def.step || (def.type === 'tnum' ? 0.1 : 1) });
      num.value = Number(value).toFixed(dec);
      let slider = null;
      const set = (v, final) => {
        if (!isFinite(v)) return;
        if (def.type !== 'tnum') v = clamp(v, def.min ?? -Infinity, def.max ?? Infinity);
        v = Number(Number(v).toFixed(def.type === 'tnum' ? 1 : dec));
        num.value = v;
        if (slider) slider.value = slider.toPos(v);
        onChange(v, final);
      };
      if (label) {
        wrap.append(label);
        scrubby(label, num, def, set);
      }
      if (def.type === 'range') {
        // Wide ranges (radius 0.1–250, size 1–1000) use a logarithmic slider so small values stay reachable.
        const log = def.log && def.min > 0;
        const toPos = v => (log ? (Math.log(v / def.min) / Math.log(def.max / def.min)) * 1000 : v);
        const fromPos = t => (log ? def.min * Math.pow(def.max / def.min, t / 1000) : t);
        slider = el('input', { type: 'range', min: log ? 0 : def.min, max: log ? 1000 : def.max, step: log ? 1 : def.step || 1, 'aria-label': def.label || def.key, class: def.gradient ? `grad-${def.gradient}` : null });
        slider.value = toPos(value);
        const fromSlider = () => {
          const v = fromPos(Number(slider.value));
          return log ? Number(v.toFixed(dec)) : v;
        };
        slider.addEventListener('input', () => set(fromSlider(), false));
        slider.addEventListener('change', () => set(fromSlider(), true));
        slider.toPos = toPos;
        wrap.append(slider);
      }
      num.addEventListener('change', () => set(Number(num.value), true));
      num.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          set(Number(num.value), true);
          num.blur();
        }
        e.stopPropagation();
      });
      wrap.append(num);
      if (def.unit) wrap.append(el('span', { class: 'unit', text: def.unit }));
      wrap.update = v => {
        const s = def.type === 'tnum' ? Number(v).toFixed(1) : Number(v).toFixed(dec);
        if (document.activeElement !== num) num.value = s;
        if (slider) slider.value = slider.toPos(v);
      };
      return wrap;
    }

    if (def.type === 'select') {
      if (def.label) wrap.append(el('label', { for: id, text: def.label }));
      const opts = typeof def.options === 'function' ? def.options() : def.options;
      const sel = el('select', { id });
      if (def.width) sel.style.width = def.width + 'px';
      opts.forEach(([v, text], i) => {
        const o = el('option', { value: String(i), text });
        if (def.fontPreview) o.style.fontFamily = `"${v}", sans-serif`;
        sel.append(o);
      });
      const indexOf = v => Math.max(0, opts.findIndex(o => o[0] === v));
      sel.value = String(indexOf(value));
      sel.addEventListener('change', () => onChange(opts[Number(sel.value)][0], true));
      sel.addEventListener('keydown', e => e.stopPropagation());
      wrap.append(sel);
      wrap.update = v => (sel.value = String(indexOf(v)));
      return wrap;
    }

    if (def.type === 'check') {
      const cb = el('input', { id, type: 'checkbox' });
      cb.checked = !!value;
      cb.addEventListener('change', () => onChange(cb.checked, true));
      wrap.append(cb, el('label', { for: id, text: def.label }));
      wrap.update = v => (cb.checked = !!v);
      return wrap;
    }

    if (def.type === 'toggle') {
      const b = el('button', { type: 'button', class: 'tbtn', title: def.title, html: PW.icon(def.icon, 16), 'aria-pressed': String(!!value) });
      b.addEventListener('click', () => {
        const v = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(v));
        onChange(v, true);
      });
      wrap.append(b);
      wrap.update = v => b.setAttribute('aria-pressed', String(!!v));
      return wrap;
    }

    if (def.type === 'buttons') {
      const group = el('div', { class: 'seg', role: 'group' });
      const btns = def.options.map(([v, icon, title]) => {
        const b = el('button', { type: 'button', class: 'tbtn', title, 'aria-label': title, html: PW.icon(icon, 16), 'aria-pressed': String(v === value) });
        b.addEventListener('click', () => {
          btns.forEach(x => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
          onChange(v, true);
        });
        group.append(b);
        return b;
      });
      if (def.label) wrap.append(el('span', { class: 'lbl', text: def.label }));
      wrap.append(group);
      wrap.update = v => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(def.options[i][0] === v)));
      return wrap;
    }

    if (def.type === 'color') {
      if (def.label) wrap.append(el('span', { class: 'lbl', text: def.label }));
      const sw = el('button', { type: 'button', class: 'swatch-btn', title: def.title || 'Farbe wählen', 'aria-label': def.title || def.label || 'Farbe wählen' });
      sw.style.background = value;
      sw.addEventListener('click', async () => {
        const c = await PW.dialogs.colorPicker(sw.dataset.value || value, def.title || def.label || 'Farbe wählen');
        if (c) {
          sw.dataset.value = c;
          sw.style.background = c;
          onChange(c, true);
        }
      });
      sw.dataset.value = value;
      wrap.append(sw);
      wrap.update = v => {
        sw.dataset.value = v;
        sw.style.background = v;
      };
      return wrap;
    }

    if (def.type === 'hint') {
      wrap.append(el('span', { class: 'hint', text: def.text }));
      return wrap;
    }

    if (def.type === 'sep') {
      wrap.className = 'ctl-sep';
      return wrap;
    }

    return wrap;
  }

  PW.ui = PW.ui || {};
  PW.ui.control = control;
  PW.ui.fmt = fmt;
})(window.PW);
