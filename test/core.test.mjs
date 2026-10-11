import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPES, SHAPE_BY_ID } from '../src/core/shapes.js';
import { emptyBoard, canPlace, paint, fullLines, clearLines, idx } from '../src/core/board.js';
import { evaluate } from '../src/core/scoring.js';
import { finishOf, upgradePatch, PATTERN_SEAMS } from '../src/core/seams.js';
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

// cleared lines as the scorer sees them: row and column indices (row 1 is neither edge nor centre)
const L = (rowIdx, colIdx = []) => ({ lineCount: rowIdx.length + colIdx.length, rowLines: rowIdx.length, colLines: colIdx.length, rowIdx, colIdx });
const baseCtx = (over = {}) => ({
  ...L([1]), monoLines: 0,
  cleared: Array.from({ length: 8 }, (_, c) => ({ r: 0, c, color: 'red' })),
  placedCells: 3, streak: 1, clearIndex: 1, perfect: false, emptyAfter: 50,
  coins: 0, discardsLeft: 2, boss: null, ...over,
});

test('scoring: plain placement', () => {
  const r = evaluate(baseCtx({ lineCount: 0, cleared: [] }), []);
  assert.equal(r.score, 3);
});

test('scoring: single line, streak, one-colour line', () => {
  assert.equal(evaluate(baseCtx(), []).score, 70); // 홈질 (30 + 8×5) × 1
  assert.equal(evaluate(baseCtx({ streak: 3 }), []).score, 210); // ×(1+2)
  const mono = evaluate(baseCtx({ monoLines: 1 }), []);
  assert.equal(mono.seam, 'single', 'colour never changes the seam');
  assert.equal(mono.score, 140); // 홈질 70, every line one colour → ×2
  // 홈질 never levels
  assert.equal(evaluate(baseCtx({ levels: { single: 3 } }), []).score, 70);
});

test('scoring: phases apply chips, then +mult, then ×mult regardless of slot order', () => {
  const a = evaluate(baseCtx(L([1], [2])), [makeTool('scissors'), makeTool('thimble'), makeTool('needlecase')]);
  const b = evaluate(baseCtx(L([1], [2])), [makeTool('needlecase'), makeTool('thimble'), makeTool('scissors')]);
  assert.equal(a.score, b.score);
  // 홈질 + 십자수: chips 30 + 50 + 40 + 50 = 170; mult 1 + 3 + 3 = 7; ×2 = 14 → 2380
  assert.equal(a.seam, 'single');
  assert.deepEqual(a.addons, ['cross']);
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

test('seams: the shape is what was made, whatever the levels (no inheriting)', async () => {
  const { judgeSeam, SHAPE_IDS, seamValue } = await import('../src/core/seams.js');
  // three parallel lines are 세누비 at 세누비's own level, however far 겹누비 has been leveled
  const triple = L([1, 2, 5]);
  assert.equal(judgeSeam(triple), 'triple');
  for (const lv of [1, 4, 9]) {
    const r = evaluate(baseCtx({ ...triple, levels: { double: lv, triple: 1 }, cleared: [] }), []);
    assert.equal(r.seam, 'triple', `double lv ${lv}`);
    assert.equal(r.level, 1);
  }
  // shapes: rank and base value point the same way
  const vals = SHAPE_IDS.map((id) => seamValue(id, 1)).map((v) => v.chips * v.mult);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] < vals[i - 1], SHAPE_IDS[i]);
});

test('seams: the shape comes from the direction with more lines; spacing names the pair', async () => {
  const { judgeSeam } = await import('../src/core/seams.js');
  const j = (rows, cols = []) => judgeSeam(L(rows, cols));
  assert.equal(j([1]), 'single');
  assert.equal(j([], [6]), 'single');
  assert.equal(j([1, 2]), 'double', '붙은 2줄');
  assert.equal(j([], [5, 6]), 'double');
  assert.equal(j([1, 5]), 'gap', '떨어진 2줄');
  assert.equal(j([0, 7]), 'gap');
  assert.equal(j([1, 2, 3]), 'triple');
  assert.equal(j([0, 3, 6]), 'triple', '3줄이면 간격과 상관없이 세누비');
  // rows and columns together: the larger group names the shape, 십자수 rides on top
  assert.equal(j([1, 2], [5]), 'double');
  assert.equal(j([4], [1, 6]), 'gap');
  assert.equal(j([1], [5]), 'single');
  // a tie between the two directions goes to the higher-ranked shape, never to a value
  assert.equal(j([1, 2], [3, 6]), 'gap');
  assert.equal(j([], []), null);
  // colour never changes the shape
  assert.equal(judgeSeam({ ...L([1, 2]), monoLines: 2 }), 'double');
});

