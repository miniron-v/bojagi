// Controller: wires core run state ↔ view ↔ DOM HUD/sheets, persistence and sound.
// Input stays live during score tallies; only order win/fail sequences block the board.
import * as R from '../core/run.js';
import { TOOLS, TOOL_IDS, MAX_TOOLS, RARITY_NAME, toolDesc, toolBadge, sellPrice, makeTool } from '../core/tools.js';
import { SHAPE_BY_ID } from '../core/shapes.js';
import { View } from './view.js';
import { toolArt, glyph, seamIcon } from './icons.js';
import { clothTexture } from './art.js';
import { sfx, unlock, setEnabled, resumeAudio, setAmbient } from './audio.js';
import { createTitleArt } from './title-art.js';
import { drawQuilt, shareText } from './quilt.js';
import * as store from './store.js';
import { lockedIds, isUnlocked, progress } from '../core/unlocks.js';
import { recordRun as writeRecords, dailyStreakAlive } from '../core/records.js';
import { fmt, fmtMult, kindName, dayName, bestDayLabel } from './format.js';
import { SEAMS, SEAM_BY_ID, seamValue, PATTERN_PRICE } from '../core/seams.js';

const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');
const el = {
  title: $('#title'), game: $('#game'), modal: $('#modal'), sheet: $('#sheet'), toast: $('#toast'),
  day: $('#hud-day'), dayMax: $('#hud-daymax'), kind: $('#hud-kind'), score: $('#hud-score'), target: $('#hud-target'),
  fill: $('#hud-fill'), ghost: $('#hud-ghost'), bar: $('#hud-bar'), patches: $('#hud-patches'), discards: $('#hud-discards'),
  coins: $('#hud-coins'), boss: $('#hud-boss'), tools: $('#hud-tools'), tally: $('#tally'), hint: $('#hint'),
  discardBtn: $('#btn-discard'), pause: $('#btn-pause'), statPatches: $('#stat-patches'), streak: $('#hud-streak'),
  seamBtn: $('#btn-seams'), seamTag: $('#hud-seam'), seamName: $('#hud-seam-name'),
};

let run = null;
let meta = store.loadMeta();
let settings = store.loadSettings();
let busy = false; // win/fail sequence running
let shownScore = 0;
let pendingScore = 0; // points earned in the core but not yet "slammed" into the HUD
let hintStage = 0;
let lastPlaced = null;
let tallyJob = null;
let lastHoverKey = null;
let endInfo = null;
let pendingHint = null;
let patchWarned = false;
const speed = () => (settings.fast ? 0.55 : 1);

setEnabled(settings.sound);
setAmbient(settings.sound && settings.ambient !== false);
app.style.setProperty('--cloth', `url(${clothTexture()})`);
el.pause.innerHTML = glyph.pause;
el.seamBtn.innerHTML = glyph.scroll;
$('#ic-coin').innerHTML = glyph.coin;
$('#ic-patch').innerHTML = glyph.patch;
$('#ic-reroll').innerHTML = glyph.reroll;

const view = new View({ stage: $('#stage'), canvas: $('#cv'), fxCanvas: $('#fx'), app });
view.speed = speed();
const titleArt = createTitleArt($('#title-art'));

function haptic(p) {
  if (!settings.haptics) return;
  try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* blocked in some frames */ }
}

// ---------- persistence ----------
function persist() {
  if (!run) return;
  if (run.phase === 'over') store.clearRun();
  else store.saveRun(run);
}

function discover(id) {
  if (!meta.discovered.includes(id)) {
    meta.discovered.push(id);
    store.saveMeta(meta);
  }
}

const dayLabel = () => dayName(run.day);
const fitsOf = () => R.trayFits(run);

// ---------- HUD ----------

/** Renders tool slots; when the same tools are already shown, only badges update so running animations survive. */
function renderTools(container, tools, { onTap, empties = true, sellTags = false } = {}) {
  const sig = tools.map((t) => t.id).join(',') + `|${empties}|${sellTags}`;
  if (container.dataset.sig === sig) {
    tools.forEach((t, i) => {
      const badge = container.children[i] && container.children[i].querySelector('.badge');
      if (badge) badge.textContent = toolBadge(t);
    });
    container._onTap = onTap;
    return;
  }
  container.dataset.sig = sig;
  container._onTap = onTap;
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
      const badgeText = toolBadge(t);
      if (badgeText) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = badgeText;
        b.appendChild(badge);
      }
      if (sellTags) {
        const tag = document.createElement('span');
        tag.className = 'sell';
        tag.textContent = `${sellPrice(t)}닢`;
        b.appendChild(tag);
      }
      b.addEventListener('click', (e) => { e.stopPropagation(); if (container._onTap) container._onTap(i, b); });
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
  el.kind.classList.toggle('boss', !!o.boss);
  el.target.textContent = fmt(o.target);
  el.patches.textContent = o.patchesLeft;
  el.statPatches.classList.toggle('low', o.patchesLeft <= 5);
  el.seamName.textContent = seamLabel(signatureSeam());
  el.discards.textContent = o.discardsLeft;
  el.coins.textContent = run.coins;
  el.discardBtn.disabled = o.discardsLeft <= 0 || run.phase !== 'play';
  el.discardBtn.classList.toggle('urge', !!o.stuck && o.discardsLeft > 0);
  if (o.boss) {
    const b = R.BOSSES[o.boss];
    el.boss.hidden = false;
    el.boss.innerHTML = `<span class="seal-mark">${b.name[0]}</span><b>${b.name}</b><span class="desc">${b.desc}</span>`;
    el.boss.onclick = () => toast(`${b.name}: ${b.desc}`, 2200);
  } else el.boss.hidden = true;
  setStreak(o.streak);
  renderTools(el.tools, run.tools, { onTap: (i, b) => showToolTip(run.tools[i], b) });
  setBar();
}

/** Streak chip: shown from 2 in a row; 'up' while hovering a clear, 'warn' when the move would break it. */
function setStreak(n, state = '') {
  el.streak.hidden = n < 2;
  el.streak.classList.toggle('warn', state === 'warn');
  el.streak.classList.toggle('up', state === 'up');
  $('b', el.streak).textContent = n;
}

function setBar() {
  const o = run.order;
  const shown = o.score - pendingScore;
  el.fill.style.width = Math.min(100, (shown / o.target) * 100) + '%';
  el.bar.classList.toggle('done', shown >= o.target);
}

