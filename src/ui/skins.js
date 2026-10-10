// 공방 꾸미기 (skins): the dye of the workroom cloth, the silk of every panel, and the lacquer of
// the hoop. Grounds are bright dyed cloth with dark lettering; panels are a deeper silk of the
// same dye with light lettering. A skin only swaps CSS custom properties and the few colours
// the canvases paint with, so every screen follows it. Accents (seal red, gold thread, the five
// patch colours) stay fixed: they carry meaning in play and must read the same on every cloth.
// Every skin but the first is the reward of a challenge (src/core/challenges.js).
import { challengeForSkin, challengeState } from '../core/challenges.js';

const WOOD = {
  pine: { shadow: '#5b381d', hi: '#a26a3d', mid: '#8e5c35', lo: '#6e4425', grain: '#2a1608', field: '#e9dcc0' },
  ebony: { shadow: '#191416', hi: '#4a3c38', mid: '#372c29', lo: '#241c1b', grain: '#000000', field: '#ece4d2' },
  cinnabar: { shadow: '#4a120c', hi: '#b5432f', mid: '#962f20', lo: '#6d1f15', grain: '#2a0702', field: '#efe1c6' },
  birch: { shadow: '#6b5434', hi: '#c9a873', mid: '#b08e5a', lo: '#8c6d40', grain: '#3a2a12', field: '#f0e8d6' },
};

export const SKINS = [
  {
    id: 'jjok', name: '쪽빛', note: '쪽물 들인 무명에 소나무 수틀',
    ground: '#7d9ad6', cloth: '#7895d2', onGround: '#16224a', onGround2: '#2f4078',
    silk: '#34519a', silk2: '#4363ad', silk3: '#5a7cc6', deep: '#263d78', veil: '#121c3a',
    rare: '#4a3f9a', pattern: '#5a3a7a', muted: '#cfd8f0', dim: '#97a7d2', wood: WOOD.pine,
  },
  {
    id: 'haneul', name: '하늘빛', note: '갠 하늘 빛 모시에 자작 수틀',
    ground: '#8ccbec', cloth: '#87c6e8', onGround: '#0f3550', onGround2: '#2a5675',
    silk: '#2a6a9e', silk2: '#337bb2', silk3: '#4893c9', deep: '#1d5481', veil: '#0d2a40',
    rare: '#3a5aa8', pattern: '#50628e', muted: '#d5e9f6', dim: '#93bbd8', wood: WOOD.birch,
  },
  {
    id: 'bisaek', name: '비색', note: '청자 빛 명주에 자작 수틀',
    ground: '#9fd1bd', cloth: '#9acdb8', onGround: '#12423a', onGround2: '#2c5f54',
    silk: '#2c7363', silk2: '#368574', silk3: '#4b9b89', deep: '#1f574a', veil: '#0b2a23',
    rare: '#2d6680', pattern: '#4f6c62', muted: '#d4ece3', dim: '#92c2b2', wood: WOOD.birch,
  },
  {
    id: 'honghwa', name: '홍화', note: '잇꽃 물 들인 비단에 주칠 수틀',
    ground: '#f0a3a8', cloth: '#ec9ea3', onGround: '#5a1020', onGround2: '#7f2c3c',
    silk: '#a33246', silk2: '#b84259', silk3: '#cc5a6f', deep: '#7a2132', veil: '#3a0d17',
    rare: '#8a2f6a', pattern: '#8a3a52', muted: '#f7d6d9', dim: '#de9ea8', wood: WOOD.cinnabar,
  },
  {
    id: 'deungkkot', name: '등꽃', note: '등나무 꽃 빛 사에 흑단 수틀',
    ground: '#bba8e0', cloth: '#b6a2dc', onGround: '#2e1a4f', onGround2: '#4b3672',
    silk: '#5e3f8e', silk2: '#6e4fa2', silk3: '#8567b9', deep: '#46306d', veil: '#1f1433',
    rare: '#5a3fa8', pattern: '#7a3f80', muted: '#e4d9f3', dim: '#b6a4d5', wood: WOOD.ebony,
  },
  {
    id: 'hanji', name: '한지와 먹', note: '닥종이 빛 삼베에 먹색 비단',
    ground: '#d8c9a6', cloth: '#d3c3a0', onGround: '#2e2620', onGround2: '#5a4c3e',
    silk: '#4a433d', silk2: '#5a524b', silk3: '#706760', deep: '#36302b', veil: '#1a1612',
    rare: '#4d3f52', pattern: '#5a4040', muted: '#e0d7c8', dim: '#ab9c8c', wood: WOOD.ebony,
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const DEFAULT_SKIN = 'jjok';

/** A skin is worn once its challenge's reward has been claimed (the first skin is free). */
export function skinUnlocked(skin, meta) {
  const c = challengeForSkin(skin.id);
  return !c || challengeState(meta, c.id).claimed;
}

/** The skin to show: the chosen one if it is earned, otherwise the default. */
export function resolveSkin(id, meta) {
  const s = SKIN_BY_ID[id];
  return s && skinUnlocked(s, meta) ? s : SKIN_BY_ID[DEFAULT_SKIN];
}

/** Write a skin's colours onto an element as custom properties. */
export function applySkinVars(node, s) {
  const v = {
    '--ground': s.ground, '--on-ground': s.onGround, '--on-ground-2': s.onGround2, '--ground-line': s.onGround + '40',
    '--silk': s.silk, '--silk-2': s.silk2, '--silk-3': s.silk3,
    '--deep': s.deep, '--deep-a': s.deep + 'f0', '--deep-b': s.deep + 'b3', '--veil': s.veil + 'b8',
    '--card-rare': s.rare, '--card-pattern': s.pattern, '--muted': s.muted, '--dim': s.dim,
  };
  for (const k in v) node.style.setProperty(k, v[k]);
}
