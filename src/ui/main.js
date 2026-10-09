// Controller: wires core run state ↔ view ↔ DOM HUD/sheets, persistence and sound.
import * as R from '../core/run.js';
import { TOOLS, TOOL_IDS, MAX_TOOLS, RARITY_NAME, toolDesc, sellPrice } from '../core/tools.js';
import { SHAPE_BY_ID } from '../core/shapes.js';
import { View, trayFits } from './view.js';
import { toolArt, glyph } from './icons.js';
import { clothTexture, paintPatch } from './art.js';
import { sfx, unlock, setEnabled } from './audio.js';
import * as store from './store.js';

const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const el = {
  title: $('#title'), game: $('#game'), modal: $('#modal'), sheet: $('#sheet'), toast: $('#toast'),
  day: $('#hud-day'), dayMax: $('#hud-daymax'), kind: $('#hud-kind'), score: $('#hud-score'), target: $('#hud-target'),
  fill: $('#hud-fill'), ghost: $('#hud-ghost'), bar: $('#hud-bar'), patches: $('#hud-patches'), discards: $('#hud-discards'),
  coins: $('#hud-coins'), boss: $('#hud-boss'), tools: $('#hud-tools'), tally: $('#tally'), hint: $('#hint'),
  discardBtn: $('#btn-discard'), pause: $('#btn-pause'), statPatches: $('#stat-patches'),
};

let run = null;
let meta = store.loadMeta();
let settings = store.loadSettings();
let busy = false;
let shownScore = 0;
let hudScore = 0; // score the HUD is allowed to show (lags the core until the slam)
let hintStage = 0;
let lastPlaced = null;
const speed = () => (settings.fast ? 0.55 : 1);

setEnabled(settings.sound);
app.style.setProperty('--cloth', `url(${clothTexture()})`);
$('#btn-pause').innerHTML = glyph.pause;
$('#ic-coin').innerHTML = glyph.coin;
$('#ic-patch').innerHTML = glyph.patch;

const view = new View({ stage: $('#stage'), canvas: $('#cv'), fxCanvas: $('#fx'), app });
view.speed = speed();

function haptic(p) {
  if (!settings.haptics) return;
  try { navigator.vibrate && navigator.vibrate(p); } catch { /* blocked */ }
}

// ---------- persistence ----------
function persist() {
  if (!run) return;
  if (run.phase === 'over' || run.phase === 'victory') store.clearRun();
  else store.saveRun(run);
}

function discover(id) {
  if (!meta.discovered.includes(id)) {
    meta.discovered.push(id);
    store.saveMeta(meta);
  }
}

// ---------- formatting ----------
const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
const fmtMult = (m) => (Math.round(m * 10) / 10).toLocaleString('ko-KR');
const kindName = (o) => R.ORDER_KINDS[o].name;
const dayLabel = () => (run.day > R.DAYS ? `밤샘 ${run.day - R.DAYS}일째` : `장날 ${run.day}`);

// ---------- HUD ----------
function renderTools(container, tools, { onTap, empties = true } = {}) {
  container.innerHTML = '';
  const n = empties ? MAX_TOOLS : tools.length;
  for (let i = 0; i < n; i++) {
    const t = tools[i];
    const b = document.createElement('button');
    b.className = 'tool';
    if (!t) {
      b.classList.add('empty');
      b.setAttribute('aria-label', '빈 도구 칸');
      b.tabIndex = -1;
    } else {
      const def = TOOLS[t.id];
      b.classList.add(`r${def.rarity}`);
      b.innerHTML = toolArt(def);
      b.setAttribute('aria-label', `${def.name}: ${toolDesc(t)}`);
      if (t.id === 'iron' || t.id === 'silk') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = t.id === 'iron' ? `+${t.data.mult}` : `+${t.data.chips}`;
        b.appendChild(badge);
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); onTap && onTap(i, b); });
    }
    container.appendChild(b);
  }
}

function renderHud() {
  if (!run || !run.order) return;
  const o = run.order;
  el.day.textContent = run.day > R.DAYS ? `밤샘 ${run.day - R.DAYS}` : run.day;
  el.dayMax.hidden = run.day > R.DAYS;
  el.kind.textContent = kindName(o.kind) + (run.mode === 'daily' ? ' · 오늘의 의뢰' : '');
  el.kind.classList.toggle('boss', o.kind === 2);
  el.target.textContent = fmt(o.target);
  el.patches.textContent = o.patchesLeft;
  el.statPatches.classList.toggle('low', o.patchesLeft <= 3);
  el.discards.textContent = o.discardsLeft;
  el.coins.textContent = run.coins;
  el.discardBtn.querySelector('b').textContent = o.discardsLeft;
  el.discardBtn.disabled = o.discardsLeft <= 0 || run.phase !== 'play';
  el.discardBtn.classList.toggle('urge', !!o.stuck && o.discardsLeft > 0);
  if (o.boss) {
    const b = R.BOSSES[o.boss];
    el.boss.hidden = false;
    el.boss.innerHTML = `<span class="seal">${b.name[0]}</span><span>${b.desc}</span>`;
  } else el.boss.hidden = true;
  renderTools(el.tools, run.tools, { onTap: (i, b) => showToolTip(run.tools[i], b) });
  if (!busy) setBar(o.score);
}