function animateScore() {
  requestAnimationFrame(animateScore);
  if (!run || !run.order) return;
  const target = run.order.score - pendingScore;
  if (shownScore !== target) {
    const diff = target - shownScore;
    shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.16));
    if ((diff > 0 && shownScore > target) || (diff < 0 && shownScore < target)) shownScore = target;
    el.score.textContent = fmt(shownScore);
  }
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
    node.querySelectorAll('.pop').forEach((old) => old.remove());
    const pop = document.createElement('span');
    pop.className = `pop ${kind}`;
    pop.textContent = label;
    node.appendChild(pop);
    setTimeout(() => pop.remove(), 1150);
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
  tipEl.setAttribute('role', 'tooltip');
  tipEl.innerHTML = `<b>${def.name}</b> <small>${RARITY_NAME[def.rarity]}</small><p>${toolDesc(inst)}</p>`;
  if (extra) tipEl.appendChild(extra);
  app.appendChild(tipEl);
  const ar = app.getBoundingClientRect();
  const br = anchor.getBoundingClientRect();
  const below = br.bottom - ar.top + 8;
  const h = tipEl.offsetHeight;
  tipEl.style.top = `${below + h > ar.height - 12 ? br.top - ar.top - h - 8 : below}px`;
}

let hintTimer = 0;
function hint(text, ms = 0) {
  clearTimeout(hintTimer);
  if (!text) { el.hint.classList.remove('show'); return; }
  el.hint.textContent = text;
  el.hint.classList.add('show');
  if (ms) hintTimer = setTimeout(() => el.hint.classList.remove('show'), ms);
}

function toast(text, ms = 1600) {
  el.toast.textContent = text;
  el.toast.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.toast.classList.remove('show'), ms);
}

/** Explains a rule the first time it matters, then never again. */
function teachOnce(key, text, ms = 3600) {
  meta.seen ||= {};
  if (meta.seen[key]) return false;
  meta.seen[key] = true;
  store.saveMeta(meta);
  hint(text, ms);
  return true;
}

// ---------- seams ----------
const seamLevel = (id) => (run && run.seams && run.seams[id]) || 1;
/** The seam this run is built around: highest level, ties broken by how often it was made. */
function signatureSeam() {
  const counts = (run.stats && run.stats.seamCounts) || {};
  let best = 'single';
  for (const s of SEAMS) {
    const a = [seamLevel(s.id), counts[s.id] || 0];
    const b = [seamLevel(best), counts[best] || 0];
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) best = s.id;
  }
  return best;
}
const lvTag = (id) => (SEAM_BY_ID[id].fixed ? '' : `Lv.${seamLevel(id)}`);
const seamLabel = (id) => `${SEAM_BY_ID[id].name} ${lvTag(id)}`.trim();

// ---------- modal ----------
function syncInput() {
  view.enabled = !!run && run.phase === 'play' && !busy && el.modal.hidden && !el.game.hidden;
}

let modalClose = null;
/**
 * Sheets have three parts: a scrolling body, a footer pinned to the bottom (the sheet's last
 * .actions/.row-actions block is moved there so the main button never needs scrolling), and,
 * when `close` is given, a close button pinned to the top corner plus tap-outside to dismiss.
 */
