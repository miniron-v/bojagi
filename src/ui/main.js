// Controller: wires core run state ↔ view ↔ DOM HUD/sheets, persistence and sound.
// Input stays live during score tallies; only order win/fail sequences block the board.
import * as R from '../core/run.js';
import { TOOLS, TOOL_IDS, MAX_TOOLS, RARITY_NAME, toolDesc, sellPrice } from '../core/tools.js';
import { SHAPE_BY_ID } from '../core/shapes.js';
import { View, trayFits } from './view.js';
import { toolArt, glyph } from './icons.js';
import { clothTexture } from './art.js';
import { sfx, unlock, setEnabled, resumeAudio, setAmbient } from './audio.js';
import { createTitleArt } from './title-art.js';
import { drawQuilt, shareText } from './quilt.js';
import * as store from './store.js';
import { lockedIds, isUnlocked, progress } from '../core/unlocks.js';

const $ = (s, root = document) => root.querySelector(s);
const app = $('#app');
const el = {
  title: $('#title'), game: $('#game'), modal: $('#modal'), sheet: $('#sheet'), toast: $('#toast'),
  day: $('#hud-day'), dayMax: $('#hud-daymax'), kind: $('#hud-kind'), score: $('#hud-score'), target: $('#hud-target'),
  fill: $('#hud-fill'), ghost: $('#hud-ghost'), bar: $('#hud-bar'), patches: $('#hud-patches'), discards: $('#hud-discards'),
  coins: $('#hud-coins'), boss: $('#hud-boss'), tools: $('#hud-tools'), tally: $('#tally'), hint: $('#hint'),
  discardBtn: $('#btn-discard'), pause: $('#btn-pause'), statPatches: $('#stat-patches'), streak: $('#hud-streak'),
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
const speed = () => (settings.fast ? 0.55 : 1);

setEnabled(settings.sound);
setAmbient(settings.sound && settings.ambient !== false);
app.style.setProperty('--cloth', `url(${clothTexture()})`);
el.pause.innerHTML = glyph.pause;
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

// ---------- formatting ----------
const fmt = (n) => Math.floor(n).toLocaleString('ko-KR');
const fmtMult = (m) => (Math.round(m * 10) / 10).toLocaleString('ko-KR');
const kindName = (o) => R.ORDER_KINDS[o].name;
const dayName = (d) => (d > R.DAYS ? `밤샘 ${d - R.DAYS}일째` : `장날 ${d}`);
const dayLabel = () => dayName(run.day);

// ---------- HUD ----------
function toolBadge(t) {
  if (t.id === 'iron') return `+${t.data.mult}`;
  if (t.id === 'silk') return `+${t.data.chips}`;
  return null;
}

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
  el.kind.classList.toggle('boss', o.kind === 2);
  el.target.textContent = fmt(o.target);
  el.patches.textContent = o.patchesLeft;
  el.statPatches.classList.toggle('low', o.patchesLeft <= 3);
  el.discards.textContent = o.discardsLeft;
  el.coins.textContent = run.coins;
  el.discardBtn.disabled = o.discardsLeft <= 0 || run.phase !== 'play';
  el.discardBtn.classList.toggle('urge', !!o.stuck && o.discardsLeft > 0);
  if (o.boss) {
    const b = R.BOSSES[o.boss];
    el.boss.hidden = false;
    el.boss.innerHTML = `<span class="seal">${b.name[0]}</span><b>${b.name}</b><span class="desc">${b.desc}</span>`;
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

// ---------- modal ----------
function syncInput() {
  view.enabled = !!run && run.phase === 'play' && !busy && el.modal.hidden && !el.game.hidden;
}

function openModal(html, { center = false } = {}) {
  closeTip();
  view.cancelDrag();
  el.modal.classList.toggle('center', center);
  el.sheet.innerHTML = html;
  el.sheet.scrollTop = 0;
  el.modal.hidden = false;
  // swallow the tail of a double tap that opened this sheet
  el.sheet.style.pointerEvents = 'none';
  setTimeout(() => { el.sheet.style.pointerEvents = ''; }, 280);
  syncInput();
  const first = el.sheet.querySelector('[data-autofocus]');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  return el.sheet;
}
function closeModal() {
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

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return R.dailySeed(d).key;
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
    const what = save.phase === 'victory' ? '보자기 완성 · 밤샘 작업 가능' : `${dayName(save.day)} · ${R.ORDER_KINDS[save.orderIdx].name}`;
    $('.sub', cont).textContent = what + (save.mode === 'daily' ? ' · 오늘의 의뢰' : '');
  }
  const { key } = R.dailySeed();
  const today = meta.daily[key];
  const ds = meta.dailyStreak;
  const streakOn = ds && (ds.last === key || ds.last === yesterdayKey()) && ds.count > 0;
  $('.sub', $('#btn-daily')).textContent = today ? `오늘 기록: ${today.label}` : '모두가 같은 판을 짓는 하루';
  const stamp = $('#daily-stamp');
  stamp.hidden = !streakOn;
  if (streakOn) stamp.textContent = `${ds.count}일 연속`;
  $('#codex-count').textContent = `${meta.discovered.length}/${TOOL_IDS.length}`;
  $('#best-line').textContent = meta.runs
    ? `최고 ${meta.bestDay > R.DAYS ? `밤샘 ${meta.bestDay - R.DAYS}일` : `장날 ${meta.bestDay || 1}`} · 최고 한 땀 ${fmt(meta.bestHand)} · 완성 ${meta.wins}회`
    : '조각을 이어 손님의 보자기를 지어 주세요';
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
  view.setTray(run.tray, trayFits(run.board, run.tray), false);
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
  let desc = inst ? toolDesc(inst) : def.desc({ data: def.init ? def.init() : {} });
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
    <p class="lead">바느질 도구는 칩과 배수를 키워 줘요.<br>도구는 ${MAX_TOOLS}개까지 들 수 있고, 장터에서 사고팔 수 있어요.</p>
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
    if (!meta.toolTip) { meta.toolTip = true; store.saveMeta(meta); pendingHint = '위의 도구를 누르면 효과를 볼 수 있어요'; }
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
    view.text(`${dayLabel()} · ${kindName(o.kind)}`, mid.x, mid.y - view.cell * 0.9, { size: 24, color: '#a3abc8', dur: 1300, rise: 8, pop: 1.1 });
    view.text(`목표 ${fmt(o.target)}`, mid.x, mid.y + view.cell * 0.2, { size: 40, color: '#e7b33a', dur: 1300, rise: 8, pop: 1.3, delay: 80 });
    sfx.ui();
    return;
  }
  const boss = R.BOSSES[o.boss];
  const html = `<div class="eyebrow">${dayLabel()}${run.day <= R.DAYS ? ` / ${R.DAYS}` : ''}</div><h2>${kindName(o.kind)}</h2>
    <div class="big-target"><span class="num">${fmt(o.target)}</span><small>점 이상 지어 주세요</small></div>
    <div class="facts"><span class="fact">조각 <b>${o.patchesLeft}</b></span><span class="fact">바꾸기 <b>${o.discardsLeft}</b></span><span class="fact">보상 <b>${R.ORDER_KINDS[o.kind].reward}</b>닢</span></div>
    <div class="boss-card"><span class="seal">${boss.name[0]}</span><div><b>${boss.name}</b><span>${boss.desc}</span></div></div>
    ${dayTrack()}
    <div class="actions"><button class="btn btn-seal" id="go" data-autofocus>바느질 시작</button></div>`;
  const s = openModal(html, { center: true });
  on(s, '#go', once(() => { closeModal(); begin(); }));
}

