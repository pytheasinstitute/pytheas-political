// ─── Boot: wire up the shell and open a sample document ───
'use strict';

(function (PW) {
  // A layered demo scene, so the first view shows what the editor does.
  async function createSample() {
    const W = 1600, H = 1000;
    const doc = new PW.Doc(W, H, 'Beispiel');
    doc.isSample = true;
    const layer = name => {
      const L = new PW.Layer(W, H, name);
      doc.layers.push(L);
      return L;
    };

    const sky = layer('Hintergrund');
    let g = sky.ctx;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0e1d45');
    grad.addColorStop(0.38, '#38407e');
    grad.addColorStop(0.62, '#c9677a');
    grad.addColorStop(0.74, '#f4a76a');
    grad.addColorStop(1, '#fbd38d');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H * 0.45, r = rnd() * 1.4 + 0.3;
      g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6 * (1 - y / (H * 0.45))})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    sky.touch();

    const sun = layer('Sonne');
    g = sun.ctx;
    const sg = g.createRadialGradient(1080, 600, 0, 1080, 600, 120);
    sg.addColorStop(0, '#fff6d8');
    sg.addColorStop(0.8, '#ffd27a');
    sg.addColorStop(1, '#ffb65c');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(1080, 600, 120, 0, Math.PI * 2);
    g.fill();
    sun.fx = { glow: { ...PW.FX_DEFAULTS.glow, enabled: true, color: '#ffb35a', opacity: 0.85, size: 90 } };
    sun.touch();

    const ridge = (L, base, amp, freq, color, seed) => {
      const noise = PW.filters.makeNoise(seed), c = L.ctx;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        let v = 0, a = 1, f = freq;
        for (let o = 0; o < 5; o++) {
          v += (noise(x * f, seed) - 0.5) * a;
          a *= 0.5;
          f *= 2.1;
        }
        c.lineTo(x, base + v * amp);
      }
      c.lineTo(W, H);
      c.closePath();
      c.fill();
      L.touch();
    };
    ridge(layer('Berge hinten'), 690, 330, 0.0022, '#4a3a6e', 11);
    ridge(layer('Berge vorne'), 820, 260, 0.003, '#1d1934', 29);

    const title = layer('Pixelwerk');
    title.type = 'text';
    title.text = { content: 'Pixelwerk', font: 'Montserrat', size: 150, bold: true, italic: false, align: 'left', color: '#ffffff', x: 110, y: 120, leading: 1.1 };
    title.fx = { shadow: { ...PW.FX_DEFAULTS.shadow, enabled: true, opacity: 0.45, distance: 10, size: 24 } };
    const sub = layer('Bildbearbeitung im Browser');
    sub.type = 'text';
    sub.text = { content: 'Bildbearbeitung im Browser', font: 'Montserrat', size: 46, bold: false, italic: false, align: 'left', color: '#f3e7ff', x: 118, y: 300, leading: 1.2 };
    sub.opacity = 0.9;
    title.renderText();
    sub.renderText();

    doc.layerCounter = 0;
    doc.activeId = title.id;
    PW.app.addDoc(doc, 'Öffnen');
    doc.dirty = false;

    // Re-render text once the web font arrives (offline: stays on the fallback face).
    await PW.fonts.ensure('Montserrat');
    title.renderText();
    sub.renderText();
    if (doc.history.states.length === 1) doc.history.states[0].snap = doc.capture(null);
    PW.bus.emit('layers:changed', doc);
    PW.app.render();
    return doc;
  }

  function boot() {
    PW.ui.applySavedTheme();
    const view = new PW.View(document.getElementById('workspace'));
    PW.app.view = view;
    PW.ui.initShell();
    PW.panels.init();
    PW.io.init();
    PW.initKeys();
    PW.guide.init();
    PW.assistant.init();
    PW.app.setTool('brush');
    PW.sample.create().then(() => PW.guide.maybeStartTour());
    window.addEventListener('resize', () => PW.ui.closeMenus());
    document.documentElement.classList.add('ready');
  }

  PW.sample = { create: createSample };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.PW);
