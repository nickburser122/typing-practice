const TRACK_KEYS = ["letters", "capitals", "digits", "numpad", "punct", "symbols", "dia"];

const MIX_KEYS = ["letters", "capitals", "digits", "punct", "symbols", "code", "dia", "custom"];

const ONBOARD_STATES = ["new", "steps", "done", "skipped"];

function newTracks() {
  const t = {};
  TRACK_KEYS.forEach(k => { t[k] = { k: null, lk: 0 }; });
  return t;
}

function bindK(L) {
  Object.defineProperty(L, "k", {
    enumerable: true,
    configurable: true,
    get() { return L.tracks.letters.k; },
    set(v) { L.tracks.letters.k = v; }
  });
  return L;
}

function sanitizeTracks(t, k) {
  const out = newTracks();
  TRACK_KEYS.forEach(key => {
    const slot = t && typeof t === "object" && t[key] && typeof t[key] === "object" ? t[key] : null;
    const v = slot ? slot.k : null;
    if (typeof v === "number" && isFinite(v)) out[key].k = Math.max(key === "letters" ? 2 : 0, Math.min(80, Math.round(v)));
    if (slot && typeof slot.lk === "number" && isFinite(slot.lk)) out[key].lk = Math.max(0, Math.min(1e6, Math.round(slot.lk)));
  });
  if (out.letters.k == null && k != null) out.letters.k = k;
  return out;
}

function sanitizeMix(v) {
  if (!v || typeof v !== "object") return null;
  const m = {};
  let any = false;
  MIX_KEYS.forEach(k => {
    const x = v[k];
    const on = !!(x && x.on === true);
    const w = x && typeof x.weight === "number" && isFinite(x.weight) ? Math.max(0, Math.min(100, Math.round(x.weight))) : 50;
    m[k] = { on, weight: w };
    if (on) any = true;
  });
  return any ? m : null;
}

export { MIX_KEYS, ONBOARD_STATES, TRACK_KEYS, bindK, newTracks, sanitizeMix, sanitizeTracks };
