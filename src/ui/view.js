// Stage view: hoop, tray, drag & drop, clear animations, plus the full-screen FX layer.
// Owns only visual state; the controller feeds it core events.
import { SHAPE_BY_ID } from '../core/shapes.js';
import { N, canPlace, paint, fullLines, fitsAnywhere } from '../core/board.js';
import { patchSprite, drawHoop, roundRect, PAL } from './art.js';

const TALLY_SPACE = 64;
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export class View {
  constructor({ stage, canvas, fxCanvas, app }) {
    this.stage = stage;
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.fx = fxCanvas;
    this.fg = fxCanvas.getContext('2d');
    this.app = app;
    this.dpr = 1;
    this.board = new Array(N * N).fill(null);
    this.tray = [null, null, null];
    this.trayFit = [true, true, true];
    this.trayBorn = [0, 0, 0];
    this.cellPop = new Map();
    this.leaving = [];
    this.needles = [];
    this.lineGlow = [];
    this.particles = [];
    this.texts = [];
    this.drag = null;
    this.returning = null;
    this.shakeT = 0;
    this.shakePow = 0;
    this.enabled = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.speed = 1;
    this.handlers = { canDrag: () => true, drop: () => false, hover: () => {}, pickup: () => {}, cancel: () => {} };
    this.boss = null;
    this.hoopCache = null;
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(app);
    this.resize();
    this.bindInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- layout ----------
  resize() {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    const sr = this.stage.getBoundingClientRect();
    const ar = this.app.getBoundingClientRect();
    this.W = Math.max(1, sr.width);
    this.H = Math.max(1, sr.height);
    this.stageOff = { x: sr.left - ar.left, y: sr.top - ar.top };
    for (const [cv, w, h] of [[this.cv, this.W, this.H], [this.fx, ar.width, ar.height]]) {
      cv.width = Math.round(w * this.dpr);
      cv.height = Math.round(h * this.dpr);
    }
    this.AW = ar.width;
    this.AH = ar.height;
    const c = Math.floor(Math.min((this.W - 28) / 8.64, (this.H - TALLY_SPACE - 10) / 11.9));
    this.cell = Math.max(18, c);
    const size = this.cell * 8;
    this.size = size;
    this.bx = Math.round((this.W - size) / 2);
    this.by = Math.round(TALLY_SPACE + this.cell * 0.32);
    const trayTop = this.by + size + this.cell * 0.75;
    const trayH = Math.max(this.cell * 2.9, this.H - trayTop - 4);
    this.trayRect = { y: trayTop, h: trayH };
    this.trayScale = Math.min(0.55, (this.W / 3 - 26) / (5 * this.cell), trayH / (5.4 * this.cell));
    this.slots = [0, 1, 2].map((i) => ({ cx: (this.W / 6) * (1 + 2 * i), cy: trayTop + trayH / 2 }));
    this.hoopCache = null;
  }

  boardRectInApp() {
    return { x: this.stageOff.x + this.bx, y: this.stageOff.y + this.by, size: this.size, cell: this.cell };
  }

  cellCenterApp(r, c) {
    return { x: this.stageOff.x + this.bx + (c + 0.5) * this.cell, y: this.stageOff.y + this.by + (r + 0.5) * this.cell };
  }

  // ---------- state sync ----------
  setBoard(board) { this.board = board.slice(); }

  setTray(tray, fits, animate = true) {
    const now = performance.now();
    tray.forEach((p, i) => {
      const changed = JSON.stringify(p) !== JSON.stringify(this.tray[i]);
      if (changed && p && animate) this.trayBorn[i] = now + i * 70;
    });
    this.tray = tray.map((p) => (p ? { ...p } : null));
    this.trayFit = fits.slice();
  }

  // ---------- input ----------
  bindInput() {
    const cv = this.cv;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.drag) return;
      const p = pos(e);
      const i = this.hitSlot(p.x, p.y);
      if (i < 0 || !this.tray[i] || !this.handlers.canDrag(i)) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const shape = SHAPE_BY_ID[this.tray[i].shape];
      const touch = e.pointerType !== 'mouse';
      this.drag = {
        i, id: e.pointerId, shape, piece: this.tray[i], x: p.x, y: p.y, t0: performance.now(),
        lift: touch ? this.cell * (shape.h / 2 + 1.25) : this.cell * 0.2,
        anchor: null, valid: false, lines: [],
        sx: this.slots[i].cx, sy: this.slots[i].cy,
      };
      this.returning = null;
      this.handlers.pickup(i);
      this.updateDrag(p);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      e.preventDefault();
      this.updateDrag(pos(e));
    });
    const end = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const d = this.drag;
      this.drag = null;
      this.handlers.hover(null);
      if (d.valid && e.type === 'pointerup' && this.handlers.drop(d.i, d.anchor.r, d.anchor.c)) return;
      // fly back to the tray
      const cx = d.x;
      const cy = d.y - d.lift;
      this.returning = { i: d.i, x: cx, y: cy, t0: performance.now(), scale: 1 };
      this.handlers.cancel(d.i, d.valid);
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  hitSlot(x, y) {
    const tr = this.trayRect;
    if (y < tr.y - this.cell * 0.4 || y > tr.y + tr.h + this.cell * 0.4) return -1;
    const i = Math.floor(x / (this.W / 3));
    return i >= 0 && i < 3 ? i : -1;
  }

  updateDrag(p) {
    const d = this.drag;
    d.x = p.x;
    d.y = p.y;
    const cx = p.x;
    const cy = p.y - d.lift;
    const tlx = cx - (d.shape.w * this.cell) / 2;
    const tly = cy - (d.shape.h * this.cell) / 2;
    let c = Math.round((tlx - this.bx) / this.cell);
    let r = Math.round((tly - this.by) / this.cell);
    let valid = canPlace(this.board, d.shape, r, c);
    if (!valid) {
      // forgiving snap: try the 4 neighbours closest to the true position
      const fx = (tlx - this.bx) / this.cell;
      const fy = (tly - this.by) / this.cell;
      const cands = [[Math.floor(fy), Math.floor(fx)], [Math.floor(fy), Math.ceil(fx)], [Math.ceil(fy), Math.floor(fx)], [Math.ceil(fy), Math.ceil(fx)]]
        .sort((a, b) => Math.hypot(a[0] - fy, a[1] - fx) - Math.hypot(b[0] - fy, b[1] - fx));
      for (const [rr, cc] of cands) {
        if (Math.hypot(rr - fy, cc - fx) < 0.85 && canPlace(this.board, d.shape, rr, cc)) { r = rr; c = cc; valid = true; break; }
      }
    }
    const key = valid ? `${r},${c}` : null;
    if (key !== d.key) {
      d.key = key;
      d.valid = valid;
      d.anchor = valid ? { r, c } : null;
      d.lines = valid ? fullLines(paint(this.board, d.shape, r, c, d.piece.color)) : [];
      this.handlers.hover(valid ? { i: d.i, r, c, lines: d.lines } : null);
    }
  }

  // ---------- animation API (returns promises) ----------
  wait(ms) { return new Promise((res) => setTimeout(res, ms * this.speed)); }

  placePiece(ev) {
    const now = performance.now();
    for (const [r, c] of ev.cells) {
      this.board[r * N + c] = ev.piece.color;
      this.cellPop.set(r * N + c, now);
      const p = this.cellCenterApp(r, c);
      this.burst(p.x, p.y, PAL[ev.piece.color].light, 3, 1.4);
    }
    this.tray[ev.tray] = null;
    this.returning = null;
    this.shake(0.8);
  }

  async clearLines(lines, streak) {
    const now = performance.now();
    const per = this.reduced ? 0 : 150 * this.speed;
    lines.forEach((line, k) => {
      this.needles.push({ line, t0: now + k * per, dur: 260 * this.speed });
      this.lineGlow.push({ line, t0: now + k * per });
    });
    // cells leave in a wave following the needle
    lines.forEach((line, k) => {
      line.cells.forEach((cell, j) => {
        const delay = k * per + (j / N) * 240 * this.speed;
        const key = cell.r * N + cell.c;
        if (this.leaving.some((l) => l.key === key)) return;
        this.leaving.push({ key, r: cell.r, c: cell.c, color: cell.color, t0: now + delay, spin: (Math.random() - 0.5) * 2 });
      });
    });
    const total = (lines.length - 1) * per + 300 * this.speed;
    return { total, stitchTimes: lines.map((_, k) => k * per), streak };
  }

  finishClear(board) {
    this.setBoard(board);
  }

  shake(power) {
    if (this.reduced) return;
    this.shakeT = performance.now();
    this.shakePow = Math.max(this.shakePow * 0.5, power);
  }

  burst(x, y, color, n = 8, speed = 3, kind = 'scrap') {
    if (this.reduced) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random()) * speed;
      this.particles.push({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, g: 0.12,
        life: 0, max: 420 + Math.random() * 380, size: 3 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, color,
      });
    }
  }

  /** Scraps that fly from a point to a target (e.g. the score bar). */
  flyTo(x, y, tx, ty, color, n = 4) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'home', x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, sx: x, sy: y, tx, ty,
        cx: x + (Math.random() - 0.5) * 160, cy: y - 60 - Math.random() * 120,
        life: -Math.random() * 120, max: 520 + Math.random() * 200, size: 4 + Math.random() * 4, rot: Math.random() * 6, color,
      });
    }
  }

  confetti(n = 70) {
    const cols = ['#2f66b0', '#c63d31', '#e4ab2c', '#efe6d2', '#33333f'];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        kind: 'confetti', x: Math.random() * this.AW, y: -20 - Math.random() * this.AH * 0.4,
        vx: (Math.random() - 0.5) * 1.5, vy: 1.5 + Math.random() * 2.5, g: 0.02,
        life: 0, max: 2600 + Math.random() * 1200, size: 6 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.2,
        color: cols[i % cols.length],
      });
    }
  }

  text(str, x, y, { size = 28, color = '#f4ead3', dur = 900, rise = 40, stroke = '#121829', delay = 0, pop = 1.5 } = {}) {
    // keep the popped text inside the hoop width (Hangul glyphs are ~1em wide)
    const maxW = (this.size || 300) * 0.92;
    size = Math.min(size, maxW / (Math.max(1, [...str].length) * 0.95 * pop));
    this.texts.push({ str, x, y, size, color, dur: dur * Math.max(0.6, this.speed), rise, stroke, t0: performance.now() + delay, pop });
  }

  // ---------- render ----------
  loop(now) {
    requestAnimationFrame(this.loop);
    this.renderStage(now);
    this.renderFx(now);
  }

  hoop() {
    if (this.hoopCache) return this.hoopCache;
    const c = document.createElement('canvas');
    c.width = this.cv.width;
    c.height = this.cv.height;
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    drawHoop(g, this.bx, this.by, this.size, this.cell, 0);
    this.hoopCache = c;
    return c;
  }

  drawPatch(g, color, x, y, size, alpha = 1, rot = 0) {
    const spr = patchSprite(color, size * this.dpr);
    g.globalAlpha = alpha;
    if (rot) {
      g.save();
      g.translate(x + size / 2, y + size / 2);
      g.rotate(rot);
      g.drawImage(spr, -size / 2, -size / 2, size, size);
      g.restore();
    } else {
      g.drawImage(spr, x, y, size, size);
    }
    g.globalAlpha = 1;
  }

  renderStage(now) {
    const g = this.g;
    const { cell, bx, by, dpr } = this;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    let sx = 0, sy = 0;
    const st = (now - this.shakeT) / 320;
    if (st < 1 && this.shakePow > 0) {
      const a = this.shakePow * (1 - st) ** 2 * 6;
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
    } else this.shakePow = 0;
    g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    g.drawImage(this.hoop(), 0, 0, this.cv.width / dpr, this.cv.height / dpr);

    const d = this.drag;
    const willClear = new Set();
    if (d && d.valid) for (const l of d.lines) for (const c of l.cells) willClear.add(c.r * N + c.c);

    // line glow under cells during preview
    if (d && d.valid && d.lines.length) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 110);
      g.fillStyle = `rgba(231,179,58,${0.18 + pulse * 0.15})`;
      for (const l of d.lines) {
        if (l.type === 'row') g.fillRect(bx, by + l.index * cell, cell * 8, cell);
        else g.fillRect(bx + l.index * cell, by, cell, cell * 8);
      }
    }

    // settled cells
    for (let k = 0; k < N * N; k++) {
      const col = this.board[k];
      if (!col) continue;
      if (this.leaving.some((l) => l.key === k && now >= l.t0)) continue;
      const r = Math.floor(k / N), c = k % N;
      let s = 1;
      const t0 = this.cellPop.get(k);
      if (t0 !== undefined) {
        const t = clamp01((now - t0) / 220);
        s = 1 + 0.22 * Math.sin(t * Math.PI) * (1 - t);
        if (t >= 1) this.cellPop.delete(k);
      }
      const size = cell * s;
      const off = (cell - size) / 2;
      const tint = willClear.has(k) && col !== 'knot' ? d.piece.color : col;
      this.drawPatch(g, tint, bx + c * cell + off, by + r * cell + off, size);
      if (willClear.has(k)) {
        g.fillStyle = `rgba(255,250,235,${0.12 + 0.1 * Math.sin(now / 90)})`;
        roundRect(g, bx + c * cell + 2, by + r * cell + 2, cell - 4, cell - 4, cell * 0.16);
        g.fill();
      }
    }

    // ghost
    if (d && d.valid) {
      for (const [dr, dc] of d.shape.cells) {
        const r = d.anchor.r + dr, c = d.anchor.c + dc;
        this.drawPatch(g, d.piece.color, bx + c * cell, by + r * cell, cell, willClear.size ? 0.75 : 0.45);
      }
    }

    // line flash after a clear
    this.lineGlow = this.lineGlow.filter((lg) => {
      const t = (now - lg.t0) / (420 * this.speed);
      if (t < 0) return true;
      if (t > 1) return false;
      g.fillStyle = `rgba(255,246,220,${0.55 * (1 - t)})`;
      const l = lg.line;
      const grow = easeOut(clamp01(t * 2.2));
      if (l.type === 'row') g.fillRect(bx, by + l.index * cell + cell * 0.5 * (1 - grow), cell * 8 * grow, cell * grow);
      else g.fillRect(bx + l.index * cell + cell * 0.5 * (1 - grow), by, cell * grow, cell * 8 * grow);
      return true;
    });

    // leaving cells: puff up, spin, shrink
    this.leaving = this.leaving.filter((l) => {
      const t = (now - l.t0) / (380 * this.speed);
      if (t < 0) return true;
      if (t > 1) return false;
      if (!l.burst) {
        l.burst = true;
        const p = this.cellCenterApp(l.r, l.c);
        this.burst(p.x, p.y, PAL[l.color].base, 3, 2.6);
        if (this.onCellLeave) this.onCellLeave(l, p);
      }
      const s = t < 0.25 ? 1 + t * 0.8 : 1.2 * (1 - easeOut((t - 0.25) / 0.75));
      const size = cell * Math.max(0, s);
      const off = (cell - size) / 2;
      this.drawPatch(g, l.color, bx + l.c * cell + off, by + l.r * cell + off - t * cell * 0.4, size, 1 - t * 0.3, l.spin * t);
      return true;
    });

    // needles + running stitch trail
    this.needles = this.needles.filter((n) => {
      const t = (now - n.t0) / n.dur;
      if (t < 0) return true;
      if (t > 1.6) return false;
      const l = n.line;
      const p = easeOut(clamp01(t));
      const vert = l.type === 'col';
      const x0 = vert ? bx + (l.index + 0.5) * cell : bx - cell * 0.2;
      const y0 = vert ? by - cell * 0.2 : by + (l.index + 0.5) * cell;
      const len = cell * 8.4;
      const x1 = vert ? x0 : x0 + len * p;
      const y1 = vert ? y0 + len * p : y0;
      const fade = t > 1 ? 1 - (t - 1) / 0.6 : 1;
      g.save();
      g.globalAlpha = fade;
      g.setLineDash([cell * 0.22, cell * 0.14]);
      g.lineWidth = Math.max(2, cell * 0.08);
      g.lineCap = 'round';
      g.strokeStyle = '#c8392c';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.setLineDash([]);
      if (t <= 1) {
        g.translate(x1, y1);
        g.rotate(vert ? Math.PI / 2 : 0);
        g.strokeStyle = '#e8ecf4';
        g.lineWidth = Math.max(2, cell * 0.07);
        g.beginPath(); g.moveTo(-cell * 0.9, 0); g.lineTo(cell * 0.25, 0); g.stroke();
        g.fillStyle = '#121829';
        g.beginPath(); g.ellipse(-cell * 0.75, 0, cell * 0.08, cell * 0.025, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      return true;
    });

    // tray
    for (let i = 0; i < 3; i++) {
      const p = this.tray[i];
      if (!p || (d && d.i === i)) continue;
      const shape = SHAPE_BY_ID[p.shape];
      let s = this.trayScale;
      let cx = this.slots[i].cx, cy = this.slots[i].cy;
      const bt = (now - this.trayBorn[i]) / 320;
      if (bt < 0) continue;
      if (bt < 1) s *= easeOutBack(clamp01(bt));
      if (this.returning && this.returning.i === i) {
        const rt = clamp01((now - this.returning.t0) / 180);
        const e = easeOut(rt);
        cx = this.returning.x + (cx - this.returning.x) * e;
        cy = this.returning.y + (cy - this.returning.y) * e;
        s = 1 + (s - 1) * e;
        if (rt >= 1) this.returning = null;
      }
      const fit = this.trayFit[i];
      this.drawShape(g, shape, p.color, cx, cy, cell * s, fit ? 1 : 0.32);
    }

    // dragged piece on top
    if (d) {
      const t = clamp01((now - d.t0) / 140);
      const s = this.trayScale + (1.04 - this.trayScale) * easeOutBack(t);
      const cx = d.sx + (d.x - d.sx) * easeOut(t);
      const cy = d.sy + (d.y - d.lift - d.sy) * easeOut(t);
      g.save();
      g.shadowColor = 'rgba(0,0,0,.4)';
      g.shadowBlur = cell * 0.5;
      g.shadowOffsetY = cell * 0.35;
      this.drawShape(g, d.shape, d.piece.color, cx, cy, cell * s, 1);
      g.restore();
    }
  }

  drawShape(g, shape, color, cx, cy, cs, alpha) {
    const x0 = cx - (shape.w * cs) / 2;
    const y0 = cy - (shape.h * cs) / 2;
    for (const [r, c] of shape.cells) this.drawPatch(g, color, x0 + c * cs, y0 + r * cs, cs, alpha);
  }

  renderFx(now) {
    const g = this.fg;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.AW, this.AH);
    if (!this.lastNow) this.lastNow = now;
    const dt = Math.min(48, now - this.lastNow) / 16.67;
    this.lastNow = now;

    this.particles = this.particles.filter((p) => {
      p.life += dt * 16.67;
      if (p.life < 0) return true;
      const t = p.life / p.max;
      if (t >= 1) {
        if (p.kind === 'home' && p.onArrive) p.onArrive();
        return false;
      }
      if (p.kind === 'home') {
        const e = t * t * (3 - 2 * t);
        const u = 1 - e;
        p.x = u * u * p.sx + 2 * u * e * p.cx + e * e * p.tx;
        p.y = u * u * p.sy + 2 * u * e * p.cy + e * e * p.ty;
        p.rot += 0.2 * dt;
      } else {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.kind === 'confetti') p.vx += Math.sin(now / 300 + p.size) * 0.02;
      }
      const a = p.kind === 'confetti' ? Math.min(1, (1 - t) * 3) : 1 - t * t;
      g.save();
      g.globalAlpha = a;
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.kind === 'confetti') g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else {
        const s = p.kind === 'home' ? p.size * (1 - t * 0.5) : p.size;
        g.fillRect(-s / 2, -s / 2, s, s);
      }
      g.restore();
      return true;
    });

    this.texts = this.texts.filter((tx) => {
      const t = (now - tx.t0) / tx.dur;
      if (t < 0) return true;
      if (t > 1) return false;
      const popT = clamp01(t / 0.18);
      const s = t < 0.18 ? 0.4 + (tx.pop - 0.4) * easeOutBack(popT) : tx.pop + (1 - tx.pop) * easeOut(clamp01((t - 0.18) / 0.2));
      const a = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      g.save();
      g.globalAlpha = a;
      g.translate(tx.x, tx.y - tx.rise * easeOut(t));
      g.scale(s, s);
      g.font = `${tx.size}px 'Song Myung', 'Nanum Myeongjo', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(3, tx.size / 6);
      g.strokeStyle = tx.stroke;
      g.strokeText(tx.str, 0, 0);
      g.fillStyle = tx.color;
      g.fillText(tx.str, 0, 0);
      g.restore();
      return true;
    });
  }
}

export function trayFits(board, tray) {
  return tray.map((p) => !!p && fitsAnywhere(board, SHAPE_BY_ID[p.shape]));
}
