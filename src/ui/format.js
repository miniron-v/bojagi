// Display formatting shared by HUD and sheets.
import { DAYS, ORDER_KINDS } from '../core/run.js';

export const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
export const fmtMult = (m) => (Math.round(m * 10) / 10).toLocaleString('ko-KR');
export const kindName = (orderIdx) => ORDER_KINDS[orderIdx].name;
export const dayName = (d) => (d > DAYS ? `밤샘 ${d - DAYS}일째` : `장날 ${d}`);
export const bestDayLabel = (d) => (d > DAYS ? `밤샘 ${d - DAYS}일` : `장날 ${d || 1}`);
