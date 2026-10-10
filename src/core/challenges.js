// 도전 과제 (challenges): long goals that pay out a workroom skin.
// They are measured on the lifetime record (공방 일지), so they reward playing long and playing
// well: points sewn over many runs, lines quilted, one great run, a seam grown to level 10, and
// finishing the whole commission more than once. Meeting one marks it done; the player then
// claims the reward by hand. Pure functions (meta.challenges = { id: { best, done, claimed } }).
import { COUNTERS } from './records.js';

export const CHALLENGES = [
  { id: 'points300k', name: '삼십만 땀', need: '누적 점수 300,000점', of: (m) => m.points, goal: 300000, skin: 'cheongmyeong' },
  { id: 'lines500', name: '오백 줄', need: '누빈 줄 누적 500줄', of: (m) => m.clears, goal: 500, skin: 'jaju' },
  { id: 'run100k', name: '큰 손님', need: '한 판 점수 100,000점', of: (m) => m.bestPoints, goal: 100000, skin: 'deungkkot' },
  { id: 'level10', name: '한 우물', need: '한 족보를 10레벨까지 (한 판에서)', of: (m) => m.bestLevel, goal: 10, skin: 'dancheong', hard: true },
  { id: 'wins3', name: '명장', need: '누비 완성 3번', of: (m) => m.wins, goal: 3, skin: 'hanji', hard: true },
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

const entry = (meta, id) => {
  meta.challenges ||= {};
  return (meta.challenges[id] ||= { best: 0, done: false, claimed: false });
};

/**
 * The lifetime record as it would read if the run in progress ended now: counters gain what the
 * run has not reported yet, bests take the run's bests. Lets challenges complete mid-run.
 */
export function liveRecord(meta, run = null) {
  const m = { ...meta };
  if (!run || !run.stats) return m;
  const st = run.stats;
  const rep = run.reported || {};
  for (const k of COUNTERS) m[k] = (m[k] || 0) + Math.max(0, (st[k] || 0) - (rep[k] || 0));
  m.bestPoints = Math.max(m.bestPoints || 0, st.points || 0);
  m.bestLevel = Math.max(m.bestLevel || 1, st.topLevel || 1);
  return m;
}

export function challengeState(meta, id) {
  const c = CHALLENGE_BY_ID[id];
  const e = (meta.challenges && meta.challenges[id]) || { best: 0, done: false, claimed: false };
  return { ...e, have: Math.min(c.goal, e.best || 0), goal: c.goal };
}

/** Folds a record (see liveRecord) into every challenge. Returns the challenges completed just now. */
export function checkChallenges(meta, record = meta) {
  const fresh = [];
  for (const c of CHALLENGES) {
    const e = entry(meta, c.id);
    const v = c.of(record) || 0;
    if (v > e.best) e.best = v;
    if (!e.done && v >= c.goal) { e.done = true; fresh.push(c); }
  }
  return fresh;
}

/** Takes a completed challenge's reward. */
export function claimChallenge(meta, id) {
  const e = entry(meta, id);
  if (!e.done || e.claimed) return false;
  e.claimed = true;
  return true;
}

/** Completed but not yet claimed. */
export const claimable = (meta) => CHALLENGES.filter((c) => {
  const e = meta.challenges && meta.challenges[c.id];
  return e && e.done && !e.claimed;
});

/** The challenge that pays out a skin, if any. */
export const challengeForSkin = (skinId) => CHALLENGES.find((c) => c.skin === skinId) || null;
