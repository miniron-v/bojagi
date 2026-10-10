import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SHAPE_BY_ID } from '../src/core/shapes.js';
import { emptyBoard, canPlace, paint, fullLines, clearLines, idx } from '../src/core/board.js';
import { evaluate } from '../src/core/scoring.js';
import { makeTool, TOOL_IDS, TOOLS } from '../src/core/tools.js';
import * as R from '../src/core/run.js';

test('shapes: orientations are unique and normalized', () => {
  const sigs = new Set(SHAPES.map((s) => s.cells.map((p) => p.join(',')).join(';')));
  assert.equal(sigs.size, SHAPES.length);
  for (const s of SHAPES) {
    assert.equal(Math.min(...s.cells.map((p) => p[0])), 0);
    assert.equal(Math.min(...s.cells.map((p) => p[1])), 0);
  }
  assert.equal(SHAPES.filter((s) => s.family === 'i2').length, 2);
  assert.equal(SHAPES.filter((s) => s.family === 'l4').length, 8);
  assert.equal(SHAPES.filter((s) => s.family === 'o2').length, 1);
});

test('board: placement bounds and overlap', () => {
  const b = emptyBoard();
  const i5 = SHAPES.find((s) => s.family === 'i5' && s.w === 5);
  assert.ok(canPlace(b, i5, 0, 3));
  assert.ok(!canPlace(b, i5, 0, 4));
  const b2 = paint(b, i5, 0, 0, 'red');
  assert.ok(!canPlace(b2, i5, 0, 2));
});

test('board: row + column clear shares the crossing cell once', () => {
  let b = emptyBoard();
  for (let c = 0; c < 8; c++) b[idx(3, c)] = 'red';
  for (let r = 0; r < 8; r++) b[idx(r, 5)] = 'red';
  const lines = fullLines(b);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.mono === 'red'));
  const { board, cleared } = clearLines(b, lines);
  assert.equal(cleared.length, 15);
  assert.ok(board.every((v) => v === null));
});

test('board: knots break mono seams', () => {
  const b = emptyBoard();
  for (let c = 0; c < 8; c++) b[idx(0, c)] = 'blue';
  b[idx(0, 2)] = 'knot';
  assert.equal(fullLines(b)[0].mono, null);
});

const baseCtx = (over = {}) => ({
  lineCount: 1, rowLines: 1, colLines: 0, monoLines: 0,
  cleared: Array.from({ length: 8 }, (_, c) => ({ r: 0, c, color: 'red' })),
  placedCells: 3, streak: 1, clearIndex: 1, perfect: false, emptyAfter: 50,
  coins: 0, discardsLeft: 2, boss: null, ...over,
});

test('scoring: plain placement', () => {
  const r = evaluate(baseCtx({ lineCount: 0, cleared: [] }), []);
  assert.equal(r.score, 3);
});

test('scoring: single line, streak, mono seam', () => {
  assert.equal(evaluate(baseCtx(), []).score, 70); // 홈질 (30 + 8×5) × 1
  assert.equal(evaluate(baseCtx({ streak: 3 }), []).score, 210); // ×(1+2)
  assert.equal(evaluate(baseCtx({ monoLines: 1 }), []).score, 440); // 단색 (70+40) × 4
  // 홈질 never levels
  assert.equal(evaluate(baseCtx({ levels: { single: 3 } }), []).score, 70);
});

test('scoring: phases apply chips, then +mult, then ×mult regardless of slot order', () => {
  const a = evaluate(baseCtx({ lineCount: 2, colLines: 1 }), [makeTool('scissors'), makeTool('thimble'), makeTool('needlecase')]);
  const b = evaluate(baseCtx({ lineCount: 2, colLines: 1 }), [makeTool('needlecase'), makeTool('thimble'), makeTool('scissors')]);
  assert.equal(a.score, b.score);
  // 십자솔기: chips 80 + 40 + 50 = 170; mult 4 + 3 = 7; ×2 = 14 → 2380
  assert.equal(a.seam, 'cross');
  assert.equal(a.score, 2380);
});

test('scoring: ink boss zeroes black cells, strict halves mult', () => {
  const black = baseCtx({ cleared: Array.from({ length: 8 }, (_, c) => ({ r: 0, c, color: 'black' })), boss: 'ink' });
  assert.equal(evaluate(black, []).score, 30);
  assert.equal(evaluate(baseCtx({ boss: 'strict', streak: 3 }), []).score, 105);
});