function begin() {
  const ev = R.beginOrder(run);
  persist();
  view.setTray(run.tray, trayFits(run.board, run.tray));
  renderHud();
  syncInput();
  if (!meta.tutorial && run.day === 1 && run.orderIdx === 0) { hintStage = 1; hint('조각을 끌어 수틀에 놓으세요'); }
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
view.handlers.pickup = () => { unlock(); sfx.pick(); haptic(6); closeTip(); lastHoverKey = null; };
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
      el.tally.innerHTML = tallyHtml(fmt(pv.chips), fmtMult(pv.mult), pv.completes ? '주문 완료!' : `+${fmt(pv.score)}`, pv.completes);
    }
    const key = `${h.i}:${h.r}:${h.c}`;
    if (key !== lastHoverKey) { lastHoverKey = key; sfx.hover(pv.lines.length); }
  } else {
    setStreak(o.streak, pv.streakBreaks ? 'warn' : '');
    if (!tallyJob) el.tally.classList.remove('show', 'preview');
    lastHoverKey = null;
  }
}

function tallyHtml(chips, mult, label, win = false) {
  return `<span class="chips"><small>칩</small><em>${chips}</em></span><span class="x">×</span><span class="mult"><small>배수</small><em>${mult}</em></span><span class="label${win ? ' win' : ''}">${label}</span>`;
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

async function playEvents(events) {
  for (const ev of events) {
    switch (ev.type) {
      case 'place':
        lastPlaced = ev;
        view.placePiece(ev);
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
      case 'tray':
        view.setTray(run.tray, trayFits(run.board, run.tray));
        break;
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
    view.setTray(run.tray, trayFits(run.board, run.tray), false);
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
  const mid = view.cellCenterApp(3.5, 3.5);
  const cross = lines.some((l) => l.type === 'row') && lines.some((l) => l.type === 'col');
  if (lines.length >= 2) {
    const word = ['', '', '두 줄', '세 줄', '네 줄', '다섯 줄'][Math.min(5, lines.length)];
    view.text(`${word}${cross ? ' 교차' : ''}!`, mid.x, mid.y + view.cell * 1.6, { size: 34 + lines.length * 4, color: '#f4ead3', dur: 1000, pop: 1.5 });
    haptic([15, 30, 25]);
  }
  tallyJob = startTally(ev);
}

/** Balatro-style tally. Interruptible: a new clear flushes the old one straight to its slam. */
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
    const sp = speed() * (teach ? 2 : 1);
    const steps = result.steps;
    let chips = 0;
    let mult = 0;
    const tally = el.tally;
    tally.classList.remove('preview');
    tally.classList.add('show');
    tally.innerHTML = tallyHtml('0', '0', '');
    const cEl = $('.chips em', tally);
    const mEl = $('.mult em', tally);
    const lEl = $('.label', tally);
    const boardMid = view.cellCenterApp(3.5, 3.5);
    const topY = view.boardRectInApp().y + view.cell * 1.2;
    if (teach) hint('칩 × 배수 = 점수! 도구가 칩과 배수를 키워요', 3600);
    const stepMs = Math.max(60, Math.min(120, 900 / steps.length)) * sp;
    let tick = 0;
    for (const st of steps) {
      if (job.flushed) break;
      let label = '';
      if (st.src === 'lines') { chips = st.chips; mult = st.mult; label = `${st.lines}줄 솔기 · ${st.cells}칸`; }
      else if (st.src === 'streak') {
        mult += st.mult;
        label = `연속 ${st.streak}`;
        view.text(`연속 ${st.streak}!`, boardMid.x, topY, { size: 30, color: '#e7b33a', dur: 900 });
      } else if (st.src === 'perfect') {
        chips += st.chips;
        label = '판을 다 비웠어요!';
        sfx.perfect();
        view.text('판 비움!', boardMid.x, boardMid.y, { size: 46, color: '#f4ead3', dur: 1200, pop: 1.6 });
        view.confetti(40);
      } else if (st.src === 'mono') {
        mult *= st.xmult;
        label = '단색 솔기 ×2';
        view.text('단색 솔기!', boardMid.x, boardMid.y - view.cell * 1.5, { size: 32, color: '#f5c75a', dur: 900 });
      } else if (st.src === 'boss') {
        mult *= st.xmult;
        label = '깐깐한 눈 ×0.5';
      } else {
        if (st.chips) { chips += st.chips; fireTool(st.slot, `+${st.chips} 칩`, 'chips'); }
        if (st.mult) { mult += st.mult; fireTool(st.slot, `+${fmtMult(st.mult)} 배수`, 'mult'); }
        if (st.xmult) { mult *= st.xmult; fireTool(st.slot, `×${fmtMult(st.xmult)}`, 'xmult'); }
        label = TOOLS[st.src].name;
      }
      cEl.textContent = fmt(chips);
      mEl.textContent = fmtMult(mult);
      lEl.textContent = label;
      if (st.chips) bump(cEl.parentNode);
      if (st.mult || st.xmult) bump(mEl.parentNode);
      if (st.xmult) sfx.mult(tick); else sfx.tick(tick);
      tick++;
      await sleep(stepMs);
    }
    cEl.textContent = fmt(result.chips);
    mEl.textContent = fmtMult(result.mult);
    if (!job.flushed) await sleep(120 * sp);

    if (!run || !run.order) { if (tallyJob === job) tallyJob = null; return; } // left the game mid-tally
    // slam
    const power = Math.log10(Math.max(10, result.score)) - 1;
    const size = Math.min(64, 30 + power * 10);
    view.text(`+${fmt(result.score)}`, boardMid.x, boardMid.y, { size, color: '#e7b33a', dur: 800, rise: 20, pop: 1.6 });
    view.shake(1.5 + power * 1.4);
    sfx.slam(0.6 + power * 0.4);
    haptic(result.score > 2000 ? [20, 30, 40] : 25);
    if (run && run.order && result.score >= Math.max(1000, run.order.target * 0.5)) flash();
    const sr = el.score.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    view.flyTo(boardMid.x, boardMid.y, sr.left - ar.left + 30, sr.top - ar.top + 14, '#e7b33a', Math.min(14, 4 + lines.length * 3));
    if (teach) { meta.tallyTaught = true; meta.tutorial = true; store.saveMeta(meta); }
    if (!job.flushed) await sleep(380);
    pendingScore = Math.max(0, pendingScore - result.score);
    if (run && run.order) setBar();
    bump(el.score);
    job.after.forEach((f) => f());
    if (tallyJob === job) {
      tallyJob = null;
      el.tally.classList.remove('show');
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
  view.text('주문 완료!', mid.x, mid.y, { size: 52, color: '#f4ead3', dur: 1400, pop: 1.4, rise: 10 });
  sfx.win();
  haptic([30, 40, 30, 40, 60]);
  view.confetti(80);
  const left = Math.min(5, run.order.patchesLeft);
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
  let day = run.day;
  let o = run.orderIdx + 1;
  if (o >= R.ORDERS_PER_DAY) { o = 0; day += 1; }
  const boss = o === 2 ? R.BOSSES[day <= R.DAYS ? run.bosses[day - 1] : R.BOSS_IDS[(day * 7) % R.BOSS_IDS.length]] : null;
  return `${dayName(day)} · ${R.ORDER_KINDS[o].name} · 목표 <b>${fmt(R.targetFor(day, o))}</b>${boss ? `<br><span class="boss-note">${boss.name}: ${boss.desc}</span>` : ''}`;
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
    <div class="row-actions"><button class="btn btn-ghost btn-small" id="reroll" ${run.coins < sh.rerollCost ? 'disabled' : ''}>${glyph.reroll}새로 진열 · ${sh.rerollCost}닢</button></div>
    <div class="section-label"><span>내 도구 ${run.tools.length}/${MAX_TOOLS}</span><span>눌러서 팔기</span></div>
    <div class="owned" id="owned"></div>
    <div class="next-order"><small>다음 주문</small><div>${nextOrderPreview()}</div></div>
    <div class="actions"><button class="btn btn-seal" id="leave" data-autofocus>주문 받으러 가기</button></div>`;
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
  const before = new Set(lockedIds(meta));
  const st = run.stats;
  const reachedDay = run.day;
  endInfo = { newDay: reachedDay > meta.bestDay, newHand: st.bestHand > meta.bestHand };
  meta.bestDay = Math.max(meta.bestDay, reachedDay);
  meta.bestOrders = Math.max(meta.bestOrders, st.orders);
  meta.bestHand = Math.max(meta.bestHand, st.bestHand);
  meta.bestStreak = Math.max(meta.bestStreak, st.bestStreak);
  const rep = run.reported || {};
  for (const k of ['clears', 'monos', 'crosses', 'triples', 'perfects']) {
    meta[k] = (meta[k] || 0) + (st[k] || 0) - (rep[k] || 0);
    rep[k] = st[k] || 0;
  }
  run.reported = rep;
  meta.maxCoins = Math.max(meta.maxCoins || 0, st.maxCoins || 0, run.coins);
  if (victory && !run.winRecorded) { meta.wins += 1; run.winRecorded = true; }
  if (run.mode === 'daily' && run.dailyKey) {
    const prev = meta.daily[run.dailyKey];
    const k = st.orders * 1e7 + Math.min(st.bestHand, 9999999);
    if (!prev || k > prev.k) meta.daily[run.dailyKey] = { k, label: victory || st.orders >= 12 ? '완성' : `주문 ${st.orders}개` };
    const keys = Object.keys(meta.daily);
    if (keys.length > 14) keys.slice(0, keys.length - 14).forEach((key) => delete meta.daily[key]);
    const ds = meta.dailyStreak || { last: null, count: 0 };
    if (ds.last !== run.dailyKey) {
      ds.count = ds.last === yesterdayKey() ? ds.count + 1 : 1;
      ds.last = run.dailyKey;
    }
    meta.dailyStreak = ds;
  }
  endInfo.unlocked = [...before].filter((id) => isUnlocked(id, meta));
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
  const s = openModal(html, { center: true });
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
      <p><b>칩 × 배수</b> — 지운 칸이 칩, 지운 줄 수의 제곱과 연속 횟수가 배수예요. 두 줄을 한 번에 지우면 배수 4, 세 줄이면 9. 한 줄이 한 색이면 단색 솔기 ×2.</p>
      <p><b>주문</b> — 조각이 떨어지기 전에 목표 점수를 넘기면 완료. 놓을 데가 없으면 「조각 바꾸기」로 트레이를 새로 받아요.</p>
      <p><b>장터</b> — 품삯으로 바느질 도구를 사요. 도구 조합이 점수 엔진이에요. 엽전을 모아 두면 5닢마다 이자가 1닢 붙어요.</p>
    </div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>알겠어요</button></div>`;
  const s = openModal(html);
  on(s, '#back', () => (back ? back() : closeModal()));
}

function showCodex() {
  const lockedN = lockedIds(meta).length;
  const html = `<div class="eyebrow">도구 도감 ${meta.discovered.length}/${TOOL_IDS.length}</div><h2>바느질 도구</h2>
    ${lockedN ? `<p class="lead">잠긴 도구 ${lockedN}개는 조건을 채우면 장터에 나와요.</p>` : ''}
    <div class="cards">${TOOL_IDS.map((id) => toolCard(id, { locked: !meta.discovered.includes(id) || !isUnlocked(id, meta) })).join('')}</div>
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>닫기</button></div>`;
  const s = openModal(html);
  on(s, '#back', closeModal);
}

function showRecords() {
  const days = Object.entries(meta.daily).slice(-7).reverse();
  const html = `<div class="eyebrow">공방 일지</div><h2>지금까지</h2>
    <div class="stat-grid">
      <div><small>지은 판</small><b>${meta.runs}</b></div>
      <div><small>완성한 보자기</small><b>${meta.wins}</b></div>
      <div><small>최고 도달</small><b>${meta.bestDay > R.DAYS ? `밤샘 ${meta.bestDay - R.DAYS}일` : `장날 ${meta.bestDay || '-'}`}</b></div>
      <div><small>최고 한 땀</small><b>${fmt(meta.bestHand)}</b></div>
      <div><small>최고 연속</small><b>${meta.bestStreak}</b></div>
      <div><small>꿰맨 솔기</small><b>${fmt(meta.clears)}</b></div>
    </div>
    ${days.length ? `<div class="section-label"><span>오늘의 의뢰</span><span>${meta.dailyStreak ? `${meta.dailyStreak.count}일 연속` : ''}</span></div>
    <div class="daily-list">${days.map(([k, v]) => `<div><span>${k.split('-').slice(1).join('/')}</span><b>${v.label}</b></div>`).join('')}</div>` : ''}
    <div class="actions"><button class="btn btn-seal" id="back" data-autofocus>닫기</button></div>`;
  const s = openModal(html, { center: true });
  on(s, '#back', closeModal);
}

// ---------- title buttons ----------
function confirmReplace(title, go) {
  const s = openModal(`<h2>${title}</h2><p class="lead">이어 짓던 판은 사라져요.</p>
    <div class="row-actions"><button class="btn btn-ghost" id="no">취소</button><button class="btn btn-seal" id="yes" data-autofocus>시작</button></div>`, { center: true });
  on(s, '#no', closeModal);
  on(s, '#yes', once(() => { store.clearRun(); go(); }));
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
