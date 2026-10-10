// Run state machine. Every function mutates `run` (plain JSON, saveable) and returns
// an event list the UI replays as animation. No DOM / timing here.
import { createRng, next, int, weighted, pick, shuffle, hashString } from './rng.js';
import { SHAPES, SHAPE_BY_ID, COLORS } from './shapes.js';
import { N, emptyBoard, canPlace, fitsAnywhere, paint, fullLines, clearLines, filledCount } from './board.js';
import { TOOLS, TOOL_IDS, MAX_TOOLS, makeTool, sellPrice } from './tools.js';
import { evaluate } from './scoring.js';
import { SEAM_IDS, PATTERN_PRICE, startingLevels, judgeSeam } from './seams.js';

export const SAVE_VERSION = 1;
export const DAYS = 4;
export const ORDERS_PER_DAY = 3;
export const BASE_PATCHES = 18;
export const BASE_DISCARDS = 2;
export const START_COINS = 5;
export const REROLL_BASE = 2;
export const INTEREST_CAP = 4;
export const INTEREST_PER = 5; // coins held per 1 coin of interest
export const LEFTOVER_CAP = 5; // max coins paid for unused patches
export const STREAK_GRACE = 3; // placements without a clear before the streak breaks
export const KNOTS = 8;
export const SHORT_PENALTY = 4;
export const BIG_PENALTY = 2;
export const BIG_MIN_SIZE = 4;
export const BOSS_ORDER = 2; // index of the boss order within a day
export const MONO_TRAY_CHANCE = 0.5;
export const PATTERN_OFFERS = 2;

export const ORDER_KINDS = [
  { key: 'small', name: '작은 주문', reward: 3, scale: 1 },
  { key: 'big', name: '큰 주문', reward: 4, scale: 1.5 },
  { key: 'boss', name: '장인 의뢰', reward: 5, scale: 1.75 },
];

// Target for the small order of each day; big/boss multiply by ORDER_KINDS.scale.
// Calibrated by tools/simulate.mjs.
export const DAY_BASE = [400, 1700, 4800, 12500];
export const ENDLESS_GROWTH = 1.9; // must exceed the boss scale so targets keep rising

export const BOSSES = {
  knots: { scale: 1.75, name: '매듭', desc: `매듭 ${KNOTS}개가 칸을 막고 시작. 매듭이 든 줄을 채우면 함께 풀려요` },
  ink: { scale: 1.6, name: '먹물', desc: '흑색 칸은 지워도 칩이 0' },
  busy: { scale: 1.5, name: '바쁜 손', desc: '조각 바꾸기를 쓸 수 없음' },
  short: { scale: 1.5, name: '짧은 실', desc: `조각이 ${SHORT_PENALTY}개 적음` },
  big: { scale: 1.75, name: '큰 천', desc: `${BIG_MIN_SIZE}칸 이상 조각만, 조각 ${BIG_PENALTY}개 적음` },
  strict: { scale: 1.2, name: '깐깐한 눈', desc: '모든 점수의 배수가 절반' },
};
export const BOSS_IDS = Object.keys(BOSSES);
// Boss rules arrive easiest first: one day introduces one new kind of pressure.
export const BOSS_TIERS = [['short', 'big'], ['knots', 'ink'], ['busy', 'knots', 'ink'], ['strict']];

/** Order target. Boss orders scale by their rule: harsher rules ask for less. */
export function targetFor(day, orderIdx, boss = null) {
  let base;
  if (day <= DAYS) base = DAY_BASE[day - 1];
  else base = DAY_BASE[DAYS - 1] * Math.pow(ENDLESS_GROWTH, day - DAYS);
  const scale = boss && BOSSES[boss] ? BOSSES[boss].scale : ORDER_KINDS[orderIdx].scale;
  const t = base * scale;
  const mag = Math.pow(10, Math.max(1, Math.floor(Math.log10(t)) - 1));
  return Math.round(t / mag) * mag;
}

export function dailySeed(date = new Date()) {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  return { key, seed: hashString(`bojagi:${key}`) };
}