function setBar(score) {
  const o = run.order;
  hudScore = score;
  const pct = Math.min(100, (score / o.target) * 100);
  el.fill.style.width = pct + '%';
  el.bar.classList.toggle('done', score >= o.target);
}

function animateScore() {
  if (run && run.order) {
    const targetScore = hudScore;
    if (shownScore !== targetScore) {
      const diff = targetScore - shownScore;
      shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.16));
      if ((diff > 0 && shownScore > targetScore) || (diff < 0 && shownScore < targetScore)) shownScore = targetScore;
      el.score.textContent = fmt(shownScore);
    }
  }
  requestAnimationFrame(animateScore);
}
requestAnimationFrame(animateScore);

function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function fireTool(slot, label, kind) {
  const node = el.tools.children[slot];
  if (!node) return;
  node.classList.remove('fire');
  void node.offsetWidth;
  node.classList.add('fire');
  if (label) {
    const pop = document.createElement('span');
    pop.className = `pop ${kind}`;
    pop.textContent = label;
    node.appendChild(pop);
    setTimeout(() => pop.remove(), 820);
  }
}

let tipEl = null;
function closeTip() { if (tipEl) { tipEl.remove(); tipEl = null; } }
document.addEventListener('pointerdown', (e) => { if (tipEl && !tipEl.contains(e.target)) closeTip(); }, true);

function showToolTip(inst, anchor, extra) {
  closeTip();
  const def = TOOLS[inst.id];
  tipEl = document.createElement('div');
  tipEl.className = 'pop-tip';
  tipEl.innerHTML = `<b>${def.name}</b> <small style="color:var(--muted)">${RARITY_NAME[def.rarity]}</small><p>${toolDesc(inst)}</p>`;
  if (extra) tipEl.appendChild(extra);
  app.appendChild(tipEl);
  const ar = app.getBoundingClientRect();
  const br = anchor.getBoundingClientRect();
  tipEl.style.top = `${br.bottom - ar.top + 8}px`;
}

let hintTimer = 0;
function hint(text, ms = 0) {
  clearTimeout(hintTimer);
  if (!text) { el.hint.classList.remove('show'); return; }
  el.hint.textContent = text;
  el.hint.classList.add('show');
  if (ms) hintTimer = setTimeout(() => el.hint.classList.remove('show'), ms);
}

function toast(text, ms = 1400) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.toast.classList.remove('show'), ms);
}

// ---------- modal ----------
function openModal(html, { center = false } = {}) {
  closeTip();
  el.modal.classList.toggle('center', center);
  el.sheet.innerHTML = html;
  el.modal.hidden = false;
  view.enabled = false;
  const first = el.sheet.querySelector('[data-autofocus]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
  return el.sheet;
}
function closeModal() {
  el.modal.hidden = true;
  el.sheet.innerHTML = '';
  view.enabled = run && run.phase === 'play' && !busy;
}
const on = (root, sel, fn) => root.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => { unlock(); sfx.ui(); fn(e, n); }));

// ---------- screens ----------
function showScreen(name) {
  el.title.hidden = name !== 'title';
  el.game.hidden = name !== 'game';
  if (name === 'game') requestAnimationFrame(() => view.resize());
}

function titleScreen() {
  run = null;
  view.enabled = false;
  closeModal();
  showScreen('title');
  const save = store.loadRun();
  const valid = R.isValidSave(save) && !['over', 'victory'].includes(save.phase);
  const cont = $('#btn-continue');
  cont.hidden = !valid;
  if (valid) {
    const d = save.day > R.DAYS ? `밤샘 ${save.day - R.DAYS}일째` : `장날 ${save.day}`;
    cont.querySelector('.sub').textContent = `${d} · ${R.ORDER_KINDS[save.orderIdx].name}${save.mode === 'daily' ? ' · 오늘의 의뢰' : ''}`;
  }
  const { key } = R.dailySeed();
  const today = meta.daily[key];
  const dailyBtn = $('#btn-daily');
  dailyBtn.querySelector('.sub').textContent = today ? `오늘 최고: ${today.label}` : '모두가 같은 판을 짓는 하루';
  $('#codex-count').textContent = `${meta.discovered.length}/${TOOL_IDS.length}`;
  $('#best-line').textContent = meta.runs
    ? `최고 기록 ${meta.bestDay > R.DAYS ? `밤샘 ${meta.bestDay - R.DAYS}일` : `장날 ${meta.bestDay || 1}`} · 최고 한 땀 ${fmt(meta.bestHand)}`
    : '조각을 이어 손님의 보자기를 지어 주세요';
  $('#btn-sound').textContent = settings.sound ? '소리 켬' : '소리 끔';
  titleArt.start();
}

function startRun(mode) {
  let opts = {};
  if (mode === 'daily') {
    const { key, seed } = R.dailySeed();
    opts = { seed, mode: 'daily', dailyKey: key };
  }
  run = R.newRun(opts);
  meta.runs += 1;
  store.saveMeta(meta);
  enterGame();
  showGift();
}

function continueRun() {
  const save = store.loadRun();
  if (!R.isValidSave(save)) { titleScreen(); return; }
  run = save;
  enterGame();
  resumePhase();
}