test('seams: add-ons are earned together, each from what can be seen', async () => {
  const { addonsOf } = await import('../src/core/seams.js');
  const a = (rows, cols = [], over = {}) => addonsOf({ ...L(rows, cols), ...over });
  assert.deepEqual(a([1]), []);
  assert.deepEqual(a([0]), ['edge'], '가장자리 줄');
  assert.deepEqual(a([], [7]), ['edge']);
  assert.deepEqual(a([3]), ['center'], '가운데 줄');
  assert.deepEqual(a([], [4]), ['center']);
  assert.deepEqual(a([1], [2]), ['cross']);
  assert.deepEqual(a([0], [4]), ['cross', 'edge', 'center'], '가로+세로면 자리 이름이 함께 붙음');
  assert.deepEqual(a([1], [], { perfect: true }), ['perfect']);
  // 시침질: every cell of the placed patch sits in a cleared line
  assert.deepEqual(a([1], [], { pieceCells: [[1, 2], [1, 3]] }), ['whole']);
  assert.deepEqual(a([1], [], { pieceCells: [[1, 2], [2, 2]] }), [], '한 칸이라도 남으면 아님');
  assert.deepEqual(a([1], [5], { pieceCells: [[1, 4], [1, 5], [2, 5]] }), ['cross', 'whole']);
  assert.deepEqual(a([], [], { pieceCells: [[1, 1]] }), []);
});

test('seams: every add-on adds its chips and mult, so an add-on never lowers the score', async () => {
  const { seamValue } = await import('../src/core/seams.js');
  // the common cases keep their old values: 홈질 + 십자수 = 80 × 4, one line clearing the hoop = 160 × 8
  const cross = evaluate(baseCtx({ ...L([1], [2]), cleared: [] }), []);
  assert.deepEqual([cross.chips, cross.mult], [80, 4]);
  const perfect = evaluate(baseCtx({ perfect: true, cleared: [] }), []);
  assert.deepEqual([perfect.seam, perfect.addons], ['single', ['perfect']]);
  assert.deepEqual([perfect.chips, perfect.mult], [160, 8]);
  // 마무리 on top of a leveled 겹누비 adds to it: no 역전 at any level of either
  for (const dl of [1, 5, 10]) for (const pl of [1, 3]) {
    const levels = { double: dl, perfect: pl };
    const plain = evaluate(baseCtx({ ...L([1, 2]), levels, cleared: [] }), []);
    const done = evaluate(baseCtx({ ...L([1, 2]), levels, perfect: true, cleared: [] }), []);
    assert.equal(done.seam, 'double');
    assert.ok(done.score > plain.score, `겹누비 ${dl} + 마무리 ${pl}`);
    const v = seamValue('perfect', pl);
    assert.deepEqual([done.chips - plain.chips, done.mult - plain.mult], [v.chips, v.mult]);
  }
  // every add-on's value is non-negative at every level
  for (const id of PATTERN_SEAMS) for (let lv = 1; lv <= 12; lv++) {
    const v = seamValue(id, lv);
    assert.ok(v.chips >= 0 && v.mult >= 0, `${id} ${lv}`);
  }
  // the common add-ons add chips only (a mult on 홈질's ×1 would multiply most clears)
  for (const id of ['edge', 'center', 'whole']) assert.equal(seamValue(id, 7).mult, 0, id);
});

test('seams: one-colour lines scale the whole score by their share, up to ×2', () => {
  const pair = (monoLines) => evaluate(baseCtx({ ...L([1, 2]), monoLines, levels: { double: 5 },
    cleared: Array.from({ length: 16 }, (_, k) => ({ r: k >> 3, c: k & 7, color: 'red' })) }), []);
  const plain = pair(0);
  assert.equal(plain.seam, 'double');
  assert.equal(pair(1).score, Math.floor(plain.chips * plain.mult * 1.5));
  assert.equal(pair(2).score, plain.score * 2, '겹누비 → 오목누비 doubles it');
  assert.equal(pair(2).seam, 'double');
});

