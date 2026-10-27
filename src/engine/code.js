import { bestOf, codePbKey, notePb, pbOf, recordSession } from "../core/history.js";
import { S } from "../core/state.js";
import { CODE_IDS, CODE_SETS } from "../data/code-sets.js";
import { LAYOUTS } from "../data/layouts.js";
import { skillOf } from "./skill.js";
import { charStat, layoutData } from "./stats.js";
import { consistency } from "./test.js";
import { pickW } from "./words.js";

function codeLayoutId() {
  const l = S.settings.layout;
  return LAYOUTS[l].lang === "en" ? l : "en-qwerty";
}

function codeSid() {
  return codeLayoutId() + ":code";
}

const CASE_KEY = "\u21E7";

function caseStep(lesson, i) {
  return i > 0 && /[A-Z]/.test(lesson.chars[i]) && /[a-z]/.test(lesson.chars[i - 1]);
}

function isPlain(ch) {
  return /[a-z0-9 ]/i.test(ch);
}

function codeNeed(sid, ch) {
  const s = charStat(sid, ch, false);
  if (!s || s.n < 3) return 1.15;
  const k = skillOf(sid, ch, s);
  return Math.max(0.2, k.ms / S.derived.targetMs) + 4 * Math.max(0, 1 - k.acc - (1 - S.derived.targetAcc));
}

function codePool() {
  const id = S.settings.codeSet;
  const ids = CODE_SETS[id] ? [id] : CODE_IDS;
  const out = [];
  ids.forEach(i => CODE_SETS[i].forEach(text => out.push(text)));
  return out;
}

function buildCodeLesson() {
  const sid = codeSid();
  const pool = codePool();
  const recent = new Set(S.codeRecent || []);
  let avail = pool.filter(x => !recent.has(x));
  if (avail.length < 4) avail = pool;
  const need = {};
  const weights = avail.map(text => {
    let ex = 0;
    for (const ch of text) {
      if (isPlain(ch)) continue;
      if (!(ch in need)) need[ch] = codeNeed(sid, ch);
      ex += Math.max(0, need[ch] - 1);
    }
    const steps = (text.match(/[a-z][A-Z]/g) || []).length;
    if (steps) {
      if (!(CASE_KEY in need)) need[CASE_KEY] = codeNeed(sid, CASE_KEY);
      ex += steps * Math.max(0, need[CASE_KEY] - 1);
    }
    return Math.pow(1 + Math.min(ex, 8), 2);
  });
  const picks = [];
  const used = new Set();
  let len = 0;
  for (let tries = 0; tries < 200 && len < 150 && picks.length < 8 && used.size < avail.length; tries++) {
    const x = pickW(avail, weights);
    if (used.has(x)) continue;
    used.add(x);
    picks.push(x);
    len += x.length + 1;
  }
  S.codeRecent = (S.codeRecent || []).concat(picks).slice(-30);
  return picks;
}

function newCodeLesson() {
  const sid = codeSid();
  const chars = buildCodeLesson().join(" ").split("");
  S.lesson = {
    chars,
    idx: 0,
    flag: new Uint8Array(chars.length),
    mark: new Uint8Array(chars.length),
    errTs: new Float64Array(chars.length),
    start: 0,
    prevTs: null,
    errs: 0,
    focus: null,
    focusPair: null,
    done: false,
    code: true,
    sid,
    log: [],
    per: {},
    keys: 0,
    net: 0,
    bad: 0
  };
}

function codeNote(lesson, ch, ms, err) {
  const p = lesson.per[ch] || (lesson.per[ch] = { n: 0, sum: 0, e: 0, a: 0 });
  p.a++;
  if (err) p.e++;
  else if (ms > 0 && ms < 3000) {
    p.n++;
    p.sum += ms;
  }
}

function codeHistory() {
  return (S.data.code || []).filter(x => x.lid === codeLayoutId() && x.set === S.settings.codeSet);
}

function finishCode(lesson, durMs) {
  const L = layoutData(lesson.sid);
  L.tot = (L.tot || 0) + 1;
  const dur = Math.max(1000, durMs);
  const min = dur / 60000;
  const keys = lesson.keys;
  const wpm = lesson.net / 5 / min;
  const raw = keys / 5 / min;
  const acc = keys ? (keys - lesson.bad) / keys : 1;
  const secs = Math.ceil(dur / 1000);
  const series = [];
  const rawPer = [];
  let li = 0;
  let prevRaw = 0;
  let prevBad = 0;
  let lastNet = 0;
  let lastRaw = 0;
  let lastBad = 0;
  for (let sec = 1; sec <= secs; sec++) {
    const b = Math.min(sec * 1000, dur);
    while (li < lesson.log.length && lesson.log[li][0] <= b) {
      lastNet = lesson.log[li][1];
      lastRaw = lesson.log[li][2];
      lastBad = lesson.log[li][3];
      li++;
    }
    const spanSec = b / 1000;
    const span = b - (sec - 1) * 1000;
    const rp = span < 500 ? null : Math.max(0, (lastRaw - prevRaw) * 12 * (1000 / span));
    series.push({ s: spanSec, wpm: lastNet / 5 / (spanSec / 60), raw: rp, err: lastBad - prevBad });
    if (rp != null) rawPer.push(rp);
    prevRaw = lastRaw;
    prevBad = lastBad;
  }
  const keysSeen = Object.keys(lesson.per).filter(c => c !== " ").map(c => ({ c, n: lesson.per[c].n, m: lesson.per[c].n ? lesson.per[c].sum / lesson.per[c].n : 0, e: lesson.per[c].e, a: lesson.per[c].a }));
  const slow = keysSeen.filter(x => x.n >= 2).sort((a, b) => b.m - a.m).slice(0, 5);
  const miss = keysSeen.filter(x => x.e > 0).sort((a, b) => b.e / b.a - a.e / a.a || b.e - a.e).slice(0, 5);
  if (!S.data.code) S.data.code = [];
  const lid = codeLayoutId();
  const prev = S.data.code.filter(x => x.lid === lid && x.set === S.settings.codeSet);
  const rec = { ts: Date.now(), lid, set: S.settings.codeSet, wpm: Math.round(wpm * 10) / 10, raw: Math.round(raw * 10) / 10, acc: Math.round(acc * 1000) / 1000, cons: Math.round(consistency(rawPer)) };
  const pbPrev = bestOf(pbOf(codePbKey(rec)), prev);
  S.codeRes = {
    wpm, raw, acc, cons: rec.cons, dur: dur / 1000, series,
    chars: { ok: lesson.net, bad: lesson.bad, extra: 0, miss: Math.max(0, lesson.chars.length - lesson.idx) },
    slow, miss, pbPrev,
    isPb: pbPrev != null && rec.wpm > pbPrev
  };
  if (keys > 0) {
    S.data.code.push(rec);
    if (S.data.code.length > 200) S.data.code.splice(0, S.data.code.length - 200);
    notePb(codePbKey(rec), rec.wpm, rec.acc, rec.ts);
    recordSession("c", lid, wpm, acc, dur, keys, rec.ts);
  }
}

export {
  CASE_KEY, buildCodeLesson, caseStep, codeHistory, codeLayoutId, codeNeed, codeNote, codePool, codeSid,
  finishCode, isPlain, newCodeLesson
};
