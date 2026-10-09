// Patch shapes. Each base shape expands to its unique rotations/mirrors.
// weight = how often the shape family appears; cells normalized to top-left = (0,0).

export const COLORS = ['blue', 'red', 'yellow', 'white', 'black'];
export const COLOR_NAMES = { blue: '청', red: '적', yellow: '황', white: '백', black: '흑' };

const BASE = [
  { key: 'dot', w: 5, cells: ['#'] },
  { key: 'i2', w: 7, cells: ['##'] },
  { key: 'i3', w: 8, cells: ['###'] },
  { key: 'i4', w: 6, cells: ['####'] },
  { key: 'i5', w: 3, cells: ['#####'] },
  { key: 'o2', w: 7, cells: ['##', '##'] },
  { key: 'o3', w: 2, cells: ['###', '###', '###'] },
  { key: 'r23', w: 4, cells: ['###', '###'] },
  { key: 'c3', w: 7, cells: ['##', '#.'], mirror: false },
  { key: 'l4', w: 6, cells: ['#.', '#.', '##'], mirror: true },
  { key: 't4', w: 5, cells: ['###', '.#.'] },
  { key: 's4', w: 4, cells: ['.##', '##.'], mirror: true },
  { key: 'c5', w: 3, cells: ['###', '#..', '#..'] },
];

function parse(rows) {
  const out = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && out.push([r, c])));
  return out;
}

function normalize(cells) {
  const minR = Math.min(...cells.map((p) => p[0]));
  const minC = Math.min(...cells.map((p) => p[1]));
  return cells
    .map(([r, c]) => [r - minR, c - minC])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const rot = (cells) => normalize(cells.map(([r, c]) => [c, -r]));
const flip = (cells) => normalize(cells.map(([r, c]) => [r, -c]));
const sig = (cells) => cells.map((p) => p.join(',')).join(';');

function variants(base) {
  const seen = new Map();
  let cur = normalize(parse(base.cells));
  const seeds = base.mirror ? [cur, flip(cur)] : [cur];
  for (let s of seeds) {
    for (let i = 0; i < 4; i++) {
      seen.set(sig(s), s);
      s = rot(s);
    }
  }
  return [...seen.values()];
}

export const SHAPES = [];
for (const b of BASE) {
  const vs = variants(b);
  vs.forEach((cells, i) => {
    SHAPES.push({
      id: `${b.key}_${i}`,
      family: b.key,
      cells,
      size: cells.length,
      h: Math.max(...cells.map((p) => p[0])) + 1,
      w: Math.max(...cells.map((p) => p[1])) + 1,
      // spread the family weight across its orientations
      weight: b.w / vs.length,
    });
  });
}

export const SHAPE_BY_ID = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
