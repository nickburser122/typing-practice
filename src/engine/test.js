import { rnd } from "../core/base.js";
import { bestOf, notePb, pbOf, recordSession, testPbKey } from "../core/history.js";
import { S, layoutInfo, typeable } from "../core/state.js";
import { customWords, scheduleSave } from "../core/storage.js";
import { AR_MARKS, DIGITS } from "../data/layouts.js";
import { QUOTES, QUOTE_BUCKETS } from "../data/quotes.js";
import { WORDS } from "../data/words.js";
import { currentK, currentOrder } from "./order.js";
import { recordTiming, ringPush } from "./session.js";
import { rampMs, skillOf, wilsonLower } from "./skill.js";
import { charStat, layoutData } from "./stats.js";
import { rand } from "./words.js";

const TEST_EXTRA = 8;
const TCACHE = {};
const QUOTE_LENS = ["short", "medium", "long", "all"];
const CUSTOM_MAX = 300;
let lastQuote = "";

function tcfg() {
  const st = S.settings;
  if (S.testOv) return Object.assign({ diff: "normal", stop: "off" }, S.testOv);
  const mode = st.testMode;
  const fixed = mode === "quote" || mode === "custom";
  const amt = mode === "words" ? st.testWords : mode === "time" ? st.testTime : mode === "quote" ? QUOTE_LENS.indexOf(st.testQuote) + 1 : 0;
  return { mode, amt, list: fixed ? "1000" : st.testList, punct: st.testPunct, num: st.testNum, caps: st.testCaps, dia: st.testDia, diff: st.testDiff, stop: st.testStop };
}

function quotePool(len) {
  const lay = layoutInfo();
  const key = "q:" + lay.id + ":" + len;
  if (TCACHE[key]) return TCACHE[key];
  const bounds = QUOTE_BUCKETS[lay.lang];
  const all = QUOTES[lay.lang].filter(q => q.split("").every(c => c === " " || typeable(c)));
  let pool = all.filter(q => len === "all" || (len === "short" ? q.length < bounds[0] : len === "medium" ? q.length >= bounds[0] && q.length < bounds[1] : q.length >= bounds[1]));
  if (!pool.length) pool = all;
  TCACHE[key] = pool;
  return pool;
}

function pickQuote(len) {
  const pool = quotePool(len);
  if (!pool.length) return null;
  let q = pool[rand(pool.length)];
  for (let tries = 0; tries < 6 && q === lastQuote && pool.length > 1; tries++) q = pool[rand(pool.length)];
  lastQuote = q;
  return q;
}

function testPool() {
  const lay = layoutInfo();
  const list = tcfg().list;
  const key = lay.id + ":" + list;
  if (TCACHE[key]) return TCACHE[key];
  const all = WORDS[lay.lang].filter(w => w.split("").every(typeable));
  let pool = list === "all" ? all : all.slice(0, Number(list));
  if (pool.length < 20) pool = all;
  TCACHE[key] = pool;
  return pool;
}

function testExt() {
  const c = tcfg();
  const lang = layoutInfo().lang;
  const plain = c.mode === "time" || c.mode === "words";
  const rules = (c.diff === "expert" ? 16 : 0) + (c.diff === "master" ? 32 : 0) + (c.stop && c.stop !== "off" ? 64 : 0);
  return (plain ? (c.punct ? 1 : 0) + (c.num ? 2 : 0) + (lang === "en" && c.caps ? 4 : 0) + (lang === "ar" && c.dia ? 8 : 0) : 0) + rules;
}