function enterGame() {
  titleArt.stop();
  showScreen('game');
  shownScore = hudScore = run.order ? run.order.score : 0;
  el.score.textContent = fmt(shownScore);
  view.setBoard(run.board);
  view.setTray(run.tray, trayFits(run.board, run.tray), false);
  view.boss = run.order && run.order.boss;
  renderHud();
}

function resumePhase() {
  switch (run.phase) {
    case 'gift': return showGift();
    case 'intro': return showIntro();
    case 'play': closeModal(); view.enabled = true; renderHud(); if (run.order.stuck) stuckHint(); return;
    case 'reward': return showReward();
    case 'shop': return showShop();
    default: return titleScreen();
  }
}

function toolCard(id, { action = '', price = null, sold = false, locked = false, inst = null } = {}) {
  const def = TOOLS[id];
  const desc = locked ? '아직 만나지 못한 도구' : inst ? toolDesc(inst) : def.desc({ data: def.init ? def.init() : {} });
  return `<div class="card r${def.rarity}${sold ? ' sold' : ''}${locked ? ' locked' : ''}">
    <div class="art">${toolArt(def)}</div>
    <div class="min"><div class="name">${locked ? '???' : def.name}<span class="rar">${RARITY_NAME[def.rarity]}</span></div><div class="desc">${desc}</div></div>
    ${action}</div>`;
}

function showGift() {
  hint(null);
  view.setBoard(run.board);
  const html = `<div class="eyebrow">첫 손님</div><h2>선물을 하나 고르세요</h2>
    <p class="lead">바느질 도구는 점수를 키우는 비결이에요.<br>도구는 최대 ${MAX_TOOLS}개까지 들 수 있어요.</p>
    <div class="cards">${run.gift.map((id, i) => toolCard(id, { action: `<button class="btn btn-gold btn-small" data-gift="${i}" ${i === 0 ? 'data-autofocus' : ''}>고르기</button>` })).join('')}</div>`;
  const s = openModal(html);
  on(s, '[data-gift]', (e, n) => {
    const id = run.gift[+n.dataset.gift];
    R.chooseGift(run, +n.dataset.gift);
    discover(id);
    sfx.buy();
    persist();
    renderHud();
    fireTool(run.tools.length - 1, '획득!', 'xmult');
    showIntro();
  });
}

function dayTrack() {
  if (run.day > R.DAYS) return '';
  let html = '<div class="day-track" aria-hidden="true">';
  for (let d = 1; d <= R.DAYS; d++) for (let o = 0; o < 3; o++) {
    const done = d < run.day || (d === run.day && o < run.orderIdx);
    const now = d === run.day && o === run.orderIdx;
    html += `<i class="${done ? 'done' : now ? 'now' : ''}${o === 2 ? ' boss' : ''}"></i>`;
  }
  return html + '</div>';
}

function showIntro() {
  hint(null);
  const o = run.order;
  view.setBoard(run.board);
  view.setTray([null, null, null], [true, true, true], false);
  shownScore = hudScore = 0;
  el.score.textContent = '0';
  renderHud();
  const boss = o.boss ? R.BOSSES[o.boss] : null;
  const html = `<div class="eyebrow">${dayLabel()}${run.day <= R.DAYS ? ` / ${R.DAYS}` : ''}</div><h2>${kindName(o.kind)}</h2>
    <div class="big-target"><span class="num">${fmt(o.target)}</span><small>점 이상 지어 주세요</small></div>
    <div class="facts"><span class="fact">조각 <b>${o.patchesLeft}</b></span><span class="fact">버리기 <b>${o.discardsLeft}</b></span><span class="fact">보상 <b>${R.ORDER_KINDS[o.kind].reward}</b>닢</span></div>
    ${boss ? `<div class="boss-card"><span class="seal">${boss.name[0]}</span><div><b>${boss.name}</b><span>${boss.desc}</span></div></div>` : ''}
    ${dayTrack()}
    <div class="actions"><button class="btn btn-seal" id="go" data-autofocus>바느질 시작</button></div>`;
  const s = openModal(html, { center: true });
  on(s, '#go', () => {
    closeModal();
    const ev = R.beginOrder(run);
    persist();
    view.setTray(run.tray, trayFits(run.board, run.tray));
    renderHud();
    view.enabled = true;
    if (!meta.tutorial && run.day === 1 && run.orderIdx === 0) { hintStage = 1; hint('조각을 끌어 수틀에 놓으세요'); }
    if (ev.some((e) => e.type === 'stuck')) stuckHint();
  });
}

function stuckHint() {
  hint('놓을 자리가 없어요. 버리기로 조각을 바꾸세요');
  renderHud();
}

// ---------- play ----------
view.handlers.canDrag = () => !busy && run && run.phase === 'play';
view.handlers.pickup = () => { unlock(); sfx.pick(); haptic(6); closeTip(); };
view.handlers.cancel = (i, wasValid) => { if (!wasValid) sfx.invalid(); showPreview(null); };
view.handlers.hover = (h) => showPreview(h);
view.handlers.drop = (i, r, c) => {
  if (busy || !run || run.phase !== 'play') return false;
  const res = R.place(run, i, r, c);
  if (!res.ok) return false;
  showPreview(null);
  persist();
  playEvents(res.events);
  return true;
};

