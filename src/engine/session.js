import { lessonPbKey, notePb, recordSession } from "../core/history.js";
import { S } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { CASE_KEY, caseStep, codeNote, finishCode } from "./code.js";
import { gateUnlock, noteSession, resetSitting } from "./fatigue.js";
import { activeKeys, currentK, currentOrder, setK } from "./order.js";
import { lessonAccuracyOk, pauseMs, statusOf } from "./skill.js";
import { charStat, layoutData, median, stampPush, sum } from "./stats.js";
import { advanceTrack } from "./tracks.js";
import { noteWork } from "./sessionlen.js";
import { lessonWordItems, noteWords } from "./weak.js";

function ringPush(arr, v, cap) {
  arr.push(v);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

function notePair(lid, key, wrong) {
  const L = layoutData(lid);
  let p = L.pairs[key];
  if (!p) p = L.pairs[key] = { n: 0, m: 500 };
  p.tc = (p.tc || 0) * 0.97 + (wrong ? 0 : 1);
  p.te = (p.te || 0) * 0.97 + (wrong ? 1 : 0);
}

function noteTri(lid, key, delta) {
  const L = layoutData(lid);
  const tri = L.tri || (L.tri = {});
  let p = tri[key];
  if (!p) {
    p = tri[key] = { n: 0, m: delta };
    if (Object.keys(tri).length > 450) {
      Object.keys(tri).sort((a, b) => tri[b].n - tri[a].n).slice(400).forEach(k => { delete tri[k]; });
    }
  }
  p.m = p.n === 0 ? delta : p.m * 0.8 + delta * 0.2;
  p.n++;
}

function recordTiming(lid, lesson, expected, prevCh, delta, prev2) {
  const P = S.settings;
  const st = charStat(lid, expected, true);
  if (delta >= 15 && delta <= pauseMs()) {
    ringPush(st.t, delta, 40);
    stampPush(st, "td", !lesson);
    st.n++;
    if (prevCh && prevCh !== " " && expected !== " ") {
      const L = layoutData(lid);
      const key = prevCh + expected;
      let p = L.pairs[key];
      if (!p) p = L.pairs[key] = { n: 0, m: delta };
      p.m = p.n === 0 ? delta : p.m * 0.8 + delta * 0.2;
      p.n++;
      notePair(lid, key, false);
      if (prev2 && prev2 !== " " && prevCh !== " " && expected !== " " && expected.length === 1) noteTri(lid, prev2 + prevCh + expected, delta);
    }
  }
}

function handleChar(ch, ts, hooks) {
  const lesson = S.lesson;
  if (!lesson || lesson.done) return;
  const lid = lesson.cm && lesson.cm[lesson.idx] ? S.settings.layout + ":code" : lesson.sid || S.settings.layout;
  if (lesson.idx === 0 && !lesson.start) lesson.start = ts;
  if (lesson.lastTs != null) lesson.act = (lesson.act || 0) + Math.max(0, Math.min(ts - lesson.lastTs, pauseMs()));
  lesson.lastTs = ts;
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
      stampPush(st, "od", false);
      if (lesson.prevTs != null && i > 0 && !lesson.flag[i - 1]) {
        recordTiming(lid, lesson, expected, lesson.chars[i - 1], ts - lesson.prevTs, i > 1 && !lesson.flag[i - 2] && !lesson.code ? lesson.chars[i - 2] : null);
      }
    }
    lesson.mark[i] = 1;
    if (lesson.cts) lesson.cts[i] = ts;
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
      const swapped = !lesson.code && ch !== expected && ch === lesson.chars[i + 1] && expected !== " " && ch !== " ";
      if (swapped) notePair(lid, expected + ch, true);
      else {
        st.a++;
        st.e++;
        ringPush(st.o, 1, 40);
        stampPush(st, "od", false);
        const keys = Object.keys(st.x);
        if (ch in st.x || keys.length < 8) st.x[ch] = (st.x[ch] || 0) + 1;
      }
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

function advance() {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const order = currentOrder();
  L.tot = (L.tot || 0) + 1;
  L.lk = (L.lk || 0) + 1;
  if (S.settings.progression !== "auto") return;
  const k = currentK();
  if (k >= order.length) return;
  const settled = activeKeys().every(c => statusOf(charStat(lid, c, false), c) === "steady");
  const ready = settled && lessonAccuracyOk(lid, "letters");
  if (gateUnlock(lid, "letters", ready)) {
    setK(k + 1);
    L.lk = 0;
    resetSitting(lid, "letters");
  }
}

function finishLesson(ts, hooks) {
  const lesson = S.lesson;
  lesson.done = true;
  const n = lesson.chars.length;
  const wall = Math.max(1, ts - lesson.start);
  const dur = lesson.act > 0 ? lesson.act : wall;
  const wpm = Math.max(0, ((n - 1) / 5) / (dur / 60000));
  const acc = Math.max(0, 1 - lesson.errs / n);
  if (lesson.code) {
    finishCode(lesson, wall);
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
  S.data.lessons.push({ ts: Date.now(), lid: S.settings.layout, tr: lesson.track || "letters", wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 1000) / 1000, n, ams: Math.round(dur) });
  if (S.data.lessons.length > 300) S.data.lessons.splice(0, S.data.lessons.length - 300);
  recordSession("l", S.settings.layout, wpm, acc, dur, n);
  if (acc >= 0.9) notePb(lessonPbKey(S.settings.layout), wpm, acc);
  noteSession(S.settings.layout, lesson.track || "letters", dur / n, lesson.errs / n);
  noteWork(dur, n, lesson.errs);
  if (!lesson.code && (!lesson.track || lesson.track === "letters")) noteWords(S.settings.layout, lessonWordItems(lesson));
  if (lesson.track && lesson.track !== "letters") advanceTrack(lesson.track);
  else advance();
  scheduleSave();
  hooks.finished();
}

function needsEscConfirm(lesson) {
  return !!lesson && !lesson.done && !lesson.code && lesson.chars.length > 0 && lesson.idx / lesson.chars.length > 0.3;
}

export { handleChar, needsEscConfirm, recordTiming, ringPush };