function openModal(html, { center = false, close = null } = {}) {
  closeTip();
  view.cancelDrag();
  el.modal.classList.toggle('center', center);
  el.sheet.innerHTML = `<div class="sheet-body">${html}</div>`;
  const body = el.sheet.firstElementChild;
  const last = body.lastElementChild;
  if (last && (last.classList.contains('actions') || last.classList.contains('row-actions'))) {
    const foot = document.createElement('div');
    foot.className = 'sheet-foot';
    foot.appendChild(last);
    el.sheet.appendChild(foot);
  }
  modalClose = close;
  if (close) {
    const x = document.createElement('button');
    x.className = 'sheet-close';
    x.setAttribute('aria-label', '닫기');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    x.addEventListener('click', () => { unlock(); sfx.ui(); close(); });
    el.sheet.appendChild(x);
  }
  el.sheet.classList.toggle('closable', !!close);
  body.scrollTop = 0;
  el.modal.hidden = false;
  // swallow the tail of a double tap that opened this sheet
  el.sheet.style.pointerEvents = 'none';
  setTimeout(() => { el.sheet.style.pointerEvents = ''; }, 280);
  syncInput();
  const first = el.sheet.querySelector('[data-autofocus]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  return el.sheet;
}
el.modal.addEventListener('click', (e) => {
  if (e.target === el.modal && modalClose && el.sheet.style.pointerEvents !== 'none') { sfx.ui(); modalClose(); }
});
function closeModal() {
  modalClose = null;
  el.modal.hidden = true;
  el.sheet.innerHTML = '';
  syncInput();
}
function once(fn) {
  let used = false;
  return (...a) => { if (used) return; used = true; fn(...a); };
}
const on = (root, sel, fn) => root.querySelectorAll(sel).forEach((n) => n.addEventListener('click', (e) => { unlock(); sfx.ui(); fn(e, n); }));

// ---------- screens ----------
function showScreen(name) {
  el.title.hidden = name !== 'title';
  el.game.hidden = name !== 'game';
  view.cancelDrag();
  // lay out synchronously so anything positioned on the hoop this frame lands correctly
  if (name === 'game') view.resize();
  syncInput();
}

function titleScreen() {
  run = null;
  busy = false;
  if (tallyJob) tallyJob.flush();
  closeModal();
  showScreen('title');
  const save = store.loadRun();
  const valid = R.isValidSave(save) && save.phase !== 'over';
  const cont = $('#btn-continue');
  cont.hidden = !valid;
  if (valid) {
    // between orders (gift/shop) the next order is what the player returns to
    const at = ['gift', 'shop'].includes(save.phase) ? R.nextOrderOf(save) : { day: save.day, orderIdx: save.orderIdx };
    const what = save.phase === 'victory' ? '보자기 완성 · 밤샘 작업 가능' : `${dayName(at.day)} · ${kindName(at.orderIdx)}`;
    $('.sub', cont).textContent = what + (save.mode === 'daily' ? ' · 오늘의 의뢰' : '');
  }
  const { key } = R.dailySeed();
  const today = meta.daily[key];
  const streakOn = dailyStreakAlive(meta, key);
  $('.sub', $('#btn-daily')).textContent = today ? `오늘 기록: ${today.label}` : '모두가 같은 판을 짓는 하루';
  const stamp = $('#daily-stamp');
  stamp.hidden = !streakOn;
  if (streakOn) stamp.textContent = `${meta.dailyStreak.count}일 연속`;
  $('#codex-count').textContent = `${meta.discovered.length}/${TOOL_IDS.length}`;
  $('#best-line').textContent = meta.runs
    ? `최고 ${bestDayLabel(meta.bestDay)} · 최고 한 땀 ${fmt(meta.bestHand)} · 완성 ${meta.wins}회`
    : '';
  $('#btn-sound').textContent = settings.sound ? '소리 켬' : '소리 끔';
  titleArt.start();
}

function startRun(mode) {
  // the daily order is the same for everyone, so it uses the full tool set
  let opts = { locked: lockedIds(meta) };
  if (mode === 'daily') {
    const { key, seed } = R.dailySeed();
    opts = { seed, mode: 'daily', dailyKey: key, locked: [] };
  }
  run = R.newRun(opts);
  meta.runs += 1;
  store.saveMeta(meta);
  persist();
  enterGame();
  showIntro();
}

function continueRun() {
  const save = store.loadRun();
  if (!R.isValidSave(save)) { store.clearRun(); titleScreen(); return; }
  run = R.migrate(save);
  enterGame();
  resumePhase();
}

function enterGame() {
  titleArt.stop();
  busy = false;
  pendingScore = 0;
  tallyJob = null;
  showScreen('game');
  shownScore = run.order ? run.order.score : 0;
  el.score.textContent = fmt(shownScore);
  el.tally.classList.remove('show', 'preview');
  view.setBoard(run.board);
  view.setTray(run.tray, fitsOf(), false);
  renderHud();
}

function resumePhase() {
  switch (run.phase) {
    case 'gift': return showGift();
    case 'intro': return showIntro();
    case 'play':
      closeModal();
      renderHud();
      if (run.order.stuck) stuckHint();
      return undefined;
    case 'reward': return showReward();
    case 'shop': return showShop();
    case 'victory': return showEnd(true);
    default: return titleScreen();
  }
}

function toolCard(id, { action = '', sold = false, locked = false, inst = null } = {}) {
  const def = TOOLS[id];
  let desc = toolDesc(inst || makeTool(id));
  if (locked) {
    const p = !isUnlocked(id, meta) && progress(id, meta);
    desc = p ? `잠김 · ${p.need} (${p.have}/${p.goal})` : '아직 만나지 못한 도구';
  }
  return `<div class="card r${def.rarity}${sold ? ' sold' : ''}${locked ? ' locked' : ''}">
    <div class="art">${toolArt(def)}</div>
    <div class="min"><div class="name">${locked ? '???' : def.name}<span class="rar">${RARITY_NAME[def.rarity]}</span></div><div class="desc">${desc}</div></div>
    ${action}</div>`;
}

function showGift() {
  hint(null);
  const html = `<div class="eyebrow">첫 손님의 선물</div><h2>도구를 하나 고르세요</h2>
    <p class="lead">도구는 칩과 배수를 키워 줘요. ${MAX_TOOLS}개까지 들 수 있고 장터에서 사고팔 수 있어요.</p>
    <div class="cards">${run.gift.map((id, i) => toolCard(id, { action: `<button class="btn btn-gold btn-small" data-gift="${i}" ${i === 0 ? 'data-autofocus' : ''}>고르기</button>` })).join('')}</div>`;
  const s = openModal(html);
  on(s, '[data-gift]', once((e, n) => {
    const id = run.gift[+n.dataset.gift];
    R.chooseGift(run, +n.dataset.gift);
    discover(id);
    sfx.buy();
    persist();
    renderHud();
    showShop();
    if (!meta.toolTip) { meta.toolTip = true; store.saveMeta(meta); pendingHint = '도구를 누르면 효과를, 위의 족보 버튼을 누르면 족보표를 볼 수 있어요'; }
  }));
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

/** Small/big orders start immediately with a banner; boss orders get a card with the rule. */
function showIntro() {
  hint(null);
  const o = run.order;
  view.setBoard(run.board);
  view.setTray([null, null, null], [true, true, true], false);
  shownScore = 0;
  pendingScore = 0;
  el.score.textContent = '0';
  renderHud();
  if (!o.boss) {
    closeModal();
    begin();
    const mid = view.cellCenterApp(3.5, 3.5);
    view.text(`${dayLabel()}  ${kindName(o.kind)}`, mid.x, mid.y - view.cell * 1.3, { size: 24, color: '#b3b8cf', dur: 1700, rise: 8, pop: 1.1 });
    view.text(`목표 ${fmt(o.target)}`, mid.x, mid.y - view.cell * 0.1, { size: 42, color: '#e2b54a', dur: 1700, rise: 8, pop: 1.3, delay: 80 });
    view.text(`조각 ${o.patchesLeft}개 안에`, mid.x, mid.y + view.cell * 1.0, { size: 22, color: '#f3ead6', dur: 1700, rise: 8, pop: 1.1, delay: 160 });
    sfx.ui();
    return;
  }
  const boss = R.BOSSES[o.boss];
  const html = `<div class="eyebrow">${dayLabel()}${run.day <= R.DAYS ? ` / ${R.DAYS}` : ''}</div><h2>${kindName(o.kind)}</h2>
    <div class="big-target"><span class="num">${fmt(o.target)}</span><small>점 이상 지어 주세요</small></div>
    <div class="facts"><span class="fact">조각 <b>${o.patchesLeft}</b></span><span class="fact">바꾸기 <b>${o.discardsLeft}</b></span><span class="fact">보상 <b>${R.ORDER_KINDS[o.kind].reward}</b>닢</span></div>
    <div class="boss-card"><span class="seal-mark">${boss.name[0]}</span><div><b>${boss.name}</b><span>${boss.desc}</span></div>${bossDemo(o.boss)}</div>
    ${dayTrack()}
    <div class="actions"><button class="btn btn-seal" id="go" data-autofocus>바느질 시작</button></div>`;
  const s = openModal(html, { center: true });
  on(s, '#go', once(() => { closeModal(); begin(); }));
}

/** A tiny picture for rules that read ambiguously in words. */
function bossDemo(boss) {
  if (boss !== 'knots') return '';
  const cell = (x, fill, knot) => `<rect x="${x}" y="8" width="22" height="22" rx="3" fill="${fill}"/>${knot ? `<circle cx="${x + 11}" cy="19" r="4" fill="#e4ab2c"/>` : ''}`;
  const row = (y0, cells) => `<g transform="translate(0 ${y0})">${cells}</g>`;
  const before = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cell(4 + i * 24, i === 3 ? '#6a2a24' : i === 6 ? '#ffffff14' : '#2f66b0', i === 3)).join('');
  return `<div class="demo"><svg viewBox="0 0 200 62" aria-label="매듭이 든 줄을 채우면 함께 풀려요">${row(0, before)}
    <text x="100" y="52" text-anchor="middle" font-size="10" fill="#ffd6cf">빈칸을 채우면 매듭까지 한 줄로 풀려요</text></svg></div>`;
}

function begin() {
  const ev = R.beginOrder(run);
  persist();
  view.setTray(run.tray, fitsOf());
  renderHud();
  syncInput();
  patchWarned = false;
  if (!meta.tutorial && run.day === 1 && run.orderIdx === 0) { hintStage = 1; hint(`조각을 끌어 수틀에 놓으세요. 조각은 ${run.order.patchesLeft}개뿐이에요`); }
  else if (run.order.boss === 'knots' && teachOnce('knots', '매듭이 든 줄도 나머지를 채우면 매듭째 풀려요', 4200)) { /* taught */ }
  else if (run.order.boss === 'ink' && teachOnce('ink', '먹물: 흑색 칸은 지워도 칩을 주지 않아요. 다른 색 줄을 노리세요', 4200)) { /* taught */ }
  else if (run.order.boss === 'strict' && teachOnce('strict', '깐깐한 눈: 모든 배수가 절반이에요. 목표가 그만큼 낮아요', 4200)) { /* taught */ }
  else if (pendingHint) { hint(pendingHint, 3200); pendingHint = null; }
  if (ev.some((e) => e.type === 'stuck')) stuckHint();
  if (ev.some((e) => e.type === 'fail')) {
    recordRun(false);
    persist();
    playEvents(ev.filter((e) => e.type === 'fail'));
  }
}

function stuckHint() {
  hint('놓을 자리가 없어요. 아래 「조각 바꾸기」를 누르세요');
  renderHud();
}

// ---------- play ----------
view.handlers.canDrag = () => !busy && !!run && run.phase === 'play' && el.modal.hidden;
view.handlers.pickup = () => {
  unlock(); sfx.pick(); haptic(6); closeTip(); lastHoverKey = null;
  // picking up the next patch finishes the running tally so the preview can take its place
  if (tallyJob) tallyJob.flush();
};
view.handlers.cancel = (i, wasValid) => { if (!wasValid) sfx.invalid(); showPreview(null); };
view.handlers.hover = (h) => showPreview(h);
view.handlers.drop = (i, r, c, piece) => {
  if (busy || !run || run.phase !== 'play' || !el.modal.hidden) return false;
  // the tray may have changed under the finger (discard); never place a different patch
  if (JSON.stringify(run.tray[i]) !== JSON.stringify(piece)) return false;
  const res = R.place(run, i, r, c);
  if (!res.ok) return false;
  showPreview(null);
  if (res.events.some((e) => e.type === 'fail')) recordRun(false);
  persist();
  playEvents(res.events);
  return true;
};

function showPreview(h) {
  if (!h || !run || run.phase !== 'play') {
    if (!tallyJob) el.tally.classList.remove('show', 'preview');
    el.ghost.style.width = '0';
    el.ghost.classList.remove('win');
    if (run && run.order) setStreak(run.order.streak);
    return;
  }
  const pv = R.preview(run, h.i, h.r, h.c);
  if (!pv) return;
  const o = run.order;
  el.ghost.style.width = Math.min(100, ((o.score - pendingScore + pv.score) / o.target) * 100) + '%';
  el.ghost.classList.toggle('win', pv.completes);
  if (pv.lines.length) {
    setStreak(pv.streak, 'up');
    if (!tallyJob) {
      el.tally.classList.add('show', 'preview');
      el.tally.innerHTML = tallyHtml(pv.seam, fmt(pv.chips), fmtMult(pv.mult), pv.completes ? '이걸로 주문 완료!' : `+${fmt(pv.score)}점`, pv.completes);
    }
    const key = `${h.i}:${h.r}:${h.c}`;
    if (key !== lastHoverKey) { lastHoverKey = key; sfx.hover(pv.lines.length); }
  } else {
    setStreak(o.streak, pv.streakBreaks ? 'warn' : '');
    if (!tallyJob) el.tally.classList.remove('show', 'preview');
    lastHoverKey = null;
  }
}

function tallyHtml(seam, chips, mult, label, win = false) {
  const head = seam ? `<div class="seam">${SEAM_BY_ID[seam].name}<small>${lvTag(seam)}</small></div>` : '';
  return `${head}<div class="row"><span class="chips"><small>칩</small><em>${chips}</em></span><span class="x">×</span><span class="mult"><small>배수</small><em>${mult}</em></span></div><div class="label${win ? ' win' : ''}">${label}</div>`;
}

el.discardBtn.addEventListener('click', () => {
  unlock();
  if (busy || !run || run.phase !== 'play' || view.drag) return;
  const ev = R.discard(run);
  if (!ev.length) return;
  sfx.pick();
  haptic(10);
  hint(null);
  if (ev.some((e) => e.type === 'fail')) recordRun(false);
  persist();
  playEvents(ev);
});

el.pause.addEventListener('click', () => { unlock(); sfx.ui(); showPause(); });
const openSeamsFromHud = () => { unlock(); sfx.ui(); if (run && !busy && el.modal.hidden) showSeams(); };
el.seamBtn.addEventListener('click', openSeamsFromHud);
el.seamTag.addEventListener('click', openSeamsFromHud);

async function playEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'place':
        lastPlaced = ev;
        view.placePiece(ev);
        el.patches.textContent = run.order.patchesLeft;
        bump(el.patches);
        if (run.phase === 'play' && run.order.patchesLeft <= 5 && run.order.patchesLeft > 0 && !patchWarned) {
          patchWarned = true;
          toast(`조각이 ${run.order.patchesLeft}개 남았어요`, 1800);
        }
        sfx.drop(SHAPE_BY_ID[ev.piece.shape].size);
        haptic(8);
        break;
      case 'toolGrow':
        if (ev.late) {
          if (tallyJob) tallyJob.after.push(() => fireTool(ev.slot, '성장!', 'xmult'));
          else fireTool(ev.slot, '성장!', 'xmult');
        }
        break;
      case 'score':
        scoreEvent(ev);
        break;
      case 'tray': {
        view.setTray(run.tray, fitsOf());
        const t = run.tray.filter(Boolean);
        if (t.length >= 2 && t.every((p) => p.color === t[0].color)) teachOnce('monoTray', '모두 같은 색 조각이에요. 한 줄을 한 색으로 채우면 단색 솔기!', 4000);
        break;
      }
      case 'discard':
        view.setTray([null, null, null], [true, true, true], false);
        break;
      case 'stuck':
        stuckHint();
        break;
      case 'won':
        busy = true;
        syncInput();
        if (tallyJob) await tallyJob.done;
        await winSequence();
        break;
      case 'fail':
        busy = true;
        syncInput();
        if (tallyJob) await tallyJob.done;
        await failSequence(ev);
        break;
      default:
    }
  }
  if (run && run.phase === 'play') {
    view.setTray(run.tray, fitsOf(), false);
    renderHud();
  }
  syncInput();
}

