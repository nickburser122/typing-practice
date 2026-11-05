import { rnd } from "../core/base.js";
import { REVIEW_RATE } from "../core/settings.js";
import { S, emitLessonBuilt, layoutInfo } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { fatigueHolding, gateUnlock, resetSitting } from "./fatigue.js";
import { carrierCtx, carrierWord, classKeys, punctPatterns, symbolPatterns } from "./mix.js";
import { activeKeys, currentK, currentOrder, setK } from "./order.js";
import { RECENT_LESSONS, gateOf, lessonAccuracyOk, needOf, skillOf, statusOf } from "./skill.js";
import { charStat, layoutData, recentAccuracy } from "./stats.js";
import { buildWords, pickW, rand } from "./words.js";

const TRACK_START = { capitals: 2, digits: 2, numpad: 3, punct: 2, symbols: 2, dia: 2 };

function trackList() {
  return layoutInfo().lang === "ar" ? ["letters", "digits", "numpad", "punct", "symbols", "dia"] : ["letters", "capitals", "digits", "numpad", "punct", "symbols"];
}

function trackKeys(tr) {
  return tr === "letters" ? currentOrder().slice() : classKeys(tr);
}

function learnTrack() {
  const a = S.settings.learnTracks.active;
  return trackList().indexOf(a) >= 0 && trackKeys(a).length ? a : "letters";
}

function trackK(tr) {
  if (tr === "letters") return currentK();
  const keys = trackKeys(tr);
  const v = layoutData(S.settings.layout).tracks[tr].k;
  return Math.max(Math.min(keys.length, 1), Math.min(keys.length, v == null ? TRACK_START[tr] : v));
}

function trackActive(tr) {
  return tr === "letters" ? activeKeys() : trackKeys(tr).slice(0, trackK(tr));
}

function setTrackK(tr, k) {
  if (tr === "letters") {
    setK(k);
    return;
  }
  layoutData(S.settings.layout).tracks[tr].k = Math.max(1, Math.min(trackKeys(tr).length, k));
  scheduleSave();
}

function stallAt() {
  return S.data.early ? 15 : 30;
}

function advanceTrack(tr) {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  L.tot = (L.tot || 0) + 1;
  if (S.settings.progression !== "auto") return;
  const k = trackK(tr);
  if (k >= trackKeys(tr).length) return;
  const slot = L.tracks[tr];
  slot.lk = (slot.lk || 0) + 1;
  const settled = trackActive(tr).every(c => statusOf(charStat(lid, c, false), c) === "steady");
  const ready = settled && lessonAccuracyOk(lid, tr);
  if (gateUnlock(lid, tr, ready)) {
    setTrackK(tr, k + 1);
    slot.lk = 0;
    resetSitting(lid, tr);
  }
}

function stallInfo() {
  const P = S.settings;
  if (P.progression !== "auto") return null;
  const tr = learnTrack();
  const lid = P.layout;
  const L = layoutData(lid);
  const complete = tr === "letters" ? currentK() >= currentOrder().length : trackK(tr) >= trackKeys(tr).length;
  if (complete) return null;
  if (fatigueHolding(lid, tr)) return { track: tr, kind: "fatigue", lessons: tr === "letters" ? L.lk || 0 : L.tracks[tr].lk || 0 };
  const spent = tr === "letters" ? L.lk || 0 : L.tracks[tr].lk || 0;
  if (spent < stallAt()) return null;
  const keys = trackActive(tr);
  let worst = null;
  let top = -1;
  keys.forEach(c => {
    const s = charStat(lid, c, false);
    if (statusOf(s, c) === "steady") return;
    const v = needOf(s, c);
    if (v > top) {
      top = v;
      worst = c;
    }
  });
  if (worst === null) {
    const recent = recentAccuracy(lid, RECENT_LESSONS, tr);
    if (recent === null || recent >= S.derived.targetAcc) return null;
    return { track: tr, kind: "lessons", n: keys.length, acc: recent, target: S.derived.targetAcc, lessons: spent };
  }
  const ws = charStat(lid, worst, false);
  if (statusOf(ws, worst) === "sparse") return { track: tr, kind: "few", c: worst, n: keys.length, have: ws ? ws.n : 0, need: S.derived.minS, lessons: spent };
  const sk = skillOf(lid, worst, ws);
  const gate = gateOf(worst);
  const slow = sk.upper > gate;
  return { track: tr, kind: slow ? "speed" : "key", c: worst, n: keys.length, ms: Math.round(sk.ms), gate: Math.round(gate), acc: sk.acc, target: S.derived.targetAcc, lessons: spent };
}

