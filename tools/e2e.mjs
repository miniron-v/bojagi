// Headless play-through: drives real pointer drags, captures screenshots and console errors.
// Usage: node tools/e2e.mjs [width height] [moves]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const W = +process.argv[2] || 390;
const H = +process.argv[3] || 844;
const MOVES = +process.argv[4] || 60;
const out = new URL('../shots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${out}01-title-${W}x${H}.png` });

await page.click('#btn-new');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}02-gift-${W}x${H}.png` });
await page.click('[data-gift="0"]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}03-intro-${W}x${H}.png` });
await page.click('#go');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}04-play-${W}x${H}.png` });

async function bestMove() {
  return page.evaluate(() => {
    const { run, view, R } = window.__bojagi;
    if (!run || run.phase !== 'play') return null;
    let best = null;
    run.tray.forEach((p, i) => {
      if (!p) return;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const pv = R.preview(run, i, r, c);
        if (pv && (!best || pv.score + Math.random() > best.score)) best = { i, r, c, score: pv.score, shape: p.shape };
      }
    });
    if (!best) return { stuck: true };
    const rect = view.cv.getBoundingClientRect();
    const slot = view.slots[best.i];
    return { ...best, from: { x: rect.left + slot.cx, y: rect.top + slot.cy }, rect: { l: rect.left, t: rect.top }, bx: view.bx, by: view.by, cell: view.cell };
  });
}

let shot = 5;
let moves = 0;
let midShot = false;
for (let k = 0; k < MOVES * 3 && moves < MOVES; k++) {
  const phase = await page.evaluate(() => window.__bojagi.run && window.__bojagi.run.phase);
  const busy = await page.evaluate(() => !window.__bojagi.view.enabled);
  if (phase === 'reward') {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-reward.png` });
    await page.click('#collect');
    await page.waitForTimeout(500);
    continue;
  }
  if (phase === 'shop') {
    await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-shop.png` });
    const buy = await page.$('[data-buy]:not([disabled])');
    if (buy) { await buy.click(); await page.waitForTimeout(300); }
    await page.click('#leave');
    await page.waitForTimeout(500);
    continue;
  }
  if (phase === 'intro') { await page.click('#go'); await page.waitForTimeout(500); continue; }
  if (phase === 'over' || phase === 'victory') {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-end.png` });
    break;
  }
  if (phase !== 'play' || busy) { await page.waitForTimeout(150); continue; }
  const m = await bestMove();
  if (!m) { await page.waitForTimeout(150); continue; }
  if (m.stuck) { await page.click('#btn-discard'); await page.waitForTimeout(400); continue; }
  // piece dimensions from the shape table exposed through preview cells
  const wh = await page.evaluate((id) => {
    const cells = window.__bojagi.shapes[id].cells;
    return { w: Math.max(...cells.map((p) => p[1])) + 1, h: Math.max(...cells.map((p) => p[0])) + 1 };
  }, m.shape);
  const lift = m.cell * 0.2;
  const tx = m.rect.l + m.bx + (m.c + wh.w / 2) * m.cell;
  const ty = m.rect.t + m.by + (m.r + wh.h / 2) * m.cell + lift;
  await page.mouse.move(m.from.x, m.from.y);
  await page.mouse.down();
  const steps = 6;
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(m.from.x + ((tx - m.from.x) * s) / steps, m.from.y + ((ty - m.from.y) * s) / steps);
    await page.waitForTimeout(16);
  }
  if (!midShot && m.score > 30) {
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-preview.png` });
  }
  await page.mouse.up();
  moves++;
  if (!midShot && m.score > 30) {
    midShot = true;
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-tally.png` });
  }
  await page.waitForTimeout(60);
}
await page.screenshot({ path: `${out}${String(shot++).padStart(2, '0')}-last.png` });
const state = await page.evaluate(() => { const r = window.__bojagi.run; return r && { phase: r.phase, day: r.day, order: r.orderIdx, score: r.order && r.order.score, coins: r.coins, tools: r.tools.map((t) => t.id) }; });
console.log(JSON.stringify({ moves, state, errors }, null, 1));
await browser.close();
