// Sewing tools = the score engine (Balatro jokers).
// score(ctx, inst, run) returns effects: { chips } | { mult } | { xmult }.
// Phases are applied in fixed order (chips → +mult → ×mult), so slot order never matters.

import { COLORS, COLOR_NAMES } from './shapes.js';

export const MAX_TOOLS = 5;

const THREAD_NAME = { blue: '청실', red: '홍실', yellow: '황실', white: '백실', black: '먹실' };

const defs = [
  {
    id: 'thimble', name: '골무', rarity: 1, price: 4, art: 'thimble',
    desc: () => '줄을 지울 때 배수 +3',
    score: (ctx) => (ctx.lineCount ? [{ mult: 3 }] : []),
  },
  {
    id: 'needlecase', name: '바늘쌈', rarity: 1, price: 4, art: 'needlecase',
    desc: () => '줄을 지울 때 칩 +50',
    score: (ctx) => (ctx.lineCount ? [{ chips: 50 }] : []),
  },
  ...COLORS.map((color) => ({
    id: `thread_${color}`, name: THREAD_NAME[color], rarity: 1, price: 4, art: 'thread', color,
    desc: () => `지워진 ${COLOR_NAMES[color]}색 칸마다 칩 +10`,
    score: (ctx) => {
      const n = ctx.cleared.filter((c) => c.color === color).length;
      return n ? [{ chips: n * 10 }] : [];
    },
  })),
  {
    id: 'tape', name: '줄자', rarity: 1, price: 5, art: 'tape',
    desc: () => '지운 줄 하나마다 배수 +2',
    score: (ctx) => (ctx.lineCount ? [{ mult: 2 * ctx.lineCount }] : []),
  },
  {
    id: 'pouch', name: '복주머니', rarity: 1, price: 3, art: 'pouch',
    desc: () => '주문을 마칠 때마다 엽전 +2',
    reward: () => 2,
  },
  {
    id: 'sewingbox', name: '반짇고리', rarity: 1, price: 3, art: 'box',
    desc: () => '주문마다 버리기 +1, 조각 +1',
    discards: 1,
    patches: 1,
  },
  {
    id: 'lantern', name: '청사초롱', rarity: 2, price: 6, art: 'lantern',
    desc: () => '남은 버리기 1회마다 배수 +2',
    score: (ctx) => (ctx.lineCount && ctx.discardsLeft ? [{ mult: 2 * ctx.discardsLeft }] : []),
  },
  {
    id: 'scissors', name: '가위', rarity: 2, price: 5, art: 'scissors',
    desc: () => '두 줄 이상 동시에 지우면 ×2',
    score: (ctx) => (ctx.lineCount >= 2 ? [{ xmult: 2 }] : []),
  },
  {
    id: 'iron', name: '인두', rarity: 3, price: 8, art: 'iron',
    desc: (inst) => `줄을 지울 때 배수 +${inst.data.mult || 0}. 지울 때마다 +1씩 커짐`,
    init: () => ({ mult: 1 }),
    score: (ctx, inst) => (ctx.lineCount && inst.data.mult ? [{ mult: inst.data.mult }] : []),
    after: (ctx, inst) => {
      if (ctx.lineCount >= 1) { inst.data.mult += 1; return true; }
      return false;
    },
  },
  {
    id: 'spool', name: '실패', rarity: 2, price: 6, art: 'spool',
    desc: () => '연속으로 지운 횟수마다 칩 +30',
    score: (ctx) => (ctx.lineCount ? [{ chips: 30 * ctx.streak }] : []),
  },
  {
    id: 'ruler', name: '자', rarity: 2, price: 6, art: 'ruler',
    desc: () => '세로 솔기 하나마다 ×1.5',
    score: (ctx) => (ctx.colLines ? [{ xmult: Math.pow(1.5, ctx.colLines) }] : []),
  },
  {
    id: 'obang', name: '오방 주머니', rarity: 2, price: 6, art: 'obang',
    desc: () => '지운 칸에 세 가지 색 이상이 섞이면 ×1.5',
    score: (ctx) => {
      if (!ctx.lineCount) return [];
      const set = new Set(ctx.cleared.map((c) => c.color).filter((c) => COLORS.includes(c)));
      return set.size >= 3 ? [{ xmult: 1.5 }] : [];
    },
  },
  {
    id: 'pincushion', name: '바늘꽂이', rarity: 1, price: 5, art: 'pincushion',
    desc: () => '주문마다 조각 +4',
    patches: 4,
  },
  {
    id: 'lamp', name: '등잔', rarity: 2, price: 6, art: 'lamp',
    desc: () => '주문에서 첫 번째로 지울 때 ×3',
    score: (ctx) => (ctx.lineCount && ctx.clearIndex === 1 ? [{ xmult: 3 }] : []),
  },
  {
    id: 'norigae', name: '노리개', rarity: 3, price: 8, art: 'norigae',
    desc: () => '지운 뒤 빈칸이 48칸 이상이면 ×2, 판을 다 비우면 ×4',
    score: (ctx) => {
      if (!ctx.lineCount) return [];
      if (ctx.perfect) return [{ xmult: 4 }];
      return ctx.emptyAfter >= 48 ? [{ xmult: 2 }] : [];
    },
  },
  {
    id: 'hoop', name: '수틀', rarity: 3, price: 8, art: 'hoop',
    desc: () => '가로와 세로를 함께 지우면 ×3',
    score: (ctx) => (ctx.rowLines && ctx.colLines ? [{ xmult: 3 }] : []),
  },
  {
    id: 'artisan', name: '장인의 손', rarity: 3, price: 8, art: 'hand',
    desc: () => '단색 솔기 하나마다 추가 ×1.5',
    score: (ctx) => (ctx.monoLines ? [{ xmult: Math.pow(1.5, ctx.monoLines) }] : []),
  },
  {
    id: 'coins', name: '엽전 꾸러미', rarity: 3, price: 7, art: 'coins',
    desc: () => '가진 엽전 5닢마다 배수 +1 (최대 +8)',
    score: (ctx) => (ctx.lineCount && ctx.coins >= 5 ? [{ mult: Math.min(8, Math.floor(ctx.coins / 5)) }] : []),
  },
  {
    id: 'silk', name: '비단', rarity: 3, price: 8, art: 'silk',
    desc: (inst) => `줄을 지울 때 칩 +${inst.data.chips || 0}. 조각을 놓을 때마다 +3씩 쌓이고 주문마다 초기화`,
    init: () => ({ chips: 0 }),
    onPlace: (inst) => { inst.data.chips += 3; },
    onOrderStart: (inst) => { inst.data.chips = 0; },
    score: (ctx, inst) => (ctx.lineCount && inst.data.chips ? [{ chips: inst.data.chips }] : []),
  },
  {
    id: 'grandma', name: '할머니의 바늘', rarity: 3, price: 9, art: 'needle',
    desc: () => '주문에서 두 번째로 지울 때마다 ×2.5',
    score: (ctx) => (ctx.lineCount && ctx.clearIndex % 2 === 0 ? [{ xmult: 2.5 }] : []),
  },
];

export const TOOLS = Object.fromEntries(defs.map((d) => [d.id, d]));
export const TOOL_IDS = defs.map((d) => d.id);
export const RARITY_NAME = { 1: '흔함', 2: '귀함', 3: '진귀함' };

export function makeTool(id) {
  const def = TOOLS[id];
  return { id, data: def.init ? def.init() : {} };
}

export function toolDesc(inst) {
  return TOOLS[inst.id].desc(inst);
}

export function sellPrice(inst) {
  return Math.max(1, Math.ceil(TOOLS[inst.id].price / 2));
}
