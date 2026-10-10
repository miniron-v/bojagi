// Canvas art: fabric patches, the linen hoop, knots and the indigo cloth background.
export const PAL = {
  blue: { base: '#2f66b0', light: '#4f86cf', dark: '#1d477f', stitch: '#f4ead3' },
  red: { base: '#c63d31', light: '#e0594b', dark: '#8e271e', stitch: '#f4ead3' },
  yellow: { base: '#e4ab2c', light: '#f5c75a', dark: '#a8781a', stitch: '#5b381d' },
  white: { base: '#efe6d2', light: '#fffaf0', dark: '#c9bc9f', stitch: '#8e5c35' },
  black: { base: '#33333f', light: '#4a4a5a', dark: '#1d1d25', stitch: '#e4ab2c' },
  knot: { base: '#6a2a24', light: '#8d3b33', dark: '#3f1612', stitch: '#e4ab2c' },
};

const sprites = new Map();

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export { rr as roundRect };

/** Pre-rendered patch sprite in device pixels. */
export function patchSprite(color, px) {
  px = Math.max(4, Math.round(px));
  const key = `${color}:${px}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  paintPatch(c.getContext('2d'), color, px, px);
  sprites.set(key, c);
  return c;
}

/** Paints a patch filling (0,0)-(w,h). Used for square sprites and free-size title art. */
export function paintPatch(g, color, w, h) {
  const px = Math.min(w, h);
  const p = PAL[color] || PAL.white;
  const r = px * 0.16;
  const inset = px * 0.04;
  // body with soft pillow shading
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.55, p.base);
  grad.addColorStop(1, p.dark);
  rr(g, inset, inset, w - inset * 2, h - inset * 2, r);
  g.fillStyle = grad;
  g.fill();
  // weave texture
  g.save();
  g.clip();
  g.globalAlpha = 0.09;
  g.strokeStyle = '#000';
  g.lineWidth = Math.max(1, px / 40);
  const span = Math.max(w, h);
  for (let i = -span; i < span * 2; i += px / 7) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + span, span); g.stroke();
  }
  g.globalAlpha = 0.07;
  g.strokeStyle = '#fff';
  for (let i = -span; i < span * 2; i += px / 7) {
    g.beginPath(); g.moveTo(i + span, 0); g.lineTo(i, span); g.stroke();
  }
  g.restore();
  // dark cloth gets a light rim so it reads against dark grounds and its neighbours
  if (color === 'black' || color === 'knot') {
    rr(g, inset + 0.5, inset + 0.5, w - inset * 2 - 1, h - inset * 2 - 1, r);
    g.strokeStyle = 'rgba(244,234,211,.32)';
    g.lineWidth = Math.max(1, px * 0.03);
    g.stroke();
  }
  // top highlight
  g.globalAlpha = 0.25;
  rr(g, inset + px * 0.08, inset + px * 0.06, w - inset * 2 - px * 0.16, px * 0.14, px * 0.07);
  g.fillStyle = '#fff';
  g.fill();
  g.globalAlpha = 1;
  // running stitch border
  const s = px * 0.17;
  g.setLineDash([px * 0.09, px * 0.07]);
  g.lineWidth = Math.max(1, px * 0.045);
  g.lineCap = 'round';
  g.strokeStyle = p.stitch;
  g.globalAlpha = 0.85;
  rr(g, s, s, w - s * 2, h - s * 2, r * 0.6);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  if (color === 'knot') {
    g.fillStyle = p.stitch;
    g.beginPath();
    g.arc(w / 2, h / 2, px * 0.12, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.stitch;
    g.lineWidth = px * 0.05;
    g.beginPath();
    g.ellipse(w / 2 - px * 0.14, h / 2, px * 0.12, px * 0.08, 0, 0, Math.PI * 2);
    g.ellipse(w / 2 + px * 0.14, h / 2, px * 0.12, px * 0.08, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

export function clearSpriteCache() { sprites.clear(); }

/** Wooden hoop frame + linen field. Drawn in CSS pixel units (ctx already scaled). */
const PINE = { shadow: '#5b381d', hi: '#a26a3d', mid: '#8e5c35', lo: '#6e4425', grain: '#2a1608', field: '#e9dcc0' };

export function drawHoop(g, x, y, size, cell, t, wood = PINE) {
  const pad = cell * 0.32;
  // shadow
  g.save();
  g.shadowColor = 'rgba(0,0,0,.45)';
  g.shadowBlur = cell * 0.7;
  g.shadowOffsetY = cell * 0.18;
  rr(g, x - pad, y - pad, size + pad * 2, size + pad * 2, cell * 0.45);
  g.fillStyle = wood.shadow;
  g.fill();
  g.restore();
  // wood with grain
  const wg = g.createLinearGradient(x - pad, y - pad, x + size + pad, y + size + pad);
  wg.addColorStop(0, wood.hi);
  wg.addColorStop(0.5, wood.mid);
  wg.addColorStop(1, wood.lo);
  rr(g, x - pad, y - pad, size + pad * 2, size + pad * 2, cell * 0.45);
  g.fillStyle = wg;
  g.fill();
  g.save();
  g.clip();
  g.globalAlpha = 0.12;
  g.strokeStyle = wood.grain;
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const yy = y - pad + ((i * 37) % (size + pad * 2));
    g.beginPath();
    g.moveTo(x - pad, yy);
    g.bezierCurveTo(x + size * 0.3, yy + 6, x + size * 0.7, yy - 6, x + size + pad, yy + 2);
    g.stroke();
  }
  g.restore();
  // linen field
  const inner = cell * 0.06;
  rr(g, x - inner, y - inner, size + inner * 2, size + inner * 2, cell * 0.22);
  g.fillStyle = wood.field;
  g.fill();
  // linen weave
  g.save();
  g.clip();
  g.globalAlpha = 0.06;
  g.fillStyle = wood.shadow;
  for (let i = 0; i < size; i += 3) g.fillRect(x + i, y, 1, size);
  for (let i = 0; i < size; i += 3) g.fillRect(x, y + i, size, 1);
  g.restore();
  // grid seams (empty slots)
  g.save();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    rr(g, x + c * cell + cell * 0.08, y + r * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.14);
    g.fillStyle = 'rgba(120,90,50,.09)';
    g.fill();
  }
  g.restore();
  // brass clamp at top
  g.fillStyle = wood.shadow;
  rr(g, x + size / 2 - cell * 0.5, y - pad - cell * 0.18, cell, cell * 0.3, cell * 0.08);
  g.fill();
  g.fillStyle = '#e7b33a';
  g.beginPath();
  g.arc(x + size / 2, y - pad - cell * 0.03, cell * 0.08, 0, Math.PI * 2);
  g.fill();
  void t;
}

/** Tileable indigo cloth texture returned as a data URL for the CSS background. */
export function clothTexture(base = '#1b2542') {
  const c = document.createElement('canvas');
  const n = 128;
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  // seeded LCG so the texture is stable
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i += 2) {
    g.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.02})`;
    g.fillRect(i, 0, 1, n);
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.04})`;
    g.fillRect(0, i, n, 1);
  }
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,10'},${rnd() * 0.05})`;
    g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 3, 1);
  }
  return c.toDataURL();
}
