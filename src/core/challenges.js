// 도전 과제 (challenges): one-run feats that pay out a workroom skin.
// A challenge is judged on a single run's stats, so it asks for a deliberate attempt rather than
// accumulating by itself. Meeting it marks it done; the player then claims the reward by hand.
// Pure functions over the meta record (meta.challenges = { id: { best, done, claimed } }).

export const CHALLENGES = [
  { id: 'streak5', name: '쉬지 않는 바늘', need: '한 판에서 연속 5번 지우기', key: 'bestStreak', goal: 5, skin: 'haneul' },
  { id: 'mono6', name: '고른 땀', need: '한 판에서 납작누비 6번', key: 'monos', goal: 6, skin: 'bisaek' },
  { id: 'hand1500', name: '한 땀에 천오백', need: '한 번 놓아 1,500점 넘기기', key: 'bestHand', goal: 1500, skin: 'honghwa' },
  { id: 'day3', name: '장인의 눈', need: '한 판에서 장날 3 장인 의뢰까지 마치기', key: 'orders', goal: 9, skin: 'deungkkot' },
  { id: 'finish', name: '누비 완성', need: '장날 4까지 모든 주문 마치기', key: 'orders', goal: 12, skin: 'hanji' },
];
export const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

const entry = (meta, id) => {
  meta.challenges ||= {};
  return (meta.challenges[id] ||= { best: 0, done: false, claimed: false });
};

export function challengeState(meta, id) {
  const c = CHALLENGE_BY_ID[id];
  const e = (meta.challenges && meta.challenges[id]) || { best: 0, done: false, claimed: false };
  return { ...e, have: Math.min(c.goal, e.best || 0), goal: c.goal };
}

/** Folds one run's stats into every challenge. Returns the challenges completed just now. */
export function checkChallenges(meta, stats) {
  const fresh = [];
  for (const c of CHALLENGES) {
    const e = entry(meta, c.id);
    const v = stats[c.key] || 0;
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
