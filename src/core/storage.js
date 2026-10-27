import { VERSION } from "./base.js";
import { backfill, sanitizeDays, sanitizePbs } from "./history.js";
import { ONBOARD_STATES, bindK, sanitizeTracks } from "./schema.js";
import { defaultSettings, sanitizeSettings } from "./settings.js";
import { S, refreshDerived, typeable } from "./state.js";
import { CODE_SETS } from "../data/code-sets.js";
import { LAYOUTS } from "../data/layouts.js";

const KEY_S = "tarq:settings";
const KEY_D = "tarq:data";
const KEY_C = "tarq:custom";
const CUSTOM_CAP = 50000;
const customStore = { text: null, src: null, lid: null, words: [] };

function customText() {
  if (customStore.text === null) customStore.text = storeGet(KEY_C) || "";
  return customStore.text;
}

function customBytes(s) {
  return new TextEncoder().encode(s).length;
}

function saveCustom(raw) {
  let s = String(raw).split("").filter(c => {
    const k = c.charCodeAt(0);
    return k === 9 || k === 10 || (k > 31 && k !== 127);
  }).join("");
  let truncated = false;
  if (customBytes(s) > CUSTOM_CAP) {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (customBytes(s.slice(0, mid)) <= CUSTOM_CAP) lo = mid;
      else hi = mid - 1;
    }
    s = s.slice(0, lo).replace(/[\uD800-\uDBFF]$/, "");
    truncated = true;
  }
  customStore.text = s;
  customStore.src = null;
  S.customPos = 0;
  S.mixLedger = null;
  if (!S.noSave) storeSet(KEY_C, s);
  return { bytes: customBytes(s), truncated };
}

function clearCustom() {
  customStore.text = "";
  customStore.src = null;
  S.customPos = 0;
  S.mixLedger = null;
  if (S.noSave) return;
  delete MEM[KEY_C];
  try {
    window.localStorage.removeItem(KEY_C);
  } catch (err) {
    S.storage = "memory";
  }
}

function customWords() {
  const text = customText();
  if (customStore.src !== text || customStore.lid !== S.settings.layout) {
    customStore.src = text;
    customStore.lid = S.settings.layout;
    customStore.words = text ? text.split(/\s+/).map(w => Array.from(w).filter(typeable).join("").slice(0, 30)).filter(Boolean) : [];
  }
  return customStore.words;
}

function hasCustom() {
  return customWords().length > 0;
}
let saveTimer = null;
const MEM = {};

function storeGet(k) {
  try {
    const v = window.localStorage.getItem(k);
    S.storage = "local";
    return v;
  } catch (err) {
    S.storage = "memory";
    return MEM[k] || null;
  }
}

function storeSet(k, v) {
  try {
    window.localStorage.setItem(k, v);
    return true;
  } catch (err) {
    S.storage = "memory";
    MEM[k] = v;
    return false;
  }
}

const PAIR_CAP = 2500;
const PAIR_KEEP = 2000;

function prunePairs(L) {
  const keys = Object.keys(L.pairs);
  if (keys.length <= PAIR_CAP) return;
  keys.sort((a, b) => L.pairs[a].n - L.pairs[b].n);
  for (let i = 0; i < keys.length - PAIR_KEEP; i++) delete L.pairs[keys[i]];
}

function readSettings(raw) {
  const out = sanitizeSettings(raw);
  if (raw && typeof raw === "object" && raw.unlock === undefined) out.unlock = "assist";
  return out;
}

function adoptData(raw) {
  let d = null;
  if (raw != null) {
    try {
      d = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!d || typeof d !== "object") return false;
  }
  S.data = sanitizeData(d);
  if (!S.noSave) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  refreshDerived();
  return true;
}

function adoptSettings(raw) {
  let s = null;
  if (raw != null) {
    try {
      s = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!s || typeof s !== "object") return false;
  }
  S.settings = readSettings(s);
  if (!S.noSave) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  refreshDerived();
  return true;
}

function saveNow() {
  if (S.noSave) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  for (const lid in S.data.layouts) prunePairs(S.data.layouts[lid]);
  S.data.saved = Date.now();
  storeSet(KEY_S, JSON.stringify(S.settings));
  storeSet(KEY_D, JSON.stringify(S.data));
}

function dataFootprint() {
  const sv = storeGet(KEY_S) || "";
  const dv = storeGet(KEY_D) || "";
  const cv = storeGet(KEY_C) || "";
  const bytes = sv ? (KEY_S.length + sv.length) * 2 : 0;
  return { bytes: bytes + (dv ? (KEY_D.length + dv.length) * 2 : 0) + (cv ? (KEY_C.length + cv.length) * 2 : 0), lessons: S.data.lessons.length, tests: S.data.tests.length, saved: S.data.saved || 0 };
}

