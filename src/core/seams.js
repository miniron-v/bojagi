// 솔기 족보 (seam hands) — the poker hands of this game.
// A clear is named in two layers, like Balatro's hands are built from independent traits:
//  - its SHAPE, exactly one: how many lines were cleared side by side and how they sit;
//  - any number of ADD-ONS: where the lines are, what the patch did, what the hoop looks like after.
// Every name a clear earns adds its own chips and mult (at its own level), so doing more never
// scores less. Levels never change what a clear is called. Colour stays apart from both: lines
// filled in one colour multiply the whole thing (see monoFactor / finishOf).
// Each seam has a level; pattern papers (본) bought in the market raise it.
//
// Names come from traditional Korean sewing and nubi (누비) quilting: 홈질 is the running stitch;
// 겹누비 quilts two layers; 드문누비 is nubi with wide spacing (잔누비·중누비·드문누비 are the
// spacing classes); 세누비 (잔누비) is the fine, closely spaced kind; 감침질 whips a cloth's edge;
// 등솔 is the seam down the middle of a garment's back; 시침질 is basting, the temporary stitch that
// is pulled out afterwards; 마무리 is the finishing step when the cloth is done.

import { N } from './board.js';

export const SEAMS = [
  // shapes, ranked highest first (the rank only settles a tie between rows and columns)
  { id: 'triple', kind: 'shape', short: '3줄 이상', name: '세누비', chips: 120, mult: 6, lvChips: 35, lvMult: 3, how: '같은 방향 세 줄 이상을 한 번에' },
  { id: 'gap', kind: 'shape', short: '떨어진 2줄', name: '드문누비', chips: 80, mult: 4, lvChips: 25, lvMult: 2, how: '떨어진 같은 방향 두 줄을 한 번에' },
  { id: 'double', kind: 'shape', short: '붙은 2줄', name: '겹누비', chips: 70, mult: 3, lvChips: 25, lvMult: 2, how: '붙은 같은 방향 두 줄을 한 번에' },
  // the fallback hand: it never levels, so a run grows through the other names
  { id: 'single', kind: 'shape', short: '1줄', name: '홈질', chips: 30, mult: 1, lvChips: 0, lvMult: 0, how: '한 줄', fixed: true },
  // add-ons: rare ones add chips and mult; the common ones add chips only (a mult on top of the
  // fallback hand's ×1 would multiply most of the game's clears)
  { id: 'perfect', kind: 'addon', short: '판 비움', name: '마무리', chips: 130, mult: 7, lvChips: 40, lvMult: 3, how: '줄을 지워 수틀을 완전히 비우기' },
  { id: 'cross', kind: 'addon', short: '가로+세로', name: '십자수', chips: 50, mult: 3, lvChips: 25, lvMult: 2, how: '가로와 세로를 함께' },
  { id: 'whole', kind: 'addon', short: '조각째 지움', name: '시침질', chips: 10, mult: 0, lvChips: 10, lvMult: 0, how: '놓은 조각이 남김없이 지워지게' },
  { id: 'edge', kind: 'addon', short: '가장자리 줄', name: '감침질', chips: 10, mult: 0, lvChips: 7, lvMult: 0, how: '맨 바깥 줄을 지우기' },
  { id: 'center', kind: 'addon', short: '가운데 줄', name: '등솔', chips: 10, mult: 0, lvChips: 10, lvMult: 0, how: '한가운데 두 줄 중 하나를 지우기' },
];

export const SEAM_BY_ID = Object.fromEntries(SEAMS.map((s) => [s.id, s]));
export const SEAM_IDS = SEAMS.map((s) => s.id);
export const SHAPE_IDS = SEAMS.filter((s) => s.kind === 'shape').map((s) => s.id);
export const ADDON_IDS = SEAMS.filter((s) => s.kind === 'addon').map((s) => s.id);
export const PATTERN_PRICE = 3;
// every name but the fallback hand has a pattern paper
export const PATTERN_SEAMS = SEAM_IDS.filter((id) => !SEAM_BY_ID[id].fixed);