export function newRun({ seed = (Math.random() * 2 ** 32) >>> 0, mode = 'normal', dailyKey = null, locked = [] } = {}) {
  const rng = createRng(seed);
  const bosses = [];
  for (let d = 0; d < DAYS; d++) {
    const tier = BOSS_TIERS[Math.min(d, BOSS_TIERS.length - 1)].filter((b) => !bosses.includes(b));
    bosses.push(pick(rng, tier.length ? tier : BOSS_IDS));
  }
  const run = {
    v: SAVE_VERSION,
    seed,
    mode,
    dailyKey,
    rng,
    day: 1,
    orderIdx: 0,
    phase: 'intro',
    coins: START_COINS,
    tools: [],
    bosses,
    locked: locked.slice(),
    gift: shuffle(rng, TOOL_IDS.filter((id) => TOOLS[id].rarity === 1 && !locked.includes(id))).slice(0, 2),
    board: emptyBoard(),
    tray: [null, null, null],
    order: null,
    shop: null,
    reward: null,
    history: [],
    seams: startingLevels(),
    endless: false,
    stats: emptyStats(),
  };
  prepareOrder(run);
  return run;
}

export function emptyStats() {
  return {
    bestHand: 0, clears: 0, perfects: 0, orders: 0, placed: 0, bestStreak: 0, monos: 0, crosses: 0, triples: 0,
    seamCounts: {}, patterns: 0,
  };
}

/** The first customer's gift is offered after the first order, once the player knows the rules. */
export function chooseGift(run, i) {
  if (run.phase !== 'gift') return [];
  const id = run.gift[i];
  if (id && run.tools.length < MAX_TOOLS) run.tools.push(makeTool(id));
  run.gift = null;
  openShop(run);
  return [{ type: 'gift', id }];
}

/** Boss rule for any order of the run (null for non-boss orders). Endless days cycle the rules. */
export function bossFor(run, day, orderIdx) {
  if (orderIdx !== BOSS_ORDER) return null;
  if (day <= DAYS) return run.bosses[day - 1];
  return BOSS_IDS[(day * 7) % BOSS_IDS.length];
}

export function bossOf(run) {
  return bossFor(run, run.day, run.orderIdx);
}

/** The order that follows the current one. */
export function nextOrderOf(run) {
  let day = run.day;
  let orderIdx = run.orderIdx + 1;
  if (orderIdx >= ORDERS_PER_DAY) { orderIdx = 0; day += 1; }
  const boss = bossFor(run, day, orderIdx);
  return { day, orderIdx, target: targetFor(day, orderIdx, boss), boss };
}

function toolSum(run, key) {
  return run.tools.reduce((s, t) => s + (TOOLS[t.id][key] || 0), 0);
}

export function prepareOrder(run) {
  const boss = bossOf(run);
  let patches = BASE_PATCHES + toolSum(run, 'patches');
  let discards = BASE_DISCARDS + toolSum(run, 'discards');
  if (boss === 'short') patches -= SHORT_PENALTY;
  if (boss === 'big') patches -= BIG_PENALTY;
  if (boss === 'busy') discards = 0;
  for (const t of run.tools) {
    const def = TOOLS[t.id];
    if (def.onOrderStart) def.onOrderStart(t);
  }
  run.order = {
    kind: run.orderIdx,
    target: targetFor(run.day, run.orderIdx, boss),
    boss,
    score: 0,
    patchesLeft: patches,
    patchesMax: patches,
    discardsLeft: discards,
    streak: 0,
    sinceClear: 0,
    clears: 0,
    stuck: false,
    colors: {},
  };
  run.board = emptyBoard();
  if (boss === 'knots') {
    let n = 0;
    while (n < KNOTS) {
      const k = int(run.rng, N * N);
      if (run.board[k] === null) { run.board[k] = 'knot'; n++; }
    }
  }
  run.tray = [null, null, null];
  run.phase = 'intro';
}

export function beginOrder(run) {
  if (run.phase !== 'intro') return [];
  run.phase = 'play';
  refillTray(run);
  return [{ type: 'tray' }, ...checkStuck(run)];
}

function shapePool(run) {
  if (run.order && run.order.boss === 'big') return SHAPES.filter((s) => s.size >= BIG_MIN_SIZE);
  return SHAPES;
}

function randomPiece(run, color) {
  const shape = weighted(run.rng, shapePool(run), (s) => s.weight);
  return { shape: shape.id, color: color || pick(run.rng, COLORS) };
}

function refillTray(run) {
  const count = Math.min(3, run.order.patchesLeft);
  let tray;
  // Guarantee at least one placeable patch; jams should come from play, not from the dealer.
  for (let attempt = 0; attempt < 30; attempt++) {
    tray = [];
    // Half the trays share one color so single-color seams are a plan, not a miracle.
    const shared = next(run.rng) < MONO_TRAY_CHANCE ? pick(run.rng, COLORS) : null;
    for (let i = 0; i < count; i++) tray.push(randomPiece(run, shared));
    if (tray.some((p) => fitsAnywhere(run.board, SHAPE_BY_ID[p.shape]))) break;
    if (attempt === 29) {
      // Last resort: a single dot if there is any empty cell.
      if (run.board.some((v) => v === null)) tray[0] = { shape: 'dot_0', color: pick(run.rng, COLORS) };
    }
  }
  while (tray.length < 3) tray.push(null);
  run.tray = tray;
}