function scoreEvent(ev) {
  const { result, lines } = ev;
  if (!lines.length) {
    if (lastPlaced) {
      const cs = lastPlaced.cells;
      const p = view.cellCenterApp(cs.reduce((a, q) => a + q[0], 0) / cs.length, cs.reduce((a, q) => a + q[1], 0) / cs.length);
      view.text(`+${result.score}`, p.x, p.y - view.cell * 0.4, { size: 18, color: '#f4ead3', dur: 600, rise: 26, pop: 1.2 });
    }
    setBar();
    if (hintStage === 1) { hintStage = 2; hint('가로나 세로 한 줄을 채우면 꿰매져요'); }
    if (run.order.streak === 0 && ev.streak === 0 && el.streak && !el.streak.hidden) setStreak(0);
    return;
  }
  hint(null);
  if (tallyJob) tallyJob.flush();
  pendingScore += result.score;
  const plan = view.clearLines(lines, ev.streak);
  plan.stitchTimes.forEach((t, k) => setTimeout(() => { sfx.stitch(k, ev.streak); haptic(12); }, t));
  view.shake(1 + lines.length * 0.6);
  if (lines.length >= 2) haptic([15, 30, 25]);
  tallyJob = startTally(ev);
}

/**
 * Balatro-style tally laid over the hoop: the seam is named, then cells, streak and each tool
 * step forward one at a time and the numbers climb. Tools get a long beat each so the player
 * can see what every tool did; beats shorten as more tools fire. A new clear flushes the old
 * tally straight to its result.
 */
