// Balance simulator: plays many runs with a heuristic bot and reports where runs end.
// Usage: node tools/simulate.mjs [runs=300] [bot=smart|greedy] [shop=value|rarity] [DAY_BASE e.g. 240,900,2200,5500]
//        NEWBIE=1 restricts the tool pool to a first-time player's unlocks.
import * as R from '../src/core/run.js';
import { SHAPE_BY_ID } from '../src/core/shapes.js';
import { N, idx, paint, fullLines, clearLines, canPlace } from '../src/core/board.js';
import { TOOLS, MAX_TOOLS } from '../src/core/tools.js';
import { lockedIds } from '../src/core/unlocks.js';
import { PATTERN_SEAMS, judgeSeam, seamValue } from '../src/core/seams.js';
import { filledCount } from '../src/core/board.js';

const RUNS = +process.argv[2] || 300;
const BOT = process.argv[3] || 'smart';
const SHOP = process.argv[4] || 'value'; // value | rarity
if (process.argv[5]) process.argv[5].split(',').forEach((v, i) => { R.DAY_BASE[i] = +v; });
// rough hand-tuned tool values for the "planner" shopper
const VAL = { lantern: 8, thimble: 8, coins: 7, silk: 8, iron: 9, norigae: 8, spool: 8, grandma: 8, tape: 7, needlecase: 6,
  lamp: 6, scissors: 7, hoop: 7, artisan: 7, ruler: 6, obang: 6, pincushion: 5, sewingbox: 4, pouch: 3,
  stamp: 8, manual: 7, sleeve: 6 };
const val = (id) => (SHOP === 'value' ? (VAL[id] || 4) : TOOLS[id].rarity);

function boardQuality(board) {
  // Rewards open space and penalizes isolated single holes and ragged lines.
  let empty = 0, holes = 0, nearly = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[idx(r, c)] !== null) continue;
    empty++;
    let blocked = 0;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || board[idx(rr, cc)] !== null) blocked++;
    }
    if (blocked === 4) holes++;
  }
  for (let i = 0; i < N; i++) {
    let rowF = 0, colF = 0;
    for (let k = 0; k < N; k++) { if (board[idx(i, k)] !== null) rowF++; if (board[idx(k, i)] !== null) colF++; }
    if (rowF >= 6) nearly++;
    if (colF >= 6) nearly++;
  }
  return empty * 2 - holes * 12 + nearly * 3;
}

// planner: beam search over the rest of the tray, valuing clears at the run's seam levels
function plannerMove(run) {
  const BEAM = 20;
  const avail = run.tray.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  let beam = [{ board: run.board, used: [], first: null, val: 0 }];
  let best = null;
  for (let depth = 0; depth < avail.length; depth++) {
    const nb = [];
    for (const st of beam) for (const i of avail) {
      if (st.used.includes(i)) continue;
      const p = run.tray[i];
      const sh = SHAPE_BY_ID[p.shape];
      for (let r = 0; r <= N - sh.h; r++) for (let c = 0; c <= N - sh.w; c++) {
        if (!canPlace(st.board, sh, r, c)) continue;
        const pb = paint(st.board, sh, r, c, p.color);
        const L = fullLines(pb);
        const after = clearLines(pb, L).board;
        let g = 0;
        if (L.length) {
          const ctx = { lineCount: L.length, rowLines: L.filter((l) => l.type === 'row').length, colLines: L.filter((l) => l.type === 'col').length, monoLines: L.filter((l) => l.mono).length, perfect: filledCount(after) === 0 };
          const sm = judgeSeam(ctx, run.seams);
          const v = seamValue(sm, run.seams[sm] || 1);
          g = (v.chips + L.length * 40) * v.mult;
        }
        nb.push({ board: after, used: [...st.used, i], first: st.first || { i, r, c }, val: st.val + g });
      }
    }
    if (!nb.length) break;
    for (const x of nb) x.score = x.val + boardQuality(x.board) * 4;
    nb.sort((a, b) => b.score - a.score);
    beam = nb.slice(0, BEAM);
    best = beam[0];
  }
  return best ? best.first : null;
}

function chooseMove(run) {
  if (BOT === 'planner') return plannerMove(run);
  let best = null;
  run.tray.forEach((p, i) => {
    if (!p) return;
    const shape = SHAPE_BY_ID[p.shape];
    for (let r = 0; r <= N - shape.h; r++) for (let c = 0; c <= N - shape.w; c++) {
      if (!canPlace(run.board, shape, r, c)) continue;
      const pv = R.preview(run, i, r, c);
      let v = pv.score;
      if (BOT === 'smart') {
        const painted = paint(run.board, shape, r, c, p.color);
        const after = clearLines(painted, fullLines(painted)).board;
        v = pv.score * 0.4 + boardQuality(after) + pv.lines.length * 25;
        // keep the other tray pieces placeable
        const others = run.tray.filter((q, j) => q && j !== i);
        for (const q of others) {
          const s2 = SHAPE_BY_ID[q.shape];
          let ok = false;
          for (let a = 0; a <= N - s2.h && !ok; a++) for (let b = 0; b <= N - s2.w && !ok; b++) ok = canPlace(after, s2, a, b);
          if (!ok) v -= 60;
        }
      }
      if (!best || v > best.v) best = { i, r, c, v };
    }
  });
  return best;
}