test('tools: every tool has a description and valid rarity/price', () => {
  for (const id of TOOL_IDS) {
    const t = makeTool(id);
    assert.equal(typeof TOOLS[id].desc(t), 'string');
    assert.ok([1, 2, 3].includes(TOOLS[id].rarity));
    assert.ok(TOOLS[id].price > 0);
  }
});

function playGreedy(run, maxSteps = 400) {
  for (let s = 0; s < maxSteps && run.phase === 'play'; s++) {
    let best = null;
    run.tray.forEach((p, i) => {
      if (!p) return;
      const shape = SHAPE_BY_ID[p.shape];
      for (let r = 0; r <= 8 - shape.h; r++) for (let c = 0; c <= 8 - shape.w; c++) {
        const pv = R.preview(run, i, r, c);
        if (pv && (!best || pv.score > best.score)) best = { i, r, c, score: pv.score };
      }
    });
    if (!best) { R.discard(run); continue; }
    const res = R.place(run, best.i, best.r, best.c);
    assert.ok(res.ok);
  }
}

test('run: deterministic from seed and preview equals actual score', () => {
  const a = R.newRun({ seed: 42 });
  const b = R.newRun({ seed: 42 });
  R.beginOrder(a); R.beginOrder(b);
  assert.deepEqual(a.tray, b.tray);
  // preview must match actual placement result
  const p = a.tray[0];
  const shape = SHAPE_BY_ID[p.shape];
  const pv = R.preview(a, 0, 0, 0);
  if (pv) {
    const before = a.order.score;
    const res = R.place(a, 0, 0, 0);
    const sc = res.events.find((e) => e.type === 'score');
    assert.equal(sc.result.score, pv.score);
    assert.equal(a.order.score - before, pv.score);
  }
  assert.ok(shape);
});

test('run: full loop reaches reward or over, survives JSON round-trip', () => {
  let won = 0;
  for (let seed = 1; seed <= 30; seed++) {
    let run = R.newRun({ seed });
    assert.equal(run.phase, 'intro');
    R.beginOrder(run);
    run = JSON.parse(JSON.stringify(run));
    assert.ok(R.isValidSave(run));
    playGreedy(run);
    assert.ok(['reward', 'over'].includes(run.phase), run.phase);
    if (run.phase === 'reward') {
      won++;
      const coins = run.coins;
      R.collectReward(run);
      assert.equal(run.phase, 'gift', 'first order is followed by the gift pick');
      assert.ok(run.coins > coins);
      R.chooseGift(run, 1);
      assert.equal(run.tools.length, 1);
      assert.equal(run.phase, 'shop');
      assert.equal(run.shop.offers.length, 3);
      R.leaveShop(run);
      assert.equal(run.phase, 'intro');
      assert.equal(run.orderIdx, 1);
    }
  }
  assert.ok(won >= 20, `greedy bot should beat day-1 small order usually (won ${won}/30)`);
});

test('run: shop buy / sell / reroll economics', () => {
  const run = R.newRun({ seed: 7 });
  run.phase = 'reward';
  run.reward = { lines: [], total: 20 };
  R.collectReward(run);
  R.chooseGift(run, 0);
  const c0 = run.coins;
  const price = TOOLS[run.shop.offers[0].id].price;
  assert.ok(R.buy(run, 0).ok);
  assert.equal(run.coins, c0 - price);
  assert.ok(!R.buy(run, 0).ok);
  const c1 = run.coins;
  assert.ok(R.reroll(run).ok);
  assert.equal(run.coins, c1 - R.REROLL_BASE);
  assert.equal(run.shop.rerollCost, R.REROLL_BASE + 1);
  const n = run.tools.length;
  assert.ok(R.sell(run, 0).ok);
  assert.equal(run.tools.length, n - 1);
});

test('run: boss rules shape the order', () => {
  const run = R.newRun({ seed: 3 });
  run.orderIdx = 2;
  run.bosses[0] = 'knots';
  R.prepareOrder(run);
  assert.equal(run.board.filter((v) => v === 'knot').length, 8);
  run.bosses[0] = 'busy';
  R.prepareOrder(run);
  assert.equal(run.order.discardsLeft, 0);
  run.bosses[0] = 'short';
  R.prepareOrder(run);
  assert.equal(run.order.patchesLeft, R.BASE_PATCHES - 4);
  run.bosses[0] = 'big';
  R.prepareOrder(run);
  R.beginOrder(run);
  assert.ok(run.tray.filter(Boolean).every((p) => SHAPE_BY_ID[p.shape].size >= 4));
});

