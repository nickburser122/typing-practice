import { S } from "../core/state.js";
import { median, sum } from "./stats.js";

const IDLE_MS = 600000;
const BASE_LESSONS = 5;
const RECENT_LESSONS_N = 3;
const MAX_HOLD = 2;
const SLOWER = 1.15;

function sittingKey(lid, tr) {
  return lid + "|" + tr;
}

function sittings() {
  if (!S.sess || typeof S.sess !== "object") S.sess = {};
  return S.sess;
}

function mean(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

function push(buf, ms, er, cap) {
  buf.lat.push(ms);
  buf.err.push(er);
  if (buf.lat.length > cap) {
    buf.lat.shift();
    buf.err.shift();
  }
}

function sitting(lid, tr, now) {
  const all = sittings();
  const key = sittingKey(lid, tr);
  let ss = all[key];
  if (!ss || now - ss.last > IDLE_MS) {
    ss = all[key] = { base: { lat: [], err: [] }, recent: { lat: [], err: [] }, last: now, fat: false, held: 0, holding: false };
  }
  return ss;
}

function noteSession(lid, tr, ms, er, now) {
  const at = now == null ? Date.now() : now;
  const ss = sitting(lid, tr, at);
  ss.last = at;
  if (ss.base.lat.length < BASE_LESSONS) push(ss.base, ms, er, BASE_LESSONS);
  else push(ss.recent, ms, er, RECENT_LESSONS_N);
  ss.fat = ss.recent.lat.length >= RECENT_LESSONS_N
    && median(ss.recent.lat) > median(ss.base.lat) * SLOWER
    && mean(ss.recent.err) > mean(ss.base.err);
  return ss.fat;
}

function gateUnlock(lid, tr, ready) {
  const ss = sittings()[sittingKey(lid, tr)];
  if (!ss) return ready;
  if (!ready) {
    ss.holding = false;
    return false;
  }
  if (ss.fat && ss.held < MAX_HOLD) {
    ss.held++;
    ss.holding = true;
    return false;
  }
  ss.holding = false;
  return true;
}

function resetSitting(lid, tr) {
  delete sittings()[sittingKey(lid, tr)];
}

function fatigueHolding(lid, tr, now) {
  const ss = sittings()[sittingKey(lid, tr)];
  const at = now == null ? Date.now() : now;
  return !!(ss && ss.holding && at - ss.last <= IDLE_MS);
}

export { IDLE_MS, MAX_HOLD, fatigueHolding, gateUnlock, noteSession, resetSitting };
