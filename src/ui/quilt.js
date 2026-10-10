// 조각누비: the run's keepsake. Every finished order adds one patch: its cloth is the colour the
// player sewed most in that order, and it is quilted with the stitch of the seam they made most
// (홈질 one running line, 겹누비 two, 세누비 dense lines, 십자수 a cross, 마무리 a border). A failed order leaves a torn patch, a boss order a
// red knot in the corner. Rows are market days, so the quilt also reads as the map of the run.
// It is stitched in on the reward sheet, laid out whole at the end, and kept in the 일지.
import { paintPatch } from './art.js';
import { DAYS, ORDERS_PER_DAY } from '../core/run.js';
import { SEAM_BY_ID } from '../core/seams.js';

const EMOJI = { blue: '🟦', red: '🟥', yellow: '🟨', white: '⬜', black: '⬛' };
const COLOR_NAME = { blue: '청색', red: '적색', yellow: '황색', white: '백색', black: '흑색' };

/** history → grid. At least the four market days; endless runs add rows. */
const MAX_ROWS = 8;
export function quiltCells(history) {
  let h = history || [];
  // a long night shift keeps only its latest rows, so the quilt never outgrows its sheet
  const over = Math.ceil(h.length / ORDERS_PER_DAY) - MAX_ROWS;
  if (over > 0) h = h.slice(over * ORDERS_PER_DAY);
  const days = Math.max(DAYS, Math.ceil(h.length / ORDERS_PER_DAY));
  const cells = [];
  for (let i = 0; i < days * ORDERS_PER_DAY; i++) cells.push(h[i] || null);
  return { cols: ORDERS_PER_DAY, rows: days, cells };
}

/** One line describing a patch, e.g. "청색 천 · 겹누비 땀". */
export function patchCaption(h) {
  if (!h) return '';
  const seam = h.seam ? `${SEAM_BY_ID[h.seam].name} 땀` : '땀 없이';
  return `${COLOR_NAME[h.color] || '백색'} 천 · ${seam}`;
}

/** The quilting stitch for a seam, drawn over a patch of size w×h. */
function quiltStitch(g, seam, w, h, color) {
  if (!seam) return;
  g.save();
  g.strokeStyle = color;
  g.lineCap = 'round';
  const lw = Math.max(1, w * 0.045);
  g.lineWidth = lw;
  g.setLineDash([Math.max(2, w * 0.09), Math.max(1.5, w * 0.06)]);
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const m = w * 0.2;
  switch (seam) {
    case 'single': line(m, h / 2, w - m, h / 2); break;
    case 'double': line(m, h * 0.38, w - m, h * 0.38); line(m, h * 0.62, w - m, h * 0.62); break;
    case 'triple':
      g.setLineDash([Math.max(1.5, w * 0.05), Math.max(1, w * 0.04)]);
      for (let k = 0.24; k < 0.8; k += 0.1) line(m, h * k, w - m, h * k);
      break;
    case 'cross': line(m, h / 2, w - m, h / 2); line(w / 2, m, w / 2, h - m); break;
    case 'perfect':
      g.strokeRect(m, m, w - m * 2, h - m * 2);
      g.strokeRect(m * 1.8, m * 1.8, w - m * 3.6, h - m * 3.6);
      break;
    default: break;
  }
  g.restore();
}

/** Paints one keepsake patch (cloth, quilting, torn mark or knot) at the origin. */
export function paintKeepsake(g, hist, w, h) {
  paintPatch(g, hist.color || 'white', w, h);
  const thread = hist.color === 'white' || hist.color === 'yellow' ? 'rgba(60,40,20,.55)' : 'rgba(243,234,214,.8)';
  quiltStitch(g, hist.seam, w, h, thread);
  if (hist.boss) {
    g.fillStyle = '#c63d31';
    g.beginPath(); g.arc(w * 0.82, h * 0.18, Math.max(2, w * 0.08), 0, Math.PI * 2); g.fill();
  }
  if (!hist.ok) {
    g.strokeStyle = '#c8392c';
    g.lineWidth = Math.max(2, w * 0.07);
    g.lineCap = 'round';
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(w * 0.25, h * 0.25); g.lineTo(w * 0.75, h * 0.75);
    g.moveTo(w * 0.75, h * 0.25); g.lineTo(w * 0.25, h * 0.75);
    g.stroke();
  }
}