function genTestWords(n, carry) {
  const c0 = tcfg();
  const st = { testNum: c0.num, testPunct: c0.punct, testCaps: c0.caps, testDia: c0.dia };
  const marks = AR_MARKS.filter(typeable);
  const lang = layoutInfo().lang;
  const pool = testPool();
  const digs = DIGITS.filter(typeable);
  const stops = (lang === "ar" ? [".", ".", "؟"] : [".", ".", ".", "?", "!"]).filter(typeable);
  const commas = (lang === "ar" ? ["،"] : [","]).filter(typeable);
  const out = [];
  for (let i = 0; i < n; i++) {
    let w = "";
    let isNum = false;
    if (st.testNum && digs.length && rnd() < 0.1) {
      const len = 1 + rand(4);
      for (let j = 0; j < len; j++) {
        let d = digs[rand(digs.length)];
        if (j === 0 && len > 1 && d === "0") d = digs[(digs.indexOf(d) + 1) % digs.length];
        w += d;
      }
      isNum = true;
    } else {
      for (let tries = 0; tries < 8; tries++) {
        w = pool[rand(pool.length)];
        if (w !== carry.prev) break;
      }
      carry.prev = w;
    }
    if (!isNum && lang === "en" && ((st.testPunct && carry.cap) || (st.testCaps && rnd() < 0.25))) {
      const up = w[0].toUpperCase();
      if (typeable(up)) w = up + w.slice(1);
    }
    if (!isNum && lang === "ar" && st.testDia && marks.length && rnd() < 0.5) w += marks[rand(marks.length)];
    if (st.testPunct && !isNum) {
      carry.left--;
      carry.cap = false;
      if (carry.left <= 0 && stops.length) {
        w += stops[rand(stops.length)];
        carry.left = 5 + rand(8);
        carry.cap = true;
      } else if (commas.length && rnd() < 0.12) {
        w += commas[0];
      }
    }
    out.push(w);
  }
  return out;
}

function testNew(repeat) {
  const cfg = tcfg();
  const carry = { prev: "", left: 5 + rand(8), cap: true };
  let words;
  if (repeat && S.test && S.test.words0) words = S.test.words0.slice();
  else if (cfg.mode === "quote") {
    const q = pickQuote(S.settings.testQuote);
    words = q ? q.split(" ") : genTestWords(25, carry);
  } else if (cfg.mode === "custom") words = customWords().slice(0, CUSTOM_MAX);
  else words = genTestWords(cfg.mode === "words" ? cfg.amt : 80, carry);
  S.test = {
    lid: S.settings.layout,
    mode: cfg.mode,
    amt: cfg.mode === "custom" ? words.length : cfg.amt,
    list: cfg.list,
    ext: testExt(),
    diff: cfg.diff || "normal",
    stop: cfg.stop || "off",
    failed: "",
    place: !!S.testOv,
    words,
    words0: words.slice(),
    carry,
    wi: 0,
    typed: "",
    committed: [],
    done: false,
    running: false,
    start: 0,
    end: 0,
    prevTs: null,
    prevCh: null,
    prevOk: false,
    ccWords: 0,
    rawWords: 0,
    strokes: 0,
    bad: 0,
    log: [],
    seen: new Set(),
    per: {},
    res: null
  };
}

function testNetNow(T) {
  const w = T.words[T.wi] || "";
  const cur = T.typed.length > 0 && w.indexOf(T.typed) === 0 ? T.typed.length : 0;
  return T.ccWords + cur;
}

function testRawNow(T) {
  return T.rawWords + T.typed.length;
}

function testSnap(T, ts) {
  T.log.push([ts - T.start, testNetNow(T), testRawNow(T), T.bad]);
}

function testFeedKey(T, expected, ch, ok, ts) {
  const pos = T.wi + ":" + T.typed.length;
  const seen = T.seen.has(pos);
  let delta = null;
  if (ok && !seen && T.prevOk && T.prevTs != null) delta = ts - T.prevTs;
  const P = S.settings;
  const per = T.per[expected] || (T.per[expected] = { n: 0, sum: 0, e: 0, a: 0 });
  if (!ok && !seen) {
    per.e++;
    per.a++;
  } else if (ok && !seen) per.a++;
  if (delta != null && delta >= 15 && delta <= P.pause) {
    per.n++;
    per.sum += delta;
  }
  if (!ok && !seen) T.seen.add(pos);
  if (!P.testFeed && !T.place) return;
  if (expected !== " " && !typeable(expected)) return;
  const stt = charStat(T.lid, expected, true);
  stt.ls = Date.now();
  if (ok) {
    if (!seen) {
      stt.a++;
      ringPush(stt.o, 0, 40);
      if (delta != null) recordTiming(T.lid, null, expected, T.prevCh, delta);
    }
  } else if (!seen) {
    stt.a++;
    stt.e++;
    ringPush(stt.o, 1, 40);
    const keys = Object.keys(stt.x);
    if (ch in stt.x || keys.length < 8) stt.x[ch] = (stt.x[ch] || 0) + 1;
  }
}