function startTally(ev) {
  const { result, lines } = ev;
  const job = { flushed: false, after: [], wake: null };
  job.flush = () => { job.flushed = true; if (job.wake) job.wake(); };
  const sleep = (ms) => new Promise((res) => {
    if (job.flushed) { res(); return; }
    const t = setTimeout(res, ms);
    job.wake = () => { clearTimeout(t); res(); };
  });
  const teach = !meta.tallyTaught;
  job.done = (async () => {
    const sp = speed() * (teach ? 1.5 : 1);
    let chips = 0;
    let mult = 0;
    const tally = el.tally;
    tally.classList.remove('preview');
    tally.classList.add('show');
    tally.innerHTML = tallyHtml(result.seam, '0', '0', '');
    const cEl = $('.chips em', tally);
    const mEl = $('.mult em', tally);
    const lEl = $('.label', tally);
    const boardMid = view.cellCenterApp(3.5, 3.5);
    const topY = view.boardRectInApp().y + view.cell * 2.6;
    if (teach) hint('지운 모양이 족보가 되고, 칩 × 배수가 점수예요', 4200);
    let toolBeat = 420;
    let tick = 0;
    for (const st of result.steps) {
      if (job.flushed) break;
      let label = '';
      let beat = 260;
      if (st.src === 'seam') {
        chips = st.chips;
        mult = st.mult;
        label = SEAM_BY_ID[st.seam].how;
        beat = 420;
        if (st.seam !== 'single') {
          view.text(SEAM_BY_ID[st.seam].name, boardMid.x, boardMid.y, { size: 30, color: '#f3ead6', dur: 1100, rise: 14, tag: true });
        }
        if (st.seam === 'perfect') { sfx.perfect(); view.confetti(50); }
        sfx.stitch(2, ev.streak);
      } else if (st.src === 'cells') {
        chips += st.chips;
        label = `지운 칸 ${st.cells}개 × 5`;
      } else if (st.src === 'streak') {
        mult += st.mult;
        label = `연속 ${st.streak}번째 · 배수 +${st.mult}`;
        beat = 320;
        view.text(`연속 ${st.streak}`, boardMid.x, topY, { size: 26, color: '#e2b54a', dur: 900, rise: 20 });
        if (st.streak === 2) teachOnce('streak', '연달아 지우면 배수가 올라가요. 조각 3개 안에 다시 지우면 이어져요', 4000);
      } else if (st.src === 'boss') {
        mult *= st.xmult;
        label = `${R.BOSSES.strict.name} ×${st.xmult}`;
        beat = 320;
      } else {
        const name = TOOLS[st.src].name;
        if (st.chips) { chips += st.chips; fireTool(st.slot, `+${st.chips} 칩`, 'chips'); label = `${name} 칩 +${st.chips}`; }
        if (st.mult) { mult += st.mult; fireTool(st.slot, `+${fmtMult(st.mult)} 배수`, 'mult'); label = `${name} 배수 +${fmtMult(st.mult)}`; }
        if (st.xmult) { mult *= st.xmult; fireTool(st.slot, `×${fmtMult(st.xmult)}`, 'xmult'); label = `${name} 배수 ×${fmtMult(st.xmult)}`; }
        beat = toolBeat;
        toolBeat = Math.max(200, toolBeat * 0.85);
      }
      cEl.textContent = fmt(chips);
      mEl.textContent = fmtMult(mult);
      lEl.textContent = label;
      if (st.chips) bump(cEl.parentNode);
      if (st.mult || st.xmult) bump(mEl.parentNode);
      if (st.xmult) sfx.mult(tick); else if (st.src !== 'seam') sfx.tick(tick);
      tick++;
      await sleep(beat * sp);
    }
    cEl.textContent = fmt(result.chips);
    mEl.textContent = fmtMult(result.mult);

    if (!run || !run.order) { if (tallyJob === job) tallyJob = null; return; } // left the game mid-tally
    // the product counts up in the ribbon, then flies into the order total
    lEl.classList.remove('win');
    lEl.innerHTML = '<span class="total">= 0</span>';
    const totalEl = $('.total', lEl);
    const countMs = job.flushed ? 0 : Math.min(520, 220 + Math.log10(result.score + 1) * 80) * sp;
    const t0 = performance.now();
    while (!job.flushed) {
      const k = Math.min(1, (performance.now() - t0) / Math.max(1, countMs));
      totalEl.textContent = `= ${fmt(result.score * (1 - (1 - k) ** 3))}`;
      if (k >= 1) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    totalEl.textContent = `= ${fmt(result.score)}`;

    const power = Math.log10(Math.max(10, result.score)) - 1;
    view.shake(1.5 + power * 1.4);
    sfx.slam(0.6 + power * 0.4);
    haptic(result.score > 2000 ? [20, 30, 40] : 25);
    if (result.score >= Math.max(1000, run.order.target * 0.5)) flash();
    const tr = el.tally.getBoundingClientRect();
    const sr = el.score.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    view.flyTo(tr.left - ar.left + tr.width / 2, tr.bottom - ar.top - 16, sr.left - ar.left + 30, sr.top - ar.top + 14, '#e2b54a', Math.min(14, 4 + lines.length * 3));
    if (teach) { meta.tallyTaught = true; meta.tutorial = true; store.saveMeta(meta); }
    if (!job.flushed) await sleep(260);
    pendingScore = Math.max(0, pendingScore - result.score);
    if (run && run.order) setBar();
    bump(el.score);
    job.after.forEach((f) => f());
    if (tallyJob === job) {
      tallyJob = null;
      el.tally.classList.remove('show');
      if (run && run.order) el.seamName.textContent = seamLabel(signatureSeam());
      if (hintStage === 2 || hintStage === 1) { hintStage = 3; hint('목표 점수를 넘기면 주문 완료!', 2600); }
    }
  })();
  return job;
}

function flash() {
  const f = document.createElement('div');
  f.className = 'flash';
  app.appendChild(f);
  f.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => f.remove();
}

async function winSequence() {
  hint(null);
  await view.wait(200);
  const mid = view.cellCenterApp(3.5, 3.5);
  view.text('주문 완료', mid.x, mid.y, { size: 40, color: '#e2b54a', dur: 1500, rise: 10, tag: true, weight: 800 });
  sfx.win();
  haptic([30, 40, 30, 40, 60]);
  view.confetti(80);
  const leftLine = run.reward && run.reward.lines.find((l) => l.kind === 'leftover');
  const left = leftLine ? leftLine.coins : 0;
  const cr = el.coins.getBoundingClientRect();
  const ar = app.getBoundingClientRect();
  for (let i = 0; i < left; i++) {
    setTimeout(() => {
      view.flyTo(mid.x, mid.y + view.cell * 4.5, cr.left - ar.left + 8, cr.top - ar.top + 8, '#e7b33a', 2);
      sfx.coin(i);
    }, 450 + i * 110);
  }
  await view.wait(1100 + left * 60);
  busy = false;
  persist();
  showReward();
}

async function failSequence(ev) {
  hint(null);
  await view.wait(250);
  sfx.fail();
  haptic([60, 40, 60]);
  view.shake(3);
  const mid = view.cellCenterApp(3.5, 3.5);
  view.text(ev.reason === 'jam' ? '놓을 자리가 없어요' : '조각이 다 떨어졌어요', mid.x, mid.y, { size: 30, color: '#ff9b8c', dur: 1400, rise: 6 });
  await view.wait(1000);
  busy = false;
  showEnd(false, ev);
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
  on(s, '#collect', once(() => {
    const ev = R.collectReward(run);
    sfx.buy();
    haptic(15);
    persist();
    el.coins.textContent = run.coins;
    bump(el.coins);
    if (ev.some((e) => e.type === 'victory')) { recordRun(true); persist(); showEnd(true); }
    else if (run.phase === 'gift') showGift();
    else showShop();
  }));
}

function nextOrderPreview() {
  const n = R.nextOrderOf(run);
  const boss = n.boss ? R.BOSSES[n.boss] : null;
  return `${kindName(n.orderIdx)}, 목표 <b>${fmt(n.target)}</b>${boss ? ` <span class="boss-note">${boss.name}</span>` : ''}`;
}

function patternCard(pt, i) {
  const seam = SEAM_BY_ID[pt.id];
  const lv = seamLevel(pt.id);
  const now = seamValue(pt.id, lv);
  const nxt = seamValue(pt.id, lv + 1);
  const can = !pt.sold && run.coins >= PATTERN_PRICE;
  return `<div class="card pattern${pt.sold ? ' sold' : ''}">
    <div class="art">${seamIcon(pt.id)}</div>
    <div class="min"><div class="name">${seam.name} 본 <span class="up">Lv.${lv} → ${lv + 1}</span></div>
      <div class="desc">칩 ${now.chips}→${nxt.chips}, 배수 ${now.mult}→${nxt.mult}. ${seam.how}</div></div>
    <button class="btn btn-small ${can ? 'btn-gold' : 'btn-ghost'} price" data-pattern="${i}" ${can ? '' : 'disabled'}>${pt.sold ? '팔림' : `${PATTERN_PRICE}닢`}</button></div>`;
}

function showSeams(back) {
  const counts = (run && run.stats.seamCounts) || {};
  const sig = run ? signatureSeam() : null;
  const html = `<h2>솔기 족보</h2>
    <p class="lead">지울 때마다 해당하는 족보 중 가장 비싼 하나로 점수를 매겨요. 홑솔기는 자라지 않으니, 본으로 다른 족보를 키워 노려 보세요.</p>
    <div class="seam-table">${SEAMS.map((sm) => {
      const lv = seamLevel(sm.id);
      const v = seamValue(sm.id, lv);
      return `<div class="seam-row${sm.id === sig && lv > 1 ? ' hot' : ''}"><span class="ic">${seamIcon(sm.id)}</span><span class="nm">${sm.name}<small>${sm.fixed ? '레벨 없음' : `Lv.${lv}`}</small></span>
        <span class="val"><span class="c">${v.chips}</span> × <span class="m">${v.mult}</span></span>
        <span class="cond">${sm.how}${run && counts[sm.id] ? ` <span class="cnt">이번 판 ${counts[sm.id]}번</span>` : ''}</span></div>`;
    }).join('')}</div>`;
  openModal(html, { close: () => (back ? back() : resumePhase()) });
}

function showShop() {
  hint(null);
  renderHud();
  const sh = run.shop;
  const full = run.tools.length >= MAX_TOOLS;
  const html = `<div class="shop-head"><div><div class="eyebrow left">${dayLabel()}</div><h2>장터</h2></div>
      <span class="coin-pill">${glyph.coin}<span>${run.coins}</span></span></div>
    <div class="cards">${sh.offers.map((of, i) => {
      const price = TOOLS[of.id].price;
      const can = !of.sold && !full && run.coins >= price;
      const label = of.sold ? '팔림' : full ? '칸 없음' : `${price}닢`;
      return toolCard(of.id, { sold: of.sold, action: `<button class="btn btn-small ${can ? 'btn-gold' : 'btn-ghost'} price" data-buy="${i}" ${can ? '' : 'disabled'}>${label}</button>` });
    }).join('')}</div>
    <div class="section-label"><span><b>바느질 본</b> 사면 그 족보가 한 단계 올라요</span><button class="link" id="open-seams">족보표</button></div>
    <div class="cards">${(sh.patterns || []).map((pt, i) => patternCard(pt, i)).join('')}</div>
    <div class="row-actions"><button class="btn btn-ghost btn-small" id="reroll" ${run.coins < sh.rerollCost ? 'disabled' : ''}>${glyph.reroll}도구와 본 새로 진열 (${sh.rerollCost}닢)</button></div>
    <div class="section-label"><span>내 도구 ${run.tools.length}/${MAX_TOOLS}</span><span>눌러서 팔기</span></div>
    <div class="owned" id="owned"></div>
    <div class="actions"><div class="next-order"><small>다음 주문</small> ${nextOrderPreview()}</div><button class="btn btn-seal" id="leave" data-autofocus>주문 받으러 가기</button></div>`;
  const s = openModal(html);
  const owned = $('#owned', s);
  owned.dataset.sig = '';
  renderTools(owned, run.tools, {
    sellTags: true,
    onTap: (i, b) => {
      const t = run.tools[i];
      const btn = document.createElement('button');
      btn.className = 'btn btn-small btn-seal tip-action';
      btn.textContent = `${sellPrice(t)}닢에 팔기`;
      btn.addEventListener('click', once(() => {
        R.sell(run, i);
        sfx.coin(0);
        haptic(10);
        persist();
        closeTip();
        showShop();
      }));
      showToolTip(t, b, btn);
    },
  });
  on(s, '[data-buy]', once((e, n) => {
    const i = +n.dataset.buy;
    const id = sh.offers[i].id;
    const res = R.buy(run, i);
    if (!res.ok) { toast(res.reason === 'full' ? '도구 칸이 가득 찼어요. 먼저 하나를 파세요' : '엽전이 모자라요'); showShop(); return; }
    discover(id);
    sfx.buy();
    haptic(15);
    persist();
    showShop();
    fireTool(run.tools.length - 1, '획득!', 'xmult');
  }));
  on(s, '[data-pattern]', once((e, n) => {
    const res = R.buyPattern(run, +n.dataset.pattern);
    if (!res.ok) { toast('엽전이 모자라요'); showShop(); return; }
    sfx.buy();
    haptic(15);
    persist();
    showShop();
    toast(`${SEAM_BY_ID[res.seam].name} 레벨 ${res.level}`, 1800);
    res.grown.forEach((slot) => fireTool(slot, '성장!', 'xmult'));
  }));
  on(s, '#open-seams', () => showSeams(() => showShop()));
  on(s, '#reroll', once(() => {
    if (R.reroll(run).ok) { sfx.coin(2); persist(); }
    showShop();
  }));
  on(s, '#leave', once(() => {
    R.leaveShop(run);
    persist();
    showIntro();
  }));
}

// ---------- end of run ----------
/** Writes records immediately (before any animation) so closing the app can't lose them. */
function recordRun(victory) {
  endInfo = writeRecords(meta, run, { victory });
  store.saveMeta(meta);
}

function showEnd(victory, ev) {
  if (!endInfo) endInfo = { newDay: false, newHand: false };
  const st = run.stats;
  const grid = `<div class="stat-grid">
    <div><small>도달</small><b>${dayLabel()}</b>${endInfo.newDay ? '<span class="new">신기록</span>' : ''}</div>
    <div><small>완료한 주문</small><b>${st.orders}</b></div>
    <div><small>최고 한 땀</small><b>${fmt(st.bestHand)}</b>${endInfo.newHand ? '<span class="new">신기록</span>' : ''}</div>
    <div><small>최고 연속</small><b>${st.bestStreak}</b></div></div>`;
  const unlockedNote = endInfo.unlocked && endInfo.unlocked.length
    ? `<div class="unlock-note">${endInfo.unlocked.map((id) => `<span class="art">${toolArt(TOOLS[id])}</span>`).join('')}<div><b>새 도구가 장터에 나와요</b><span>${endInfo.unlocked.map((id) => TOOLS[id].name).join(', ')}</span></div></div>`
    : '';
  const quilt = `<figure class="quilt"><canvas id="quilt" aria-label="이번 판의 조각보"></canvas><figcaption>이번 판의 조각보</figcaption></figure>`;
  const share = run.mode === 'daily' ? '<button class="btn btn-ghost" id="share">결과 복사하기</button>' : '';
  let html;
  if (victory) {
    view.confetti(120);
    sfx.perfect();
    html = `<div class="eyebrow">${R.DAYS}일의 장이 끝났어요</div><h2>보자기 완성</h2>
      <p class="lead">손님들이 모두 만족했어요. 밤을 새워 더 큰 주문에 도전할 수도 있어요.</p>
      <div class="end-body">${quilt}${grid}</div>${unlockedNote}
      <div class="actions"><button class="btn btn-gold" id="endless" data-autofocus>밤샘 작업 이어가기</button>${share}
      <button class="btn btn-ghost" id="home">처음으로</button></div>`;
  } else {
    const short = Math.max(0, ev ? ev.short : 0);
    const near = short <= run.order.target * 0.1;
    html = `<div class="eyebrow">${dayLabel()} · ${kindName(run.order.kind)}</div><h2>${near ? '아깝다!' : '주문 실패'}</h2>
      <p class="shortfall">목표까지 <b>${fmt(short)}</b>점 모자랐어요</p>
      <div class="end-body">${quilt}${grid}</div>${unlockedNote}
      <div class="actions"><button class="btn btn-seal" id="again" data-autofocus>${run.mode === 'daily' ? '오늘의 의뢰 다시' : '다시 짓기'}</button>${share}
      <button class="btn btn-ghost" id="home">처음으로</button></div>`;
  }
  const s = openModal(html, { center: true });
  requestAnimationFrame(() => drawQuilt($('#quilt', s), run));
  on(s, '#again', once(() => { endInfo = null; startRun(run.mode); }));
  on(s, '#home', once(() => { endInfo = null; titleScreen(); }));
  on(s, '#endless', once(() => {
    endInfo = null;
    R.continueEndless(run);
    persist();
    showShop();
  }));
  on(s, '#share', (e, n) => {
    const d = new Date();
    const text = shareText(run, `${d.getMonth() + 1}월 ${d.getDate()}일`);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.className = 'share-text';
      ta.value = text;
      ta.readOnly = true;
      n.after(ta);
      ta.select();
      toast('복사가 막혀 있어요. 글을 길게 눌러 복사하세요', 2600);
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast('결과를 복사했어요'), fallback);
    } catch { fallback(); }
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
      if (after) after();
      unlock();
      sfx.ui();
    });
  };
  bind('sw-sound', 'sound', () => { setEnabled(settings.sound); setAmbient(settings.sound && settings.ambient !== false); });
  bind('sw-ambient', 'ambient', () => setAmbient(settings.sound && settings.ambient !== false));
  bind('sw-haptics', 'haptics', () => haptic(20));
  bind('sw-fast', 'fast', () => { view.speed = speed(); });
}

