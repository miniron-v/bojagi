// Chips × Mult evaluation for one placement. Returns a step-by-step breakdown so the UI
// can replay it (Balatro-style tally) and the final integer score.
import { TOOLS } from './tools.js';

export const CELL_CHIPS = 5;
export const LINE_CHIPS = 10;
export const PERFECT_CHIPS = 100;
export const MONO_XMULT = 2;

/**
 * ctx: { lineCount, rowLines, colLines, monoLines, cleared, placedCells, streak,
 *        clearIndex, perfect, emptyAfter, coins, discardsLeft, boss }
 * tools: tool instances (slot order)
 */
export function evaluate(ctx, tools) {
  const steps = [];
  let chips = 0;
  let mult = 1;

  if (!ctx.lineCount) {
    // Plain placement: small trickle so every move feels like progress.
    chips = ctx.placedCells;
    steps.push({ src: 'place', chips: ctx.placedCells });
    return { chips, mult, score: chips, steps };
  }

  const cellChips = ctx.cleared.reduce(
    (s, c) => s + (ctx.boss === 'ink' && c.color === 'black' ? 0 : CELL_CHIPS),
    0,
  );
  chips = cellChips + ctx.lineCount * LINE_CHIPS;
  // Multi-line clears grow quadratically so setting up a big clear is a real choice.
  mult = ctx.lineCount * ctx.lineCount;
  steps.push({ src: 'lines', chips, mult, lines: ctx.lineCount, cells: ctx.cleared.length });

  if (ctx.streak > 1) {
    mult += ctx.streak - 1;
    steps.push({ src: 'streak', mult: ctx.streak - 1, streak: ctx.streak });
  }
  if (ctx.perfect) {
    chips += PERFECT_CHIPS;
    steps.push({ src: 'perfect', chips: PERFECT_CHIPS });
  }

  const effects = [];
  tools.forEach((inst, slot) => {
    const def = TOOLS[inst.id];
    if (!def.score) return;
    for (const e of def.score(ctx, inst)) effects.push({ ...e, slot, src: inst.id });
  });

  for (const e of effects) if (e.chips) { chips += e.chips; steps.push(e); }
  for (const e of effects) if (e.mult) { mult += e.mult; steps.push(e); }

  // Mono seams are a base rule, applied as the first multiplier.
  for (let i = 0; i < ctx.monoLines; i++) {
    mult *= MONO_XMULT;
    steps.push({ src: 'mono', xmult: MONO_XMULT });
  }
  for (const e of effects) if (e.xmult) { mult *= e.xmult; steps.push(e); }

  if (ctx.boss === 'strict') {
    mult *= 0.5;
    steps.push({ src: 'boss', xmult: 0.5 });
  }

  mult = Math.max(1, Math.round(mult * 10) / 10);
  const score = Math.floor(chips * mult);
  return { chips, mult, score, steps };
}