export function trayFits(run) {
  return run.tray.map((p) => !!p && fitsAnywhere(run.board, SHAPE_BY_ID[p.shape]));
}

function checkStuck(run) {
  if (run.phase !== 'play') return [];
  const any = trayFits(run).some(Boolean);
  run.order.stuck = !any;
  if (any) return [];
  if (run.order.discardsLeft > 0) return [{ type: 'stuck' }];
  return failOrder(run, 'jam');
}

function dominantColor(o) {
  let best = null;
  for (const c of COLORS) if ((o.colors?.[c] || 0) > (o.colors?.[best] || 0)) best = c;
  return best || 'white';
}

function logOrder(run, ok) {
  (run.history ||= []).push({ kind: run.order.kind, ok, color: dominantColor(run.order), score: run.order.score });
}

function failOrder(run, reason) {
  logOrder(run, false);
  run.phase = 'over';
  run.overReason = reason;
  return [{ type: 'fail', reason, short: run.order.target - run.order.score }];
}

/** Score preview for UI: what would placing tray[i] at (r,c) produce? null if illegal. */
export function preview(run, i, r, c) {
  const p = run.tray[i];
  if (!p) return null;
  const shape = SHAPE_BY_ID[p.shape];
  if (!canPlace(run.board, shape, r, c)) return null;
  const painted = paint(run.board, shape, r, c, p.color);
  const lines = fullLines(painted);
  const res = scorePlacement(run, painted, lines, shape, true);
  const o = run.order;
  const streakBreaks = !lines.length && o.streak > 0 && o.sinceClear + 1 >= STREAK_GRACE;
  return { lines, ...res.result, streak: res.ctx.streak, streakBreaks, completes: o.score + res.result.score >= o.target };
}

function scorePlacement(run, painted, lines, shape, dry) {
  const { board: after, cleared } = clearLines(painted, lines);
  const o = run.order;
  const streak = lines.length ? o.streak + 1 : 0;
  const ctx = {
    levels: run.seams,
    lineCount: lines.length,
    rowLines: lines.filter((l) => l.type === 'row').length,
    colLines: lines.filter((l) => l.type === 'col').length,
    monoLines: lines.filter((l) => l.mono).length,
    cleared,
    placedCells: shape.size,
    streak,
    clearIndex: o.clears + (lines.length ? 1 : 0),
    perfect: lines.length > 0 && filledCount(after) === 0,
    emptyAfter: N * N - filledCount(after),
    coins: run.coins,
    discardsLeft: o.discardsLeft,
    boss: o.boss,
  };
  ctx.seam = judgeSeam(ctx);
  // Tool state must not leak from previews: use copies when dry.
  let tools = run.tools;
  if (dry) {
    tools = run.tools.map((t) => ({ id: t.id, data: { ...t.data } }));
    for (const t of tools) if (TOOLS[t.id].onPlace) TOOLS[t.id].onPlace(t);
  }
  return { ctx, after, cleared, result: evaluate(ctx, tools) };
}

