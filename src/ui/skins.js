// 공방 꾸미기 (skins): the dye of the workroom cloth, the silk of every panel, and the lacquer of
// the hoop. A skin only swaps CSS custom properties and the few colours the canvases paint with,
// so every screen follows it. Accents (seal red, gold thread, the five patch colours) stay fixed:
// they carry meaning in play and must read the same on every cloth.
// Some skins are earned, like the tools: a reason to come back that never touches balance.

const WOOD = {
  pine: { shadow: '#5b381d', hi: '#a26a3d', mid: '#8e5c35', lo: '#6e4425', grain: '#2a1608', field: '#e9dcc0' },
  ebony: { shadow: '#191416', hi: '#4a3c38', mid: '#372c29', lo: '#241c1b', grain: '#000000', field: '#ece4d2' },
  cinnabar: { shadow: '#4a120c', hi: '#b5432f', mid: '#962f20', lo: '#6d1f15', grain: '#2a0702', field: '#efe1c6' },
  birch: { shadow: '#6b5434', hi: '#c9a873', mid: '#b08e5a', lo: '#8c6d40', grain: '#3a2a12', field: '#ebe3cf' },
};

export const SKINS = [
  {
    id: 'jjok', name: '쪽빛 밤', note: '쪽물 들인 무명에 소나무 수틀',
    ground: '#141b33', silk: '#1f2a4f', silk2: '#2a3866', silk3: '#3a4b84', deep: '#10162c', veil: '#090d1c',
    rare: '#2c2b55', pattern: '#2b2342', cloth: '#1b2542', muted: '#b3b8cf', dim: '#7d84a3', wood: WOOD.pine,
  },
  {
    id: 'meok', name: '먹빛', note: '먹으로 물들인 삼베에 흑단 수틀',
    ground: '#23201e', silk: '#312d2a', silk2: '#3e3935', silk3: '#57514b', deep: '#171513', veil: '#0b0a09',
    rare: '#3a3238', pattern: '#3d2c30', cloth: '#2a2725', muted: '#bdbcc4', dim: '#85848f', wood: WOOD.ebony,
  },
  {
    id: 'honghwa', name: '홍화', note: '잇꽃 물 들인 비단에 주칠 수틀',
    ground: '#2a1118', silk: '#3c1a24', silk2: '#512431', silk3: '#6c3344', deep: '#1c0a0f', veil: '#12060a',
    rare: '#44203a', pattern: '#4a1f2c', cloth: '#331520', muted: '#d6b8bd', dim: '#9c7a81', wood: WOOD.cinnabar,
    unlock: { key: 'bestDay', goal: 3, need: '장날 3까지 가기' },
  },
  {
    id: 'bisaek', name: '비색', note: '청자 빛 모시에 자작 수틀',
    ground: '#0e2422', silk: '#173633', silk2: '#214743', silk3: '#30625c', deep: '#091816', veil: '#050f0e',
    rare: '#1f3b4a', pattern: '#2a3438', cloth: '#132d2a', muted: '#b2cbc5', dim: '#76958f', wood: WOOD.birch,
    unlock: { key: 'wins', goal: 1, need: '누비 완성 1번' },
  },
  {
    id: 'jaju', name: '자줏빛', note: '자초로 물들인 명주에 흑단 수틀',
    ground: '#1f1530', silk: '#2d2045', silk2: '#3b2b5a', silk3: '#523d7a', deep: '#150e22', veil: '#0c0814',
    rare: '#3a2a5e', pattern: '#3a2340', cloth: '#261a3a', muted: '#c4b8d6', dim: '#8a7ea0', wood: WOOD.ebony,
    unlock: { key: 'perfects', goal: 3, need: '마무리 3번' },
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const DEFAULT_SKIN = 'jjok';

export function skinUnlocked(skin, meta) {
  return !skin.unlock || (meta[skin.unlock.key] || 0) >= skin.unlock.goal;
}

export function skinProgress(skin, meta) {
  const u = skin.unlock;
  return u ? { have: Math.min(u.goal, meta[u.key] || 0), goal: u.goal, need: u.need } : null;
}

/** The skin to show: the chosen one if it is (still) earned, otherwise the default. */
export function resolveSkin(id, meta) {
  const s = SKIN_BY_ID[id];
  return s && skinUnlocked(s, meta) ? s : SKIN_BY_ID[DEFAULT_SKIN];
}

/** Write a skin's colours onto an element as custom properties. */
export function applySkinVars(node, s) {
  const v = {
    '--ground': s.ground, '--silk': s.silk, '--silk-2': s.silk2, '--silk-3': s.silk3,
    '--deep': s.deep, '--deep-a': s.deep + 'f0', '--deep-b': s.deep + 'b3', '--veil': s.veil + 'cc',
    '--card-rare': s.rare, '--card-pattern': s.pattern, '--muted': s.muted, '--dim': s.dim,
  };
  for (const k in v) node.style.setProperty(k, v[k]);
}