test('run: targets grow monotonically', () => {
  let prev = 0;
  for (let d = 1; d <= 8; d++) for (let o = 0; o < 3; o++) {
    const t = R.targetFor(d, o);
    assert.ok(t > prev, `${d}/${o}: ${t} <= ${prev}`);
    prev = t;
  }
});

test('seams: ranking picks the highest hand', async () => {
  const { judgeSeam } = await import('../src/core/seams.js');
  const j = (o) => judgeSeam({ lineCount: 1, rowLines: 1, colLines: 0, monoLines: 0, perfect: false, ...o });
  assert.equal(j({}), 'single');
  assert.equal(j({ lineCount: 2, rowLines: 2 }), 'double');
  assert.equal(j({ lineCount: 2, rowLines: 1, colLines: 1 }), 'cross');
  // both cross (80×4) and mono (70×4) apply: the more valuable one is scored
  assert.equal(j({ lineCount: 2, rowLines: 1, colLines: 1, monoLines: 1 }), 'cross');
  assert.equal(judgeSeam({ lineCount: 2, rowLines: 1, colLines: 1, monoLines: 1, perfect: false }, { mono: 3 }), 'mono');
  // a leveled 겹누비 is not overridden by an incidental single-color line
  assert.equal(judgeSeam({ lineCount: 2, rowLines: 2, colLines: 0, monoLines: 1, perfect: false }, { double: 5 }), 'double');
  assert.equal(j({ lineCount: 1, rowLines: 1, monoLines: 1 }), 'mono');
  assert.equal(j({ lineCount: 3, rowLines: 3, monoLines: 1 }), 'triple');
  assert.equal(j({ lineCount: 2, rowLines: 2, monoLines: 2 }), 'twinMono');
  assert.equal(j({ perfect: true, monoLines: 1 }), 'perfect');
  assert.equal(j({ lineCount: 0 }), null);
  const two = evaluate(baseCtx({ lineCount: 2, rowLines: 2, cleared: Array.from({ length: 16 }, (_, k) => ({ r: k >> 3, c: k & 7, color: 'red' })) }), []);
  assert.equal(two.score, (60 + 80) * 3);
});

test('patterns: buying raises a seam level and grows the manual', () => {
  const run = R.newRun({ seed: 31 });
  run.tools.push(makeTool('manual'));
  run.phase = 'reward';
  run.reward = { lines: [], total: 20 };
  R.collectReward(run);
  R.chooseGift(run, 0);
  assert.equal(run.shop.patterns.length, R.PATTERN_OFFERS);
  const id = run.shop.patterns[0].id;
  const coins = run.coins;
  const res = R.buyPattern(run, 0);
  assert.ok(res.ok);
  assert.equal(run.seams[id], 2);
  assert.equal(run.coins, coins - 3);
  assert.equal(run.tools[0].data.mult, 2);
  assert.ok(!R.buyPattern(run, 0).ok);
});

test('bosses arrive in tiers: day 1 is an easy rule, day 4 is a hard one', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const run = R.newRun({ seed });
    assert.ok(['short', 'big'].includes(run.bosses[0]));
    assert.ok(['strict', 'busy'].includes(run.bosses[3]));
    assert.equal(new Set(run.bosses).size, R.DAYS);
  }
});

test('tools: silk resets at each order start', () => {
  const run = R.newRun({ seed: 11 });
  run.tools.push(makeTool('silk'), makeTool('iron'));
  run.tools[0].data.chips = 99;
  R.prepareOrder(run);
  assert.equal(run.tools[0].data.chips, 0);
});

test('run: invalid saves are rejected per phase', () => {
  const run = R.newRun({ seed: 5 });
  assert.ok(R.isValidSave(JSON.parse(JSON.stringify(run))));
  const bad = JSON.parse(JSON.stringify(run));
  bad.phase = 'reward';
  bad.reward = null;
  assert.ok(!R.isValidSave(bad));
  const bad2 = JSON.parse(JSON.stringify(run));
  bad2.tools = [{ id: 'nope', data: {} }];
  assert.ok(!R.isValidSave(bad2));
  assert.ok(!R.isValidSave(null));
});

test('run: half the trays share a color (mono seams are reachable)', () => {
  let mono = 0, total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const run = R.newRun({ seed });
    R.beginOrder(run);
    const t = run.tray.filter(Boolean);
    total++;
    if (t.every((p) => p.color === t[0].color)) mono++;
  }
  assert.ok(mono / total > 0.4 && mono / total < 0.7, `mono ratio ${mono / total}`);
});