function eraseAll() {
  clearTimeout(saveTimer);
  saveTimer = null;
  S.settings = defaultSettings();
  S.data = sanitizeData(null);
  refreshDerived();
  customStore.text = "";
  customStore.src = null;
  S.customPos = 0;
  if (S.noSave) return;
  delete MEM[KEY_C];
  delete MEM[KEY_S];
  delete MEM[KEY_D];
  try {
    window.localStorage.removeItem(KEY_S);
    window.localStorage.removeItem(KEY_D);
    window.localStorage.removeItem(KEY_C);
  } catch (err) {
    S.storage = "memory";
  }
}

function scheduleSave() {
  if (S.noSave) return;
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 600);
}

function num(v, lo, hi, dflt) {
  return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

function extMask(lang) {
  return 3 | 112 | (lang === "ar" ? 8 : 4);
}

function sanitizeData(input) {
  const out = { v: VERSION, layouts: {}, lessons: [], tests: [], code: [], sc: {}, days: {}, pbs: {}, saved: 0, onboard: "new", onboardStep: 0 };
  if (!input || typeof input !== "object") return out;
  out.saved = num(input.saved, 0, 8.64e15, 0);
  const layouts = input.layouts && typeof input.layouts === "object" ? input.layouts : {};
  for (const lid of Object.keys(LAYOUTS).concat(Object.keys(LAYOUTS).map(l => l + ":code"))) {
    const src = layouts[lid];
    if (!src || typeof src !== "object") continue;
    const dst = { chars: {}, pairs: {}, k: null, rec: [], sh: { ok: num(src.sh && src.sh.ok, 0, 1e9, 0), same: num(src.sh && src.sh.same, 0, 1e9, 0) }, lk: num(src.lk, 0, 1e6, 0), tot: num(src.tot, 0, 1e9, 0), rescue: num(src.rescue, 0, 2, 0), bk: null, raise: null, placed: src.placed === true };
    if (src.bk && typeof src.bk === "object" && typeof src.bk.c === "string" && src.bk.c.length <= 2) {
      dst.bk = { c: src.bk.c, mu: num(src.bk.mu, -20, 20, 0), lk: num(src.bk.lk, 0, 1e6, 0), rs: src.bk.rs ? 1 : 0, rl: num(src.bk.rl, 0, 1e6, 0), mu2: num(src.bk.mu2, -20, 20, 0) };
    }
    if (src.raise && typeof src.raise === "object" && typeof src.raise.c === "string" && src.raise.c.length <= 2) {
      dst.raise = { c: src.raise.c, until: num(src.raise.until, 0, 1e9, 0) };
    }
    if (Array.isArray(src.rec)) dst.rec = src.rec.filter(v => typeof v === "number" && isFinite(v) && v > 0 && v < 10000).slice(-40);
    if (typeof src.k === "number" && isFinite(src.k)) dst.k = Math.max(2, Math.min(80, Math.round(src.k)));
    const chars = src.chars && typeof src.chars === "object" ? src.chars : {};
    Object.keys(chars).slice(0, 200).forEach(ch => {
      const c = chars[ch];
      if (!c || typeof c !== "object" || ch.length > 2) return;
      const clean = { n: num(c.n, 0, 1e9, 0), a: num(c.a, 0, 1e9, 0), e: num(c.e, 0, 1e9, 0), t: [], o: [], x: {}, ls: num(c.ls, 0, 8.64e15, 0) };
      if (Array.isArray(c.t)) clean.t = c.t.filter(v => typeof v === "number" && isFinite(v) && v > 0 && v < 60000).slice(-40);
      if (Array.isArray(c.o)) clean.o = c.o.map(v => (v ? 1 : 0)).slice(-40);
      if (c.x && typeof c.x === "object") {
        Object.keys(c.x).slice(0, 8).forEach(k => {
          if (k.length <= 2) clean.x[k] = num(c.x[k], 0, 1e9, 0);
        });
      }
      dst.chars[ch] = clean;
    });
    const pairs = src.pairs && typeof src.pairs === "object" ? src.pairs : {};
    Object.keys(pairs).slice(0, PAIR_CAP).forEach(k => {
      const p = pairs[k];
      if (!p || typeof p !== "object" || k.length !== 2) return;
      dst.pairs[k] = { n: num(p.n, 0, 1e9, 0), m: num(p.m, 1, 60000, 500) };
    });
    dst.tracks = sanitizeTracks(src.tracks, dst.k);
    bindK(dst);
    out.layouts[lid] = dst;
  }
  if (Array.isArray(input.lessons)) {
    out.lessons = input.lessons.slice(-300).filter(l => l && typeof l === "object").map(l => ({
      ts: num(l.ts, 0, 8.64e15, 0),
      lid: typeof l.lid === "string" && LAYOUTS[l.lid] ? l.lid : "en-qwerty",
      wpm: num(l.wpm, 0, 500, 0),
      acc: num(l.acc, 0, 1, 0),
      n: num(l.n, 0, 100000, 0)
    }));
  }
  if (Array.isArray(input.code)) {
    out.code = input.code.slice(-200).filter(x => x && typeof x === "object").map(x => ({
      ts: num(x.ts, 0, 8.64e15, 0),
      lid: typeof x.lid === "string" && LAYOUTS[x.lid] ? x.lid : "en-qwerty",
      set: typeof x.set === "string" && (x.set === "mix" || CODE_SETS[x.set]) ? x.set : "mix",
      wpm: num(x.wpm, 0, 1000, 0),
      raw: num(x.raw, 0, 1000, 0),
      acc: num(x.acc, 0, 1, 0),
      cons: num(x.cons, 0, 100, 0)
    }));
  }
  if (Array.isArray(input.tests)) {
    out.tests = input.tests.slice(-200).filter(x => x && typeof x === "object").map(x => ({
      ts: num(x.ts, 0, 8.64e15, 0),
      lid: typeof x.lid === "string" && LAYOUTS[x.lid] ? x.lid : "en-qwerty",
      mode: ["words", "quote"].indexOf(x.mode) >= 0 ? x.mode : "time",
      amt: num(x.amt, 1, 1000, 30),
      list: ["200", "1000", "all"].indexOf(x.list) >= 0 ? x.list : "1000",
      ext: num(x.ext, 0, 127, 0) & extMask(typeof x.lid === "string" && LAYOUTS[x.lid] ? LAYOUTS[x.lid].lang : "en"),
      wpm: num(x.wpm, 0, 500, 0),
      raw: num(x.raw, 0, 500, 0),
      acc: num(x.acc, 0, 1, 0),
      cons: num(x.cons, 0, 100, 0)
    }));
  }
  if (input.days && typeof input.days === "object") {
    out.days = sanitizeDays(input.days, lid => !!LAYOUTS[lid] || (lid.endsWith(":code") && !!LAYOUTS[lid.slice(0, -5)]));
    out.pbs = sanitizePbs(input.pbs);
  } else {
    backfill(out);
  }
  const hasData = Object.keys(out.layouts).length || out.lessons.length || out.tests.length || out.code.length;
  out.onboard = ONBOARD_STATES.indexOf(input.onboard) >= 0 ? input.onboard : (hasData ? "done" : "new");
  out.onboardStep = Math.max(0, Math.min(4, Math.round(num(input.onboardStep, 0, 4, 0))));
  if (input.sc && typeof input.sc === "object") {
    Object.keys(input.sc).slice(0, 400).forEach(k => {
      const v = input.sc[k];
      if (!v || typeof v !== "object" || !/^(win|mac)\|[a-z]{2,12}$/.test(k)) return;
      out.sc[k] = { b: num(v.b, 0, 5, 0), n: num(v.n, 0, 1e6, 0), e: num(v.e, 0, 1e6, 0), ms: Array.isArray(v.ms) ? v.ms.filter(x => typeof x === "number" && isFinite(x) && x > 0 && x < 60000).slice(-10) : [], due: num(v.due, 0, 8.64e15, 0), ls: num(v.ls, 0, 8.64e15, 0) };
    });
  }
  return out;
}

function loadAll() {
  let s = null;
  let d = null;
  try {
    const rs = storeGet(KEY_S);
    if (rs) s = JSON.parse(rs);
  } catch (err) {
    s = null;
  }
  try {
    const rd = storeGet(KEY_D);
    if (rd) d = JSON.parse(rd);
  } catch (err) {
    d = null;
  }
  S.settings = readSettings(s);
  S.data = sanitizeData(d);
  refreshDerived();
}

function buildExport(full) {
  const o = { app: "tarq", version: VERSION, exportedAt: new Date().toISOString(), settings: S.settings };
  if (full) o.data = S.data;
  return o;
}

function applyImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    return false;
  }
  if (!obj || obj.app !== "tarq" || typeof obj.version !== "number" || obj.version > VERSION) return false;
  S.settings = readSettings(obj.settings);
  if (obj.data) S.data = sanitizeData(obj.data);
  refreshDerived();
  saveNow();
  return true;
}

export {
  CUSTOM_CAP, KEY_C, KEY_D, KEY_S, MEM, PAIR_CAP, PAIR_KEEP, adoptData, adoptSettings, applyImport,
  buildExport, clearCustom, customBytes, customStore, customText, customWords, dataFootprint, eraseAll,
  hasCustom, loadAll, prunePairs, sanitizeData, saveCustom, saveNow, scheduleSave, storeSet
};
