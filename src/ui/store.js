// localStorage wrappers. Every access is guarded: storage can be missing or throw.
const KEY = { run: 'bojagi.run.v1', meta: 'bojagi.meta.v1', settings: 'bojagi.settings.v1' };

function read(k, fallback) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(k, v) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch { /* storage unavailable */ }
}

export const defaultMeta = () => ({
  runs: 0, wins: 0, bestDay: 0, bestOrders: 0, bestHand: 0, bestStreak: 0, clears: 0,
  monos: 0, crosses: 0, triples: 0, perfects: 0, maxCoins: 0,
  discovered: [], tutorial: false, daily: {},
});

export const loadMeta = () => ({ ...defaultMeta(), ...read(KEY.meta, {}) });
export const saveMeta = (m) => write(KEY.meta, m);
export const loadSettings = () => ({ sound: true, haptics: true, fast: false, ...read(KEY.settings, {}) });
export const saveSettings = (s) => write(KEY.settings, s);
export const loadRun = () => read(KEY.run, null);
export const saveRun = (r) => write(KEY.run, r);
export const clearRun = () => write(KEY.run, null);