function showPause() {
  if (!run || busy || !el.modal.hidden) return;
  const html = `<div class="eyebrow">바늘을 잠시 꽂아 두고</div><h2>잠시 쉬기</h2>
    ${switchRow('sw-sound', '소리', settings.sound)}${switchRow('sw-ambient', '배경 가락', settings.ambient !== false)}${switchRow('sw-haptics', '진동', settings.haptics)}${switchRow('sw-fast', '빠른 연출', settings.fast)}
    <div class="actions"><button class="btn btn-seal" id="resume" data-autofocus>계속하기</button>
    <button class="btn btn-ghost" id="how">하는 방법</button>
    <button class="btn btn-ghost" id="quit">처음으로 (진행 저장됨)</button></div>`;
  const s = openModal(html, { center: true, close: () => resumePhase() });
  bindSwitches(s);
  on(s, '#resume', () => resumePhase());
  on(s, '#how', () => showHow(() => { closeModal(); showPause(); }));
  on(s, '#quit', () => { persist(); titleScreen(); });
}

function showHow(back) {
  const html = `<div class="eyebrow">하는 방법</div><h2>조각보 짓기</h2>
    <div class="how">
      <p><b>조각 놓기</b> — 아래 조각을 끌어 수틀에 놓아요. 놓을 때마다 남은 조각이 하나씩 줄어요.</p>
      <p><b>솔기 꿰매기</b> — 가로나 세로 한 줄을 채우면 바늘이 지나가며 줄이 사라지고 점수가 나요.</p>
      <p><b>솔기 족보</b> — 지운 모양이 족보가 돼요. 홑솔기(한 줄), 겹솔기(같은 방향 두 줄), 십자솔기(가로+세로), 단색 솔기(한 색으로 채운 줄), 세겹솔기(세 줄 이상), 쌍단색, 판 비움. 족보마다 칩과 배수가 정해져 있어요.</p>
      <p><b>칩 × 배수</b> — 족보의 칩에 지운 칸마다 5를 더하고, 연달아 지우면 배수가 올라요. 도구가 칩과 배수를 더 키워요.</p>
      <p><b>주문</b> — 조각이 떨어지기 전에 목표 점수를 넘기면 완료. 놓을 데가 없으면 「조각 바꾸기」로 트레이를 새로 받아요.</p>
      <p><b>장터</b> — 품삯으로 바느질 도구와 바느질 본을 사요. 본은 족보 레벨을 올려 줘요. 한 족보를 키워 빌드를 만들어 보세요. 엽전을 모아 두면 ${R.INTEREST_PER}닢마다 이자가 1닢(최대 ${R.INTEREST_CAP}닢) 붙어요.</p>
    </div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>알겠어요</button></div>`;
  const done = () => (back ? back() : closeModal());
  const s = openModal(html, { close: done });
  on(s, '#back', done);
}

