// 공방 꾸미기 (skins): the dye of the workroom cloth, the silk of every panel, and the lacquer of
// the hoop. Each skin is a pairing of traditional Korean colours: a ground cloth (with its own
// lettering colour, dark or light) and a panel silk that always carries light lettering. A skin only swaps CSS custom properties and the few colours
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

// Colours start from 「한국전통표준색명 및 색상」 (국립현대미술관) and are moved only in value so
// lettering stays readable. The large areas take the deep, slightly greyed tones of natural dyes
// (쪽, 자초, 먹, 뇌록); vivid colour is left to small accents, the way 색동 and 단청 머리초 do it.
export const SKINS = [
  {
    // 쪽 dye in its deepest vat: the original night workroom
    id: 'jjok', name: '쪽빛', note: '쪽물 들인 무명에 소나무 수틀',
    ground: '#141b33', cloth: '#1b2542', onGround: '#f3ead6', onGround2: '#b3b8cf', onAlert: '#ffaa9c',
    silk: '#1f2a4f', silk2: '#2a3866', silk3: '#3a4b84', deep: '#10162c', veil: '#090d1c',
    rare: '#2c2b55', pattern: '#2b2342', muted: '#b3b8cf', dim: '#8d94b3', wood: WOOD.pine,
  },
  {
    // 벽색 碧色 #469EDE sky over 감색 紺色 #495C7F silk
    id: 'cheongmyeong', name: '청명', note: '벽색 하늘 아래 감색 비단',
    ground: '#4596d2', cloth: '#4190cc', onGround: '#0c2440', onGround2: '#0f2a48', onAlert: '#5a0f0a',
    silk: '#2f4570', silk2: '#3a5280', silk3: '#4e6796', deep: '#22345a', veil: '#0d1830',
    rare: '#454a8a', pattern: '#55456e', muted: '#d8e0ee', dim: '#aab6cc', wood: WOOD.birch,
  },
  {
    // 단청: 뇌록 磊綠 #398885 ground, 석간주 石間硃 #A06549 posts, a cinnabar frame
    id: 'dancheong', name: '단청', note: '뇌록 바탕에 석간주 기둥',
    ground: '#2c706c', cloth: '#2f7470', onGround: '#f3ead6', onGround2: '#dcebe8', onAlert: '#ffd0c4',
    silk: '#7a4430', silk2: '#874c37', silk3: '#a0644a', deep: '#5a3221', veil: '#1e100a',
    rare: '#6e4a6a', pattern: '#7a4440', muted: '#f3e2d6', dim: '#e0c2b2', wood: WOOD.cinnabar,
  },
  {
    // 자주 紫朱 #9E4574 dyed with 자초, panels in 포도색 葡萄色 #74496C
    id: 'jaju', name: '자주', note: '자초로 물들인 자주 명주',
    ground: '#82365c', cloth: '#7d3458', onGround: '#f6e6ee', onGround2: '#e6c4d4', onAlert: '#ffd0c4',
    silk: '#55304d', silk2: '#643a5b', silk3: '#7d4e72', deep: '#3d2137', veil: '#1c0d18',
    rare: '#5d3a7a', pattern: '#6b2f45', muted: '#efd9e4', dim: '#c9a6ba', wood: WOOD.ebony,
  },
  {
    id: 'deungkkot', name: '등꽃', note: '등나무 꽃 빛 사에 흑단 수틀',
    ground: '#bba8e0', cloth: '#b6a2dc', onGround: '#2e1a4f', onGround2: '#4b3672', onAlert: '#6e1a12',
    silk: '#5e3f8e', silk2: '#6e4fa2', silk3: '#8567b9', deep: '#46306d', veil: '#1f1433',
    rare: '#5a3fa8', pattern: '#7a3f80', muted: '#e8dff5', dim: '#c3b4de', wood: WOOD.ebony,
  },
  {
    // 지백 紙白 / 소색 素色 paper with 먹 ink silk
    id: 'hanji', name: '한지와 먹', note: '닥종이 빛 삼베에 먹색 비단',
    ground: '#d8c9a6', cloth: '#d3c3a0', onGround: '#2e2620', onGround2: '#5a4c3e', onAlert: '#6e1a12',
    silk: '#4a433d', silk2: '#5a524b', silk3: '#706760', deep: '#36302b', veil: '#1a1612',
    rare: '#4d3f52', pattern: '#5a4040', muted: '#e4dccf', dim: '#bdb0a2', wood: WOOD.ebony,
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
    '--ground': s.ground, '--on-ground': s.onGround, '--on-ground-2': s.onGround2, '--ground-line': s.onGround + '66', '--on-ground-alert': s.onAlert,
    '--silk': s.silk, '--silk-2': s.silk2, '--silk-3': s.silk3,
    '--deep': s.deep, '--deep-a': s.deep + 'f0', '--deep-b': s.deep + 'b3', '--veil': s.veil + 'b8',
    '--card-rare': s.rare, '--card-pattern': s.pattern, '--muted': s.muted, '--dim': s.dim,
  };
  for (const k in v) node.style.setProperty(k, v[k]);
}