function testChar(ch, ts) {
  const T = S.test;
  if (!T || T.done || !T.words.length) return;
  if (T.running && T.mode === "time" && ts >= T.start + T.amt * 1000) {
    testFinish(T.start + T.amt * 1000);
    return;
  }
  if (ch === " " && !T.typed.length) return;
  const w = T.words[T.wi];
  if (ch === " " && T.stop === "word" && T.typed !== w) return;
  if (!T.running) {
    T.running = true;
    T.start = ts;
  }
  if (ch === " ") {
    const ok = T.typed === w;
    T.strokes++;
    if (!ok && T.diff === "expert") {
      testFinish(ts, "expert");
      return;
    }
    if (ok) testFeedKey(T, " ", " ", true, ts);
    T.rawWords += T.typed.length + 1;
    if (ok) T.ccWords += w.length + 1;
    T.committed.push(T.typed);
    T.prevCh = " ";
    T.prevOk = ok;
    T.prevTs = ts;
    T.typed = "";
    T.wi++;
    if (T.mode === "time" && T.words.length - T.wi < 30) T.words.push.apply(T.words, genTestWords(40, T.carry));
    if (T.mode !== "time" && T.wi >= T.words.length) {
      T.wi = T.words.length - 1;
      T.typed = T.committed.pop();
      T.rawWords -= T.typed.length + 1;
      if (ok) T.ccWords -= w.length + 1;
      testFinish(ts);
      return;
    }
    testSnap(T, ts);
    return;
  }
  T.strokes++;
  if (T.typed.length >= w.length) {
    T.bad++;
    if (T.stop === "off" && T.typed.length < w.length + TEST_EXTRA) T.typed += ch;
    T.prevOk = false;
    testSnap(T, ts);
    if (T.diff === "master") testFinish(ts, "master");
    return;
  }
  const expected = w[T.typed.length];
  const ok = ch === expected;
  if (!ok) T.bad++;
  testFeedKey(T, expected, ch, ok, ts);
  if (!ok && T.stop === "letter") {
    T.prevOk = false;
    testSnap(T, ts);
    if (T.diff === "master") testFinish(ts, "master");
    return;
  }
  T.typed += ch;
  T.prevCh = ch;
  T.prevOk = ok;
  T.prevTs = ts;
  testSnap(T, ts);
  if (!ok && T.diff === "master") {
    testFinish(ts, "master");
    return;
  }
  if (T.mode !== "time" && T.wi === T.words.length - 1 && T.typed === w) testFinish(ts);
}

function testRewind(whole) {
  const T = S.test;
  if (!T || T.wi < 1) return false;
  const prev = T.committed[T.wi - 1];
  if (prev === T.words[T.wi - 1]) return false;
  T.wi--;
  T.typed = T.committed.pop();
  T.rawWords -= T.typed.length + 1;
  if (whole) T.typed = "";
  T.prevOk = false;
  return true;
}

function testBackspace(whole) {
  const T = S.test;
  if (S.settings.confident) return;
  if (!T || T.done || !T.running) return;
  if (!T.typed.length) {
    testRewind(whole);
    return;
  }
  T.typed = whole ? "" : T.typed.slice(0, -1);
  T.prevOk = false;
}

function testTick(now) {
  const T = S.test;
  if (T && T.running && !T.done && T.mode === "time" && now >= T.start + T.amt * 1000) testFinish(T.start + T.amt * 1000);
}

function testChars(T) {
  let ok = 0;
  let bad = 0;
  let extra = 0;
  let miss = 0;
  const all = T.committed.concat([T.typed]);
  all.forEach((typed, i) => {
    const w = T.words[i];
    const last = i === all.length - 1;
    for (let j = 0; j < typed.length; j++) {
      if (j >= w.length) extra++;
      else if (typed[j] === w[j]) ok++;
      else bad++;
    }
    if (!last && typed.length < w.length) miss += w.length - typed.length;
  });
  return { ok, bad, extra, miss };
}

function consistency(vals) {
  if (!vals || vals.length < 2) return 0;
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!isFinite(m) || m <= 0) return 0;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
  const cv = sd / m;
  return Math.max(0, Math.min(100, 100 * (1 - Math.tanh(cv + (cv * cv * cv) / 3 + Math.pow(cv, 5) / 5))));
}