export function place(run, i, r, c) {
  if (run.phase !== 'play') return { ok: false, events: [] };
  const p = run.tray[i];
  if (!p) return { ok: false, events: [] };
  const shape = SHAPE_BY_ID[p.shape];
  if (!canPlace(run.board, shape, r, c)) return { ok: false, events: [] };

  const o = run.order;
  o.colors ||= {};
  const events = [];
  const lateGrow = [];
  // onPlace hooks (e.g. silk) fire before scoring so the patch you place counts.
  run.tools.forEach((t, slot) => {
    const def = TOOLS[t.id];
    if (def.onPlace) { def.onPlace(t); events.push({ type: 'toolGrow', slot }); }
  });

  const painted = paint(run.board, shape, r, c, p.color);
  const lines = fullLines(painted);
  const { ctx, after, cleared, result } = scorePlacement(run, painted, lines, shape, false);

  run.tray[i] = null;
  o.patchesLeft -= 1;
  o.colors[p.color] = (o.colors[p.color] || 0) + shape.size;
  for (const cell of cleared) if (cell.color !== 'knot') o.colors[cell.color] = (o.colors[cell.color] || 0) + 1;
  run.stats.placed += 1;
  events.unshift({ type: 'place', tray: i, r, c, piece: p, cells: shape.cells.map(([dr, dc]) => [r + dr, c + dc]) });

  if (lines.length) {
    o.clears += 1;
    o.streak = ctx.streak;
    o.sinceClear = 0;
    run.stats.clears += lines.length;
    run.stats.bestStreak = Math.max(run.stats.bestStreak, o.streak);
    if (ctx.perfect) run.stats.perfects += 1;
    run.stats.monos += ctx.monoLines;
    if (ctx.rowLines && ctx.colLines) run.stats.crosses += 1;
    if (lines.length >= 3) run.stats.triples += 1;
    const sc = (run.stats.seamCounts ||= {});
    sc[ctx.seam] = (sc[ctx.seam] || 0) + 1;
    run.tools.forEach((t, slot) => {
      const def = TOOLS[t.id];
      if (def.after && def.after(ctx, t)) lateGrow.push({ type: 'toolGrow', slot, late: true });
    });
  } else {
    o.sinceClear += 1;
    if (o.sinceClear >= STREAK_GRACE) o.streak = 0;
  }

  run.board = after;
  o.score += result.score;
  run.stats.bestHand = Math.max(run.stats.bestHand, result.score);
  events.push({
    type: 'score', lines, cleared, result, streak: o.streak, perfect: ctx.perfect,
    painted, mono: ctx.monoLines,
  });
  events.push(...lateGrow);

  if (o.score >= o.target) {
    events.push(...winOrder(run));
    return { ok: true, events };
  }
  if (o.patchesLeft <= 0) {
    events.push(...failOrder(run, 'out'));
    return { ok: true, events };
  }
  if (run.tray.every((t) => t === null)) {
    refillTray(run);
    events.push({ type: 'tray' });
  }
  events.push(...checkStuck(run));
  return { ok: true, events };
}

export function discard(run) {
  if (run.phase !== 'play' || run.order.discardsLeft <= 0) return [];
  run.order.discardsLeft -= 1;
  refillTray(run);
  return [{ type: 'discard' }, { type: 'tray' }, ...checkStuck(run)];
}

function winOrder(run) {
  const o = run.order;
  logOrder(run, true);
  run.phase = 'reward';
  run.stats.orders += 1;
  const lines = [];
  lines.push({ label: ORDER_KINDS[o.kind].name + ' 완료', coins: ORDER_KINDS[o.kind].reward });
  const left = Math.min(LEFTOVER_CAP, o.patchesLeft);
  if (left > 0) lines.push({ label: `남은 조각 ${o.patchesLeft}개`, coins: left, kind: 'leftover' });
  const interest = Math.min(INTEREST_CAP, Math.floor(run.coins / INTEREST_PER));
  if (interest > 0) lines.push({ label: `이자 (${INTEREST_PER}닢마다 1)`, coins: interest, kind: 'interest' });
  run.tools.forEach((t) => {
    const def = TOOLS[t.id];
    if (def.reward) lines.push({ label: def.name, coins: def.reward(run, t) });
  });
  run.reward = { lines, total: lines.reduce((s, l) => s + l.coins, 0) };
  return [{ type: 'won' }];
}

export function collectReward(run) {
  if (run.phase !== 'reward') return [];
  run.coins += run.reward.total;
  const got = run.reward.total;
  run.reward = null;
  const finishedRun = run.day === DAYS && run.orderIdx === ORDERS_PER_DAY - 1 && !run.endless;
  if (finishedRun) {
    run.phase = 'victory';
    return [{ type: 'coins', amount: got }, { type: 'victory' }];
  }
  if (run.gift) {
    run.phase = 'gift';
    return [{ type: 'coins', amount: got }, { type: 'giftOffer' }];
  }
  openShop(run);
  return [{ type: 'coins', amount: got }];
}

function rarityWeight(run, rarity) {
  const d = Math.min(run.day, 6);
  return rarity === 1 ? 60 : rarity === 2 ? 28 + d * 2 : 8 + d * 3;
}

function rollOffers(run) {
  const owned = new Set(run.tools.map((t) => t.id));
  const locked = new Set(run.locked || []);
  let pool = TOOL_IDS.filter((id) => !owned.has(id) && !locked.has(id));
  const offers = [];
  for (let k = 0; k < 3 && pool.length; k++) {
    const id = weighted(run.rng, pool, (x) => rarityWeight(run, TOOLS[x].rarity));
    offers.push({ id, sold: false });
    pool = pool.filter((x) => x !== id);
  }
  return offers;
}

function rollPatterns(run) {
  // perfect-clear patterns are rarer: that seam is a long shot to build around
  const pool = SEAM_IDS.slice();
  const out = [];
  for (let k = 0; k < PATTERN_OFFERS; k++) {
    const id = weighted(run.rng, pool.filter((x) => !out.some((o) => o.id === x)), (x) => (x === 'perfect' ? 0.4 : 1));
    out.push({ id, sold: false });
  }
  return out;
}

