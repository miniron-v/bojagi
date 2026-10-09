// The run's keepsake: one patch per order, colored by what the player sewed most.
// Rendered on the end sheet and shared as an emoji grid for the daily order.
import { paintPatch } from './art.js';
import { DAYS, ORDERS_PER_DAY } from '../core/run.js';

const EMOJI = { blue: '🟦', red: '🟥', yellow: '🟨', white: '⬜', black: '⬛' };

export function quiltCells(run) {
  const days = Math.max(DAYS, Math.ceil((run.history || []).length / ORDERS_PER_DAY));
  const cells = [];
  for (let i = 0; i < days * ORDERS_PER_DAY; i++) cells.push((run.history || [])[i] || null);
  return { cols: ORDERS_PER_DAY, rows: days, cells };
}

export function drawQuilt(canvas, run) {
  const { cols, rows, cells } = quiltCells(run);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 160;
  const u = cssW / cols;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(u * rows * dpr);
  canvas.style.height = `${u * rows}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  cells.forEach((h, i) => {
    const x = (i % cols) * u;
    const y = Math.floor(i / cols) * u;
    if (!h) {
      g.strokeStyle = 'rgba(244,234,211,.25)';
      g.setLineDash([4, 4]);
      g.lineWidth = 1.5;
      g.strokeRect(x + 4, y + 4, u - 8, u - 8);
      g.setLineDash([]);
      return;
    }
    g.save();
    g.translate(x + 1, y + 1);
    paintPatch(g, h.color || 'white', u - 2, u - 2);
    g.restore();
    if (!h.ok) {
      g.strokeStyle = '#c8392c';
      g.lineWidth = Math.max(2, u * 0.07);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x + u * 0.25, y + u * 0.25); g.lineTo(x + u * 0.75, y + u * 0.75);
      g.moveTo(x + u * 0.75, y + u * 0.25); g.lineTo(x + u * 0.25, y + u * 0.75);
      g.stroke();
    }
  });
}

export function shareText(run, dateLabel) {
  const { cols, cells } = quiltCells(run);
  let grid = '';
  cells.forEach((h, i) => {
    grid += !h ? '▫️' : !h.ok ? '❌' : EMOJI[h.color] || '⬜';
    if (i % cols === cols - 1) grid += '\n';
  });
  const best = Math.floor(run.stats.bestHand).toLocaleString('ko-KR');
  return `보자기 공방 · 오늘의 의뢰 ${dateLabel}\n${grid}최고 한 땀 ${best}`;
}