test('run: saves from before order.colors/history still play after migrate', () => {
  const run = R.newRun({ seed: 21 });
  R.beginOrder(run);
  delete run.order.colors;
  delete run.history;
  const old = JSON.parse(JSON.stringify(run));
  assert.ok(R.isValidSave(old));
  R.migrate(old);
  let placed = false;
  for (let i = 0; i < 3 && !placed; i++) for (let r = 0; r < 8 && !placed; r++) for (let c = 0; c < 8 && !placed; c++) {
    if (R.preview(old, i, r, c)) { assert.ok(R.place(old, i, r, c).ok); placed = true; }
  }
  assert.ok(placed);
});

test('unlocks: locked tools never appear in gifts or the shop', async () => {
  const { lockedIds, isUnlocked } = await import('../src/core/unlocks.js');
  const locked = lockedIds({});
  assert.ok(locked.includes('artisan') && locked.includes('hoop'));
  assert.ok(isUnlocked('artisan', { monos: 10 }));
  for (let seed = 1; seed <= 40; seed++) {
    const run = R.newRun({ seed, locked });
    assert.ok(run.gift.every((id) => !locked.includes(id)));
    run.phase = 'reward';
    run.reward = { lines: [], total: 50 };
    R.collectReward(run);
    R.chooseGift(run, 0);
    for (let k = 0; k < 5; k++) {
      assert.ok(run.shop.offers.every((o) => !locked.includes(o.id)));
      R.reroll(run);
    }
  }
});

// ---------- helpers for deterministic board setups ----------
const { idx: bidx } = await import('../src/core/board.js');
function setRow(run, r, color, except = -1) {
  for (let c = 0; c < 8; c++) if (c !== except) run.board[bidx(r, c)] = color;
}
function playing(seed = 1) {
  const run = R.newRun({ seed });
  R.beginOrder(run);
  run.order.target = 1e9;
  return run;
}

test('streak: grows on consecutive clears, breaks after STREAK_GRACE quiet placements, preview agrees', () => {
  const run = playing(3);
  run.tray = [{ shape: 'dot_0', color: 'red' }, { shape: 'dot_0', color: 'red' }, { shape: 'dot_0', color: 'red' }];
  setRow(run, 0, 'blue', 7);
  setRow(run, 1, 'blue', 7);
  R.place(run, 0, 0, 7);
  assert.equal(run.order.streak, 1);
  R.place(run, 1, 1, 7);
  assert.equal(run.order.streak, 2);
  // quiet placements
  for (let k = 0; k < R.STREAK_GRACE; k++) {
    run.tray = [{ shape: 'dot_0', color: 'red' }, null, null];
    const pv = R.preview(run, 0, 7, k);
    const shouldBreak = k === R.STREAK_GRACE - 1;
    assert.equal(pv.streakBreaks, shouldBreak);
    R.place(run, 0, 7, k);
    assert.equal(run.order.streak, shouldBreak ? 0 : 2);
  }
});

test('preview equals place with growing tools (silk, iron) owned', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const run = playing(seed);
    run.tools = [makeTool('silk'), makeTool('iron'), makeTool('spool')];
    for (let step = 0; step < 12 && run.phase === 'play'; step++) {
      let mv = null;
      run.tray.forEach((p, i) => { if (!p || mv) return; for (let r = 0; r < 8 && !mv; r++) for (let c = 0; c < 8 && !mv; c++) if (R.preview(run, i, r, c)) mv = { i, r, c }; });
      if (!mv) break;
      const pv = R.preview(run, mv.i, mv.r, mv.c);
      const ev = R.place(run, mv.i, mv.r, mv.c).events.find((e) => e.type === 'score');
      assert.equal(ev.result.score, pv.score);
    }
  }
});

test('reward math: leftover cap, interest cap, pouch', () => {
  const run = playing(4);
  run.tools = [makeTool('pouch')];
  run.coins = 23;
  run.order.target = 1;
  run.order.patchesLeft = 12;
  run.tray = [{ shape: 'dot_0', color: 'red' }, null, null];
  R.place(run, 0, 4, 4);
  assert.equal(run.phase, 'reward');
  const byKind = Object.fromEntries(run.reward.lines.map((l) => [l.kind || l.label, l.coins]));
  assert.equal(byKind.leftover, R.LEFTOVER_CAP);
  assert.equal(byKind.interest, 4);
  assert.equal(byKind['복주머니'], 2);
  assert.equal(run.reward.total, R.ORDER_KINDS[0].reward + R.LEFTOVER_CAP + 4 + 2);
});