function plainWords() {
  const keep = S.settings;
  S.settings = Object.assign({}, keep, { caps: false, digits: false, punct: false, dia: false });
  try {
    return buildWords();
  } finally {
    S.settings = keep;
  }
}

function pickNeed(keys) {
  const lid = S.settings.layout;
  return pickW(keys, keys.map(c => Math.max(0.2, needOf(charStat(lid, c, false), c))));
}

function trackFocus(keys) {
  const lid = S.settings.layout;
  let best = null;
  let bv = -1;
  keys.forEach(c => {
    const s = charStat(lid, c, false);
    if (statusOf(s, c) === "steady") return;
    const v = needOf(s, c) + rnd() * 0.001;
    if (v > bv) {
      bv = v;
      best = c;
    }
  });
  return best;
}

function wantKey(keys, focus) {
  return focus && rnd() < 0.6 ? focus : pickNeed(keys);
}

function validTrackToken(tok, set) {
  let has = false;
  for (const c of tok) {
    if (c === " " || /\p{L}/u.test(c)) continue;
    if (!set.has(c)) return false;
    has = true;
  }
  return has;
}

function buildTrackWords(tr) {
  const N = S.settings.lessonWords;
  const keys = trackActive(tr);
  const words = [];
  const focus = trackFocus(keys);
  const out = () => ({ words, focus, focusPair: null });
  if (tr === "digits" || tr === "numpad") {
    const digs = keys.filter(c => /[0-9]/.test(c));
    const seps = keys.filter(c => !/[0-9]/.test(c));
    if (!digs.length) return plainWords();
    for (let i = 0; i < N; i++) {
      const len = 2 + rand(4);
      let s = "";
      for (let j = 0; j < len; j++) s += pickNeed(digs);
      if (seps.length && len >= 3 && rand(3) === 0) {
        const p = 1 + rand(len - 1);
        s = s.slice(0, p) + seps[rand(seps.length)] + s.slice(p);
      }
      if (focus && s.indexOf(focus) < 0 && rnd() < 0.6) {
        if (/[0-9]/.test(focus)) {
          const p = rand(s.length);
          if (/[0-9]/.test(s[p])) s = s.slice(0, p) + focus + s.slice(p + 1);
          else s += focus;
        } else if (s.length >= 3) {
          const p = 1 + rand(s.length - 1);
          s = s.slice(0, p) + focus + s.slice(p);
        }
      }
      words.push(s);
    }
    return out();
  }
  if (tr === "capitals") {
    const base = plainWords().words;
    const letters = activeKeys();
    for (let i = 0; i < N; i++) {
      if (rand(4) === 0) {
        words.push(base[rand(base.length)]);
        continue;
      }
      const c = wantKey(keys, focus);
      const low = c.toLowerCase();
      const cand = base.filter(w => w[0] === low);
      let tail;
      if (cand.length) tail = cand[rand(cand.length)].slice(1);
      else {
        tail = "";
        const n = 1 + rand(3);
        for (let j = 0; j < n; j++) tail += letters[rand(letters.length)];
      }
      words.push(c + tail);
    }
    return out();
  }
  const cc = carrierCtx(true);
  const set = new Set(keys);
  const pats = tr === "punct" ? punctPatterns() : tr === "symbols" ? symbolPatterns() : [];
  for (let i = 0; i < N; i++) {
    if (rand(4) === 0) {
      words.push(carrierWord(cc));
      continue;
    }
    const want = wantKey(keys, focus);
    let tok = null;
    for (let tries = 0; tries < 10 && !tok; tries++) {
      const cand = tr === "dia" ? carrierWord(cc) + keys[rand(keys.length)] : pats[rand(pats.length)](carrierWord(cc), carrierWord(cc));
      if (validTrackToken(cand, set) && cand.indexOf(want) >= 0) tok = cand;
    }
    if (!tok) {
      const a = carrierWord(cc);
      const r = rand(3);
      tok = r === 0 ? a + want : r === 1 ? want + a : a + want + carrierWord(cc);
    }
    words.push(tok || carrierWord(cc) + keys[0]);
  }
  return out();
}

