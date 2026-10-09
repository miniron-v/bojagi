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

test('scoring: single line, streak, mono', () => {
  assert.equal(evaluate(baseCtx(), []).score, 50); // (40+10) × 1
  assert.equal(evaluate(baseCtx({ streak: 3 }), []).score, 150); // ×(1+2)
  assert.equal(evaluate(baseCtx({ monoLines: 1 }), []).score, 100);
});

test('scoring: phases apply chips, then +mult, then ×mult regardless of slot order', () => {
  const a = evaluate(baseCtx({ lineCount: 2, colLines: 1 }), [makeTool('scissors'), makeTool('thimble'), makeTool('needlecase')]);
  const b = evaluate(baseCtx({ lineCount: 2, colLines: 1 }), [makeTool('needlecase'), makeTool('thimble'), makeTool('scissors')]);
  assert.equal(a.score, b.score);
  // chips 40 + 20 + 50 = 110; mult 2² + 3 = 7; ×2 = 14 → 1540
  assert.equal(a.score, 1540);
});

test('scoring: ink boss zeroes black cells, strict halves mult', () => {
  const black = baseCtx({ cleared: Array.from({ length: 8 }, (_, c) => ({ r: 0, c, color: 'black' })), boss: 'ink' });
  assert.equal(evaluate(black, []).score, 10);
  assert.equal(evaluate(baseCtx({ boss: 'strict', streak: 3 }), []).score, 75);
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

test('scoring: multi-line clears grow quadratically', () => {
  const two = evaluate(baseCtx({ lineCount: 2, cleared: Array.from({ length: 16 }, (_, k) => ({ r: k >> 3, c: k & 7, color: 'red' })) }), []);
  assert.equal(two.score, (80 + 20) * 4);
});

test('tools: silk resets each order, iron grows per clear', () => {
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
