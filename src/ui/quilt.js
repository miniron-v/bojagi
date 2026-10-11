// 조각누비: the run's keepsake. Every finished order adds one patch: its cloth is the colour the
// player sewed most in that order, and it is quilted with the stitch of the seam they made most
// other than 홈질 (홈질 one running line, 겹누비 two, 드문누비 two far apart, 세누비 dense lines, 십자수 a cross,
// 등솔 one line down the middle, 감침질 slanted whip stitches on the edges, 시침질 one long basting line, 마무리 a border). If that seam was
// mostly sewn in one colour the stitch is gold thread: flat for 납작누비, raised in ridges for 오목누비.
// A failed order leaves a torn patch, a boss order a red knot in the corner. Rows are market days, so the quilt also reads as the map of the run.
// It is stitched in on the reward sheet, laid out whole at the end, and kept in the 일지.
import { paintPatch } from './art.js';
import { DAYS, ORDERS_PER_DAY } from '../core/run.js';
import { SEAM_BY_ID, FINISH_BY_ID, upgradePatch } from '../core/seams.js';

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

/** One line describing a patch, e.g. "청색 천 · 겹누비 땀" or "청색 천 · 겹누비 땀 · 오목누비". */
export function patchCaption(h) {
  if (!h) return '';
  const seam = h.seam ? `${SEAM_BY_ID[h.seam].name} 땀` : '땀 없이';
  const finish = h.seam && h.finish ? ` · ${FINISH_BY_ID[h.finish].name}` : '';
  return `${COLOR_NAME[h.color] || '백색'} 천 · ${seam}${finish}`;
}

/**
 * The quilting stitch for a seam, drawn over a patch of size w×h. A finish sews it in gold thread:
 * 'flat' (납작누비) lies flat on the cloth; 'ridge' (오목누비) stands up as a raised cord, a shadow
 * under the thread and a glint along its top. On light cloths gold gets a dark rim to stay gold.
 */
function quiltStitch(g, seam, w, h, color, finish = null, light = false) {
  if (!seam) return;
  g.save();
  g.lineCap = 'round';
  const dense = seam === 'triple';
  const lw = Math.max(1, w * 0.045);
  const dash = [Math.max(2, w * 0.09), Math.max(1.5, w * 0.06)];
  const tw = finish ? lw * (dense ? 1.1 : 1.35) : lw; // gold thread is a little thicker
  const lift = Math.max(0.8, w * (dense ? 0.018 : 0.03));
  const stroke = (x0, y0, x1, y1, style, width, dx = 0, dy = 0) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath(); g.moveTo(x0 + dx, y0 + dy); g.lineTo(x1 + dx, y1 + dy); g.stroke();
  };
  const line = (x0, y0, x1, y1) => {
    if (!finish) { stroke(x0, y0, x1, y1, color, lw); return; }
    if (finish === 'ridge') stroke(x0, y0, x1, y1, 'rgba(0,0,0,.42)', tw * 1.25, lift * 0.6, lift * 1.4);
    if (light) stroke(x0, y0, x1, y1, 'rgba(70,45,10,.85)', tw + Math.max(1, lw * 0.7));
    stroke(x0, y0, x1, y1, '#e8bf55', tw);
    if (finish === 'ridge') stroke(x0, y0, x1, y1, 'rgba(255,250,228,.8)', Math.max(0.6, tw * 0.32), -tw * 0.18, -tw * 0.22);
  };
  g.setLineDash(dash);
  const m = w * 0.2;
  switch (seam) {
    case 'single': line(m, h / 2, w - m, h / 2); break;
    case 'double': line(m, h * 0.38, w - m, h * 0.38); line(m, h * 0.62, w - m, h * 0.62); break;
    case 'triple':
      g.setLineDash([Math.max(1.5, w * 0.05), Math.max(1, w * 0.04)]);
      for (let k = 0.24; k < 0.8; k += 0.1) line(m, h * k, w - m, h * k);
      break;
    case 'gap': line(m, h * 0.27, w - m, h * 0.27); line(m, h * 0.73, w - m, h * 0.73); break;
    case 'cross': line(m, h / 2, w - m, h / 2); line(w / 2, m, w / 2, h - m); break;
    case 'center': line(w / 2, m, w / 2, h - m); break; // 등솔: the seam down the middle
    case 'edge': { // 감침질: short slanted whip stitches along the top and bottom edges
      g.setLineDash([]);
      const k = m * 0.75;
      const s = Math.max(2, w * 0.07);
      for (let x = m; x <= w - m - s * 0.5; x += s * 1.6) { line(x, k, x + s, k + s); line(x, h - k - s, x + s, h - k); }
      break;
    }
    case 'whole': // 시침질: basting, long loose stitches across the patch
      g.setLineDash([Math.max(4, w * 0.16), Math.max(3, w * 0.1)]);
      line(m, m, w - m, h - m);
      break;
    case 'perfect':
      for (const k of [m, m * 1.8]) {
        line(k, k, w - k, k); line(w - k, k, w - k, h - k);
        line(w - k, h - k, k, h - k); line(k, h - k, k, k);
      }
      break;
    default: break;
  }
  g.restore();
}

/** Paints one keepsake patch (cloth, quilting, torn mark or knot) at the origin. */
export function paintKeepsake(g, hist, w, h) {
  hist = upgradePatch(hist);
  paintPatch(g, hist.color || 'white', w, h);
  const light = hist.color === 'white' || hist.color === 'yellow';
  const thread = light ? 'rgba(60,40,20,.55)' : 'rgba(243,234,214,.8)';
  quiltStitch(g, hist.seam, w, h, thread, hist.finish, light);
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
    h: (run.history || []).slice(-24).map((x) => ({ color: x.color, seam: x.seam || null, finish: x.finish || null, ok: x.ok, boss: !!x.boss })),
  };
}
