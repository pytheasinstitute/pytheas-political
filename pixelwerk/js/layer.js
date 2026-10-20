// ─── Layer: one document-sized canvas plus properties, optional mask, text and styles ───
'use strict';

(function (PW) {
  const { createCanvas, uid, nextVersion, rectUnion } = PW.util;

  // [composite operation, German label]; null entries render as separators.
  const BLEND_MODES = [
    ['source-over', 'Normal'],
    null,
    ['darken', 'Abdunkeln'],
    ['multiply', 'Multiplizieren'],
    ['color-burn', 'Farbig nachbelichten'],
    null,
    ['lighten', 'Aufhellen'],
    ['screen', 'Negativ multiplizieren'],
    ['color-dodge', 'Farbig abwedeln'],
    null,
    ['overlay', 'Ineinanderkopieren'],
    ['soft-light', 'Weiches Licht'],
    ['hard-light', 'Hartes Licht'],
    null,
    ['difference', 'Differenz'],
    ['exclusion', 'Ausschluss'],
    null,
    ['hue', 'Farbton'],
    ['saturation', 'Sättigung'],
    ['color', 'Farbe'],
    ['luminosity', 'Luminanz'],
  ];

  const FONTS = [
    'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman',
    'Courier New', 'Impact', 'system-ui',
    'Montserrat', 'Playfair Display', 'Oswald', 'Bebas Neue', 'Lobster', 'Pacifico',
    'Merriweather', 'Roboto Slab', 'Caveat', 'Space Mono',
  ];

  function fontString(t) {
    const fam = /\s/.test(t.font) ? `"${t.font}"` : t.font;
    return `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.size}px ${fam}, sans-serif`;
  }

  class Layer {
    constructor(w, h, name = 'Ebene') {
      this.id = uid('L');
      this.name = name;
      this.canvas = createCanvas(w, h);
      this.ctx = this.canvas.getContext('2d');
      this.visible = true;
      this.opacity = 1;
      this.blend = 'source-over';
      this.locked = false;
      this.lockAlpha = false;
      this.type = 'raster';
      this.text = null;
      this.mask = null;
      this.maskEnabled = true;
      this.editMask = false;
      this.fx = null;
      // Adjustment layer: { id, params, fg, bg } — changes everything below it, through its mask.
      this.adjust = null;
      this.version = nextVersion();
      this.maskVersion = 0;
      // Tools set this to draw a live preview instead of the stored pixels.
      this.renderOverride = null;
      this._maskAlpha = null;
      this._maskAlphaVersion = -1;
      this._maskDirty = 'all';
    }

    get width() { return this.canvas.width; }
    get height() { return this.canvas.height; }
    get isText() { return this.type === 'text'; }
    get isAdjust() { return !!this.adjust; }

    touch() { this.version = nextVersion(); }

    touchMask(rect) {
      this.maskVersion = nextVersion();
      if (this._maskDirty !== 'all') this._maskDirty = rect ? rectUnion(this._maskDirty, rect) : 'all';
    }

    invalidateMask() {
      this._maskDirty = 'all';
      this._maskAlphaVersion = -1;
    }

    // Canvas that paint tools write to: the mask while it is being edited, else the pixels.
    // Adjustment layers have nothing to paint on but their mask.
    get target() { return (this.editMask || this.adjust) && this.mask ? this.mask : this.canvas; }
    get targetIsMask() { return !!((this.editMask || this.adjust) && this.mask); }

    markTarget(rect) {
      if (this.targetIsMask) this.touchMask(rect);
      else this.touch();
    }

    // ─── Mask ───
    addMask(selection, reveal = true) {
      this.mask = createCanvas(this.width, this.height);
      const g = this.mask.getContext('2d');
      if (selection && !selection.empty) {
        g.fillStyle = reveal ? '#000' : '#fff';
        g.fillRect(0, 0, this.width, this.height);
        const tmp = createCanvas(this.width, this.height);
        const tg = tmp.getContext('2d');
        tg.fillStyle = reveal ? '#fff' : '#000';
        tg.fillRect(0, 0, this.width, this.height);
        tg.globalCompositeOperation = 'destination-in';
        tg.drawImage(selection.mask, 0, 0);
        g.drawImage(tmp, 0, 0);
      } else {
        g.fillStyle = reveal ? '#fff' : '#000';
        g.fillRect(0, 0, this.width, this.height);
      }
      this.maskEnabled = true;
      this.editMask = true;
      this.invalidateMask();
      this.touchMask();
    }

    removeMask() {
      this.mask = null;
      this.editMask = false;
      this._maskAlpha = null;
      this.invalidateMask();
      this.touchMask();
    }

    // Mask as an alpha canvas (white = visible) for destination-in compositing.
    maskAlpha() {
      if (!this.mask) return null;
      if (this._maskAlphaVersion === this.maskVersion && this._maskAlpha) return this._maskAlpha;
      const w = this.width, h = this.height;
      if (!this._maskAlpha || this._maskAlpha.width !== w || this._maskAlpha.height !== h) {
        this._maskAlpha = createCanvas(w, h);
        this._maskDirty = 'all';
      }
      let r = this._maskDirty === 'all' || !this._maskDirty ? { x: 0, y: 0, w, h } : PW.util.clipRect(this._maskDirty, w, h);
      if (r) {
        const src = this.mask.getContext('2d').getImageData(r.x, r.y, r.w, r.h);
        const d = src.data;
        for (let i = 0; i < d.length; i += 4) {
          d[i + 3] = (d[i] * d[i + 3]) / 255;
          d[i] = d[i + 1] = d[i + 2] = 0;
        }
        this._maskAlpha.getContext('2d').putImageData(src, r.x, r.y);
      }
      this._maskDirty = null;
      this._maskAlphaVersion = this.maskVersion;
      return this._maskAlpha;
    }

    // ─── Text ───
    renderText() {
      if (!this.text) return;
      const t = this.text, g = this.ctx;
      g.clearRect(0, 0, this.width, this.height);
      g.save();
      g.font = fontString(t);
      g.fillStyle = t.color;
      g.textAlign = t.align || 'left';
      g.textBaseline = 'alphabetic';
      if ('letterSpacing' in g) g.letterSpacing = `${t.tracking || 0}px`;
      const lh = t.size * (t.leading || 1.2);
      t.content.split('\n').forEach((line, i) => g.fillText(line, t.x, t.y + t.size * 0.86 + i * lh));
      g.restore();
      this.touch();
    }

    textBounds() {
      if (!this.text) return null;
      const t = this.text, g = this.ctx;
      g.save();
      g.font = fontString(t);
      if ('letterSpacing' in g) g.letterSpacing = `${t.tracking || 0}px`;
      const lines = t.content.split('\n');
      const w = Math.max(t.size * 0.3, ...lines.map(l => g.measureText(l).width));
      g.restore();
      const h = lines.length * t.size * (t.leading || 1.2);
      const x = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x;
      return { x, y: t.y, w, h };
    }

    rasterize() {
      if (!this.isText) return;
      this.type = 'raster';
      this.text = null;
      this.touch();
    }

    // ─── Serialisation (project files; "Meine Bilder" stores the pixels itself) ───
    async serialize(withPixels = true) {
      return {
        name: this.name,
        visible: this.visible,
        opacity: this.opacity,
        blend: this.blend,
        locked: this.locked,
        lockAlpha: this.lockAlpha,
        type: this.type,
        text: this.text ? { ...this.text } : null,
        fx: this.fx ? JSON.parse(JSON.stringify(this.fx)) : null,
        adjust: this.adjust ? JSON.parse(JSON.stringify(this.adjust)) : null,
        maskEnabled: this.maskEnabled,
        pixels: withPixels ? this.canvas.toDataURL('image/png') : null,
        mask: withPixels && this.mask ? this.mask.toDataURL('image/png') : null,
      };
    }

    static async deserialize(data, w, h) {
      const L = new Layer(w, h, data.name);
      Object.assign(L, {
        visible: data.visible !== false,
        opacity: data.opacity ?? 1,
        blend: data.blend || 'source-over',
        locked: !!data.locked,
        lockAlpha: !!data.lockAlpha,
        type: data.type === 'text' ? 'text' : 'raster',
        text: data.text || null,
        fx: data.fx || null,
        adjust: data.adjust || null,
        maskEnabled: data.maskEnabled !== false,
      });
      if (data.pixels) L.ctx.drawImage(await PW.util.loadImage(data.pixels), 0, 0);
      if (data.mask) {
        L.mask = createCanvas(w, h);
        L.mask.getContext('2d').drawImage(await PW.util.loadImage(data.mask), 0, 0);
        L.touchMask();
      }
      if (L.isText) {
        await PW.fonts.ensure(L.text.font);
        L.renderText();
      }
      L.touch();
      return L;
    }
  }

  // Lazy Google-font loading for the text tool; falls back silently when offline.
  // Axis specs must match what each family really ships, or Google rejects the whole request.
  const WEB_FONT_AXES = {
    'Montserrat': ':ital,wght@0,400;0,700;1,400;1,700',
    'Playfair Display': ':ital,wght@0,400;0,700;1,400;1,700',
    'Oswald': ':wght@400;700',
    'Bebas Neue': '',
    'Lobster': '',
    'Pacifico': '',
    'Merriweather': ':ital,wght@0,400;0,700;1,400;1,700',
    'Roboto Slab': ':wght@400;700',
    'Caveat': ':wght@400;700',
    'Space Mono': ':ital,wght@0,400;0,700;1,400;1,700',
  };
  const WEB_FONTS = Object.keys(WEB_FONT_AXES);
  let fontsRequested = false;
  PW.fonts = {
    request() {
      if (fontsRequested) return;
      fontsRequested = true;
      const fams = WEB_FONTS.map(f => 'family=' + f.replace(/ /g, '+') + WEB_FONT_AXES[f]).join('&');
      document.head.append(PW.util.el('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?${fams}&display=swap` }));
    },
    async ensure(font) {
      if (!WEB_FONTS.includes(font)) return;
      this.request();
      try {
        await Promise.race([
          Promise.all([document.fonts.load(`400 40px "${font}"`), document.fonts.load(`700 40px "${font}"`)]),
          new Promise(r => setTimeout(r, 2500)),
        ]);
      } catch { /* offline: canvas falls back to sans-serif */ }
    },
  };

  PW.Layer = Layer;
  PW.BLEND_MODES = BLEND_MODES;
  PW.FONTS = FONTS;
  PW.fontString = fontString;
})(window.PW);
