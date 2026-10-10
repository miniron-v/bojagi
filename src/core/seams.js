// 솔기 족보 (seam hands) — the poker hands of this game.
// Every clear is judged as exactly one seam, the highest-ranked one it satisfies.
// Each seam has a level; pattern papers (본) bought in the market raise it, so a run
// naturally commits to the seams it can make reliably.

export const SEAMS = [
  // rank order: first match wins
  { id: 'perfect', name: '판 비움', chips: 120, mult: 8, lvChips: 40, lvMult: 3, how: '줄을 지워 수틀을 완전히 비우기' },
  { id: 'twinMono', name: '쌍단색', chips: 150, mult: 8, lvChips: 40, lvMult: 3, how: '한 색으로 채운 줄 두 개 이상을 한 번에' },
  { id: 'triple', name: '세겹솔기', chips: 120, mult: 6, lvChips: 35, lvMult: 3, how: '세 줄 이상을 한 번에' },
  { id: 'mono', name: '단색 솔기', chips: 70, mult: 4, lvChips: 25, lvMult: 2, how: '한 색으로만 채운 줄 하나 포함' },
  { id: 'cross', name: '십자솔기', chips: 80, mult: 4, lvChips: 25, lvMult: 2, how: '가로와 세로를 함께' },
  { id: 'double', name: '겹솔기', chips: 60, mult: 3, lvChips: 20, lvMult: 2, how: '같은 방향 두 줄을 한 번에' },
  { id: 'single', name: '홑솔기', chips: 30, mult: 1, lvChips: 10, lvMult: 1, how: '한 줄' },
];

export const SEAM_BY_ID = Object.fromEntries(SEAMS.map((s) => [s.id, s]));
export const SEAM_IDS = SEAMS.map((s) => s.id);
export const PATTERN_PRICE = 3;

export function startingLevels() {
  return Object.fromEntries(SEAM_IDS.map((id) => [id, 1]));
}

/** Which seam a clear makes. ctx needs lineCount, rowLines, colLines, monoLines, perfect. */
export function judgeSeam(ctx) {
  if (!ctx.lineCount) return null;
  if (ctx.perfect) return 'perfect';
  if (ctx.monoLines >= 2) return 'twinMono';
  if (ctx.lineCount >= 3) return 'triple';
  if (ctx.monoLines >= 1) return 'mono';
  if (ctx.rowLines && ctx.colLines) return 'cross';
  if (ctx.lineCount === 2) return 'double';
  return 'single';
}

export function seamValue(id, level = 1) {
  const s = SEAM_BY_ID[id];
  const up = Math.max(0, level - 1);
  return { chips: s.chips + s.lvChips * up, mult: s.mult + s.lvMult * up };
}
