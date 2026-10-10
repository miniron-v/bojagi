// 솔기 족보 (seam hands) — the poker hands of this game.
// Every clear is judged as exactly one seam, the highest-ranked one it satisfies.
// Each seam has a level; pattern papers (본) bought in the market raise it, so a run
// naturally commits to the seams it can make reliably.

export const SEAMS = [
  // rank order: first match wins
  // Names come from traditional Korean nubi (누비) quilting, matched to the shape of the clear:
  // 홈질 is the running stitch every nubi line is sewn with; 겹누비 quilts two layers; 세누비 (잔누비)
  // is the fine, closely spaced quilting; 납작누비 is the flat, even kind; 오목누비, the ridged
  // "finest of all nubi", for two matched lines; 마무리 is the finishing step when the cloth is done.
  { id: 'perfect', name: '마무리', chips: 120, mult: 8, lvChips: 40, lvMult: 3, how: '줄을 지워 수틀을 완전히 비우기' },
  { id: 'twinMono', name: '오목누비', chips: 150, mult: 8, lvChips: 40, lvMult: 3, how: '한 색으로 채운 줄 두 개 이상을 한 번에' },
  { id: 'triple', name: '세누비', chips: 120, mult: 6, lvChips: 35, lvMult: 3, how: '세 줄 이상을 한 번에' },
  { id: 'mono', name: '납작누비', chips: 70, mult: 4, lvChips: 25, lvMult: 2, how: '한 색으로만 채운 줄 하나 포함' },
  { id: 'cross', name: '십자수', chips: 80, mult: 4, lvChips: 25, lvMult: 2, how: '가로와 세로를 함께' },
  { id: 'double', name: '겹누비', chips: 60, mult: 3, lvChips: 20, lvMult: 2, how: '같은 방향 두 줄을 한 번에' },
  // the fallback hand: it never levels, so a run has to grow by committing to a bigger stitch
  { id: 'single', name: '홈질', chips: 30, mult: 1, lvChips: 0, lvMult: 0, how: '한 줄', fixed: true },
];

export const SEAM_BY_ID = Object.fromEntries(SEAMS.map((s) => [s.id, s]));
export const SEAM_IDS = SEAMS.map((s) => s.id);
export const PATTERN_PRICE = 3;
// seams the market sells patterns for: long shots and the fallback hand are left out
export const PATTERN_SEAMS = ['double', 'cross', 'mono', 'triple'];

export function startingLevels() {
  return Object.fromEntries(SEAM_IDS.map((id) => [id, 1]));
}

/** Every seam a clear satisfies, in rank order. ctx needs lineCount, rowLines, colLines, monoLines, perfect. */
export function matchingSeams(ctx) {
  if (!ctx.lineCount) return [];
  const out = [];
  if (ctx.perfect) out.push('perfect');
  if (ctx.monoLines >= 2) out.push('twinMono');
  if (ctx.lineCount >= 3) out.push('triple');
  if (ctx.monoLines >= 1) out.push('mono');
  if (ctx.rowLines && ctx.colLines) out.push('cross');
  if (ctx.lineCount >= 2 && (ctx.rowLines >= 2 || ctx.colLines >= 2)) out.push('double');
  out.push('single');
  return out;
}

/**
 * Which seam a clear is scored as: the satisfied seam worth most at the current levels
 * (chips × mult), ties going to the higher rank. A leveled seam is never overridden by a
 * higher-ranked but weaker one.
 */
export function judgeSeam(ctx, levels = null) {
  const all = matchingSeams(ctx);
  if (!all.length) return null;
  let best = all[0];
  let bestV = -1;
  for (const id of all) {
    const v = seamValue(id, (levels && levels[id]) || 1);
    const val = v.chips * v.mult;
    if (val > bestV) { best = id; bestV = val; }
  }
  return best;
}

export function seamValue(id, level = 1) {
  const s = SEAM_BY_ID[id];
  const up = Math.max(0, level - 1);
  return { chips: s.chips + s.lvChips * up, mult: s.mult + s.lvMult * up };
}
