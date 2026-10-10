// UI audit: opens every screen and sheet at several phone sizes, with stress data (huge numbers,
// full tool rows, long histories), and checks the layout rules the game relies on:
//   1. nothing scrolls the page sideways
//   2. no element sticks out of the box that should hold it (the app column, its sheet, or any
//      ancestor that clips), unless it lives inside a scroller
//   3. no text is cut off or ellipsized inside a box that hides overflow
//   4. siblings laid out by a flex/grid container do not overlap
// Any violation fails the run (exit code 1), so `npm run audit:ui` can gate a deploy.
// Usage: node tools/ui-audit.mjs [--shots]   (screenshots go to shots/audit/)
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { routeFonts } from './fonts-route.mjs';

const SHOTS = process.argv.includes('--shots');
const VIEWPORTS = [[320, 568], [360, 640], [375, 667], [390, 844], [412, 915], [480, 800], [768, 1024]];
const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const out = new URL('../shots/audit/', import.meta.url).pathname;
if (SHOTS) await mkdir(out, { recursive: true });
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;

const BIG_META = {
  runs: 214, wins: 37, bestDay: 9, bestHand: 9876543, bestStreak: 42, clears: 98765, points: 123456789,
  bestPoints: 98765432, bestLevel: 14, monos: 999, crosses: 999, triples: 999, perfects: 99, tutorial: true,
  tallyTaught: true, toolTip: true, seen: { streak: 1, monoTray: 1, ink: 1, knots: 1, patchLimit: 1 }, challengesV: 2,
  discovered: ['thimble', 'needlecase', 'tape', 'pouch', 'iron', 'silk', 'scissors', 'norigae', 'grandma', 'lantern'],
  challenges: { points300k: { best: 300000, done: true, claimed: true }, lines500: { best: 500, done: true, claimed: false } },
  daily: { '2026-10-9': { k: 1, label: '완성 · 12,345,678점' }, '2026-10-10': { k: 1, label: '주문 11개 · 98,765,432점' } },
  dailyStreak: { last: '2026-10-10', count: 123 },
  quilts: Array.from({ length: 8 }, (_, n) => ({ at: n + 1, win: n % 2 === 0, day: 4 + n, points: 98765432 - n,
    h: Array.from({ length: 24 }, (_, i) => ({ color: ['blue', 'red', 'yellow', 'white', 'black'][(i + n) % 5], seam: ['single', 'double', 'cross', 'triple', 'perfect'][i % 5], ok: i !== 5, boss: i % 3 === 2 })) })),
};

// Run mutations applied in the page (R = core run module). Each scenario opens one screen.
const FULL_TOOLS = "run.tools = ['thimble','iron','silk','scissors','lantern'].map(id => ({ id, data: id==='iron'?{mult:777}:id==='silk'?{chips:9999}:{} }));";
const BIG_RUN = `${FULL_TOOLS} run.coins = 9999; run.day = 4; run.stats.points = 98765432; run.stats.bestHand = 9876543; run.stats.orders = 11; run.stats.bestStreak = 42;
  run.history = Array.from({ length: 11 }, (_, i) => ({ kind: i % 3, ok: true, color: ['blue','red','yellow','white','black'][i % 5], seam: ['single','double','cross','triple','perfect'][i % 5], score: 123456, target: 120000, boss: i % 3 === 2 ? 'knots' : null }));
  run.seams = { perfect: 12, triple: 14, cross: 11, double: 13, single: 1 };`;
