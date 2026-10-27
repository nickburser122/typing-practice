import { lessonPbKey, notePb, recordSession } from "../core/history.js";
import { S } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { CASE_KEY, caseStep, codeNote, finishCode } from "./code.js";
import { activeKeys, currentK, currentOrder, setK } from "./order.js";
import { lessonAccuracyOk, needOf, skillOf, statusOf } from "./skill.js";
import { charStat, layoutData, median, sum } from "./stats.js";
import { advanceTrack } from "./tracks.js";

function ringPush(arr, v, cap) {
  arr.push(v);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

function recordTiming(lid, lesson, expected, prevCh, delta) {
  const P = S.settings;
  const st = charStat(lid, expected, true);
  if (delta >= 15 && delta <= P.pause) {
    ringPush(st.t, delta, 40);
    st.n++;
    if (prevCh && prevCh !== " " && expected !== " ") {
      const L = layoutData(lid);
      const key = prevCh + expected;
      let p = L.pairs[key];
      if (!p) p = L.pairs[key] = { n: 0, m: delta };
      p.m = p.n === 0 ? delta : p.m * 0.8 + delta * 0.2;
      p.n++;
    }
  }
}

function handleChar(ch, ts, hooks) {
  const lesson = S.lesson;
  if (!lesson || lesson.done) return;
  const lid = lesson.cm && lesson.cm[lesson.idx] ? S.settings.layout + ":code" : lesson.sid || S.settings.layout;
  if (lesson.idx === 0 && !lesson.start) lesson.start = ts;
  const i = lesson.idx;
  const expected = lesson.chars[i];
  const st = charStat(lid, expected, true);
  st.ls = Date.now();
  if (lesson.code) lesson.keys++;
  if (ch === expected) {
    if (lesson.flag[i] && lesson.errTs[i]) {
      const rc = ts - lesson.errTs[i];
      if (rc > 50 && rc < 8000) ringPush(layoutData(lid).rec, rc, 40);
    }
    if (!lesson.flag[i]) {
      if (lesson.code) codeNote(lesson, expected, lesson.prevTs != null && i > 0 ? ts - lesson.prevTs : 0, 0);
      if (lesson.code && caseStep(lesson, i)) {
        const cs = charStat(lid, CASE_KEY, true);
        cs.a++;
        ringPush(cs.o, 0, 40);
        if (lesson.prevTs != null && !lesson.flag[i - 1]) recordTiming(lid, lesson, CASE_KEY, lesson.chars[i - 1], ts - lesson.prevTs);
      }
      st.a++;
      ringPush(st.o, 0, 40);
      if (lesson.prevTs != null && i > 0 && !lesson.flag[i - 1]) {
        recordTiming(lid, lesson, expected, lesson.chars[i - 1], ts - lesson.prevTs);
      }
    }
    lesson.mark[i] = 1;
    if (lesson.code) lesson.net++;
    lesson.prevTs = ts;
    lesson.idx++;
  } else {
    if (lesson.code) lesson.bad++;
    if (!lesson.flag[i]) {
      if (lesson.code) codeNote(lesson, expected, 0, 1);
      if (lesson.code && caseStep(lesson, i)) {
        const cs = charStat(lid, CASE_KEY, true);
        cs.a++;
        cs.e++;
        ringPush(cs.o, 1, 40);
      }
      lesson.flag[i] = 1;
      lesson.errTs[i] = ts;
      lesson.errs++;
      st.a++;
      st.e++;
      ringPush(st.o, 1, 40);
      const keys = Object.keys(st.x);
      if (ch in st.x || keys.length < 8) st.x[ch] = (st.x[ch] || 0) + 1;
    }
    if (S.settings.onError === "advance") {
      lesson.mark[i] = 2;
      lesson.prevTs = ts;
      lesson.idx++;
    }
  }
  if (lesson.code) lesson.log.push([ts - lesson.start, lesson.net, lesson.keys, lesson.bad]);
  hooks.painted(i, lesson.idx);
  if (lesson.idx >= lesson.chars.length) finishLesson(ts, hooks);
}

function noteSession(ms, er) {
  const ss = S.sess || (S.sess = { lat: [], err: [], fat: false });
  ss.lat.push(ms);
  ss.err.push(er);
  if (ss.lat.length >= 5) {
    const b = median(ss.lat.slice(0, 3));
    const c = median(ss.lat.slice(-2));
    const be = sum(ss.err.slice(0, 3)) / 3;
    const ce = sum(ss.err.slice(-2)) / 2;
    ss.fat = c > b * 1.15 && ce > be;
  }
}

function worstActive() {
  const lid = S.settings.layout;
  let best = null;
  let bv = -1;
  activeKeys().forEach(c => {
    const s = charStat(lid, c, false);
    if (statusOf(s, c) !== "learning") return;
    const v = needOf(s, c);
    if (v > bv) {
      bv = v;
      best = c;
    }
  });
  return best;
}

function advance() {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const order = currentOrder();
  L.tot = (L.tot || 0) + 1;
  L.lk = (L.lk || 0) + 1;
  if (L.rescue > 0) L.rescue--;
  if (S.settings.progression !== "auto") return;
  const k = currentK();
  if (k >= order.length) return;
  if (S.sess && S.sess.fat) return;
  const unlock = () => {
    setK(k + 1);
    L.lk = 0;
    L.bk = null;
    L.rescue = 0;
    S.sess = null;
  };
  const settled = activeKeys().every(c => statusOf(charStat(lid, c, false), c) === "steady");
  if (settled && (S.settings.unlock !== "strict" || lessonAccuracyOk(lid))) {
    unlock();
    return;
  }
  if (S.settings.unlock === "strict") return;
  const b = worstActive();
  if (!b) return;
  const mu = aggMu(lid);
  if (!L.bk) {
    L.bk = { c: b, mu, lk: L.lk, rs: 0, rl: 0, mu2: mu };
    return;
  }
  const bk = L.bk;
  if (!bk.rs) {
    if (L.lk - bk.lk >= 12) {
      if (bk.mu - mu < 0.06) {
        bk.c = b;
        bk.rs = 1;
        bk.rl = L.lk;
        bk.mu2 = mu;
        L.rescue = 2;
      } else {
        bk.mu = mu;
        bk.lk = L.lk;
      }
    }
  } else if (L.rescue === 0 && L.lk - bk.rl >= 2) {
    if (bk.mu2 - mu < 0.06) {
      L.raise = { c: bk.c, until: L.tot + 30 };
      unlock();
      return;
    }
    bk.rs = 0;
    bk.mu = mu;
    bk.lk = L.lk;
  }
  if (L.lk >= 60) {
    L.raise = { c: bk.c, until: L.tot + 30 };
    unlock();
  }
}

function aggMu(lid) {
  const act = activeKeys();
  let m = 0;
  act.forEach(c => { m += skillOf(lid, c, charStat(lid, c, false)).mu; });
  return m / act.length;
}

function finishLesson(ts, hooks) {
  const lesson = S.lesson;
  lesson.done = true;
  const n = lesson.chars.length;
  const dur = Math.max(1, ts - lesson.start);
  const wpm = Math.max(0, ((n - 1) / 5) / (dur / 60000));
  const acc = Math.max(0, 1 - lesson.errs / n);
  if (lesson.code) {
    finishCode(lesson, dur);
    scheduleSave();
    hooks.finished();
    return;
  }
  if (lesson.free) {
    recordSession("l", S.settings.layout, wpm, acc, dur, n);
    scheduleSave();
    hooks.finished();
    return;
  }
  S.lastResult = { wpm, acc };
  S.data.lessons.push({ ts: Date.now(), lid: S.settings.layout, wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 1000) / 1000, n });
  if (S.data.lessons.length > 300) S.data.lessons.splice(0, S.data.lessons.length - 300);
  recordSession("l", S.settings.layout, wpm, acc, dur, n);
  if (acc >= 0.9) notePb(lessonPbKey(S.settings.layout), wpm, acc);
  if (!(layoutData(S.settings.layout).rescue > 0)) noteSession(dur / n, lesson.errs / n);
  if (lesson.track && lesson.track !== "letters") advanceTrack(lesson.track);
  else advance();
  scheduleSave();
  hooks.finished();
}

export { handleChar, noteSession, recordTiming, ringPush };
