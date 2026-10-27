import { S } from "../core/state.js";
import { diffMap } from "./difficulty.js";
import { currentK, currentOrder } from "./order.js";
import { layoutData, median, recentAccuracy } from "./stats.js";

const DECAY = 0.95;

function wlogStats(t) {
  let w = 1;
  let sw = 0;
  let sw2 = 0;
  let m = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    m += w * Math.log(t[i]);
    sw += w;
    sw2 += w * w;
    w *= DECAY;
  }
  if (!sw) return { mean: 0, v: 0, ne: 0 };
  const mean = m / sw;
  let vv = 0;
  w = 1;
  for (let i = t.length - 1; i >= 0; i--) {
    const d = Math.log(t[i]) - mean;
    vv += w * d * d;
    w *= DECAY;
  }
  return { mean, v: vv / sw, ne: (sw * sw) / sw2 };
}

function globalMs(lid) {
  const L = layoutData(lid);
  const dm = diffMap(lid);
  const xs = [];
  for (const ch in L.chars) {
    const s = L.chars[ch];
    if (s.t.length >= 6 && ch !== " ") xs.push(Math.exp(wlogStats(s.t).mean) * (1.15 / (dm[ch] || 1.5)));
  }
  if (xs.length >= 3) return median(xs);
  return 12000 / (S.settings.targetWpm * 0.5);
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

function skillOf(lid, ch, s) {
  const dm = diffMap(lid);
  const prior = Math.log(globalMs(lid) * ((dm[ch] || 1.5) / 1.15));
  const st = s && s.t.length ? wlogStats(s.t) : { mean: 0, v: 0, ne: 0 };
  const K = SKILL_K;
  const mu = (st.ne * st.mean + K * prior) / (st.ne + K);
  const vr = Math.max(0.01, (st.ne * st.v + K * 0.09) / (st.ne + K));
  const upper = Math.exp(mu + Math.sqrt(vr / (st.ne + K)));
  let succ = 0;
  let tot = 0;
  let w = 1;
  const o = s ? s.o : [];
  for (let i = o.length - 1; i >= 0; i--) {
    tot += w;
    succ += w * (1 - o[i]);
    w *= DECAY;
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

function accuracyFloor() {
  return Math.max(0.8, S.derived.targetAcc - 0.05);
}

function statusOf(s, ch) {
  const P = S.derived;
  if (!s || s.n < P.minS) return "sparse";
  const k = skillOf(S.settings.layout, ch || "", s);
  const accOk = S.settings.unlock === "strict" ? k.acc >= accuracyFloor() : k.lower >= P.targetAcc;
  return k.upper <= gateMs() && accOk ? "steady" : "learning";
}

function lessonAccuracyOk(lid) {
  const r = recentAccuracy(lid, RECENT_LESSONS);
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
  return Math.max(0.2, k.ms / P.targetMs) + 4 * Math.max(0, 1 - k.acc - (1 - P.targetAcc)) + 0.5 * staleOf(s);
}

export {
  RECENT_LESSONS, SKILL_K, gateMs, keyModel, lessonAccuracyOk, needOf, rampMs, skillOf, staleOf, statusOf,
  wilsonLower
};