function reviewItems(exclude) {
  const lid = S.settings.layout;
  const out = [];
  trackList().forEach(tr => {
    if (tr === "letters" || tr === exclude) return;
    const keys = trackActive(tr).filter(c => statusOf(charStat(lid, c, false), c) === "steady");
    if (keys.length) out.push({ tr, keys });
  });
  return out;
}

function reviewToken(item, words) {
  const tr = item.tr;
  const keys = item.keys;
  const w = words[rand(words.length)];
  if (tr === "digits" || tr === "numpad") {
    const digs = keys.filter(c => /[0-9]/.test(c));
    if (!digs.length) return null;
    let s = "";
    const n = 2 + rand(3);
    for (let i = 0; i < n; i++) s += digs[rand(digs.length)];
    return s;
  }
  if (tr === "capitals") {
    const c = keys[rand(keys.length)];
    const cand = words.filter(x => x[0] === c.toLowerCase());
    return cand.length ? c + cand[rand(cand.length)].slice(1) : null;
  }
  if (tr === "dia") return /\p{L}/u.test(w) ? w + keys[rand(keys.length)] : null;
  const pats = tr === "punct" ? punctPatterns() : symbolPatterns();
  const set = new Set(keys);
  for (let i = 0; i < 6; i++) {
    const tok = pats[rand(pats.length)](w, words[rand(words.length)]);
    if (validTrackToken(tok, set)) return tok;
  }
  return null;
}

function reviewBlend(words, tr) {
  const st = S.settings;
  if (st.caps || st.digits || st.punct || st.dia) return words;
  const items = reviewItems(tr);
  if (!items.length) return words;
  return words.map(w => (rnd() < REVIEW_RATE / 100 ? reviewToken(items[rand(items.length)], words) || w : w));
}

function makeLesson(chars, b, tr) {
  S.lesson = {
    chars,
    idx: 0,
    flag: new Uint8Array(chars.length),
    mark: new Uint8Array(chars.length),
    errTs: new Float64Array(chars.length),
    cts: new Float64Array(chars.length),
    start: 0,
    prevTs: null,
    errs: 0,
    focus: b.focus,
    focusPair: b.focusPair,
    done: false,
    track: tr
  };
}

function newLesson() {
  emitLessonBuilt();
  const tr = learnTrack();
  const b = tr === "letters" ? buildWords() : buildTrackWords(tr);
  const text = reviewBlend(b.words, tr).join(" ");
  makeLesson(text.split(""), b, tr);
}

function newWordsLesson(list) {
  const clean = Array.from(new Set(list.filter(w => typeof w === "string" && w.length > 0 && w.length <= 24)));
  if (!clean.length) return false;
  emitLessonBuilt();
  const N = S.settings.lessonWords;
  const words = [];
  while (words.length < N) {
    const round = clean.slice();
    for (let i = round.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      const tmp = round[i];
      round[i] = round[j];
      round[j] = tmp;
    }
    round.forEach(w => {
      if (words.length < N) words.push(w);
    });
  }
  makeLesson(words.join(" ").split(""), { focus: null, focusPair: null }, "letters");
  return true;
}

function unlockAnyway() {
  const info = stallInfo();
  if (!info || info.kind === "fatigue") return false;
  const tr = info.track;
  const lid = S.settings.layout;
  const L = layoutData(lid);
  if (tr === "letters") {
    const k = currentK();
    if (k >= currentOrder().length) return false;
    setK(k + 1);
    L.lk = 0;
  } else {
    const k = trackK(tr);
    if (k >= trackKeys(tr).length) return false;
    setTrackK(tr, k + 1);
    L.tracks[tr].lk = 0;
  }
  if (info.c) L.raise = { c: info.c, until: (L.tot || 0) + 30 };
  resetSitting(lid, tr);
  scheduleSave();
  return true;
}

export {
  advanceTrack, learnTrack, newLesson, newWordsLesson, setTrackK, stallInfo, trackActive, trackK, trackKeys, trackList, unlockAnyway
};