const SCENARIOS = {
  title: { open: "ui.titleScreen()" },
  codex: { open: "ui.showCodex()" },
  records: { open: "ui.showRecords()" },
  skins: { open: "ui.showSkins()" },
  preview: { open: "ui.showSkins(); document.querySelector('.skin-row[data-skin=\"hanji\"] .sr-pic').click()" },
  how: { open: "ui.showHow()" },
  play: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run); run.order.score = 87654321; run.order.target = 99999999;`, open: '' },
  bossIntro: { run: `${BIG_RUN} run.orderIdx = 2; run.bosses[3] = 'knots'; R.prepareOrder(run);`, open: '' },
  seams: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);`, open: 'ui.showSeams()' },
  pause: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);`, open: 'ui.showPause()' },
  reward: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run); run.phase = 'reward'; run.reward = { lines: [{ label: '큰 주문 완료', coins: 4 }, { label: '남은 조각 17개', coins: 5 }, { label: '이자 (5냥마다 1냥)', coins: 4 }, { label: '복주머니', coins: 2 }], total: 15 };`, open: '' },
  gift: { run: "run.phase = 'gift';", open: '' },
  shop: { run: `${BIG_RUN} R.prepareOrder(run); run.phase = 'reward'; run.reward = { lines: [], total: 0 }; run.gift = null; R.collectReward(run);`, open: '' },
  over: {
    run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run); run.order.score = 1234; run.locked = ['artisan','hoop','norigae','grandma','ruler'];`,
    open: "ui.recordRun(false); window.__bojagi.run.phase = 'over'; ui.showEnd(false, { short: 98765432 })",
    meta: { bestDay: 1, bestHand: 0, bestPoints: 0, challenges: { points300k: { best: 0, done: false, claimed: false } }, points: 299000 },
  },
  victory: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);`, open: "ui.recordRun(true); ui.showEnd(true)" },
  // aiming forecast: a one-cell patch that completes three one-colour rows at once
  aim: {
    run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);
      for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) run.board[r * 8 + c] = c === 4 && r === 6 ? null : 'red';
      for (let r = 0; r < 8; r++) if (r !== 6) run.board[r * 8 + 4] = 'red';
      run.tray = [{ shape: 'dot_0', color: 'red' }, null, null];`,
    open: "window.__bojagi.view.handlers.hover({ i: 0, r: 6, c: 4 })",
  },
  tooltip: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);`, open: "document.querySelector('#hud-tools .tool').click()" },
  confirm: { run: `${BIG_RUN} R.prepareOrder(run); R.beginOrder(run);`, open: "ui.titleScreen(); document.querySelector('#btn-new').click()" },
};