test('endless: victory → continue → day 5 with cycling bosses and rising targets', () => {
  const run = R.newRun({ seed: 8 });
  run.day = R.DAYS; run.orderIdx = 2; run.gift = null;
  R.prepareOrder(run);
  run.phase = 'reward';
  run.reward = { lines: [], total: 0 };
  R.collectReward(run);
  assert.equal(run.phase, 'victory');
  R.continueEndless(run);
  assert.equal(run.phase, 'shop');
  R.leaveShop(run);
  assert.equal(run.day, R.DAYS + 1);
  assert.equal(run.orderIdx, 0);
  assert.ok(run.order.target > R.targetFor(R.DAYS, 2));
  assert.ok(R.BOSS_IDS.includes(R.bossFor(run, R.DAYS + 1, 2)));
  const n = R.nextOrderOf(run);
  assert.deepEqual([n.day, n.orderIdx], [R.DAYS + 1, 1]);
});

test('bosses: big removes patches; busy blocks discards; jam fails without discards', () => {
  const run = R.newRun({ seed: 9 });
  run.orderIdx = 2;
  run.bosses[0] = 'big';
  R.prepareOrder(run);
  assert.equal(run.order.patchesLeft, R.BASE_PATCHES - R.BIG_PENALTY);
  run.bosses[0] = 'busy';
  R.prepareOrder(run);
  R.beginOrder(run);
  assert.deepEqual(R.discard(run), []);
  // fill the board so nothing fits, then a placement-free jam check fails the order
  const full = playing(10);
  full.order.discardsLeft = 0;
  // checkerboard of holes: single patches fit, dominoes never do, and no line can complete
  full.board = full.board.map((_, k) => (((k >> 3) + (k & 7)) % 2 ? 'knot' : null));
  full.tray = [{ shape: 'dot_0', color: 'red' }, { shape: 'i2_0', color: 'red' }, null];
  full.order.target = 1e9;
  const ev = R.place(full, 0, 0, 0).events;
  // after the dot only the domino is left and it fits nowhere → jam
  assert.ok(ev.some((e) => e.type === 'fail' && e.reason === 'jam'));
});

test('tools: coins capped, grandma on even clears, sell price at least 1', async () => {
  const { evaluate } = await import('../src/core/scoring.js');
  const c = baseCtx({ coins: 500 });
  assert.equal(evaluate(c, [makeTool('coins')]).mult, 1 + 8);
  assert.equal(evaluate(baseCtx({ clearIndex: 2 }), [makeTool('grandma')]).mult, 2.5);
  assert.equal(evaluate(baseCtx({ clearIndex: 3 }), [makeTool('grandma')]).mult, 1);
  const { sellPrice } = await import('../src/core/tools.js');
  for (const id of TOOL_IDS) assert.ok(sellPrice(makeTool(id)) >= 1);
});

test('migrate fills stats and locked on old saves', () => {
  const run = R.newRun({ seed: 12 });
  delete run.locked;
  run.stats = { bestHand: 5 };
  R.migrate(run);
  assert.deepEqual(run.locked, []);
  assert.equal(run.stats.bestHand, 5);
  assert.equal(run.stats.monos, 0);
});

test('records: idempotent counters, daily streak, unlock reporting', async () => {
  const { recordRun, shiftDayKey, dailyStreakAlive } = await import('../src/core/records.js');
  assert.equal(shiftDayKey('2026-3-1', -1), '2026-2-28');
  const meta = { runs: 1, wins: 0, bestDay: 0, bestHand: 0, bestStreak: 0, clears: 0, monos: 7, daily: {} };
  const run = R.newRun({ seed: 1, mode: 'daily', dailyKey: '2026-10-10' });
  run.stats.monos = 3;
  run.stats.clears = 10;
  const info = recordRun(meta, run, { victory: false });
  assert.ok(info.unlocked.includes('artisan'));
  recordRun(meta, run, { victory: true });
  recordRun(meta, run, { victory: true });
  assert.equal(meta.monos, 10);
  assert.equal(meta.clears, 10);
  assert.equal(meta.wins, 1);
  assert.equal(meta.dailyStreak.count, 1);
  const next = R.newRun({ seed: 2, mode: 'daily', dailyKey: '2026-10-11' });
  recordRun(meta, next, {});
  assert.equal(meta.dailyStreak.count, 2);
  assert.ok(dailyStreakAlive(meta, '2026-10-12'));
  assert.ok(!dailyStreakAlive(meta, '2026-10-14'));
});