function showPreview(h) {
  if (!h || !run || run.phase !== 'play') {
    el.tally.classList.remove('show', 'preview');
    el.ghost.style.width = '0';
    return;
  }
  const pv = R.preview(run, h.i, h.r, h.c);
  if (!pv) return;
  const o = run.order;
  el.ghost.style.width = Math.min(100, ((o.score + pv.score) / o.target) * 100) + '%';
  if (pv.lines.length) {
    el.tally.classList.add('show', 'preview');
    el.tally.innerHTML = `<span class="chips">${fmt(pv.chips)}</span><span class="x">×</span><span class="mult">${fmtMult(pv.mult)}</span><span class="label">+${fmt(pv.score)}</span>`;
  } else {
    el.tally.classList.remove('show', 'preview');
  }
}

el.discardBtn.addEventListener('click', () => {
  unlock();
  if (busy || !run || run.phase !== 'play') return;
  const ev = R.discard(run);
  if (!ev.length) return;
  sfx.pick();
  haptic(10);
  hint(null);
  persist();
  playEvents(ev);
});

el.pause.addEventListener('click', () => { unlock(); sfx.ui(); showPause(); });

async function playEvents(events) {
  busy = true;
  view.enabled = false;
  try {
    for (const ev of events) {
      switch (ev.type) {
        case 'place':
          lastPlaced = ev;
          view.placePiece(ev);
          sfx.drop(SHAPE_BY_ID[ev.piece.shape].size);
          haptic(8);
          break;
        case 'toolGrow':
          if (ev.late) fireTool(ev.slot, '성장!', 'xmult');
          break;
        case 'score':
          await scoreSequence(ev);
          break;
        case 'tray':
          view.setTray(run.tray, trayFits(run.board, run.tray));
          break;
        case 'discard':
          view.setTray([null, null, null], [true, true, true], false);
          await view.wait(80);
          break;
        case 'stuck':
          view.setTray(run.tray, trayFits(run.board, run.tray), false);
          stuckHint();
          break;
        case 'won':
          await winSequence();
          break;
        case 'fail':
          await failSequence(ev);
          break;
        default:
      }
    }
  } finally {
    busy = false;
    renderHud();
    if (run && run.phase === 'play') {
      view.setTray(run.tray, trayFits(run.board, run.tray), false);
      view.enabled = el.modal.hidden;
    }
  }
}

async function scoreSequence(ev) {
  const { result, lines } = ev;
  const o = run.order;
  if (!lines.length) {
    // small trickle for plain placements
    if (lastPlaced) {
      const cs = lastPlaced.cells;
      const p = view.cellCenterApp(cs.reduce((a, q) => a + q[0], 0) / cs.length, cs.reduce((a, q) => a + q[1], 0) / cs.length);
      view.text(`+${result.score}`, p.x, p.y - view.cell * 0.4, { size: 18, color: '#f4ead3', dur: 600, rise: 26, pop: 1.2 });
    }
    setBar(o.score);
    if (hintStage === 1) { hintStage = 2; hint('가로나 세로 한 줄을 채우면 꿰매져요'); }
    return;
  }
  if (hintStage === 2 || hintStage === 1) { hintStage = 3; hint('목표 점수를 넘기면 주문 완료!', 2600); meta.tutorial = true; store.saveMeta(meta); }
  else if (!el.hint.textContent.startsWith('목표')) hint(null);

  // --- needles & cells
  const sp = speed();
  const plan = await view.clearLines(lines, ev.streak);
  plan.stitchTimes.forEach((t, k) => setTimeout(() => { sfx.stitch(k, ev.streak); haptic(12); }, t));
  view.shake(1 + lines.length * 0.6);

  // --- tally
  const steps = result.steps;
  let chips = 0;
  let mult = 0;
  const tally = el.tally;
  tally.classList.remove('preview');
  tally.classList.add('show');
  tally.innerHTML = '<span class="chips">0</span><span class="x">×</span><span class="mult">0</span><span class="label"></span>';
  const cEl = $('.chips', tally);
  const mEl = $('.mult', tally);
  const lEl = $('.label', tally);
  const boardMid = view.cellCenterApp(3.5, 3.5);
  let tick = 0;
  const stepMs = Math.max(55, Math.min(120, 900 / steps.length)) * sp;
  for (const st of steps) {
    let label = '';
    if (st.src === 'lines') { chips = st.chips; mult = st.mult; label = `${st.lines}줄 솔기`; }
    else if (st.src === 'streak') {
      mult += st.mult;
      label = `연속 ${st.streak}`;
      view.text(`연속 ${st.streak}!`, boardMid.x, view.boardRectInApp().y + view.cell * 1.2, { size: 30, color: '#e7b33a', dur: 900 });
    } else if (st.src === 'perfect') {
      chips += st.chips;
      label = '판을 다 비웠어요!';
      sfx.perfect();
      view.text('판 비움!', boardMid.x, boardMid.y, { size: 46, color: '#f4ead3', dur: 1200, pop: 1.8 });
      view.confetti(40);
    } else if (st.src === 'mono') {
      mult *= st.xmult;
      label = '단색 솔기 ×2';
      view.text('단색 솔기!', boardMid.x, boardMid.y - view.cell * 1.5, { size: 32, color: '#f5c75a', dur: 900 });
    } else if (st.src === 'boss') {
      mult *= st.xmult;
      label = '깐깐한 눈 ×0.5';
    } else {
      // tool effect
      if (st.chips) { chips += st.chips; fireTool(st.slot, `+${st.chips} 칩`, 'chips'); }
      if (st.mult) { mult += st.mult; fireTool(st.slot, `+${fmtMult(st.mult)} 배수`, 'mult'); }
      if (st.xmult) { mult *= st.xmult; fireTool(st.slot, `×${fmtMult(st.xmult)}`, 'xmult'); }
      label = TOOLS[st.src].name;
    }
    cEl.textContent = fmt(chips);
    mEl.textContent = fmtMult(mult);
    lEl.textContent = label;
    if (st.chips) bump(cEl);
    if (st.mult || st.xmult) bump(mEl);
    if (st.xmult) sfx.mult(tick); else sfx.tick(tick);
    tick++;
    await view.wait(stepMs / sp);
  }
  cEl.textContent = fmt(result.chips);
  mEl.textContent = fmtMult(result.mult);
  await view.wait(Math.max(0, plan.total / view.speed - steps.length * stepMs / sp) * 0.4);

  // --- slam
  const power = Math.log10(Math.max(10, result.score)) - 1;
  const size = Math.min(64, 30 + power * 10);
  view.text(`+${fmt(result.score)}`, boardMid.x, boardMid.y, { size, color: '#e7b33a', dur: 800, rise: 20, pop: 1.7 });
  view.shake(1.5 + power * 1.4);
  sfx.slam(0.6 + power * 0.4);
  haptic(result.score > 2000 ? [20, 30, 40] : 25);
  if (result.score >= Math.max(1000, run.order.target * 0.5)) flash();
  const sr = el.score.getBoundingClientRect();
  const ar = app.getBoundingClientRect();
  view.flyTo(boardMid.x, boardMid.y, sr.left - ar.left + 30, sr.top - ar.top + 14, '#e7b33a', Math.min(14, 4 + lines.length * 3));
  await view.wait(420);
  tally.classList.remove('show');
  bump(el.score);
  setBar(o.score);
  view.finishClear(run.board);
}

