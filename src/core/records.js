// Lifetime records (the "공방 일지"). Pure: takes the meta record and a finished/abandoned run,
// mutates both and returns what changed for the end screen. Safe to call more than once per run.
import { DAYS, ORDERS_PER_DAY } from './run.js';
import { lockedIds, isUnlocked } from './unlocks.js';

const COUNTERS = ['clears', 'monos', 'crosses', 'triples', 'perfects'];
const DAILY_KEEP = 14;

/** 'YYYY-M-D' keys (as produced by dailySeed) shifted by whole days. */
export function shiftDayKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function recordRun(meta, run, { victory = false } = {}) {
  const before = new Set(lockedIds(meta));
  const st = run.stats;
  const info = { newDay: run.day > meta.bestDay, newHand: st.bestHand > meta.bestHand, unlocked: [] };
  meta.bestDay = Math.max(meta.bestDay || 0, run.day);
  meta.bestHand = Math.max(meta.bestHand || 0, st.bestHand);
  meta.bestStreak = Math.max(meta.bestStreak || 0, st.bestStreak);
  // counters add only what this run has not reported yet
  const rep = run.reported || {};
  for (const k of COUNTERS) {
    meta[k] = (meta[k] || 0) + (st[k] || 0) - (rep[k] || 0);
    rep[k] = st[k] || 0;
  }
  run.reported = rep;
  if (victory && !run.winRecorded) {
    meta.wins = (meta.wins || 0) + 1;
    run.winRecorded = true;
  }
  if (run.mode === 'daily' && run.dailyKey) {
    meta.daily ||= {};
    const prev = meta.daily[run.dailyKey];
    const k = st.orders * 1e7 + Math.min(st.bestHand, 9999999);
    const full = victory || st.orders >= DAYS * ORDERS_PER_DAY;
    if (!prev || k > prev.k) meta.daily[run.dailyKey] = { k, label: full ? '완성' : `주문 ${st.orders}개` };
    const keys = Object.keys(meta.daily);
    if (keys.length > DAILY_KEEP) keys.slice(0, keys.length - DAILY_KEEP).forEach((key) => delete meta.daily[key]);
    const ds = meta.dailyStreak || { last: null, count: 0 };
    if (ds.last !== run.dailyKey) {
      ds.count = ds.last === shiftDayKey(run.dailyKey, -1) ? ds.count + 1 : 1;
      ds.last = run.dailyKey;
    }
    meta.dailyStreak = ds;
  }
  info.unlocked = [...before].filter((id) => isUnlocked(id, meta));
  return info;
}

/** Is the daily streak still alive for the given today key? */
export function dailyStreakAlive(meta, todayKey) {
  const ds = meta.dailyStreak;
  return !!ds && ds.count > 0 && (ds.last === todayKey || ds.last === shiftDayKey(todayKey, -1));
}