function openShop(run) {
  run.phase = 'shop';
  run.shop = { offers: rollOffers(run), patterns: rollPatterns(run), rerollCost: REROLL_BASE };
}

/** Buy a pattern paper (본): raises that seam's level for the rest of the run. */
export function buyPattern(run, i) {
  if (run.phase !== 'shop') return { ok: false, reason: 'phase' };
  const offer = run.shop.patterns && run.shop.patterns[i];
  if (!offer || offer.sold) return { ok: false, reason: 'sold' };
  if (run.coins < PATTERN_PRICE) return { ok: false, reason: 'coins' };
  run.coins -= PATTERN_PRICE;
  offer.sold = true;
  run.seams[offer.id] = (run.seams[offer.id] || 1) + 1;
  run.stats.patterns = (run.stats.patterns || 0) + 1;
  const grown = [];
  run.tools.forEach((t, slot) => {
    const def = TOOLS[t.id];
    if (def.onPattern) { def.onPattern(t); grown.push(slot); }
  });
  return { ok: true, seam: offer.id, level: run.seams[offer.id], grown };
}

export function buy(run, i) {
  if (run.phase !== 'shop') return { ok: false, reason: 'phase' };
  const offer = run.shop.offers[i];
  if (!offer || offer.sold) return { ok: false, reason: 'sold' };
  const price = TOOLS[offer.id].price;
  if (run.tools.length >= MAX_TOOLS) return { ok: false, reason: 'full' };
  if (run.coins < price) return { ok: false, reason: 'coins' };
  run.coins -= price;
  offer.sold = true;
  run.tools.push(makeTool(offer.id));
  return { ok: true };
}

export function sell(run, slot) {
  if (run.phase !== 'shop') return { ok: false };
  const t = run.tools[slot];
  if (!t) return { ok: false };
  run.coins += sellPrice(t);
  run.tools.splice(slot, 1);
  return { ok: true };
}

export function reroll(run) {
  if (run.phase !== 'shop' || run.coins < run.shop.rerollCost) return { ok: false };
  run.coins -= run.shop.rerollCost;
  run.shop.rerollCost += 1;
  run.shop.offers = rollOffers(run);
  run.shop.patterns = rollPatterns(run);
  return { ok: true };
}

export function leaveShop(run) {
  if (run.phase !== 'shop') return [];
  run.shop = null;
  run.orderIdx += 1;
  if (run.orderIdx >= ORDERS_PER_DAY) {
    run.orderIdx = 0;
    run.day += 1;
  }
  prepareOrder(run);
  return [{ type: 'nextOrder', day: run.day, orderIdx: run.orderIdx }];
}

export function continueEndless(run) {
  if (run.phase !== 'victory') return [];
  run.endless = true;
  openShop(run);
  return [];
}

/** Fills fields added after a save was written so older saves keep working. */
export function migrate(s) {
  s.history ||= [];
  if (s.order) s.order.colors ||= {};
  s.stats = { ...emptyStats(), ...(s.stats || {}) };
  s.locked ||= [];
  s.seams = { ...startingLevels(), ...(s.seams || {}) };
  if (s.shop && !s.shop.patterns) s.shop.patterns = [];
  return s;
}

export function isValidSave(s) {
  try {
    if (!s || s.v !== SAVE_VERSION || !s.rng || typeof s.rng.s !== 'number') return false;
    if (!Array.isArray(s.board) || s.board.length !== N * N) return false;
    if (!Array.isArray(s.tools) || !s.tools.every((t) => t && TOOLS[t.id] && t.data)) return false;
    if (!Array.isArray(s.tray) || s.tray.length !== 3) return false;
    if (!s.tray.every((p) => p === null || (SHAPE_BY_ID[p.shape] && COLORS.includes(p.color)))) return false;
    const phases = ['intro', 'play', 'reward', 'gift', 'shop', 'over', 'victory'];
    if (!phases.includes(s.phase)) return false;
    if (!s.order || typeof s.order.target !== 'number') return false;
    if (s.phase === 'reward' && !(s.reward && Array.isArray(s.reward.lines))) return false;
    if (s.phase === 'gift' && !(Array.isArray(s.gift) && s.gift.every((id) => TOOLS[id]))) return false;
    if (s.phase === 'shop' && !(s.shop && Array.isArray(s.shop.offers) && s.shop.offers.every((o) => TOOLS[o.id]))) return false;
    return true;
  } catch {
    return false;
  }
}

