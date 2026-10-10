// Screenshots of specific states (boss intro/HUD, pause, end sheets) by injecting saves.
// Usage: node tools/states.mjs [width height]
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { routeFonts } from './fonts-route.mjs';

const W = +process.argv[2] || 360;
const H = +process.argv[3] || 640;
const out = new URL('../shots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errors = [];
await routeFonts(page);
page.on('pageerror', (e) => errors.push(e.message));
const url = 'file://' + new URL('../dist/index.html', import.meta.url).pathname;
await page.goto(url);
await page.waitForTimeout(400);

async function inject(mutate) {
  await page.evaluate((src) => {
    const { R } = window.__bojagi;
    const run = R.newRun({ seed: 99 });
    // eslint-disable-next-line no-new-func
    new Function('run', 'R', src)(run, R);
    localStorage.setItem('bojagi.run.v1', JSON.stringify(run));
  }, mutate);
  await page.reload();
  await page.waitForTimeout(200);
  // the previous page may have saved its own run while unloading; write again from the title screen
  await page.evaluate((src) => {
    const { R } = window.__bojagi;
    const run = R.newRun({ seed: 99 });
    new Function('run', 'R', src)(run, R);
    localStorage.setItem('bojagi.run.v1', JSON.stringify(run));
  }, mutate);
  await page.reload();
  await page.waitForTimeout(300);
  await page.click('#btn-continue');
  await page.waitForTimeout(700);
}
const shot = (name) => page.screenshot({ path: `${out}s-${name}-${W}x${H}.png` });

// boss intro with a full tool row
await inject(`run.tools = ['thimble','iron','silk','scissors','lantern'].map(id => ({ id, data: id==='iron'?{mult:7}:id==='silk'?{chips:42}:{} }));
  run.orderIdx = 2; run.bosses[0] = 'knots'; R.prepareOrder(run);`);
await shot('boss-intro');
await page.click('#go');
await page.waitForTimeout(600);
await shot('boss-hud');
await page.click('#btn-seams');
await page.waitForTimeout(400);
await shot('seams');
await page.click('.sheet-close');
await page.waitForTimeout(300);
await page.click('#hud-tools .tool');
await page.waitForTimeout(200);
await shot('tooltip');
await page.mouse.click(5, H - 5);
await page.click('#btn-pause');
await page.waitForTimeout(300);
await shot('pause');
// game over with history
await inject(`run.history = [{kind:0,ok:true,color:'blue'},{kind:1,ok:true,color:'red'},{kind:2,ok:true,color:'yellow'},{kind:0,ok:true,color:'black'}];
  run.day = 2; run.orderIdx = 1; R.prepareOrder(run); R.beginOrder(run); run.order.patchesLeft = 1; run.stats.bestHand = 1234; run.stats.orders = 4;`);
// place anything to run out
const ok = await page.evaluate(() => {
  const { run, R } = window.__bojagi;
  for (let i = 0; i < 3; i++) for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (R.preview(run, i, r, c)) return { i, r, c };
  return null;
});
if (ok) {
  const geo = await page.evaluate(({ i, r, c }) => {
    const v = window.__bojagi.view; const rect = v.cv.getBoundingClientRect();
    const sh = window.__bojagi.shapes[window.__bojagi.run.tray[i].shape];
    return { fx: rect.left + v.slots[i].cx, fy: rect.top + v.slots[i].cy, tx: rect.left + v.bx + (c + sh.w / 2) * v.cell, ty: rect.top + v.by + (r + sh.h / 2) * v.cell + v.cell * 0.2 };
  }, ok);
  await page.mouse.move(geo.fx, geo.fy); await page.mouse.down();
  for (let k = 1; k <= 5; k++) { await page.mouse.move(geo.fx + (geo.tx - geo.fx) * k / 5, geo.fy + (geo.ty - geo.fy) * k / 5); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(2200);
  await shot('over');
}
// shop with patterns
await inject(`run.tools = ['thimble','manual'].map(id => ({ id, data: id==='manual'?{mult:2}:{} }));
  run.seams.double = 3; run.coins = 14; run.phase = 'reward'; run.reward = { lines: [], total: 0 }; run.gift = null;
  R.collectReward(run);`);
await page.waitForTimeout(400);
await shot('shop');
await page.evaluate(() => localStorage.setItem('bojagi.meta.v1', JSON.stringify({ runs: 3, discovered: ['thimble', 'iron', 'sleeve'], spotted: ['thimble', 'iron', 'sleeve', 'pouch', 'lamp', 'scissors', 'thread_red'], bestDay: 2, monos: 3 })));
await page.goto(url);
await page.waitForTimeout(400);
await page.click('#btn-codex');
await page.waitForTimeout(400);
await shot('codex');
await page.click('.sheet-close');
await page.waitForTimeout(300);
await shot('after-close');
console.log(JSON.stringify({ errors }));
await browser.close();