function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  app.appendChild(f);
  f.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => f.remove();
}

async function winSequence() {
  view.enabled = false;
  hint(null);
  await view.wait(250);
  const mid = view.cellCenterApp(3.5, 3.5);
  view.text('주문 완료!', mid.x, mid.y, { size: 52, color: '#f4ead3', dur: 1400, pop: 1.4, rise: 10 });
  sfx.win();
  haptic([30, 40, 30, 40, 60]);
  view.confetti(80);
  // remaining patches fly into the coin counter
  const left = Math.min(5, run.order.patchesLeft);
  const cr = el.coins.getBoundingClientRect();
  const ar = app.getBoundingClientRect();
  for (let i = 0; i < left; i++) {
    setTimeout(() => {
      view.flyTo(mid.x, mid.y + view.cell * 4.5, cr.left - ar.left + 8, cr.top - ar.top + 8, '#e7b33a', 2);
      sfx.coin(i);
    }, 500 + i * 120);
  }
  await view.wait(1300 + left * 60);
  persist();
  showReward();
}

async function failSequence(ev) {
  view.enabled = false;
  hint(null);
  await view.wait(300);
  sfx.fail();
  haptic([60, 40, 60]);
  view.shake(3);
  const mid = view.cellCenterApp(3.5, 3.5);
  view.text(ev.reason === 'jam' ? '자리가 없어요' : '조각이 다 떨어졌어요', mid.x, mid.y, { size: 30, color: '#ff9b8c', dur: 1400, rise: 6 });
  await view.wait(1100);
  finishRun(false, ev);
}

// ---------- reward / shop ----------
function showReward() {
  const rw = run.reward;
  const html = `<div class="eyebrow">${dayLabel()} · ${kindName(run.order.kind)}</div><h2>품삯을 받았어요</h2>
    <div class="reward-list">${rw.lines.map((l) => `<div class="reward-line"><span>${l.label}</span><b>+${l.coins}</b></div>`).join('')}</div>
    <div class="reward-total"><span>합계</span><b>${rw.total}닢</b></div>
    <div class="actions"><button class="btn btn-gold" id="collect" data-autofocus>받기</button></div>`;
  const s = openModal(html);
  s.querySelectorAll('.reward-line').forEach((n, i) => setTimeout(() => { n.classList.add('in'); sfx.coin(i); }, 120 + i * 140));
  on(s, '#collect', () => {
    const before = run.coins;
    const ev = R.collectReward(run);
    sfx.buy();
    haptic(15);
    persist();
    el.coins.textContent = run.coins;
    bump(el.coins);
    void before;
    if (ev.some((e) => e.type === 'victory')) finishRun(true);
    else showShop();
  });
}

function nextOrderPreview() {
  let day = run.day;
  let o = run.orderIdx + 1;
  if (o >= R.ORDERS_PER_DAY) { o = 0; day += 1; }
  const label = day > R.DAYS ? `밤샘 ${day - R.DAYS}일째` : `장날 ${day}`;
  return `${label} · ${R.ORDER_KINDS[o].name} · 목표 ${fmt(R.targetFor(day, o))}`;
}