/**
 * Draws a quilt from a run history. opts.fresh = index of a patch being stitched in right now
 * (animated by the caller through opts.t 0..1); opts.next = index of the order still to come.
 */
export function drawQuilt(canvas, history, opts = {}) {
  const { cols, rows, cells } = quiltCells(history);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 160;
  const u = cssW / cols;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(u * rows * dpr);
  canvas.style.height = `${u * rows}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const gap = Math.max(1, u * 0.03);
  cells.forEach((hist, i) => {
    const x = (i % cols) * u;
    const y = Math.floor(i / cols) * u;
    const empty = !hist || (opts.fresh === i && (opts.t ?? 1) <= 0);
    if (empty) {
      g.strokeStyle = i === opts.next ? 'rgba(226,181,74,.9)' : 'rgba(244,234,211,.22)';
      g.setLineDash([4, 4]);
      g.lineWidth = 1.5;
      g.strokeRect(x + 4, y + 4, u - 8, u - 8);
      g.setLineDash([]);
      return;
    }
    g.save();
    g.translate(x + u / 2, y + u / 2);
    if (opts.fresh === i) {
      const t = opts.t ?? 1;
      const e = 1 + 0.25 * Math.sin(Math.PI * Math.min(1, t)) * (1 - t);
      g.scale(e * Math.min(1, t * 1.6), e * Math.min(1, t * 1.6));
    }
    g.translate(-(u / 2 - gap), -(u / 2 - gap));
    paintKeepsake(g, hist, u - gap * 2, u - gap * 2);
    g.restore();
  });
}

/** Stitches the newest patch in with a short pop. Resolves when done. */
export function stitchIn(canvas, history, index, onLand, speed = 1) {
  const { cells } = quiltCells(history);
  index = cells.indexOf(history[index]); // the index may shift when old rows are trimmed
  return new Promise((res) => {
    let t0 = 0;
    let landed = false;
    const step = (now) => {
      if (!canvas.isConnected) { res(); return; } // the sheet closed: no sound over the next one
      t0 ||= now;
      const t = Math.min(1, (now - t0) / (520 * speed));
      drawQuilt(canvas, history, { fresh: index, t });
      if (!landed && t >= 0.55) { landed = true; if (onLand) onLand(); }
      if (t < 1) requestAnimationFrame(step); else res();
    };
    drawQuilt(canvas, history, { fresh: index, t: 0 });
    setTimeout(() => requestAnimationFrame(step), 260 * speed);
  });
}

export function shareText(run, dateLabel) {
  const { cols, cells } = quiltCells(run.history);
  let grid = '';
  cells.forEach((h, i) => {
    grid += !h ? '▫️' : !h.ok ? '❌' : EMOJI[h.color] || '⬜';
    if (i % cols === cols - 1) grid += '\n';
  });
  const pts = Math.floor(run.stats.points || 0).toLocaleString('ko-KR');
  return `누빔 공방 · 오늘의 의뢰 ${dateLabel}\n${grid}점수 ${pts}`;
}

/** What the 일지 keeps of a finished run. */
export function keepsakeOf(run, victory) {
  return {
    at: Date.now(),
    win: !!victory,
    day: run.day,
    points: Math.floor(run.stats.points || 0),
    daily: run.mode === 'daily',
    h: (run.history || []).slice(-24).map((x) => ({ color: x.color, seam: x.seam || null, ok: x.ok, boss: !!x.boss })),
  };
}
