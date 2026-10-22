// ─── Local AI: small neural networks that run on this device ───
// U²-Netp finds the main subject of a photo, MobileSAM ("Segment Anything") cuts out whatever is
// clicked or framed, MI-GAN repaints removed areas. They run with ONNX Runtime (WebAssembly) in a
// worker, so the page stays responsive. The models are published next to the page as base64 text
// with float16 weights (half the download) and kept in IndexedDB after the first download.
// Nothing is sent anywhere: pictures never leave the device.
'use strict';

(function (PW) {
  const { createCanvas, clamp, el } = PW.util;
  const ORT_VERSION = '1.23.2';
  const ortUrl = () => window.PW_ORT_URL || `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.wasm.bundle.min.mjs`;
  const BASE = 'ai/';
  const FEATURES = {
    subject: { models: ['u2netp', 'sam-enc', 'sam-dec'], label: 'Motiv- und Objekterkennung' },
    object: { models: ['sam-enc', 'sam-dec'], label: 'Objekterkennung' },
    remove: { models: ['migan'], label: 'KI-Entfernen' },
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* optional */ } },
  };

  // ─── Worker: ONNX Runtime + float16 → float32 expansion of the packed weights ───
  const WORKER = ort => `
import * as ort from ${JSON.stringify(ort)};
const sessions = {};
const F16 = new Float32Array(65536);
for (let h = 0; h < 65536; h++) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  F16[h] = e === 0 ? s * f * 5.960464477539063e-8 : e === 31 ? (f ? NaN : s * Infinity) : s * (1 + f / 1024) * Math.pow(2, e - 15);
}
function expand(man, bytes) {
  const w = new Uint8Array(man.weights), g = man.graph;
  for (const [off, len, kind, pos, full] of man.segs) {
    const at = g + off;
    if (kind === 1) {
      const out = new Float32Array(w.buffer, pos, full / 4);
      for (let k = 0, j = at; k < out.length; k++, j += 2) out[k] = F16[bytes[j] | (bytes[j + 1] << 8)];
    } else w.set(bytes.subarray(at, at + len), pos);
  }
  return { graph: bytes.slice(0, g), weights: w };
}
self.onmessage = async e => {
  const { id, cmd } = e.data;
  try {
    if (cmd === 'init') {
      ort.env.wasm.wasmBinary = e.data.wasm;
      ort.env.logLevel = 'error';
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      self.postMessage({ id, ok: true });
    } else if (cmd === 'load') {
      if (!sessions[e.data.name]) {
        const { graph, weights } = expand(e.data.man, e.data.bytes);
        sessions[e.data.name] = await ort.InferenceSession.create(graph, {
          executionProviders: ['wasm'], graphOptimizationLevel: 'all',
          externalData: [{ path: 'w.bin', data: weights }],
        });
      }
      self.postMessage({ id, ok: true });
    } else if (cmd === 'run') {
      const feeds = {};
      for (const [k, t] of Object.entries(e.data.feeds)) feeds[k] = new ort.Tensor(t.type, t.data, t.dims);
      const r = await sessions[e.data.name].run(feeds), out = {}, tr = [];
      for (const [k, t] of Object.entries(r)) {
        const data = t.data.slice();
        out[k] = { type: t.type, data, dims: t.dims };
        tr.push(data.buffer);
      }
      self.postMessage({ id, ok: true, out }, tr);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
self.postMessage({ id: 0, ok: true });
`;

  let worker = null, workerReady = null, seq = 1, index = null, indexTried = null, broken = null;
  const pending = new Map(), loaded = new Set(), loading = new Map();

  function call(cmd, args = {}, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = seq++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, cmd, ...args }, transfer);
    });
  }

  function startWorker() {
    if (workerReady) return workerReady;
    workerReady = new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([WORKER(ortUrl())], { type: 'text/javascript' }));
      worker = new Worker(url, { type: 'module' });
      const timer = setTimeout(() => reject(new Error('Die KI-Laufzeit hat nicht geantwortet.')), 60000);
      worker.onmessage = e => {
        const { id, ok, out, error } = e.data;
        if (id === 0) {
          clearTimeout(timer);
          return resolve();
        }
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (ok) p.resolve(out);
        else p.reject(new Error(error));
      };
      worker.onerror = e => {
        clearTimeout(timer);
        reject(new Error(e.message || 'Die KI-Laufzeit konnte nicht starten.'));
      };
    });
    return workerReady;
  }

  // ─── Downloads: manifest list, base64 chunks, IndexedDB cache ───
  async function getIndex() {
    if (index) return index;
    if (!indexTried) {
      indexTried = fetch(BASE + 'index.json', { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null)
        .then(j => (index = j && j.packs ? j : null));
    }
    return indexTried;
  }

  function idb() {
    return new Promise(resolve => {
      try {
        const rq = indexedDB.open('pixelwerk-ai', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('packs');
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  async function cacheGet(key) {
    const db = await idb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const rq = db.transaction('packs').objectStore('packs').get(key);
        rq.onsuccess = () => resolve(rq.result || null);
        rq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  async function cachePut(key, bytes) {
    const db = await idb();
    if (!db) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('packs', 'readwrite');
        tx.objectStore('packs').put(bytes, key);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  async function cacheClear() {
    const db = await idb();
    if (!db) return;
    await new Promise(resolve => {
      try {
        const tx = db.transaction('packs', 'readwrite');
        tx.objectStore('packs').clear();
        tx.oncomplete = tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  function fromBase64(s) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(s);
    const b = atob(s), out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }

  // Packed bytes of one pack (graph + float16 weights, or the plain runtime binary).
  async function packBytes(name, onBytes) {
    const man = index.packs[name], key = `${name}@${man.sha}`;
    const hit = await cacheGet(key);
    if (hit && hit.byteLength === man.bytes) {
      onBytes(man.bytes);
      return new Uint8Array(hit);
    }
    const out = new Uint8Array(man.bytes);
    let at = 0;
    for (let i = 0; i < man.chunks; i++) {
      const r = await fetch(`${BASE}${name}-${i}.txt`);
      if (!r.ok) throw new Error(`KI-Datei fehlt (${name}).`);
      const part = fromBase64((await r.text()).trim());
      out.set(part, at);
      at += part.length;
      onBytes(at);
    }
    if (at !== man.bytes) throw new Error(`KI-Datei ist unvollständig (${name}).`);
    await cachePut(key, out.buffer);
    return out;
  }

  const mb = n => `${Math.max(1, Math.round(n / 1e6))} MB`;

  // ─── Public: is a feature usable, ask once, load what it needs ───
  const consent = () => store.get('pw-ai');
  async function available(feature) {
    if (broken || typeof WebAssembly !== 'object' || typeof Worker !== 'function') return false;
    const ix = await getIndex();
    return !!ix && FEATURES[feature].models.every(m => ix.packs[m]);
  }
  const isReady = feature => !broken && FEATURES[feature].models.every(m => loaded.has(m));
  const enabled = () => consent() === 'on';

  function downloadSize(feature) {
    const names = ['ort', ...FEATURES[feature].models].filter(n => !loaded.has(n));
    return names.reduce((s, n) => s + (index.packs[n] ? index.packs[n].bytes : 0), 0);
  }

  async function askConsent(feature) {
    const res = await PW.dialogs.modal({
      title: 'KI auf deinem Gerät',
      width: 460,
      content: el('div', { class: 'ai-consent' }, [
        el('p', { class: 'dlg-text', text: `Für bessere Ergebnisse kann Pixelwerk kleine KI-Modelle laden (${FEATURES[feature].label}, einmalig etwa ${mb(downloadSize(feature))}).` }),
        el('p', { class: 'dlg-text', text: 'Sie laufen komplett auf deinem Gerät – deine Bilder werden nirgendwohin geschickt. Du kannst das jederzeit unter Bearbeiten › KI auf diesem Gerät ändern.' }),
      ]),
      buttons: [['ok', 'KI verwenden', true], ['no', 'Ohne KI']],
    });
    if (res === 'ok') store.set('pw-ai', 'on');
    else if (res === 'no') store.set('pw-ai', 'off');
    return res === 'ok';
  }

  async function loadPack(name, onBytes) {
    if (loaded.has(name)) return;
    if (!loading.has(name)) {
      loading.set(name, (async () => {
        const bytes = await packBytes(name, onBytes);
        if (name === 'ort') {
          await startWorker();
          await call('init', { wasm: bytes.buffer }, [bytes.buffer]);
        } else {
          await loadPack('ort', () => {});
          await call('load', { name, man: index.packs[name], bytes }, [bytes.buffer]);
        }
        loaded.add(name);
      })().finally(() => loading.delete(name)));
    }
    return loading.get(name);
  }

  // Makes `feature` ready. Asks once (opts.ask false: only if already allowed), shows progress.
  // Resolves false when the feature cannot or should not be used; callers then use the classic way.
  async function ensure(feature, opts = {}) {
    if (isReady(feature)) return true;
    if (!(await available(feature))) return false;
    let ok = consent() === 'on';
    if (!ok && consent() !== 'off' && opts.ask !== false) ok = await askConsent(feature);
    if (!ok) return false;
    const names = ['ort', ...FEATURES[feature].models].filter(n => !loaded.has(n));
    const total = names.reduce((s, n) => s + index.packs[n].bytes, 0), got = {};
    const show = () => {
      const sum = Object.values(got).reduce((a, b) => a + b, 0);
      PW.ui.busyText(`KI wird geladen … ${Math.round((sum / total) * 100)} %`);
    };
    const quiet = opts.quiet;
    const work = async () => {
      for (const n of names) {
        await loadPack(n, b => {
          got[n] = b;
          if (!quiet) show();
        });
        got[n] = index.packs[n].bytes;
        if (!quiet) PW.ui.busyText(n === names[names.length - 1] ? 'KI wird gestartet …' : 'KI wird geladen …');
      }
    };
    try {
      if (quiet) await work();
      else await PW.ui.busy(work, 'KI wird geladen …');
      return true;
    } catch (e) {
      broken = e.message || String(e);
      console.warn('Pixelwerk KI:', broken);
      if (!quiet) PW.app.toast('Die KI konnte nicht geladen werden – Pixelwerk arbeitet ohne sie weiter.');
      return false;
    }
  }

  const run = (name, feeds) => call('run', { name, feeds }, Object.values(feeds).map(f => f.data.buffer));

  // ─── Pictures → tensors ───
  // The visible picture (on white) scaled to w × h.
  function pixels(src, w, h) {
    const c = createCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  }
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  function normalized(d, w, h, size = w, sizeH = h) {
    const t = new Float32Array(3 * size * sizeH), plane = size * sizeH;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const j = (y * w + x) * 4, o = y * size + x;
        for (let c = 0; c < 3; c++) t[c * plane + o] = (d[j + c] / 255 - MEAN[c]) / STD[c];
      }
    }
    return t;
  }

  // ─── Subject: U²-Netp saliency, 0–1 at 320 × 320 ───
  async function saliency(src) {
    const d = pixels(src, 320, 320);
    const out = await run('u2netp', { 'input.1': { type: 'float32', data: normalized(d, 320, 320), dims: [1, 3, 320, 320] } });
    const s = Object.values(out)[0].data;
    let lo = Infinity, hi = -Infinity;
    for (const v of s) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const k = hi > lo ? 1 / (hi - lo) : 0, r = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) r[i] = (s[i] - lo) * k;
    return r;
  }

  // ─── Segment Anything: one embedding per picture state, then fast prompts ───
  let emb = null;
  async function embed(src, key) {
    if (emb && emb.key === key && emb.W === src.width && emb.H === src.height) return emb;
    if (emb && emb.pending && emb.key === key) return emb.pending;
    const W = src.width, H = src.height, r = 1024 / Math.max(W, H), w = Math.round(W * r), h = Math.round(H * r);
    const job = (async () => {
      const t = normalized(pixels(src, w, h), w, h, 1024, 1024);
      const out = await run('sam-enc', { x: { type: 'float32', data: t, dims: [1, 3, 1024, 1024] } });
      const e = { key, W, H, w, h, r, data: out.image_embeddings.data };
      if (emb && emb.pending === job) emb = e;
      return e;
    })();
    emb = { key, W, H, pending: job };
    try {
      return await job;
    } catch (err) {
      if (emb && emb.pending === job) emb = null;
      throw err;
    }
  }
  const embedded = key => !!(emb && emb.key === key && emb.data);

  // points: [[x, y], …] in picture px, labels: 1 = object, 0 = not; box: {x,y,w,h} picture px.
  // Returns { mask: Uint8Array (w × h of the embedding: 0/1), w, h, score } with the best of SAM's answers.
  async function segment(e, points = [], labels = [], box = null, opts = {}) {
    const pc = [], pl = [];
    points.forEach(([x, y], i) => {
      pc.push(x * e.r, y * e.r);
      pl.push(labels[i]);
    });
    if (box) {
      pc.push(box.x * e.r, box.y * e.r, (box.x + box.w) * e.r, (box.y + box.h) * e.r);
      pl.push(2, 3);
    } else {
      pc.push(0, 0);
      pl.push(-1);
    }
    const out = await run('sam-dec', {
      image_embeddings: { type: 'float32', data: e.data.slice(), dims: [1, 256, 64, 64] },
      point_coords: { type: 'float32', data: new Float32Array(pc), dims: [1, pl.length, 2] },
      point_labels: { type: 'float32', data: new Float32Array(pl), dims: [1, pl.length] },
      mask_input: { type: 'float32', data: new Float32Array(256 * 256), dims: [1, 1, 256, 256] },
      has_mask_input: { type: 'float32', data: new Float32Array([0]), dims: [1] },
      orig_im_size: { type: 'float32', data: new Float32Array([e.h, e.w]), dims: [2] },
    });
    const m = out.masks, iou = out.iou_predictions.data, [, k, h, w] = m.dims, plane = w * h;
    // One click is ambiguous (part / object / whole): SAM's three answers, the best rated wins.
    // With a box or several points the single answer is meant.
    let pick = 0;
    if (opts.choose) pick = opts.choose(i => m.data.subarray(i * plane, (i + 1) * plane), iou, w, h);
    else if (points.length === 1 && !box) {
      pick = 1;
      for (let i = 2; i < k; i++) if (iou[i] > iou[pick]) pick = i;
    }
    const logits = m.data.subarray(pick * plane, (pick + 1) * plane), mask = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) mask[i] = logits[i] > 0 ? 1 : 0;
    return { mask, w, h, score: iou[pick] };
  }

  // ─── Whole subject: saliency finds it, SAM cuts it out exactly ───
  // Returns { mask (0/1), w, h } at the embedding size, or null when nothing stands out.
  async function subject(src, key) {
    const sal = await saliency(src), S = 320;
    const bin = new Uint8Array(S * S);
    let n = 0;
    for (let i = 0; i < bin.length; i++) n += bin[i] = sal[i] > 0.5 ? 1 : 0;
    if (n < S * S * 0.004) return null;
    const comps = components(bin, S, S).filter((c, i, all) => c.area >= all[0].area * 0.15);
    const keep = new Uint8Array(S * S);
    let x0 = S, y0 = S, x1 = 0, y1 = 0;
    for (const c of comps) {
      for (const i of c.pixels) keep[i] = 1;
      x0 = Math.min(x0, c.x0); y0 = Math.min(y0, c.y0); x1 = Math.max(x1, c.x1); y1 = Math.max(y1, c.y1);
    }
    const e = await embed(src, key), fx = e.W / S, fy = e.H / S;
    // Deepest inside point of each part: tells SAM what belongs to the subject.
    const inv = Uint8Array.from(keep, v => 1 - v), d2 = PW.distanceField(inv, S, S);
    const points = comps.slice(0, 3).map(c => {
      let best = c.pixels[0];
      for (const i of c.pixels) if (d2[i] > d2[best]) best = i;
      return [((best % S) + 0.5) * fx, (Math.floor(best / S) + 0.5) * fy];
    });
    const pad = 0.02;
    const box = {
      x: clamp((x0 - S * pad) * fx, 0, e.W), y: clamp((y0 - S * pad) * fy, 0, e.H),
      w: 0, h: 0,
    };
    box.w = clamp((x1 + 1 + S * pad) * fx, 0, e.W) - box.x;
    box.h = clamp((y1 + 1 + S * pad) * fy, 0, e.H) - box.y;
    // Of SAM's answers take the one that agrees best with the saliency map.
    const choose = (maskOf, iou, w, h) => {
      let best = 0, bestScore = -1;
      for (let i = 0; i < iou.length; i++) {
        const m = maskOf(i);
        let inter = 0, uni = 0;
        for (let y = 0; y < h; y += 2) {
          const sy = Math.min(S - 1, Math.floor((y / h) * S));
          for (let x = 0; x < w; x += 2) {
            const a = m[y * w + x] > 0, b = keep[sy * S + Math.min(S - 1, Math.floor((x / w) * S))] === 1;
            if (a && b) inter++;
            if (a || b) uni++;
          }
        }
        const score = (uni ? inter / uni : 0) * 0.8 + iou[i] * 0.2;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      return best;
    };
    const r = await segment(e, points, points.map(() => 1), box, { choose });
    let cnt = 0;
    for (const v of r.mask) cnt += v;
    return cnt > r.mask.length * 0.002 ? r : null;
  }

  // Connected parts of a 0/1 mask, biggest first: { area, pixels, x0, y0, x1, y1 }.
  function components(bin, w, h) {
    const lab = new Int32Array(w * h), out = [], stack = [];
    for (let s = 0; s < bin.length; s++) {
      if (!bin[s] || lab[s]) continue;
      const c = { area: 0, pixels: [], x0: w, y0: h, x1: 0, y1: 0 };
      lab[s] = out.length + 1;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i / w) | 0;
        c.area++;
        c.pixels.push(i);
        if (x < c.x0) c.x0 = x;
        if (y < c.y0) c.y0 = y;
        if (x > c.x1) c.x1 = x;
        if (y > c.y1) c.y1 = y;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && bin[j] && !lab[j]) {
            lab[j] = lab[s];
            stack.push(j);
          }
        }
      }
      out.push(c);
    }
    return out.sort((a, b) => b.area - a.area);
  }

  // ─── MI-GAN: repaint the hole of an RGBA area; returns RGBA (Uint8ClampedArray) ───
  async function inpaint(data, w, h, hole) {
    const n = w * h, img = new Uint8Array(3 * n), mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      img[i] = data[i * 4];
      img[n + i] = data[i * 4 + 1];
      img[2 * n + i] = data[i * 4 + 2];
      mask[i] = hole[i] ? 0 : 255;
    }
    const out = await run('migan', {
      image: { type: 'uint8', data: img, dims: [1, 3, h, w] },
      mask: { type: 'uint8', data: mask, dims: [1, 1, h, w] },
    });
    const r = out.result.data, res = new Uint8ClampedArray(data);
    for (let i = 0; i < n; i++) {
      if (!hole[i]) continue;
      res[i * 4] = r[i];
      res[i * 4 + 1] = r[n + i];
      res[i * 4 + 2] = r[2 * n + i];
    }
    return res;
  }

  // ─── Settings dialog (Bearbeiten › KI auf diesem Gerät) ───
  async function settings() {
    const ix = await getIndex();
    const on = consent() === 'on';
    const status = !ix ? 'Die KI-Modelle sind in dieser Ausgabe von Pixelwerk nicht enthalten.'
      : broken ? `Die KI konnte nicht gestartet werden (${broken}).`
        : on ? `Eingeschaltet. ${loaded.size > 1 ? 'Geladen: ' + Object.keys(FEATURES).filter(isReady).map(f => FEATURES[f].label).join(', ') + '.' : 'Die Modelle werden beim ersten Gebrauch geladen.'}`
          : 'Ausgeschaltet: Pixelwerk nimmt die klassischen Verfahren.';
    const total = ix ? Object.values(ix.packs).reduce((s, p) => s + p.bytes, 0) : 0;
    const res = await PW.dialogs.modal({
      title: 'KI auf diesem Gerät',
      width: 480,
      content: el('div', {}, [
        el('p', { class: 'dlg-text', text: 'Motiv auswählen, die Objektauswahl per Klick und das Entfernen können kleine KI-Modelle nutzen. Sie laufen nur auf deinem Gerät; deine Bilder verlassen es nicht.' }),
        el('p', { class: 'dlg-text', text: status }),
        ix ? el('p', { class: 'dlg-text muted', text: `Alle Modelle zusammen: etwa ${mb(total)}, einmal geladen und dann auf dem Gerät gespeichert. Modelle: U²-Netp (Apache 2.0), MobileSAM und Segment Anything (Apache 2.0), MI-GAN (MIT), ONNX Runtime (MIT).` }) : null,
      ].filter(Boolean)),
      buttons: ix ? [[on ? 'off' : 'on', on ? 'KI ausschalten' : 'KI einschalten', !on], ['clear', 'Gespeicherte Modelle löschen'], ['cancel', 'Schließen']] : [['cancel', 'Schließen', true]],
    });
    if (res === 'on') {
      store.set('pw-ai', 'on');
      broken = null;
      PW.app.toast('KI ist eingeschaltet.');
    } else if (res === 'off') {
      store.set('pw-ai', 'off');
      PW.app.toast('KI ist ausgeschaltet.');
    } else if (res === 'clear') {
      await cacheClear();
      PW.app.toast('Die gespeicherten KI-Modelle wurden gelöscht.');
    }
  }

  PW.ai = { ensure, available, isReady, enabled, consent, settings, saliency, embed, embedded, segment, subject, inpaint, components, FEATURES, _state: () => ({ loaded: [...loaded], broken, index: !!index }) };
})(window.PW);
