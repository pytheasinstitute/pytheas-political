// ─── Paths (Pfade): Bézier paths like the ones Photoshop's pen tool draws ───
// path: { id, name, work (true: the temporary "Arbeitspfad"), subpaths: [{ closed, pts: [anchor…] }] }
// anchor: { x, y, ix, iy, ox, oy, smooth } in document px. ix/iy is the handle towards the previous
// point, ox/oy towards the next one; a handle lying on its anchor means a straight segment there.
'use strict';

(function (PW) {
  const { createCanvas, uid, clamp } = PW.util;

  const clone = p => JSON.parse(JSON.stringify(p));
  const create = (name, work = false) => ({ id: uid('P'), name, work, subpaths: [] });
  const anchor = (x, y) => ({ x, y, ix: x, iy: y, ox: x, oy: y, smooth: false });

  // Segments of a subpath as [from, to] anchor pairs (the closing one included).
  function segments(sub) {
    const out = [], n = sub.pts.length;
    for (let i = 0; i < n - 1; i++) out.push([sub.pts[i], sub.pts[i + 1]]);
    if (sub.closed && n > 1) out.push([sub.pts[n - 1], sub.pts[0]]);
    return out;
  }

  // Adds the path to a canvas context or Path2D (document px).
  function trace(g, path) {
    for (const sub of path.subpaths) {
      if (!sub.pts.length) continue;
      g.moveTo(sub.pts[0].x, sub.pts[0].y);
      for (const [a, b] of segments(sub)) g.bezierCurveTo(a.ox, a.oy, b.ix, b.iy, b.x, b.y);
      if (sub.closed) g.closePath();
    }
  }
  function toPath2D(path) {
    const p = new Path2D();
    trace(p, path);
    return p;
  }

  function point(a, b, t) {
    const u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t;
    return { x: A * a.x + B * a.ox + C * b.ix + D * b.x, y: A * a.y + B * a.oy + C * b.iy + D * b.y };
  }

  // Closest point of the path to p: { si (subpath), seg, t, d } or null.
  function nearest(path, p) {
    let best = null;
    path.subpaths.forEach((sub, si) => {
      segments(sub).forEach(([a, b], seg) => {
        const N = 32;
        let bt = 0, bd = Infinity;
        for (let k = 0; k <= N; k++) {
          const q = point(a, b, k / N), d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) { bd = d; bt = k / N; }
        }
        // A few bisection steps around the best sample.
        let lo = Math.max(0, bt - 1 / N), hi = Math.min(1, bt + 1 / N);
        for (let it = 0; it < 12; it++) {
          const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
          const d1 = Math.hypot(point(a, b, m1).x - p.x, point(a, b, m1).y - p.y), d2 = Math.hypot(point(a, b, m2).x - p.x, point(a, b, m2).y - p.y);
          if (d1 < d2) hi = m2;
          else lo = m1;
        }
        const t = (lo + hi) / 2, q = point(a, b, t), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (!best || d < best.d) best = { si, seg, t, d };
      });
    });
    return best;
  }

  // Inserts an anchor on segment `seg` of `sub` at t (de Casteljau: the curve keeps its shape).
  function split(sub, seg, t) {
    const n = sub.pts.length, a = sub.pts[seg], b = sub.pts[(seg + 1) % n];
    const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const p0 = { x: a.x, y: a.y }, p1 = { x: a.ox, y: a.oy }, p2 = { x: b.ix, y: b.iy }, p3 = { x: b.x, y: b.y };
    const q0 = lerp(p0, p1), q1 = lerp(p1, p2), q2 = lerp(p2, p3), r0 = lerp(q0, q1), r1 = lerp(q1, q2), s = lerp(r0, r1);
    a.ox = q0.x; a.oy = q0.y;
    b.ix = q2.x; b.iy = q2.y;
    const straight = Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.01 && Math.hypot(p2.x - p3.x, p2.y - p3.y) < 0.01;
    const m = { x: s.x, y: s.y, ix: straight ? s.x : r0.x, iy: straight ? s.y : r0.y, ox: straight ? s.x : r1.x, oy: straight ? s.y : r1.y, smooth: !straight };
    sub.pts.splice(seg + 1, 0, m);
    return m;
  }

  function transform(path, f) {
    for (const sub of path.subpaths) {
      for (const a of sub.pts) {
        [a.x, a.y] = f(a.x, a.y);
        [a.ix, a.iy] = f(a.ix, a.iy);
        [a.ox, a.oy] = f(a.ox, a.oy);
      }
    }
    return path;
  }
  function translateSub(sub, dx, dy) {
    for (const a of sub.pts) {
      a.x += dx; a.y += dy; a.ix += dx; a.iy += dy; a.ox += dx; a.oy += dy;
    }
  }

  function bounds(path) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sub of path.subpaths) {
      for (const a of sub.pts) {
        for (const [x, y] of [[a.x, a.y], [a.ix, a.iy], [a.ox, a.oy]]) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
      }
    }
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  const empty = path => !path || !path.subpaths.some(s => s.pts.length > 1);

  // ─── Path → selection alpha (filled, soft edge from canvas anti-aliasing) ───
  function toAlpha(path, W, H) {
    const c = createCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fill(toPath2D(path), 'nonzero');
    const d = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
    return out;
  }

  // ─── Selection → path ("Arbeitspfad aus Auswahl erstellen") ───
  // Outline of alpha > 50 % (marching squares), simplified within `tolerance` px, then smooth
  // curves through the remaining points; sharp turns stay corners.
  function fromAlpha(alpha, W, H, tolerance = 2) {
    const s = Math.min(1, 1500 / Math.max(W, H)), w = Math.max(2, Math.round(W * s)), h = Math.max(2, Math.round(H * s));
    let bin;
    if (s < 1) {
      const src = createCanvas(W, H), sg = src.getContext('2d'), img = sg.createImageData(W, H);
      for (let i = 0; i < alpha.length; i++) img.data[i * 4 + 3] = alpha[i];
      sg.putImageData(img, 0, 0);
      const c = createCanvas(w, h), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      bin = new Uint8Array(w * h);
      for (let i = 0; i < bin.length; i++) bin[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    } else {
      bin = Uint8Array.from(alpha, v => (v > 127 ? 1 : 0));
    }
    const loops = contours(bin, w, h);
    const tol = Math.max(0.5, tolerance * s), subpaths = [];
    for (const loop of loops) {
      if (loop.length < 4) continue;
      const pts = simplifyClosed(loop, tol).map(([x, y]) => [x / s, y / s]);
      if (pts.length < 3) continue;
      subpaths.push(smoothClosed(pts));
    }
    return subpaths;
  }

  // Closed outlines between inside and outside pixels; vertices on pixel edge midpoints.
  function contours(bin, w, h) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? bin[y * w + x] : 0);
    // Edge segments of each cell (corner samples at pixel centres), keyed by their end points.
    const next = new Map(), key = (x, y) => `${x},${y}`;
    const add = (a, b) => next.set(key(a[0], a[1]), b);
    for (let y = -1; y < h; y++) {
      for (let x = -1; x < w; x++) {
        const tl = at(x, y), tr = at(x + 1, y), br = at(x + 1, y + 1), bl = at(x, y + 1);
        const c = tl * 8 + tr * 4 + br * 2 + bl;
        if (c === 0 || c === 15) continue;
        // Edge midpoints in doubled coordinates (pixel centres at odd positions).
        const T = [2 * x + 2, 2 * y + 1], R = [2 * x + 3, 2 * y + 2], B = [2 * x + 2, 2 * y + 3], L = [2 * x + 1, 2 * y + 2];
        // Inside kept on the right of the direction of travel.
        switch (c) {
          case 1: add(B, L); break;
          case 2: add(R, B); break;
          case 3: add(R, L); break;
          case 4: add(T, R); break;
          case 5: add(T, L); add(B, R); break;
          case 6: add(T, B); break;
          case 7: add(T, L); break;
          case 8: add(L, T); break;
          case 9: add(B, T); break;
          case 10: add(L, B); add(R, T); break;
          case 11: add(R, T); break;
          case 12: add(L, R); break;
          case 13: add(B, R); break;
          case 14: add(L, B); break;
        }
      }
    }
    const loops = [];
    for (const [k0] of next) {
      if (!next.has(k0)) continue;
      const loop = [];
      let k = k0;
      while (next.has(k)) {
        const p = next.get(k);
        next.delete(k);
        const [x, y] = k.split(',').map(Number);
        loop.push([x / 2, y / 2]);
        k = key(p[0], p[1]);
      }
      if (loop.length > 2) loops.push(loop);
    }
    return loops;
  }

  // Ramer–Douglas–Peucker on a closed polygon (split at its two farthest points).
  function simplifyClosed(pts, tol) {
    let far = 0, fd = -1;
    for (let i = 1; i < pts.length; i++) {
      const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
      if (d > fd) { fd = d; far = i; }
    }
    const a = rdp(pts.slice(0, far + 1), tol), b = rdp([...pts.slice(far), pts[0]], tol);
    return [...a.slice(0, -1), ...b.slice(0, -1)];
  }
  function rdp(pts, tol) {
    if (pts.length < 3) return pts;
    const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    let idx = 0, md = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / L;
      if (d > md) { md = d; idx = i; }
    }
    if (md <= tol) return [pts[0], pts[pts.length - 1]];
    const l = rdp(pts.slice(0, idx + 1), tol), r = rdp(pts.slice(idx), tol);
    return [...l.slice(0, -1), ...r];
  }
  // Catmull–Rom handles through the points; turns sharper than ~60° stay corners.
  function smoothClosed(pts) {
    const n = pts.length, sub = { closed: true, pts: [] };
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[(i - 1 + n) % n], [x, y] = pts[i], [nx, ny] = pts[(i + 1) % n];
      const a = anchor(x, y);
      const v1x = x - px, v1y = y - py, v2x = nx - x, v2y = ny - y;
      const cos = (v1x * v2x + v1y * v2y) / ((Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y)) || 1);
      if (cos > 0.5) {
        const tx = (nx - px) / 6, ty = (ny - py) / 6;
        const k1 = Math.hypot(v1x, v1y) / (Math.hypot(v1x, v1y) + Math.hypot(v2x, v2y)) * 2, k2 = 2 - k1;
        a.ix = x - tx * k1; a.iy = y - ty * k1;
        a.ox = x + tx * k2; a.oy = y + ty * k2;
        a.smooth = true;
      }
      sub.pts.push(a);
    }
    return sub;
  }

  // ─── Drawing on the canvas view ───
  // Outline of the active path; with `edit` also its points (selected ones filled) and handles.
  function drawOverlay(g, view, path, edit = null) {
    if (!path || !path.subpaths.length) return;
    const d = view.dpr;
    g.save();
    g.setTransform(d * view.zoom, 0, 0, d * view.zoom, d * view.x, d * view.y);
    const p2 = toPath2D(path);
    g.lineWidth = 2.2 / view.zoom;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.stroke(p2);
    g.lineWidth = 1.1 / view.zoom;
    g.strokeStyle = '#1473e6';
    g.stroke(p2);
    g.restore();
    if (!edit) return;
    g.save();
    g.setTransform(d, 0, 0, d, 0, 0);
    path.subpaths.forEach((sub, si) => {
      sub.pts.forEach((a, i) => {
        const sel = edit.selected && edit.selected.has(`${si}:${i}`), s = view.ds(a.x, a.y);
        // Handles of selected points (and of the point being drawn).
        if (sel || (edit.showHandles && edit.showHandles(si, i))) {
          for (const [hx, hy] of [[a.ix, a.iy], [a.ox, a.oy]]) {
            if (Math.hypot(hx - a.x, hy - a.y) < 0.01) continue;
            const h = view.ds(hx, hy);
            g.beginPath();
            g.moveTo(s.x, s.y);
            g.lineTo(h.x, h.y);
            g.strokeStyle = '#1473e6';
            g.lineWidth = 1;
            g.stroke();
            g.beginPath();
            g.arc(h.x, h.y, 3.2, 0, Math.PI * 2);
            g.fillStyle = '#1473e6';
            g.fill();
          }
        }
        g.fillStyle = sel ? '#1473e6' : '#ffffff';
        g.strokeStyle = '#1473e6';
        g.lineWidth = 1;
        g.fillRect(s.x - 3.5, s.y - 3.5, 7, 7);
        g.strokeRect(s.x - 3.5, s.y - 3.5, 7, 7);
      });
    });
    g.restore();
  }

  // Small preview of a path for the panel.
  function thumb(path, W, H, size) {
    const k = size / Math.max(W, H), c = createCanvas(Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k))), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.scale(k, k);
    g.fillStyle = '#7a7f87';
    g.fill(toPath2D(path), 'nonzero');
    return c;
  }

  PW.paths = { clone, create, anchor, segments, trace, toPath2D, point, nearest, split, transform, translateSub, bounds, empty, toAlpha, fromAlpha, drawOverlay, thumb, clamp };
})(window.PW);