function showShop() {
  hint(null);
  renderHud();
  const sh = run.shop;
  const full = run.tools.length >= MAX_TOOLS;
  const html = `<div class="shop-head"><div><div class="eyebrow" style="text-align:left">${dayLabel()}</div><h2>장터</h2></div>
      <span class="coin-pill">${glyph.coin}<span id="shop-coins">${run.coins}</span></span></div>
    <div class="cards">${sh.offers.map((of, i) => {
      const price = TOOLS[of.id].price;
      const can = !of.sold && !full && run.coins >= price;
      const label = of.sold ? '팔림' : full ? '자리 없음' : `${price}닢`;
      return toolCard(of.id, { sold: of.sold, action: `<button class="btn btn-small ${can ? 'btn-gold' : 'btn-ghost'} price" data-buy="${i}" ${can ? '' : 'disabled'}>${label}</button>` });
    }).join('')}</div>
    <div class="row-actions"><button class="btn btn-ghost btn-small" id="reroll" ${run.coins < sh.rerollCost ? 'disabled' : ''}>새로 진열 · ${sh.rerollCost}닢</button></div>
    <div class="section-label"><span>내 도구 ${run.tools.length}/${MAX_TOOLS}</span><span>눌러서 팔기</span></div>
    <div class="owned" id="owned"></div>
    <div class="section-label"><span>다음 주문</span></div>
    <div class="fact" style="margin-top:6px;text-align:center">${nextOrderPreview()}</div>
    <div class="actions"><button class="btn btn-seal" id="leave" data-autofocus>주문 받으러 가기</button></div>`;
  const s = openModal(html);
  const owned = $('#owned', s);
  renderTools(owned, run.tools, {
    onTap: (i, b) => {
      const t = run.tools[i];
      const btn = document.createElement('button');
      btn.className = 'btn btn-small btn-seal';
      btn.style.marginTop = '10px';
      btn.style.width = '100%';
      btn.textContent = `${sellPrice(t)}닢에 팔기`;
      btn.addEventListener('click', () => {
        R.sell(run, i);
        sfx.coin(0);
        haptic(10);
        persist();
        closeTip();
        showShop();
      });
      showToolTip(t, b, btn);
    },
  });
  on(s, '[data-buy]', (e, n) => {
    const i = +n.dataset.buy;
    const id = sh.offers[i].id;
    const res = R.buy(run, i);
    if (!res.ok) { toast(res.reason === 'full' ? '도구 칸이 가득 찼어요. 먼저 하나를 파세요' : '엽전이 모자라요'); return; }
    discover(id);
    sfx.buy();
    haptic(15);
    persist();
    showShop();
    renderHud();
    fireTool(run.tools.length - 1, '획득!', 'xmult');
  });
  on(s, '#reroll', () => {
    if (R.reroll(run).ok) { sfx.coin(2); persist(); showShop(); }
  });
  on(s, '#leave', () => {
    R.leaveShop(run);
    persist();
    showIntro();
  });
}

// ---------- end of run ----------
function finishRun(victory, ev) {
  const st = run.stats;
  const reachedDay = run.day;
  const newBest = {
    day: reachedDay > meta.bestDay,
    hand: st.bestHand > meta.bestHand,
  };
  meta.bestDay = Math.max(meta.bestDay, reachedDay);
  meta.bestOrders = Math.max(meta.bestOrders, st.orders);
  meta.bestHand = Math.max(meta.bestHand, st.bestHand);
  meta.bestStreak = Math.max(meta.bestStreak, st.bestStreak);
  meta.clears += st.clears;
  if (victory) meta.wins += 1;
  if (run.mode === 'daily' && run.dailyKey) {
    const prev = meta.daily[run.dailyKey];
    const scoreKey = st.orders * 1e7 + Math.min(st.bestHand, 9999999);
    if (!prev || scoreKey > prev.k) {
      meta.daily[run.dailyKey] = { k: scoreKey, label: victory ? '완성' : `주문 ${st.orders}개` };
    }
    // keep the daily table small
    const keys = Object.keys(meta.daily);
    if (keys.length > 14) keys.slice(0, keys.length - 14).forEach((k) => delete meta.daily[k]);
  }
  store.saveMeta(meta);
  persist();

  const grid = `<div class="stat-grid">
    <div><small>도달</small><b>${dayLabel()}</b>${newBest.day ? '<span class="new">신기록</span>' : ''}</div>
    <div><small>완료한 주문</small><b>${st.orders}</b></div>
    <div><small>최고 한 땀</small><b>${fmt(st.bestHand)}</b>${newBest.hand ? '<span class="new">신기록</span>' : ''}</div>
    <div><small>최고 연속</small><b>${st.bestStreak}</b></div></div>`;
  let html;
  if (victory) {
    view.confetti(120);
    sfx.perfect();
    html = `<div class="eyebrow">${R.DAYS}일의 장이 끝났어요</div><h2>보자기 완성</h2>
      <p class="lead">손님들이 모두 만족했어요. 밤을 새워 더 큰 주문에 도전할 수도 있어요.</p>${grid}
      <div class="actions"><button class="btn btn-gold" id="endless" data-autofocus>밤샘 작업 이어가기</button>
      <button class="btn btn-ghost" id="home">처음으로</button></div>`;
  } else {
    const short = Math.max(0, ev.short);
    const near = short <= run.order.target * 0.1;
    html = `<div class="eyebrow">${dayLabel()} · ${kindName(run.order.kind)}</div><h2>${near ? '아깝다!' : '주문 실패'}</h2>
      <p class="shortfall">목표까지 <b>${fmt(short)}</b>점 모자랐어요</p>${grid}
      <div class="actions"><button class="btn btn-seal" id="again" data-autofocus>${run.mode === 'daily' ? '오늘의 의뢰 다시' : '다시 짓기'}</button>
      <button class="btn btn-ghost" id="home">처음으로</button></div>`;
  }
  const s = openModal(html, { center: true });
  on(s, '#again', () => startRun(run.mode));
  on(s, '#home', () => titleScreen());
  on(s, '#endless', () => {
    R.continueEndless(run);
    persist();
    showShop();
  });
}

