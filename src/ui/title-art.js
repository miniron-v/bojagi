// Title illustration: an irregular bojagi patchwork that pieces itself together, then gets its seam.
import { paintPatch } from './art.js';

export function createTitleArt(cv) {
  const g = cv.getContext('2d');
  let raf = 0;
  let t0 = 0;
  const cols = ['blue', 'red', 'yellow', 'white', 'black'];
  const rects = [];
  (function split(x, y, w, h, depth, seed) {
    if (depth > 3 || w * h <= 2 || (depth > 1 && seed % 3 === 0)) {
      rects.push({ x, y, w, h, color: cols[(seed * 7 + x * 3 + y) % 5] });
      return;
    }
    if (w >= h) {
      const k = 1 + (seed % (w - 1 || 1));
      split(x, y, k, h, depth + 1, seed * 5 + 1);
      split(x + k, y, w - k, h, depth + 1, seed * 3 + 2);
    } else {
      const k = 1 + (seed % (h - 1 || 1));
      split(x, y, w, k, depth + 1, seed * 7 + 3);
      split(x, y + k, w, h - k, depth + 1, seed * 11 + 1);
    }
  })(0, 0, 6, 6, 0, 4);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = now;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) cv.width = cv.height = Math.round(w * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, w);
    const t = (now - t0) / 1000;
    const pad = w * 0.12;
    const u = (w - pad * 2) / 6;
    g.save();
    g.translate(w / 2, w / 2);
    g.rotate(Math.sin(t * 0.4) * 0.04 + 0.09);
    g.translate(-w / 2, -w / 2);
    rects.forEach((r, i) => {
      const k = Math.max(0, Math.min(1, (t - i * 0.07) / 0.45));
      if (k <= 0) return;
      const e = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
      const x = pad + r.x * u;
      const y = pad + r.y * u;
      const ww = r.w * u;
      const hh = r.h * u;
      g.save();
      g.translate(x + ww / 2, y + hh / 2 + (1 - k) * 30);
      g.scale(e, e);
      g.translate(-ww / 2, -hh / 2);
      paintPatch(g, r.color, ww, hh);
      g.restore();
    });
    const sk = Math.max(0, Math.min(1, (t - rects.length * 0.07 - 0.2) / 0.8));
    if (sk > 0) {
      g.strokeStyle = (getComputedStyle(document.documentElement).getPropertyValue('--on-ground').trim() || '#16224a') + '99';
      g.lineWidth = Math.max(1.5, u * 0.05);
      g.setLineDash([u * 0.12, u * 0.09]);
      const L = u * 6 + 6;
      // the seam runs around the cloth like a needle making its way
      g.beginPath();
      const p = sk * 4;
      g.moveTo(pad - 3, pad - 3);
      g.lineTo(pad - 3 + L * Math.min(1, p), pad - 3);
      if (p > 1) g.lineTo(pad - 3 + L, pad - 3 + L * Math.min(1, p - 1));
      if (p > 2) g.lineTo(pad - 3 + L - L * Math.min(1, p - 2), pad - 3 + L);
      if (p > 3) g.lineTo(pad - 3, pad - 3 + L - L * Math.min(1, p - 3));
      g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }
  return {
    start() { cancelAnimationFrame(raf); t0 = 0; raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
  };
}