function testFinish(ts, failed) {
  const T = S.test;
  if (!T || T.done) return;
  T.done = true;
  T.running = false;
  T.end = ts;
  T.failed = failed || "";
  testSnap(T, ts);
  const durMs = Math.max(1000, ts - T.start);
  const min = durMs / 60000;
  const net = testNetNow(T);
  const raw = testRawNow(T);
  const wpm = net / 5 / min;
  const rawWpm = raw / 5 / min;
  const acc = T.strokes ? (T.strokes - T.bad) / T.strokes : 1;
  const secs = Math.ceil(durMs / 1000);
  const series = [];
  let li = 0;
  let prevRaw = 0;
  let prevBad = 0;
  let lastNet = 0;
  let lastRaw = 0;
  let lastBad = 0;
  const rawPer = [];
  for (let s = 1; s <= secs; s++) {
    const b = Math.min(s * 1000, durMs);
    while (li < T.log.length && T.log[li][0] <= b) {
      lastNet = T.log[li][1];
      lastRaw = T.log[li][2];
      lastBad = T.log[li][3];
      li++;
    }
    const spanSec = b / 1000;
    const span = b - (s - 1) * 1000;
    const rp = span < 500 ? null : Math.max(0, (lastRaw - prevRaw) * 12 * (1000 / span));
    series.push({ s: spanSec, wpm: lastNet / 5 / (spanSec / 60), raw: rp, err: lastBad - prevBad });
    if (rp != null) rawPer.push(rp);
    prevRaw = lastRaw;
    prevBad = lastBad;
  }
  const letters = Object.keys(T.per).filter(c => c !== " ").map(c => ({ c, n: T.per[c].n, m: T.per[c].n ? T.per[c].sum / T.per[c].n : 0, e: T.per[c].e, a: T.per[c].a }));
  const slow = letters.filter(x => x.n >= 3).sort((a, b) => b.m - a.m).slice(0, 5);
  const miss = letters.filter(x => x.e > 0).sort((a, b) => b.e / b.a - a.e / a.a || b.e - a.e).slice(0, 5);
  const prev = S.data.tests.filter(x => x.lid === T.lid && x.mode === T.mode && x.amt === T.amt && x.list === T.list && (x.ext || 0) === T.ext);
  const rec = { ts: Date.now(), lid: T.lid, mode: T.mode, amt: T.amt, list: T.list, ext: T.ext, wpm: Math.round(wpm * 10) / 10, raw: Math.round(rawWpm * 10) / 10, acc: Math.round(acc * 1000) / 1000, cons: Math.round(consistency(rawPer)) };
  const pbPrev = T.mode === "custom" ? null : bestOf(pbOf(testPbKey(rec)), prev);
  T.res = {
    wpm, raw: rawWpm, acc, cons: rec.cons, dur: durMs / 1000, series,
    chars: testChars(T), slow, miss, pbPrev,
    isPb: !T.failed && pbPrev != null && rec.wpm > pbPrev,
    failed: T.failed,
    custom: T.mode === "custom",
    fed: !!S.settings.testFeed
  };
  if (T.place) {
    if (T.strokes > 0) applyPlacement(T);
    else T.res.placed = currentK();
  }
  if (T.strokes > 0 && !T.place && !T.failed) {
    if (T.mode !== "custom") {
      S.data.tests.push(rec);
      if (S.data.tests.length > 200) S.data.tests.splice(0, S.data.tests.length - 200);
      notePb(testPbKey(rec), rec.wpm, rec.acc, rec.ts);
    }
    recordSession("t", T.lid, wpm, acc, durMs, T.strokes, rec.ts);
    scheduleSave();
  }
}

function testHistory() {
  const T = S.test;
  const lid = T ? T.lid : S.settings.layout;
  const c = T || Object.assign(tcfg(), { ext: testExt() });
  if (c.mode === "custom") return [];
  return S.data.tests.filter(x => x.lid === lid && x.mode === c.mode && x.amt === c.amt && x.list === c.list && (x.ext || 0) === c.ext);
}

function applyPlacement(T) {
  const lid = T.lid;
  const L = layoutData(lid);
  const order = currentOrder();
  const start = Math.max(2, S.settings.startKeys);
  const goal = S.derived.targetAcc;
  let k = start;
  for (let i = start; i < order.length; i++) {
    const s = charStat(lid, order[i], false);
    if (!s || s.n < 3) continue;
    const sk = skillOf(lid, order[i], s);
    if (wilsonLower(1 - 0.1 / sk.an, sk.an) < goal) continue;
    if (sk.upper > rampMs(i + 1) || sk.lower < goal) break;
    k = i + 1;
  }
  L.k = Math.max(k, currentK());
  L.placed = true;
  T.res.placed = L.k;
  scheduleSave();
}

export {
  QUOTE_LENS, applyPlacement, consistency, genTestWords, testBackspace, testChar, testExt, testFinish, testHistory,
  testNetNow, testNew, testRewind, testTick
};