/** Compact codex tile: icon, name and one line; locked tiles show what unlocks them. */
function codexCard(id) {
  const def = TOOLS[id];
  const seen = meta.discovered.includes(id) && isUnlocked(id, meta);
  const p = !isUnlocked(id, meta) && progress(id, meta);
  const desc = seen ? toolDesc(makeTool(id)) : p ? `${p.need} (${p.have}/${p.goal})` : '아직 못 만났어요';
  return `<div class="codex-card r${def.rarity}${seen ? '' : ' locked'}"><span class="art">${toolArt(def)}</span>
    <b>${seen ? def.name : p ? '잠김' : '???'}</b><span class="desc">${desc}</span></div>`;
}

function showCodex() {
  const lockedN = lockedIds(meta).length;
  const html = `<div class="eyebrow">도구 도감 ${meta.discovered.length}/${TOOL_IDS.length}</div><h2>바느질 도구</h2>
    ${lockedN ? `<p class="lead">잠긴 도구 ${lockedN}개는 조건을 채우면 장터에 나와요.</p>` : ''}
    <div class="codex">${TOOL_IDS.map((id) => codexCard(id)).join('')}</div>`;
  openModal(html, { close: closeModal });
}

function showRecords() {
  const days = Object.entries(meta.daily).slice(-7).reverse();
  const html = `<div class="eyebrow">공방 일지</div><h2>지금까지</h2>
    <div class="stat-grid">
      <div><small>지은 판</small><b>${meta.runs}</b></div>
      <div><small>완성한 보자기</small><b>${meta.wins}</b></div>
      <div><small>최고 도달</small><b>${meta.bestDay ? bestDayLabel(meta.bestDay) : '-'}</b></div>
      <div><small>최고 한 땀</small><b>${fmt(meta.bestHand)}</b></div>
      <div><small>최고 연속</small><b>${meta.bestStreak}</b></div>
      <div><small>꿰맨 솔기</small><b>${fmt(meta.clears)}</b></div>
    </div>
    ${days.length ? `<div class="section-label"><span>오늘의 의뢰</span><span>${meta.dailyStreak ? `${meta.dailyStreak.count}일 연속` : ''}</span></div>
    <div class="daily-list">${days.map(([k, v]) => `<div><span>${k.split('-').slice(1).join('/')}</span><b>${v.label}</b></div>`).join('')}</div>` : ''}`;
  openModal(html, { center: true, close: closeModal });
}