test('patterns: only buildable seams are sold', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = R.newRun({ seed });
    run.phase = 'reward';
    run.reward = { lines: [], total: 30 };
    R.collectReward(run);
    R.chooseGift(run, 0);
    for (let k = 0; k < 4; k++) {
      assert.ok(run.shop.patterns.every((p) => ['double', 'cross', 'mono', 'triple'].includes(p.id)));
      R.reroll(run);
    }
  }
});

test('challenges: lifetime goals, live progress from the run in play, claimed by hand', async () => {
  const { SKINS, resolveSkin, DEFAULT_SKIN } = await import('../src/ui/skins.js');
  const C = await import('../src/core/challenges.js');
  const { recordRun } = await import('../src/core/records.js');
  const meta = { points: 290000, clears: 10, wins: 0 };
  assert.deepEqual(C.checkChallenges(meta).map((c) => c.id), []);
  assert.equal(C.challengeState(meta, 'points300k').have, 290000);
  // a run in progress counts before it is recorded, and is not counted twice after
  const run = { stats: { points: 12000, clears: 30, topLevel: 4 }, reported: {} };
  assert.deepEqual(C.checkChallenges(meta, C.liveRecord(meta, run)).map((c) => c.id), ['points300k']);
  const live = C.liveRecord(meta, run);
  assert.equal(live.points, 302000);
  assert.equal(live.bestLevel, 4);
  run.reported = { points: 12000, clears: 30 };
  assert.equal(C.liveRecord(meta, run).points, 290000, 'reported part not added again');
  assert.deepEqual(C.checkChallenges(meta, live), [], 'announced once');
  assert.equal(resolveSkin('cheongmyeong', meta).id, DEFAULT_SKIN, 'not worn until claimed');
  assert.ok(C.claimChallenge(meta, 'points300k'));
  assert.ok(!C.claimChallenge(meta, 'points300k'));
  assert.equal(resolveSkin('cheongmyeong', meta).id, 'cheongmyeong');
  assert.ok(!C.claimChallenge(meta, 'wins3'), 'cannot claim an unmet challenge');
  // recordRun keeps the score the player actually made, overshoot included
  const R2 = await import('../src/core/run.js');
  const r = R2.newRun({ seed: 3 });
  r.stats.points = 777; r.stats.topLevel = 6;
  const m2 = {};
  const info = recordRun(m2, r);
  assert.equal(m2.bestPoints, 777); assert.equal(m2.points, 777); assert.equal(m2.bestLevel, 6); assert.ok(info.newPoints);
  recordRun(m2, r);
  assert.equal(m2.points, 777, 'idempotent');
  // every skin but the default is a challenge reward, and every reward is a real skin
  const rewards = new Set(C.CHALLENGES.map((c) => c.skin));
  for (const k of SKINS) assert.equal(rewards.has(k.id), k.id !== DEFAULT_SKIN, k.id);
  for (const k of SKINS) for (const f of ['ground', 'onGround', 'onGround2', 'onAlert', 'silk', 'silk2', 'silk3', 'deep', 'veil', 'rare', 'pattern', 'cloth', 'muted', 'dim']) {
    assert.match(k[f], /^#[0-9a-f]{6}$/, `${k.id}.${f}`);
  }
});

test('run points include the overshoot past the target, and each order logs its keepsake seam', () => {
  const run = R.newRun({ seed: 11 });
  R.beginOrder(run);
  let guard = 0;
  while (run.phase === 'play' && guard++ < 300) {
    let moved = false;
    for (let i = 0; i < 3 && !moved; i++) for (let r = 0; r < 8 && !moved; r++) for (let c = 0; c < 8 && !moved; c++) {
      if (run.tray[i] && R.preview(run, i, r, c)) { R.place(run, i, r, c); moved = true; }
    }
    if (!moved) R.discard(run);
  }
  const h = run.history[0];
  assert.ok(h, 'order logged');
  assert.equal(run.stats.points, h.score, 'points = everything sewn, not the target');
  assert.ok(h.seam === null || typeof h.seam === 'string');
  assert.equal(h.target, run.history[0].target);
});