// ---------- pause / settings / info ----------
function switchRow(id, label, value) {
  return `<div class="toggle-row"><span>${label}</span><button class="switch" role="switch" id="${id}" aria-checked="${value}" aria-label="${label}"></button></div>`;
}

function bindSwitches(s) {
  const bind = (id, key, after) => {
    const n = $('#' + id, s);
    if (!n) return;
    n.addEventListener('click', () => {
      settings[key] = !settings[key];
      n.setAttribute('aria-checked', settings[key]);
      store.saveSettings(settings);
      after && after();
      unlock();
      sfx.ui();
    });
  };
  bind('sw-sound', 'sound', () => setEnabled(settings.sound));
  bind('sw-haptics', 'haptics', () => haptic(20));
  bind('sw-fast', 'fast', () => { view.speed = speed(); });
}

function showPause() {
  if (!run || busy) return;
  const html = `<h2>잠시 쉬기</h2>
    ${switchRow('sw-sound', '소리', settings.sound)}${switchRow('sw-haptics', '진동', settings.haptics)}${switchRow('sw-fast', '빠른 연출', settings.fast)}
    <div class="actions"><button class="btn btn-seal" id="resume" data-autofocus>계속하기</button>
    <button class="btn btn-ghost" id="how">하는 방법</button>
    <button class="btn btn-ghost" id="quit">처음으로 (진행 저장됨)</button></div>`;
  const s = openModal(html, { center: true });
  bindSwitches(s);
  on(s, '#resume', () => resumePhase());
  on(s, '#how', () => showHow(() => showPause()));
  on(s, '#quit', () => { persist(); titleScreen(); });
}

function showHow(back) {
  const html = `<div class="eyebrow">하는 방법</div><h2>조각보 짓기</h2>
    <div class="how">
      <p><b>조각 놓기</b> — 아래 조각을 끌어 수틀에 놓아요. 놓을 때마다 남은 조각이 하나씩 줄어요.</p>
      <p><b>솔기 꿰매기</b> — 가로나 세로 한 줄을 채우면 바늘이 지나가며 줄이 사라지고 점수가 나요. 여러 줄을 한 번에, 연달아 지울수록 커져요.</p>
      <p><b>칩 × 배수</b> — 지운 칸이 칩, 줄 수와 연속이 배수예요. 한 줄이 한 색이면 단색 솔기 ×2.</p>
      <p><b>주문</b> — 조각이 떨어지기 전에 목표 점수를 넘기면 완료. 조각을 놓을 데가 없으면 버리기로 바꿔요.</p>
      <p><b>장터</b> — 품삯으로 바느질 도구를 사요. 도구 조합이 점수 엔진이에요. 엽전을 모아 두면 이자도 붙어요.</p>
    </div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>알겠어요</button></div>`;
  const s = openModal(html);
  on(s, '#back', () => (back ? back() : closeModal()));
}

function showCodex() {
  const html = `<div class="eyebrow">도구 도감 ${meta.discovered.length}/${TOOL_IDS.length}</div><h2>바느질 도구</h2>
    <div class="cards">${TOOL_IDS.map((id) => toolCard(id, { locked: !meta.discovered.includes(id) })).join('')}</div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>닫기</button></div>`;
  const s = openModal(html);
  on(s, '#back', closeModal);
}

function showRecords() {
  const html = `<div class="eyebrow">공방 기록</div><h2>지금까지</h2>
    <div class="stat-grid">
      <div><small>지은 판</small><b>${meta.runs}</b></div>
      <div><small>완성한 보자기</small><b>${meta.wins}</b></div>
      <div><small>최고 도달</small><b>${meta.bestDay > R.DAYS ? `밤샘 ${meta.bestDay - R.DAYS}일` : `장날 ${meta.bestDay || '-'}`}</b></div>
      <div><small>최고 한 땀</small><b>${fmt(meta.bestHand)}</b></div>
      <div><small>최고 연속</small><b>${meta.bestStreak}</b></div>
      <div><small>꿰맨 솔기</small><b>${fmt(meta.clears)}</b></div>
    </div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>닫기</button></div>`;
  const s = openModal(html, { center: true });
  on(s, '#back', closeModal);
}