function shopBot(run) {
  for (let guard = 0; guard < 10; guard++) {
    const offers = run.shop.offers
      .map((o, i) => ({ ...o, i, price: TOOLS[o.id].price }))
      .filter((o) => !o.sold && o.price <= run.coins)
      .sort((a, b) => val(b.id) - val(a.id) || b.price - a.price);
    if (offers.length) {
      const o = offers[0];
      if (run.tools.length >= MAX_TOOLS) {
        const worst = run.tools.reduce((m, t, s) => (val(t.id) < val(run.tools[m].id) ? s : m), 0);
        if (val(run.tools[worst].id) < val(o.id)) { R.sell(run, worst); R.buy(run, o.i); continue; }
      } else { R.buy(run, o.i); continue; }
    }
    // the planner commits: it levels the seam it has made most often
    if (SHOP === 'value') {
      // pick a seam to build around once (the buildable seam made most so far), then keep feeding it
      if (!run._commit) {
        const counts = run.stats.seamCounts || {};
        run._commit = PATTERN_SEAMS.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
      }
      const pi = (run.shop.patterns || []).findIndex((p) => !p.sold && p.id === run._commit);
      if (pi >= 0 && R.buyPattern(run, pi).ok) continue;
    }
    if (SHOP === 'value' && run.coins >= run.shop.rerollCost + 8 && run.tools.some((t) => val(t.id) < 7)) { R.reroll(run); continue; }
    break;
  }
}

const reach = {};
const ends = {};
const scoreBy = {};
let victories = 0;
let totalPlaced = 0;
const t0 = Date.now();
const runPoints = [], runLevels = [], runClears = [];
for (let k = 0; k < RUNS; k++) {
  const run = R.newRun({ seed: 1000 + k, locked: process.env.NEWBIE ? lockedIds({}) : [] });
  while (true) {
    if (run.phase === 'gift') R.chooseGift(run, val(run.gift[0]) >= val(run.gift[1]) ? 0 : 1);
    if (run.phase === 'intro') R.beginOrder(run);
    if (run.phase === 'play') {
      const key = `${run.day}-${run.orderIdx}`;
      reach[key] = (reach[key] || 0) + 1;
      let steps = 0;
      while (run.phase === 'play' && steps++ < 200) {
        const m = chooseMove(run);
        if (!m) { R.discard(run); continue; }
        R.place(run, m.i, m.r, m.c);
      }
      (scoreBy[key] ||= []).push(run.order.score / run.order.target);
      totalPlaced += run.order.patchesMax - run.order.patchesLeft;
    }
    if (run.phase === 'reward') R.collectReward(run);
    if (run.phase === 'shop') { shopBot(run); R.leaveShop(run); continue; }
    if (run.phase === 'victory' || run.phase === 'over') { runPoints.push(run.stats.points); runLevels.push(run.stats.topLevel); runClears.push(run.stats.clears); }
    if (run.phase === 'victory') { victories++; break; }
    if (run.phase === 'over') {
      const key = `${run.day}-${run.orderIdx}:${run.overReason}`;
      ends[key] = (ends[key] || 0) + 1;
      break;
    }
  }
}

const pct = (n) => ((100 * n) / RUNS).toFixed(1).padStart(5) + '%';
console.log(`DAY_BASE=${R.DAY_BASE} shop=${SHOP} bot=${BOT} runs=${RUNS} time=${Date.now() - t0}ms victories=${pct(victories)}`);
for (let d = 1; d <= R.DAYS; d++) for (let o = 0; o < 3; o++) {
  const key = `${d}-${o}`;
  const arr = (scoreBy[key] || []).sort((a, b) => a - b);
  const med = arr.length ? arr[Math.floor(arr.length / 2)].toFixed(2) : '-';
  console.log(`day ${d} ${['small', 'big ', 'boss'][o]} target ${String(R.targetFor(d, o)).padStart(6)} reach ${pct(reach[key] || 0)}  median score/target ${med}`);
}
console.log('ends:', Object.entries(ends).sort().map(([k, v]) => `${k}=${v}`).join('  '));
const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) * p)]; };
console.log(`run points  p25 ${q(runPoints, 0.25)}  median ${q(runPoints, 0.5)}  p75 ${q(runPoints, 0.75)}  p90 ${q(runPoints, 0.9)}  mean ${Math.round(runPoints.reduce((a, b) => a + b, 0) / runPoints.length)}`);
console.log(`run clears  median ${q(runClears, 0.5)}  mean ${Math.round(runClears.reduce((a, b) => a + b, 0) / runClears.length)}`);
console.log(`top seam level  median ${q(runLevels, 0.5)}  p90 ${q(runLevels, 0.9)}  max ${Math.max(...runLevels)}  >=10: ${runLevels.filter((v) => v >= 10).length}  >=7: ${runLevels.filter((v) => v >= 7).length}`);
