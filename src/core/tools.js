// Sewing tools = the score engine (Balatro jokers).
// score(ctx, inst) returns effects: { chips } | { mult } | { xmult }. ctx.seam / ctx.level name the
// seam hand being scored (see seams.js) so tools can build around one hand.
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
    desc: () => '줄을 지울 때 점 +50',
    score: (ctx) => (ctx.lineCount ? [{ chips: 50 }] : []),
  },
  ...COLORS.map((color) => ({
    id: `thread_${color}`, name: THREAD_NAME[color], rarity: 1, price: 4, art: 'thread', color,
    desc: () => `줄을 지울 때 ${COLOR_NAMES[color]}색 칸 하나마다 점 +10`,
    score: (ctx) => {
      const n = ctx.cleared.filter((c) => c.color === color).length;
      return n ? [{ chips: n * 10 }] : [];
    },
  })),
  {
    id: 'tape', name: '줄자', rarity: 1, price: 5, art: 'tape',
    desc: () => '줄을 지울 때 지운 줄 하나마다 배수 +2',
    score: (ctx) => (ctx.lineCount ? [{ mult: 2 * ctx.lineCount }] : []),
  },
  {
    id: 'pouch', name: '복주머니', rarity: 1, price: 3, art: 'pouch',
    desc: () => '주문을 마칠 때 +2냥',
    reward: () => 2,
  },
  {
    id: 'sewingbox', name: '반짇고리', rarity: 1, price: 3, art: 'box',
    desc: () => '주문마다 조각 +1, 조각 바꾸기 +1',
    discards: 1,
    patches: 1,
  },
  {
    id: 'lantern', name: '청사초롱', rarity: 2, price: 6, art: 'lantern',
    desc: () => '줄을 지울 때 남은 조각 바꾸기 1회마다 배수 +2',
    score: (ctx) => (ctx.lineCount && ctx.discardsLeft ? [{ mult: 2 * ctx.discardsLeft }] : []),
  },
  {
    id: 'scissors', name: '가위', rarity: 2, price: 5, art: 'scissors',
    desc: () => '겹누비·십자수·세누비로 지울 때 배수 ×2',
    score: (ctx) => (['double', 'cross', 'triple'].includes(ctx.seam) ? [{ xmult: 2 }] : []),
  },
  {
    id: 'iron', name: '인두', rarity: 3, price: 8, art: 'iron',
    desc: (inst) => `줄을 지울 때 배수 +${inst.data.mult || 0} (지울 때마다 +1씩 자람)`,
    init: () => ({ mult: 1 }),
    badge: (inst) => `+${inst.data.mult}`,
    score: (ctx, inst) => (ctx.lineCount && inst.data.mult ? [{ mult: inst.data.mult }] : []),
    after: (ctx, inst) => {
      if (ctx.lineCount >= 1) { inst.data.mult += 1; return true; }
      return false;
    },
  },
  {
    id: 'spool', name: '실패', rarity: 2, price: 6, art: 'spool',
    desc: () => '줄을 지울 때 연속 1회마다 점 +30',
    score: (ctx) => (ctx.lineCount ? [{ chips: 30 * ctx.streak }] : []),
  },
  {
    id: 'ruler', name: '자', rarity: 2, price: 6, art: 'ruler',
    desc: () => '줄을 지울 때 세로줄 하나마다 배수 ×1.5',
    score: (ctx) => (ctx.colLines ? [{ xmult: Math.pow(1.5, ctx.colLines) }] : []),
  },
  {
    id: 'obang', name: '오방 주머니', rarity: 2, price: 6, art: 'obang',
    desc: () => '줄을 지울 때 지운 칸이 세 가지 색 이상이면 배수 ×1.5',
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
    desc: () => '주문에서 처음 지울 때 배수 ×3',
    score: (ctx) => (ctx.lineCount && ctx.clearIndex === 1 ? [{ xmult: 3 }] : []),
  },
  {
    id: 'norigae', name: '노리개', rarity: 3, price: 8, art: 'norigae',
    desc: () => '마무리로 지울 때 배수 ×4, 지운 뒤 빈칸이 48칸 이상이면 배수 ×2',
    score: (ctx) => {
      if (!ctx.lineCount) return [];
      if (ctx.seam === 'perfect' || ctx.perfect) return [{ xmult: 4 }];
      return ctx.emptyAfter >= 48 ? [{ xmult: 2 }] : [];
    },
  },
  {
    id: 'hoop', name: '밀대', rarity: 3, price: 8, art: 'roller',
    desc: () => '십자수로 지울 때 배수 ×3',
    score: (ctx) => (ctx.seam === 'cross' ? [{ xmult: 3 }] : []),
  },
  {
    id: 'artisan', name: '장인의 손', rarity: 3, price: 8, art: 'hand',
    desc: () => '한 색 줄을 지울 때 배수 ×2',
    score: (ctx) => (ctx.monoLines ? [{ xmult: 2 }] : []),
  },
  {
    id: 'stamp', name: '장인 도장', rarity: 2, price: 6, art: 'stamp',
    desc: () => '레벨이 가장 높은 족보로 지울 때 배수 ×2 (레벨 2부터)',
    score: (ctx) => {
      if (!ctx.lineCount || !ctx.levels) return [];
      const top = Math.max(...Object.values(ctx.levels));
      return top >= 2 && ctx.level === top ? [{ xmult: 2 }] : [];
    },
  },
  {
    id: 'manual', name: '침선 교본', rarity: 2, price: 5, art: 'book',
    desc: (inst) => `줄을 지울 때 배수 +${inst.data.mult || 0} (본을 살 때마다 +2씩 자람)`,
    init: () => ({ mult: 0 }),
    badge: (inst) => `+${inst.data.mult}`,
    onPattern: (inst) => { inst.data.mult += 2; },
    score: (ctx, inst) => (ctx.lineCount && inst.data.mult ? [{ mult: inst.data.mult }] : []),
  },
  {
    id: 'sleeve', name: '색동 소매', rarity: 1, price: 4, art: 'sleeve',
    desc: () => '겹누비·십자수로 지울 때 점 +80',
    score: (ctx) => (ctx.seam === 'double' || ctx.seam === 'cross' ? [{ chips: 80 }] : []),
  },
  {
    id: 'coins', name: '전대', rarity: 3, price: 7, art: 'coins',
    desc: () => '줄을 지울 때 가진 돈 5냥마다 배수 +1 (최대 +8)',
    score: (ctx) => (ctx.lineCount && ctx.coins >= 5 ? [{ mult: Math.min(8, Math.floor(ctx.coins / 5)) }] : []),
  },
  {
    id: 'silk', name: '비단', rarity: 3, price: 8, art: 'silk',
    desc: (inst) => `줄을 지울 때 점 +${inst.data.chips || 0} (조각을 놓을 때마다 +3씩 자람, 주문마다 처음부터)`,
    init: () => ({ chips: 0 }),
    badge: (inst) => `+${inst.data.chips}`,
    onPlace: (inst) => { inst.data.chips += 3; },
    onOrderStart: (inst) => { inst.data.chips = 0; },
    score: (ctx, inst) => (ctx.lineCount && inst.data.chips ? [{ chips: inst.data.chips }] : []),
  },
  {
    id: 'grandma', name: '할머니의 바늘', rarity: 3, price: 9, art: 'needle',
    desc: () => '주문에서 짝수 번째(2·4·6…)로 지울 때 배수 ×2.5',
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

/** Small live number shown on the tool slot for tools that grow (null for static tools). */
export function toolBadge(inst) {
  const def = TOOLS[inst.id];
  return def.badge ? def.badge(inst) : null;
}

export function sellPrice(inst) {
  return Math.max(1, Math.ceil(TOOLS[inst.id].price / 2));
}
