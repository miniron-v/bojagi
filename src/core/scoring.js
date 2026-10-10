// Chips × Mult evaluation for one placement. Returns a step-by-step breakdown so the UI
// can replay it (Balatro-style tally) and the final integer score.
import { TOOLS } from './tools.js';
import { judgeSeam, seamValue } from './seams.js';

export const CELL_CHIPS = 5;

/**
 * ctx: { lineCount, rowLines, colLines, monoLines, cleared, placedCells, streak,
 *        clearIndex, perfect, emptyAfter, coins, discardsLeft, boss, levels, topSeam, patterns }
 * tools: tool instances (slot order)
 * Order: seam base → each cleared cell → streak → tool chips → tool +mult → tool ×mult → boss.
 */
export function evaluate(ctx, tools) {
  const steps = [];

  if (!ctx.lineCount) {
    // Plain placement: small trickle so every move feels like progress.
    steps.push({ src: 'place', chips: ctx.placedCells });
    return { chips: ctx.placedCells, mult: 1, score: ctx.placedCells, seam: null, steps };
  }

  const seam = ctx.seam || judgeSeam(ctx);
  const level = (ctx.levels && ctx.levels[seam]) || 1;
  const base = seamValue(seam, level);
  let chips = base.chips;
  let mult = base.mult;
  steps.push({ src: 'seam', seam, level, chips: base.chips, mult: base.mult, set: true });

  const cellChips = ctx.cleared.reduce(
    (s, c) => s + (ctx.boss === 'ink' && c.color === 'black' ? 0 : CELL_CHIPS),
    0,
  );
  chips += cellChips;
  steps.push({ src: 'cells', chips: cellChips, cells: ctx.cleared.length });

  if (ctx.streak > 1) {
    mult += ctx.streak - 1;
    steps.push({ src: 'streak', mult: ctx.streak - 1, streak: ctx.streak });
  }

  const effects = [];
  const tctx = { ...ctx, seam, level };
  tools.forEach((inst, slot) => {
    const def = TOOLS[inst.id];
    if (!def.score) return;
    for (const e of def.score(tctx, inst)) effects.push({ ...e, slot, src: inst.id });
  });
  for (const e of effects) if (e.chips) { chips += e.chips; steps.push(e); }
  for (const e of effects) if (e.mult) { mult += e.mult; steps.push(e); }
  for (const e of effects) if (e.xmult) { mult *= e.xmult; steps.push(e); }

  if (ctx.boss === 'strict') {
    mult *= 0.5;
    steps.push({ src: 'boss', xmult: 0.5 });
  }

  mult = Math.max(1, Math.round(mult * 10) / 10);
  const score = Math.floor(chips * mult);
  return { chips, mult, score, seam, level, steps };
}