// every screen function in the UI must have a scenario here, so a new sheet cannot ship unaudited
const COVERS = {
  showCodex: 'codex', showEnd: 'over', showGift: 'gift', showHow: 'how', showIntro: 'bossIntro', showPause: 'pause',
  showPreview: 'aim', showRecords: 'records', showReward: 'reward', showScreen: 'title', showSeams: 'seams',
  showShop: 'shop', showSkins: 'skins', showToolTip: 'tooltip', previewSkins: 'preview', confirmReplace: 'confirm',
};
{
  const src = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  const screens = [...src.matchAll(/^function (show\w+|previewSkins|confirmReplace)\(/gm)].map((m) => m[1]);
  const missing = screens.filter((f) => !COVERS[f] || !SCENARIOS[COVERS[f]]);
  if (missing.length) { console.log(`UI audit: no scenario for ${missing.join(', ')} — add one to SCENARIOS and COVERS`); process.exit(1); }
}

const browser = await chromium.launch({ executablePath: existsSync(LOCAL_CHROME) ? LOCAL_CHROME : undefined, args: ['--no-sandbox'] });
const problems = [];

/** Runs in the page: returns layout violations as strings. */
function inspect() {
  const app = document.getElementById('app');
  // corner badges and stamps hang off their box on purpose (they are still checked against the
  // screen edge by the page-scroll rule)
  const BLEED = '.badge, .sell, .seal-stamp, .stamp, .sheet-close, .pop, [data-bleed]';
  const bad = [];
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n !== app && parts.length < 4; n = n.parentElement) {
      parts.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.classList.length ? '.' + [...n.classList].slice(0, 2).join('.') : ''));
    }
    return parts.join(' > ');
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const se = document.scrollingElement;
  if (se.scrollWidth > innerWidth + 1) bad.push(`page scrolls sideways (${se.scrollWidth} > ${innerWidth})`);
  const all = [...app.querySelectorAll('*')].filter((el) => !el.closest('svg') || el.tagName === 'svg');
  for (const el of all) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    // the box that should hold it: the nearest ancestor that clips, scrolls or paints a visible
    // box (a panel, a card, a chip); else the app column
    let holder = el.parentElement;
    let scroller = false;
    while (holder && holder !== app) {
      const h = getComputedStyle(holder);
      if (/(auto|scroll)/.test(h.overflowX + h.overflowY)) { scroller = true; break; }
      if (h.overflowX === 'hidden' || h.overflowX === 'clip') break;
      const painted = (h.backgroundColor !== 'rgba(0, 0, 0, 0)' && h.backgroundColor !== 'transparent')
        || h.backgroundImage !== 'none' || (h.outlineStyle !== 'none' && parseFloat(h.outlineWidth) > 0)
        || (h.borderStyle !== 'none' && parseFloat(h.borderWidth) > 0);
      if (painted) break;
      holder = holder.parentElement;
    }
    const hr = (holder || app).getBoundingClientRect();
    const tol = 1.5;
    if (!scroller && (r.right > hr.right + tol || r.left < hr.left - tol)) {
      if (!el.closest(BLEED)) bad.push(`sticks out sideways: ${path(el)} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(hr.left)}..${Math.round(hr.right)})`);
    }
    if (scroller && (r.right > hr.right + tol || r.left < hr.left - tol) && getComputedStyle(holder).overflowX !== 'auto') {
      if (!el.closest(BLEED)) bad.push(`wider than its scroller: ${path(el)}`);
    }
    // clipped text inside a box that hides overflow
    const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    // (an ellipsis counts too: with the stress data every label should still fit)
    if (clips && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim() && el.tagName !== 'CANVAS') {
      bad.push(`${cs.textOverflow === 'ellipsis' ? 'text truncated' : 'text cut off'}: ${path(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    }
    // overlapping siblings in flex/grid flow
    if (/(flex|grid)/.test(cs.display)) {
      const kids = [...el.children].filter((k) => visible(k) && !/(absolute|fixed)/.test(getComputedStyle(k).position));
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2) bad.push(`overlap: ${path(kids[i])} × ${path(kids[j])} (${Math.round(w)}×${Math.round(h)})`);
      }
    }
  }
  return [...new Set(bad)];
}

for (const [w, h] of VIEWPORTS) {
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await routeFonts(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const meta = { ...BIG_META, ...(sc.meta || {}) };
    await ctx.addInitScript((m) => {
      if (sessionStorage.getItem('audit')) return;
      sessionStorage.setItem('audit', '1');
      localStorage.clear();
      localStorage.setItem('bojagi.meta.v1', JSON.stringify(m));
      localStorage.setItem('bojagi.settings.v1', JSON.stringify({ sound: false, haptics: false, fast: true }));
    }, meta);
    await page.goto(url);
    await page.waitForTimeout(250);
    if (sc.run !== undefined) {
      await page.evaluate((src) => {
        const { R, ui } = window.__bojagi;
        const run = R.newRun({ seed: 7 });
        new Function('run', 'R', src)(run, R);
        localStorage.setItem('bojagi.run.v1', JSON.stringify(run));
        ui.continueRun();
      }, sc.run);
      await page.waitForTimeout(500);
    }
    if (sc.open) {
      await page.evaluate((src) => { const { ui } = window.__bojagi; new Function('ui', src)(ui); }, sc.open);
      await page.waitForTimeout(700);
    }
    const found = await page.evaluate(inspect);
    for (const e of errors) found.push(`page error: ${e}`);
    for (const f of found) problems.push(`[${w}×${h}] ${name}: ${f}`);
    if (SHOTS) await page.screenshot({ path: `${out}${name}-${w}x${h}.png` });
    await ctx.close();
  }
}
await browser.close();

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\nUI audit: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`UI audit: ${VIEWPORTS.length} sizes × ${Object.keys(SCENARIOS).length} screens, no problems`);
