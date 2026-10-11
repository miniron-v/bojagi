// Display formatting shared by HUD and sheets.
import { DAYS, ORDER_KINDS } from '../core/run.js';

export const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
/** Record-sized numbers in Korean units so they fit a stat tile: 98,765,432 → 9,877만, 1.23억. */
export const fmtBig = (n) => {
  n = Math.floor(n);
  if (n >= 1e8) return `${(n / 1e8).toFixed(2).replace(/\.?0+$/, '')}억`;
  if (n >= 1e7) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
};
export const fmtMult = (m) => (Math.round(m * 10) / 10).toLocaleString('ko-KR');
export const kindName = (orderIdx) => ORDER_KINDS[orderIdx].name;
export const dayName = (d) => (d > DAYS ? `밤샘 ${d - DAYS}일째` : `장날 ${d}`);
export const bestDayLabel = (d) => (d > DAYS ? `밤샘 ${d - DAYS}일` : `장날 ${d || 1}`);