// ---------- title art: a bojagi assembling itself ----------
const titleArt = (() => {
  const cv = $('#title-art');
  const g = cv.getContext('2d');
  let raf = 0;
  let t0 = 0;
  const cols = ['blue', 'red', 'yellow', 'white', 'black'];
  // irregular patchwork: rectangles splitting a 6×6 grid
  const rects = [];
  (function split(x, y, w, h, depth, seed) {
    if (depth > 3 || w * h <= 2 || (depth > 1 && (seed % 3 === 0))) {
      rects.push({ x, y, w, h, color: cols[(seed * 7 + x * 3 + y) % 5] });
      return;
    }
    if (w >= h) { const k = 1 + (seed % (w - 1 || 1)); split(x, y, k, h, depth + 1, seed * 5 + 1); split(x + k, y, w - k, h, depth + 1, seed * 3 + 2); }
    else { const k = 1 + (seed % (h - 1 || 1)); split(x, y, w, k, depth + 1, seed * 7 + 3); split(x, y + k, w, h - k, depth + 1, seed * 11 + 1); }
  })(0, 0, 6, 6, 0, 4);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!t0) t0 = now;
    const dpr = Math.min(3, devicePixelRatio || 1);
    const w = cv.clientWidth;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = cv.height = Math.round(w * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, w);
    const t = (now - t0) / 1000;
    const pad = w * 0.12;
    const u = (w - pad * 2) / 6;
    g.save();
    g.translate(w / 2, w / 2);
    g.rotate(Math.sin(t * 0.4) * 0.04 + Math.PI / 4 * 0.12);
    g.translate(-w / 2, -w / 2);
    // knot ties on corners like a wrapped bojagi
    rects.forEach((r, i) => {
      const k = Math.max(0, Math.min(1, (t - i * 0.07) / 0.45));
      if (k <= 0) return;
      const e = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
      const x = pad + r.x * u, y = pad + r.y * u, ww = r.w * u, hh = r.h * u;
      g.save();
      g.translate(x + ww / 2, y + hh / 2 + (1 - k) * 30);
      g.scale(e, e);
      g.translate(-ww / 2, -hh / 2);
      paintPatch(g, r.color, ww, hh);
      g.restore();
    });
    // seam stitches growing in after assembly
    const sk = Math.max(0, Math.min(1, (t - rects.length * 0.07 - 0.2) / 0.8));
    if (sk > 0) {
      g.strokeStyle = 'rgba(244,234,211,.85)';
      g.lineWidth = Math.max(1.5, u * 0.05);
      g.setLineDash([u * 0.12, u * 0.09]);
      g.strokeRect(pad - 3, pad - 3, (u * 6 + 6) * 1, (u * 6 + 6) * sk);
      g.setLineDash([]);
    }
    g.restore();
  }
  return {
    start() { cancelAnimationFrame(raf); t0 = 0; raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); },
  };
})();

// ---------- title buttons ----------
on(document, '#btn-continue', () => continueRun());
on(document, '#btn-new', () => {
  const save = store.loadRun();
  if (R.isValidSave(save) && !['over', 'victory'].includes(save.phase)) {
    const s = openModal(`<h2>새로 지을까요?</h2><p class="lead">이어 짓던 판은 사라져요.</p>
      <div class="row-actions"><button class="btn btn-ghost" id="no">취소</button><button class="btn btn-seal" id="yes" data-autofocus>새로 짓기</button></div>`, { center: true });
    on(s, '#no', closeModal);
    on(s, '#yes', () => { store.clearRun(); startRun('normal'); });
    return;
  }
  startRun('normal');
});
on(document, '#btn-daily', () => {
  const save = store.loadRun();
  const { key } = R.dailySeed();
  if (R.isValidSave(save) && save.mode === 'daily' && save.dailyKey === key && !['over', 'victory'].includes(save.phase)) { continueRun(); return; }
  if (R.isValidSave(save) && !['over', 'victory'].includes(save.phase)) {
    const s = openModal(`<h2>오늘의 의뢰를 시작할까요?</h2><p class="lead">이어 짓던 판은 사라져요.</p>
      <div class="row-actions"><button class="btn btn-ghost" id="no">취소</button><button class="btn btn-seal" id="yes" data-autofocus>시작</button></div>`, { center: true });
    on(s, '#no', closeModal);
    on(s, '#yes', () => { store.clearRun(); startRun('daily'); });
    return;
  }
  startRun('daily');
});
on(document, '#btn-codex', () => showCodex());
on(document, '#btn-records', () => showRecords());
on(document, '#btn-how', () => showHow());
on(document, '#btn-sound', (e, n) => {
  settings.sound = !settings.sound;
  setEnabled(settings.sound);
  store.saveSettings(settings);
  n.textContent = settings.sound ? '소리 켬' : '소리 끔';
});

document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && run && run.phase === 'play' && el.modal.hidden) showPause();
});

// hot-update hook for the artifact viewer: keep the run when code is republished
if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  try { window.claude.hot.snapshot(() => ({ run })); } catch { /* optional */ }
}

function boot() {
  document.fonts && document.fonts.ready.then(() => view.resize());
  titleScreen();
}
boot();

// debug/test handle
window.__bojagi = { get run() { return run; }, view, R, playEvents, shapes: SHAPE_BY_ID };