// ---------- title buttons ----------
function confirmReplace(title, go) {
  const s = openModal(`<h2>${title}</h2><p class="lead">이어 짓던 판은 사라져요. 그 판의 기록은 일지에 남아요.</p>
    <div class="row-actions"><button class="btn btn-ghost" id="no">취소</button><button class="btn btn-seal" id="yes" data-autofocus>시작</button></div>`, { center: true, close: closeModal });
  on(s, '#no', closeModal);
  on(s, '#yes', once(() => {
    // the abandoned run still counts toward records and unlock progress
    const old = store.loadRun();
    if (R.isValidSave(old)) { writeRecords(meta, R.migrate(old), { victory: false }); store.saveMeta(meta); }
    store.clearRun();
    go();
  }));
}
const hasLiveSave = () => { const s = store.loadRun(); return R.isValidSave(s) && s.phase !== 'over' ? s : null; };

on(document, '#btn-continue', () => continueRun());
on(document, '#btn-new', () => (hasLiveSave() ? confirmReplace('새로 지을까요?', () => startRun('normal')) : startRun('normal')));
on(document, '#btn-daily', () => {
  const save = hasLiveSave();
  const { key } = R.dailySeed();
  if (save && save.mode === 'daily' && save.dailyKey === key) { continueRun(); return; }
  if (save) { confirmReplace('오늘의 의뢰를 시작할까요?', () => startRun('daily')); return; }
  startRun('daily');
});
on(document, '#btn-codex', () => showCodex());
on(document, '#btn-records', () => showRecords());
on(document, '#btn-how', () => showHow());
on(document, '#btn-sound', (e, n) => {
  settings.sound = !settings.sound;
  setEnabled(settings.sound);
  setAmbient(settings.sound && settings.ambient !== false);
  store.saveSettings(settings);
  n.textContent = settings.sound ? '소리 켬' : '소리 끔';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  else resumeAudio();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && run && run.phase === 'play' && el.modal.hidden) showPause();
});

if (document.fonts) document.fonts.ready.then(() => view.resize());

// Artifact viewer hot updates: carry the live run across a republish and drop the player back in.
function boot(data) {
  const carried = data && data.run;
  if (carried && R.isValidSave(carried)) {
    store.saveRun(R.migrate(carried));
    continueRun();
    return;
  }
  titleScreen();
}
const hot = window.claude && window.claude.hot;
try { if (hot && hot.snapshot) hot.snapshot(() => ({ run: run && run.phase !== 'over' ? run : null })); } catch { /* optional */ }
if (hot && hot.ready) hot.ready(boot);
else boot(hot && hot.data ? hot.data : {});

// handle for automated tests
window.__bojagi = { get run() { return run; }, view, R, shapes: SHAPE_BY_ID };
