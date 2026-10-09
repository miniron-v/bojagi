// Synthesized sound: Karplus–Strong plucks give a gayageum-like voice; everything else is
// tiny oscillator/noise recipes. No audio files.
let ctx = null;
let master = null;
let enabled = true;
const cache = new Map();

// Pentatonic (평조-like) scale degrees in semitones; streaks climb this ladder.
const SCALE = [0, 2, 5, 7, 9];
const BASE_HZ = 196; // G3

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.9 : 0;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.9 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
    } catch { ctx = null; return; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function ready() {
  return ctx && enabled && ctx.state === 'running';
}

function ksBuffer(freq, dur = 1.6, bright = 0.5) {
  const key = `${Math.round(freq)}:${bright}`;
  if (cache.has(key)) return cache.get(key);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * bright);
  let p = 0;
  let last = 0;
  const decay = 0.996;
  for (let i = 0; i < len; i++) {
    const cur = ring[p];
    const nextS = ring[(p + 1) % period];
    // lowpass averaging; `bright` keeps more of the high partials
    const v = decay * ((1 - bright * 0.5) * 0.5 * (cur + nextS) + bright * 0.5 * cur);
    ring[p] = v;
    out[i] = cur * 0.7 + last * 0.3;
    last = cur;
    p = (p + 1) % period;
  }
  // gentle attack click removal
  for (let i = 0; i < 64; i++) out[i] *= i / 64;
  cache.set(key, buf);
  return buf;
}

function note(step) {
  const oct = Math.floor(step / SCALE.length);
  const deg = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
  return BASE_HZ * Math.pow(2, oct + deg / 12);
}

export function pluck(step = 0, { gain = 0.5, delay = 0, bright = 0.5, bend = 0 } = {}) {
  if (!ready()) return;
  const src = ctx.createBufferSource();
  src.buffer = ksBuffer(note(step), 1.6, bright);
  const g = ctx.createGain();
  g.gain.value = gain;
  const t = ctx.currentTime + delay;
  if (bend) {
    // nonghyeon-style vibrato bend
    src.playbackRate.setValueAtTime(1, t);
    src.playbackRate.linearRampToValueAtTime(1 + bend, t + 0.12);
    src.playbackRate.linearRampToValueAtTime(1, t + 0.4);
  }
  src.connect(g).connect(master);
  src.start(t);
}

function noise(dur, { gain = 0.3, freq = 1200, q = 0.8, delay = 0, type = 'bandpass' } = {}) {
  if (!ready()) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(ctx.currentTime + delay);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, to = null } = {}) {
  if (!ready()) return;
  const o = ctx.createOscillator();
  o.type = type;
  const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  pick() { noise(0.05, { gain: 0.12, freq: 3000, q: 1.5 }); },
  drop(size = 3) {
    tone(140 - size * 6, 0.12, { gain: 0.35, to: 60 });
    noise(0.08, { gain: 0.18, freq: 700, q: 0.7 });
  },
  invalid() { tone(180, 0.09, { type: 'triangle', gain: 0.15, to: 120 }); },
  stitch(i, streak) { pluck(5 + i + Math.min(streak, 8), { gain: 0.42, bright: 0.65 }); },
  tick(i) { pluck(10 + Math.min(i, 9), { gain: 0.18, bright: 0.85 }); },
  mult(i) { pluck(7 + Math.min(i, 9), { gain: 0.32, bright: 0.4, bend: 0.03 }); },
  slam(power = 1) {
    tone(90, 0.35, { gain: 0.55 * Math.min(1.4, power), to: 42 });
    noise(0.25, { gain: 0.25 * Math.min(1.5, power), freq: 220, q: 0.6, type: 'lowpass' });
  },
  coin(i = 0) {
    tone(1568 + i * 40, 0.12, { type: 'triangle', gain: 0.12, delay: 0 });
    tone(2093 + i * 40, 0.2, { type: 'sine', gain: 0.1, delay: 0.05 });
  },
  ui() { pluck(12, { gain: 0.14, bright: 0.8 }); },
  win() { [0, 2, 4, 5, 7, 9].forEach((s, i) => pluck(5 + s, { gain: 0.4, delay: i * 0.09, bright: 0.6 })); },
  fail() { [9, 7, 4, 2].forEach((s, i) => pluck(s, { gain: 0.38, delay: i * 0.16, bright: 0.3, bend: -0.04 })); },
  buy() { pluck(9, { gain: 0.3 }); pluck(12, { gain: 0.3, delay: 0.07 }); tone(1975, 0.15, { type: 'triangle', gain: 0.08, delay: 0.1 }); },
  perfect() { [0, 4, 7, 10, 12, 14].forEach((s, i) => pluck(7 + s, { gain: 0.35, delay: i * 0.05, bright: 0.7 })); },
};
