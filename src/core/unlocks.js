// Long-term goals: some tools join the market only after the player has done something
// that shows them how the tool would pay off. Pure functions over the meta record.

export const UNLOCKS = {
  artisan: { need: '한 색 줄을 8번 꿰매기', key: 'monos', goal: 8 },
  hoop: { need: '가로·세로 함께 지우기 3번', key: 'crosses', goal: 3 },
  norigae: { need: '판을 다 비우기 1번', key: 'perfects', goal: 1 },
  grandma: { need: '장날 2까지 가기', key: 'bestDay', goal: 2 },
  ruler: { need: '한 번에 세 줄 지우기 1번', key: 'triples', goal: 1 },
};

export function isUnlocked(id, meta) {
  const u = UNLOCKS[id];
  if (!u) return true;
  return (meta[u.key] || 0) >= u.goal;
}

export function lockedIds(meta) {
  return Object.keys(UNLOCKS).filter((id) => !isUnlocked(id, meta));
}

export function progress(id, meta) {
  const u = UNLOCKS[id];
  return u ? { have: Math.min(u.goal, meta[u.key] || 0), goal: u.goal, need: u.need } : null;
}
