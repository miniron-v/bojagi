// Inline SVG art for sewing tools and HUD glyphs. 48×48 viewBox, palette via CSS vars.
const S = (body, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const T = 'var(--thread)';
const G = 'var(--gold)';
const R = 'var(--seal)';
const W = 'var(--wood)';
const W2 = 'var(--wood-2)';
const L = 'var(--linen)';
const COL = { blue: 'var(--c-blue)', red: 'var(--c-red)', yellow: 'var(--c-yellow)', white: 'var(--c-white)', black: '#4a4a5c' };

const art = {
  thimble: () => S(`<path d="M14 40 L16 16 Q24 6 32 16 L34 40 Z" fill="${G}"/><path d="M14 40 h20 v3 h-20z" fill="var(--gold-2)"/>
    ${[18, 23, 28, 33].map((y) => [18, 22, 26, 30].map((x) => `<circle cx="${x + (y % 2) * 1}" cy="${y}" r="1.2" fill="var(--gold-2)"/>`).join('')).join('')}`),
  needlecase: () => S(`<rect x="10" y="10" width="28" height="30" rx="4" fill="${R}"/><rect x="14" y="14" width="20" height="22" rx="2" fill="${L}"/>
    ${[18, 22, 26, 30].map((x) => `<line x1="${x}" y1="16" x2="${x}" y2="34" stroke="#888" stroke-width="1.4"/><circle cx="${x}" cy="17" r="1" fill="#555"/>`).join('')}`),
  thread: (c) => S(`<rect x="13" y="8" width="22" height="5" rx="2" fill="${W}"/><rect x="13" y="35" width="22" height="5" rx="2" fill="${W}"/>
    <rect x="15" y="13" width="18" height="22" fill="${COL[c] || T}"/>
    ${[16, 20, 24, 28, 32].map((y) => `<line x1="15" y1="${y}" x2="33" y2="${y + 1.5}" stroke="#00000030" stroke-width="1"/>`).join('')}
    <path d="M33 26 Q42 30 38 42" stroke="${COL[c] || T}" stroke-width="2" fill="none"/>`),
  tape: () => S(`<circle cx="22" cy="24" r="14" fill="${G}"/><circle cx="22" cy="24" r="5" fill="var(--gold-2)"/>
    <path d="M22 38 H42 V44 H22" fill="${L}"/>${[26, 30, 34, 38].map((x) => `<line x1="${x}" y1="38" x2="${x}" y2="41" stroke="#555" stroke-width="1"/>`).join('')}`),
  pouch: () => S(`<path d="M12 22 Q10 42 24 42 Q38 42 36 22 Z" fill="${R}"/><path d="M14 22 Q24 14 34 22" fill="var(--seal-2)"/>
    <path d="M18 16 Q24 22 30 16" stroke="${G}" stroke-width="2.5" fill="none"/><circle cx="24" cy="31" r="5" fill="none" stroke="${G}" stroke-width="2"/>
    <text x="24" y="34" font-size="7" text-anchor="middle" fill="${G}" font-family="serif">福</text>`),
  box: () => S(`<rect x="8" y="18" width="32" height="22" rx="3" fill="${W}"/><rect x="6" y="13" width="36" height="8" rx="3" fill="${W2}"/>
    <rect x="20" y="22" width="8" height="5" rx="1" fill="${G}"/><circle cx="16" cy="11" r="3" fill="var(--c-blue)"/><circle cx="30" cy="11" r="3" fill="${R}"/>`),
  lantern: () => S(`<line x1="24" y1="4" x2="24" y2="10" stroke="${W2}" stroke-width="2"/><rect x="18" y="9" width="12" height="3" fill="${W2}"/>
    <path d="M14 12 h20 v10 h-20z" fill="var(--c-blue)"/><path d="M14 22 h20 v14 h-20z" fill="${R}"/><rect x="18" y="36" width="12" height="3" fill="${W2}"/>
    <path d="M22 39 L20 46 M26 39 L28 46" stroke="${R}" stroke-width="1.5"/><rect x="14" y="12" width="20" height="24" fill="${G}" opacity=".18"/>`),
  scissors: () => S(`<circle cx="14" cy="36" r="6" fill="none" stroke="${R}" stroke-width="3.5"/><circle cx="34" cy="36" r="6" fill="none" stroke="${R}" stroke-width="3.5"/>
    <path d="M18 31 L32 6" stroke="#c9cfdc" stroke-width="3.5" stroke-linecap="round"/><path d="M30 31 L16 6" stroke="#e3e7ef" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="20" r="1.8" fill="#555"/>`),
  iron: () => S(`<rect x="6" y="30" width="14" height="6" rx="3" fill="${W}"/><path d="M20 33 L36 33" stroke="#9aa0ad" stroke-width="3"/>
    <path d="M34 26 Q44 33 34 40 Z" fill="#6c7180"/><path d="M36 22 q2 -4 0 -8 M40 22 q2 -4 0 -8" stroke="${R}" stroke-width="1.6" fill="none" opacity=".8"/>`),
  spool: () => S(`<rect x="12" y="8" width="24" height="6" rx="2" fill="${W}"/><rect x="12" y="34" width="24" height="6" rx="2" fill="${W}"/>
    <rect x="16" y="14" width="16" height="20" fill="${L}"/>${[17, 21, 25, 29].map((y) => `<path d="M16 ${y} Q24 ${y + 3} 32 ${y}" stroke="var(--linen-2)" fill="none"/>`).join('')}
    <path d="M32 24 Q40 26 40 36" stroke="${L}" stroke-width="1.5" fill="none"/>`),
  ruler: () => S(`<rect x="6" y="18" width="36" height="12" rx="2" fill="${W}" transform="rotate(-20 24 24)"/>
    <g transform="rotate(-20 24 24)">${[10, 14, 18, 22, 26, 30, 34, 38].map((x, i) => `<line x1="${x}" y1="18" x2="${x}" y2="${i % 2 ? 22 : 24}" stroke="${W2}" stroke-width="1.4"/>`).join('')}</g>`),
  obang: () => S(`<path d="M12 22 Q10 42 24 42 Q38 42 36 22 Z" fill="var(--c-white)"/>
    <path d="M12 22 Q11 32 14 38 L20 22Z" fill="var(--c-blue)"/><path d="M20 22 L17 40 Q20 42 24 42 L26 22Z" fill="${R}"/><path d="M26 22 L26 42 Q30 42 32 40 L31 22Z" fill="var(--c-yellow)"/><path d="M31 22 L33 39 Q37 34 36 22Z" fill="#3a3a48"/>
    <path d="M14 22 Q24 14 34 22" fill="var(--c-blue)"/><path d="M18 16 Q24 22 30 16" stroke="${R}" stroke-width="2.5" fill="none"/>`),
  pincushion: () => S(`<ellipse cx="24" cy="34" rx="16" ry="6" fill="${W}"/><path d="M8 32 Q8 18 24 18 Q40 18 40 32 Z" fill="${R}"/>
    ${[[16, 14], [22, 10], [29, 12], [34, 17]].map(([x, y]) => `<line x1="${x}" y1="${y}" x2="${x + 2}" y2="${y + 12}" stroke="#c9cfdc" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="2.4" fill="${G}"/>`).join('')}`),
  lamp: () => S(`<path d="M24 6 Q30 14 24 20 Q18 14 24 6Z" fill="${G}"/><path d="M24 11 Q26 15 24 18 Q22 15 24 11Z" fill="#fff3c4"/>
    <path d="M14 22 Q24 30 34 22 L32 28 Q24 33 16 28Z" fill="${W}"/><rect x="22" y="30" width="4" height="8" fill="${W2}"/><rect x="14" y="38" width="20" height="4" rx="2" fill="${W2}"/>`),
  norigae: () => S(`<line x1="24" y1="4" x2="24" y2="12" stroke="${R}" stroke-width="2"/><path d="M16 12 h16 l-8 10z" fill="${R}"/><circle cx="24" cy="25" r="6" fill="var(--c-blue)"/><circle cx="24" cy="25" r="2.5" fill="${G}"/>
    ${[17, 20, 23, 26, 29, 32].map((x) => `<path d="M24 31 Q${x} 36 ${x} 46" stroke="${R}" stroke-width="1.6" fill="none"/>`).join('')}`),
  hoop: () => S(`<circle cx="24" cy="24" r="17" fill="${L}"/><circle cx="24" cy="24" r="17" fill="none" stroke="${W}" stroke-width="4"/>
    <rect x="21" y="3" width="6" height="6" rx="1" fill="${W2}"/><path d="M15 26 l4 -4 l4 4 l4 -4 l4 4" stroke="${R}" stroke-width="2" fill="none"/><path d="M17 31 h14" stroke="var(--c-blue)" stroke-width="2" stroke-dasharray="3 2"/>`),
  hand: () => S(`<path d="M14 44 V24 Q14 21 17 21 Q20 21 20 24 V14 Q20 11 23 11 Q26 11 26 14 V22 V12 Q26 9 29 9 Q32 9 32 12 V24 V16 Q32 13 35 13 Q38 13 38 16 V32 Q38 44 26 44Z" fill="#e8c9a4"/>
    <path d="M10 6 L40 38" stroke="#c9cfdc" stroke-width="1.6"/><path d="M40 38 Q44 44 36 44" stroke="${R}" stroke-width="1.6" fill="none"/>`),
  coins: () => S(`${[[16, 30], [30, 30], [23, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${G}"/><circle cx="${x}" cy="${y}" r="10" fill="none" stroke="var(--gold-2)" stroke-width="1.5"/><rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="var(--indigo)"/>`).join('')}`),
  silk: () => S(`<path d="M8 14 Q24 6 40 14 L40 34 Q24 42 8 34Z" fill="#b77bd0"/><path d="M8 14 Q24 22 40 14" fill="none" stroke="#e2b9f0" stroke-width="2"/>
    <path d="M8 24 Q24 32 40 24" fill="none" stroke="#9a5fb4" stroke-width="1.5"/><circle cx="20" cy="28" r="2.5" fill="${G}"/><circle cx="30" cy="22" r="2" fill="${G}"/>`),
  needle: () => S(`<path d="M10 40 L38 8" stroke="#dfe3ec" stroke-width="3" stroke-linecap="round"/><ellipse cx="36" cy="10" rx="1.2" ry="3" transform="rotate(42 36 10)" fill="var(--indigo)"/>
    <path d="M36 10 Q44 20 34 26 Q24 32 30 42" stroke="${R}" stroke-width="2" fill="none"/>`),
};

export function toolArt(def) {
  const fn = art[def.art] || art.needle;
  return fn(def.color);
}

export const glyph = {
  coin: S(`<circle cx="24" cy="24" r="18" fill="var(--gold)"/><circle cx="24" cy="24" r="18" fill="none" stroke="var(--gold-2)" stroke-width="3"/><rect x="18" y="18" width="12" height="12" fill="var(--indigo)"/>`),
  patch: S(`<rect x="8" y="8" width="32" height="32" rx="5" fill="var(--c-blue)"/><rect x="13" y="13" width="22" height="22" rx="3" fill="none" stroke="var(--thread)" stroke-width="2" stroke-dasharray="4 3"/>`),
  pause: S(`<rect x="12" y="10" width="8" height="28" rx="2" fill="currentColor"/><rect x="28" y="10" width="8" height="28" rx="2" fill="currentColor"/>`),
  reroll: S(`<path d="M36 18 A14 14 0 1 0 38 28" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M30 14 L38 16 L36 24" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
};
