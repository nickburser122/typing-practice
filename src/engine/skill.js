import { S } from "../core/state.js";
import { diffMap } from "./difficulty.js";
import { currentK, currentOrder } from "./order.js";
import { layoutData, median, recentAccuracy } from "./stats.js";

const DECAY = 0.95;

const DAY_MS = 86400000;
const AGE_TAU = 21;
const TEST_WEIGHT = 0.5;

const AGE_TABLE = new Float64Array(512);
for (let i = 0; i < AGE_TABLE.length; i++) AGE_TABLE[i] = Math.exp(-i / AGE_TAU);
const W_SMALL = new Float64Array(64);
const L_SMALL = new Float64Array(64);
let W_OUT = W_SMALL;

function fillWeights(len, stamps, ls) {
  const w = len <= 64 ? W_SMALL : new Float64Array(len);
  W_OUT = w;
  const now = Date.now();
  const today = Math.floor(now / DAY_MS);
  const lsW = ls ? Math.exp(-Math.max(0, (now - ls) / DAY_MS) / AGE_TAU) : 1;
  const sl = stamps ? stamps.length : 0;
  let rank = 1;
  let full = 0;
  let got = 0;
  for (let i = len - 1; i >= 0; i--) {
    const si = sl - (len - i);
    let aw = lsW;
    let test = 1;
    if (si >= 0) {
      const st = stamps[si];
      const age = today - (st >> 1);
      aw = age <= 0 ? 1 : age >= 512 ? 0 : AGE_TABLE[age];
      if (st & 1) test = TEST_WEIGHT;
    }
    const wi = rank * aw * test;
    w[i] = wi;
    full += rank;
    got += wi;
    rank *= DECAY;
  }
  return full > 0 ? got / full : 0;
}

const LOG_CACHE = new WeakMap();

function wlogStats(t, stamps, ls) {
  const sig = (stamps ? stamps.length + lastOf(stamps) : -1) + ":" + ls + ":" + Math.floor(Date.now() / DAY_MS);
  const hit = LOG_CACHE.get(t);
  if (hit && hit.len === t.length && hit.last === lastOf(t) && hit.sig === sig) return hit.res;
  const res = wlogCompute(t, stamps, ls);
  LOG_CACHE.set(t, { len: t.length, last: lastOf(t), sig, res });
  return res;
}

function wlogCompute(t, stamps, ls) {
  const len = t.length;
  const keep = fillWeights(len, stamps, ls);
  const w = W_OUT;
  const lg = len <= 64 ? L_SMALL : new Float64Array(len);
  let sw = 0;
  let sw2 = 0;
  let m = 0;
  for (let i = 0; i < len; i++) {
    const l = Math.log(t[i]);
    lg[i] = l;
    m += w[i] * l;
    sw += w[i];
    sw2 += w[i] * w[i];
  }
  if (!(sw > 0)) return { mean: 0, v: 0, ne: 0 };
  const mean = m / sw;
  let vv = 0;
  for (let i = 0; i < len; i++) {
    const d = lg[i] - mean;
    vv += w[i] * d * d;
  }
  return { mean, v: vv / sw, ne: ((sw * sw) / sw2) * keep };
}

function lastOf(arr) {
  return arr.length ? arr[arr.length - 1] : -1;
}

function uncachedGlobalMs(lid) {
  const L = layoutData(lid);
  const dm = diffMap(lid);
  const xs = [];
  for (const ch in L.chars) {
    const s = L.chars[ch];
    if (s.t.length >= 6 && ch !== " ") xs.push(Math.exp(wlogStats(s.t, s.td, s.ls).mean) * (1.15 / (dm[ch] || 1.5)));
  }
  if (xs.length >= 3) return median(xs);
  return 12000 / (S.settings.targetWpm * 0.5);
}

const GLOBAL_CACHE = {};

function globalFresh(c, L, lid) {
  if (!c || c.L !== L || c.target !== S.settings.targetWpm || c.dm !== diffMap(lid) || c.day !== Math.floor(Date.now() / DAY_MS)) return false;
  let n = 0;
  for (const ch in L.chars) {
    const s = L.chars[ch];
    const r = c.refs[ch];
    if (!r || r.s !== s || r.t !== s.t || r.len !== s.t.length || r.last !== lastOf(s.t) || r.dl !== (s.td ? s.td.length : 0) || r.dlast !== (s.td ? lastOf(s.td) : -1) || r.ls !== s.ls) return false;
    n++;
  }
  return n === c.n;
}

function globalMs(lid) {
  const L = layoutData(lid);
  const hit = GLOBAL_CACHE[lid];
  if (globalFresh(hit, L, lid)) return hit.v;
  const refs = {};
  let n = 0;
  for (const ch in L.chars) {
    const s = L.chars[ch];
    refs[ch] = { s, t: s.t, len: s.t.length, last: lastOf(s.t), dl: s.td ? s.td.length : 0, dlast: s.td ? lastOf(s.td) : -1, ls: s.ls };
    n++;
  }
  const v = uncachedGlobalMs(lid);
  GLOBAL_CACHE[lid] = { L, target: S.settings.targetWpm, dm: diffMap(lid), day: Math.floor(Date.now() / DAY_MS), refs, n, v };
  return v;
}

function wilsonLower(p, n) {
  const z = 0.5;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
}

const SKILL_K = 4;
const RECENT_LESSONS = 3;

function keyModel(lid, ch, s) {
  const expected = globalMs(lid) * (diffMap(lid)[ch] || 1.5) / 1.15;
  const sk = skillOf(lid, ch, s);
  return { expected, learned: sk.ms, correction: sk.ms - expected, weight: sk.ne / (sk.ne + SKILL_K), ne: sk.ne };
}

const SKILL_CACHE = {};