test('seams: 겹누비 base value', () => {
  const two = evaluate(baseCtx({ ...L([1, 2]), cleared: Array.from({ length: 16 }, (_, k) => ({ r: k >> 3, c: k & 7, color: 'red' })) }), []);
  assert.equal(two.score, (70 + 80) * 3);
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
  assert.equal(run.tools[0].data.mult, 1, '교본은 본마다 +1');
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
      assert.ok(run.shop.patterns.every((p) => p.id !== 'single' && PATTERN_SEAMS.includes(p.id)));
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
  assert.ok(!C.claimChallenge(meta, 'points2m'), 'cannot claim an unmet challenge');
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

test('a tool unlocked during a run only reaches the market from the next run', () => {
  const locked = ['artisan', 'hoop', 'norigae', 'grandma', 'ruler'];
  const run = R.newRun({ seed: 5, locked });
  run.phase = 'reward'; run.reward = { lines: [], total: 0 }; run.gift = null;
  R.collectReward(run);
  assert.equal(run.phase, 'shop');
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    run.coins = 999;
    run.shop.offers.forEach((o) => seen.add(o.id));
    assert.ok(R.reroll(run).ok);
  }
  for (const id of locked) assert.ok(!seen.has(id), `${id} offered while locked for this run`);
  assert.ok(seen.size > 10, 'rerolls do show the open pool');
});

test('migrate: saves from before colour became a finish drop the old seam ids everywhere', () => {
  const run = R.newRun({ seed: 9 });
  run.phase = 'reward'; run.reward = { lines: [], total: 0 };
  run.seams.mono = 4; run.seams.twinMono = 2;
  run.history = [{ kind: 0, ok: true, color: 'red', seam: 'twinMono', score: 500 }, { kind: 1, ok: true, color: 'blue', seam: 'double', score: 900 }];
  run.shop = { offers: [], patterns: [{ id: 'mono', sold: false }, { id: 'cross', sold: false }], rerollCost: 2 };
  const m = R.migrate(JSON.parse(JSON.stringify(run)));
  assert.deepEqual(Object.keys(m.seams).sort(), ['center', 'cross', 'double', 'edge', 'gap', 'perfect', 'single', 'triple', 'whole']);
  // an old 오목누비 patch keeps its name as a finish on the two-line stitch
  assert.equal(m.history[0].seam, 'double');
  assert.equal(m.history[0].finish, 'ridge');
  assert.equal(m.history[1].seam, 'double');
  assert.equal(m.history[1].finish, null);
  assert.deepEqual(m.shop.patterns.map((p) => p.id), ['cross']);
});

test('finish: all lines one colour is 오목누비, some is 납작누비, none is plain', () => {
  assert.equal(finishOf({ lineCount: 2, monoLines: 2 }), 'ridge');
  assert.equal(finishOf({ lineCount: 2, monoLines: 1 }), 'flat');
  assert.equal(finishOf({ lineCount: 1, monoLines: 1 }), 'ridge', '한 줄도 그 줄이 한 색이면 오목누비');
  assert.equal(finishOf({ lineCount: 3, monoLines: 0 }), null);
  assert.equal(finishOf({ lineCount: 0, monoLines: 0 }), null);
  const r = evaluate(baseCtx({ ...L([1, 2]), monoLines: 1,
    cleared: Array.from({ length: 16 }, (_, k) => ({ r: k >> 3, c: k & 7, color: 'red' })) }), []);
  assert.equal(r.finish, 'flat');
  assert.equal(r.steps.find((s) => s.src === 'mono').finish, 'flat');
});

test('finish: the keepsake takes the commonest finish of the commonest seam (ties go finer)', () => {
  const o = (seams, finishes) => ({ seams, finishes });
  assert.equal(R.dominantFinish(o({ double: 3 }, { double: { ridge: 2 } }), 'double'), 'ridge');
  assert.equal(R.dominantFinish(o({ double: 3 }, { double: { ridge: 1 } }), 'double'), null, '보통 2 > 오목 1');
  assert.equal(R.dominantFinish(o({ double: 2 }, { double: { ridge: 1 } }), 'double'), 'ridge', '동률은 오목');
  assert.equal(R.dominantFinish(o({ double: 3 }, { double: { flat: 2, ridge: 1 } }), 'double'), 'flat');
  assert.equal(R.dominantFinish(o({ cross: 2 }, { double: { ridge: 5 } }), 'cross'), null, '다른 족보의 마감은 세지 않음');
  assert.equal(R.dominantFinish(o({}, {}), null), null);
});

test('finish: placing a one-colour line records 오목누비 on the order and in the history', () => {
  const run = R.newRun({ seed: 3 });
  R.beginOrder(run);
  run.board = emptyBoard();
  for (let c = 0; c < 6; c++) run.board[idx(0, c)] = 'red';
  run.board[idx(5, 5)] = 'blue'; // something left so the clear is 홈질, not 마무리
  run.tray = [{ shape: 'i2_0', color: 'red' }, null, null];
  assert.equal(R.preview(run, 0, 0, 6).finish, 'ridge', '예고에도 마감이 실림');
  run.order.target = 1; // this clear finishes the order, so it is logged
  R.place(run, 0, 0, 6);
  // the top row is an edge, and the domino vanished whole: every name it earned keeps the finish
  assert.deepEqual(run.order.finishes, { single: { ridge: 1 }, whole: { ridge: 1 }, edge: { ridge: 1 } });
  const h = run.history.at(-1);
  assert.equal(h.seam, 'whole', '조각누비 땀은 홈질 말고 가장 많이 지은 이름(동률은 표 순서)');
  assert.equal(h.finish, 'ridge');
});

test('finish: old journal patches with colour seams draw as a finish', () => {
  assert.deepEqual(upgradePatch({ color: 'red', seam: 'mono' }), { color: 'red', seam: 'single', finish: 'ridge' });
  assert.deepEqual(upgradePatch({ color: 'red', seam: 'gone' }), { color: 'red', seam: null, finish: null });
  assert.deepEqual(upgradePatch({ color: 'red', seam: 'cross', finish: 'ridge' }), { color: 'red', seam: 'cross', finish: 'ridge' });
});

test('discard swaps only the patches in hand: an emptied slot stays empty', () => {
  const run = R.newRun({ seed: 21 });
  R.beginOrder(run);
  run.board = emptyBoard();
  const held = [{ shape: 'i3_0', color: 'red' }, null, { shape: 'o2_0', color: 'blue' }];
  run.tray = held.map((p) => p && { ...p });
  const left = run.order.patchesLeft;
  const ev = R.discard(run);
  assert.ok(ev.some((e) => e.type === 'discard'));
  assert.equal(run.tray[1], null, '쓴 칸은 비어 있는 그대로');
  assert.ok(run.tray[0] && run.tray[2], '든 칸 두 개는 새 조각');
  assert.equal(run.order.patchesLeft, left, '바꾸기는 조각을 쓰지 않음');
  // a single patch in hand comes back as a single patch
  run.tray = [null, null, { shape: 'dot_0', color: 'red' }];
  R.discard(run);
  assert.deepEqual(run.tray.map(Boolean), [false, false, true]);
});

test('keepsake: the commonest name other than 홈질 stitches the patch; 홈질 only when nothing else', () => {
  const run = R.newRun({ seed: 4 });
  R.beginOrder(run);
  run.board = emptyBoard();
  for (let c = 0; c < 7; c++) run.board[idx(1, c)] = 'red'; // row 1: not an edge, not the centre
  run.board[idx(5, 5)] = 'blue';
  run.tray = [{ shape: 'dot_0', color: 'blue' }, { shape: 'dot_0', color: 'blue' }, null];
  run.order.target = 1;
  R.place(run, 0, 1, 7);
  assert.deepEqual(run.order.seams, { single: 1, whole: 1 });
  assert.equal(run.history.at(-1).seam, 'whole');
  // stats count every name made, and 세누비/십자수 counters follow the names
  assert.equal(run.stats.seamCounts.whole, 1);
});

test('tools: 인두 starts each order from 0 and grows +3 per clear; 교본 costs 6', () => {
  const run = R.newRun({ seed: 8 });
  run.tools.push(makeTool('iron'));
  assert.equal(run.tools[0].data.mult, 0);
  R.beginOrder(run);
  run.board = emptyBoard();
  for (let c = 0; c < 7; c++) run.board[idx(1, c)] = 'red';
  run.board[idx(5, 5)] = 'blue';
  run.tray = [{ shape: 'dot_0', color: 'blue' }, { shape: 'dot_0', color: 'blue' }, null];
  run.order.target = 1e9;
  R.place(run, 0, 1, 7);
  assert.equal(run.tools[0].data.mult, 3);
  run.orderIdx = 1;
  R.prepareOrder(run);
  assert.equal(run.tools[0].data.mult, 0, '주문마다 처음부터');
  assert.equal(TOOLS.manual.price, 6);
});

test('stats: 세누비 and 십자수 counters follow the names, not the raw line count', () => {
  const run = R.newRun({ seed: 6 });
  R.beginOrder(run);
  run.board = emptyBoard();
  // rows 2 and 3 full but one cell, column 0 full but those same cells' column: one dot clears 2 rows + 1 column
  for (let c = 1; c < 8; c++) { run.board[idx(2, c)] = 'red'; run.board[idx(3, c)] = 'red'; }
  for (let r = 0; r < 8; r++) if (r !== 2 && r !== 3) run.board[idx(r, 0)] = 'red';
  run.board[idx(3, 0)] = 'red';
  run.board[idx(6, 6)] = 'blue';
  run.tray = [{ shape: 'dot_0', color: 'blue' }, { shape: 'dot_0', color: 'blue' }, null];
  run.order.target = 1e9;
  const pv = R.preview(run, 0, 2, 0);
  assert.equal(pv.seam, 'double', '가로 2줄 + 세로 1줄은 겹누비 + 십자수');
  assert.ok(pv.addons.includes('cross'));
  R.place(run, 0, 2, 0);
  assert.equal(run.stats.triples, 0);
  assert.equal(run.stats.crosses, 1);
});