const EDGE = [0, N - 1];
const CENTER = [N / 2 - 1, N / 2];

export function startingLevels() {
  return Object.fromEntries(SEAM_IDS.map((id) => [id, 1]));
}

/** The shape one direction's lines make (indices of cleared rows, or of cleared columns). */
function shapeOfGroup(idx) {
  if (idx.length >= 3) return 'triple';
  if (idx.length === 2) return Math.abs(idx[0] - idx[1]) === 1 ? 'double' : 'gap';
  return idx.length ? 'single' : null;
}

/**
 * The shape a clear is named by: the direction with more lines decides it (rows and columns
 * cleared together add 십자수 on top). A tie between the two directions goes to the higher-ranked
 * shape. ctx needs rowIdx and colIdx (cleared row / column indices).
 */
export function judgeSeam(ctx) {
  if (!ctx.lineCount) return null;
  const a = shapeOfGroup(ctx.rowIdx || []);
  const b = shapeOfGroup(ctx.colIdx || []);
  if (!a || !b) return a || b;
  const na = ctx.rowIdx.length, nb = ctx.colIdx.length;
  if (na !== nb) return na > nb ? a : b;
  return SHAPE_IDS.indexOf(a) <= SHAPE_IDS.indexOf(b) ? a : b;
}

/**
 * Every add-on a clear earns, in table order. ctx needs rowIdx, colIdx, perfect, and for 시침질
 * the placed patch's cells (pieceCells) and the cleared cells (cleared: [{ r, c }]).
 */
export function addonsOf(ctx) {
  if (!ctx.lineCount) return [];
  const rows = ctx.rowIdx || [], cols = ctx.colIdx || [];
  const lines = [...rows, ...cols];
  const has = {
    perfect: !!ctx.perfect,
    cross: rows.length > 0 && cols.length > 0,
    whole: !!ctx.pieceCells && ctx.pieceCells.every(([r, c]) => rows.includes(r) || cols.includes(c)),
    edge: lines.some((i) => EDGE.includes(i)),
    center: lines.some((i) => CENTER.includes(i)),
  };
  return ADDON_IDS.filter((id) => has[id]);
}

/**
 * The colour bonus: each line filled in a single colour adds its share of a doubling, so a clear
 * whose every line is one colour (오목누비) scores ×2, and one of two lines ×1.5.
 */
export function monoFactor(ctx) {
  return ctx.lineCount ? 1 + (ctx.monoLines || 0) / ctx.lineCount : 1;
}

/**
 * The finish a clear's colours give it, named on top of its seam (never instead of it):
 * every line one colour → 오목누비 (the ridged, finest nubi, ×2); some lines one colour → 납작누비
 * (the flat kind, ×1 to ×2); none → plain (null).
 */
export const FINISH_BY_ID = { ridge: { name: '오목누비' }, flat: { name: '납작누비' } };

export function finishOf(ctx) {
  const m = ctx.monoLines || 0;
  if (!ctx.lineCount || !m) return null;
  return m >= ctx.lineCount ? 'ridge' : 'flat';
}

/**
 * A keepsake patch as it is drawn today. Saves from before colour became a finish still hold the
 * old colour seams ('mono', 'twinMono'): they become the plain stitch that seam needed (one line,
 * two lines) finished as today's rules would name it — every line one colour, so 오목누비. Unknown ids lose their stitch rather than crash.
 */
export function upgradePatch(h) {
  if (!h) return h;
  let { seam = null, finish = null } = h;
  if (seam === 'mono') { seam = 'single'; finish ||= 'ridge'; } // one one-colour line: 오목누비 today
  if (seam === 'twinMono') { seam = 'double'; finish ||= 'ridge'; }
  if (seam && !SEAM_BY_ID[seam]) seam = null;
  if (finish && !FINISH_BY_ID[finish]) finish = null;
  return { ...h, seam, finish };
}

export function seamValue(id, level = 1) {
  const s = SEAM_BY_ID[id];
  const up = Math.max(0, level - 1);
  return { chips: s.chips + s.lvChips * up, mult: s.mult + s.lvMult * up };
}