function skillOf(lid, ch, s) {
  if (!s) return uncachedSkillOf(lid, ch, s);
  const key = lid + "\u0000" + ch;
  const g = globalMs(lid);
  const c = SKILL_CACHE[key];
  if (c && c.s === s && c.t === s.t && c.o === s.o && c.g === g && c.tl === s.t.length && c.ol === s.o.length && c.tlast === lastOf(s.t) && c.olast === lastOf(s.o) && c.day === Math.floor(Date.now() / DAY_MS) && c.dl === (s.td ? s.td.length + lastOf(s.td) : -1) && c.ol2 === (s.od ? s.od.length + lastOf(s.od) : -1) && c.ls === s.ls) return c.v;
  const v = uncachedSkillOf(lid, ch, s);
  SKILL_CACHE[key] = { s, t: s.t, o: s.o, g, tl: s.t.length, ol: s.o.length, tlast: lastOf(s.t), olast: lastOf(s.o), day: Math.floor(Date.now() / DAY_MS), dl: s.td ? s.td.length + lastOf(s.td) : -1, ol2: s.od ? s.od.length + lastOf(s.od) : -1, ls: s.ls, v };
  return v;
}

function uncachedSkillOf(lid, ch, s) {
  const dm = diffMap(lid);
  const prior = Math.log(globalMs(lid) * ((dm[ch] || 1.5) / 1.15));
  const st = s && s.t.length ? wlogStats(s.t, s.td, s.ls) : { mean: 0, v: 0, ne: 0 };
  const K = SKILL_K;
  const mu = (st.ne * st.mean + K * prior) / (st.ne + K);
  const vr = Math.max(0.01, (st.ne * st.v + K * 0.09) / (st.ne + K));
  const upper = Math.exp(mu + Math.sqrt(vr / (st.ne + K)));
  let succ = 0;
  let tot = 0;
  const o = s ? s.o : [];
  fillWeights(o.length, s ? s.od : null, s ? s.ls : 0);
  const ow = W_OUT;
  for (let i = 0; i < o.length; i++) {
    tot += ow[i];
    succ += ow[i] * (1 - o[i]);
  }
  const a0 = 1.9;
  const b0 = 0.1;
  const p = (succ + a0) / (tot + a0 + b0);
  const n = tot + a0 + b0;
  const lower = wilsonLower(p, n);
  return { ms: Math.exp(mu), mu, upper, lower, acc: p, ne: st.ne, an: n };
}

function rampMs(count) {
  const total = currentOrder().length;
  return 12000 / (S.settings.targetWpm * (0.45 + 0.55 * Math.min(1, count / total)));
}

function gateMs() {
  return rampMs(currentK());
}

const PAUSE = { at: 0, data: null, lid: "", target: 0, v: 0 };

function pauseMs() {
  const lid = S.settings.layout;
  const now = Date.now();
  if (PAUSE.data === S.data && PAUSE.lid === lid && PAUSE.target === S.settings.targetWpm && now - PAUSE.at < 2000 && now >= PAUSE.at) return PAUSE.v;
  const ms = S.data.layouts[lid] ? globalMs(lid) : 12000 / (S.settings.targetWpm * 0.5);
  PAUSE.at = now;
  PAUSE.data = S.data;
  PAUSE.lid = lid;
  PAUSE.target = S.settings.targetWpm;
  PAUSE.v = Math.min(4000, Math.max(1000, 5 * ms));
  return PAUSE.v;
}

const DIFF_MEDIAN = {};

function medianDifficulty(lid) {
  const dm = diffMap(lid);
  const key = lid + currentOrder().length;
  if (DIFF_MEDIAN[key] === undefined) {
    const vals = currentOrder().map(c => dm[c] || 1.5);
    DIFF_MEDIAN[key] = vals.length ? median(vals) : 1;
  }
  return DIFF_MEDIAN[key];
}

function gateOf(ch) {
  const lid = S.settings.layout;
  const ratio = (diffMap(lid)[ch] || 1.5) / medianDifficulty(lid);
  return gateMs() * Math.min(1.35, Math.max(0.9, ratio));
}

function statusOf(s, ch) {
  const P = S.derived;
  if (!s || s.n < P.minS) return "sparse";
  const k = skillOf(S.settings.layout, ch || "", s);
  return k.upper <= gateOf(ch) && k.acc >= P.targetAcc - 0.03 ? "steady" : "learning";
}

function lessonAccuracyOk(lid, tr) {
  const r = recentAccuracy(lid, RECENT_LESSONS, tr);
  return r !== null && r >= S.derived.targetAcc;
}

function staleOf(s) {
  if (!s || !s.ls) return 0;
  return Math.min(2, Math.log(1 + Math.max(0, (Date.now() - s.ls) / 86400000)));
}

function needOf(s, ch) {
  const P = S.derived;
  if (!s || s.n < P.minS) return 2 + (1 - (s ? s.n : 0) / P.minS);
  const k = skillOf(S.settings.layout, ch || "", s);
  const gate = gateOf(ch);
  const speedGap = Math.max(0, Math.log(k.upper / gate));
  const accGap = Math.max(0, P.targetAcc - k.lower) * 8;
  const age = s.ls ? Math.max(0, (Date.now() - s.ls) / 86400000) : 0;
  const steady = k.upper <= gate && k.acc >= P.targetAcc - 0.03;
  return speedGap + accGap + (steady ? Math.min(1, age / 14) * 0.5 : 0);
}

export {
  RECENT_LESSONS, pauseMs, SKILL_K, gateMs, gateOf, globalMs, keyModel, lessonAccuracyOk, needOf, rampMs, skillOf,
  staleOf, statusOf, uncachedGlobalMs, uncachedSkillOf, wilsonLower
};
