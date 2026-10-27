import { rnd } from "../core/base.js";
import { S, emitLessonBuilt, layoutInfo } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { carrierCtx, carrierWord, classKeys, punctPatterns, symbolPatterns } from "./mix.js";
import { activeKeys, currentK, currentOrder, setK } from "./order.js";
import { RECENT_LESSONS, gateMs, lessonAccuracyOk, needOf, skillOf, statusOf } from "./skill.js";
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

const TRACK_PATIENCE = 30;
const STALL_LESSONS = 30;

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
  const ready = settled && (S.settings.unlock !== "strict" || lessonAccuracyOk(lid));
  if (ready || (S.settings.unlock === "assist" && slot.lk >= TRACK_PATIENCE)) {
    setTrackK(tr, k + 1);
    slot.lk = 0;
  }
}

function stallInfo() {
  const P = S.settings;
  if (P.progression !== "auto" || P.unlock !== "strict") return null;
  const tr = learnTrack();
  const lid = P.layout;
  const L = layoutData(lid);
  const complete = tr === "letters" ? currentK() >= currentOrder().length : trackK(tr) >= trackKeys(tr).length;
  if (complete) return null;
  const spent = tr === "letters" ? L.lk || 0 : L.tracks[tr].lk || 0;
  if (spent < STALL_LESSONS) return null;
  const keys = trackActive(tr);
  let worst = null;
  let top = -1;
  keys.forEach(c => {
    const s = charStat(lid, c, false);
    if (statusOf(s, c) !== "learning") return;
    const v = needOf(s, c);
    if (v > top) {
      top = v;
      worst = c;
    }
  });
  if (worst === null) {
    const recent = recentAccuracy(lid, RECENT_LESSONS);
    if (recent === null || recent >= S.derived.targetAcc) return null;
    return { track: tr, kind: "lessons", n: keys.length, acc: recent, target: S.derived.targetAcc, lessons: spent };
  }
  const sk = skillOf(lid, worst, charStat(lid, worst, false));
  const gate = gateMs();
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
  const out = () => ({ words, focus: null, focusPair: null });
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
      const c = pickNeed(keys);
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
    const want = pickNeed(keys);
    let tok = null;
    for (let tries = 0; tries < 10 && !tok; tries++) {
      const cand = tr === "dia" ? carrierWord(cc) + keys[rand(keys.length)] : pats[rand(pats.length)](carrierWord(cc), carrierWord(cc));
      if (validTrackToken(cand, set) && (cand.indexOf(want) >= 0 || tries > 5)) tok = cand;
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
  if (!st.reviewRate || st.caps || st.digits || st.punct || st.dia) return words;
  const items = reviewItems(tr);
  if (!items.length) return words;
  return words.map(w => (rnd() < st.reviewRate / 100 ? reviewToken(items[rand(items.length)], words) || w : w));
}

function newLesson() {
  emitLessonBuilt();
  const tr = learnTrack();
  const b = tr === "letters" ? buildWords() : buildTrackWords(tr);
  const text = reviewBlend(b.words, tr).join(" ");
  const chars = text.split("");
  S.lesson = {
    chars,
    idx: 0,
    flag: new Uint8Array(chars.length),
    mark: new Uint8Array(chars.length),
    errTs: new Float64Array(chars.length),
    start: 0,
    prevTs: null,
    errs: 0,
    focus: b.focus,
    focusPair: b.focusPair,
    done: false,
    track: tr
  };
}

export {
  advanceTrack, learnTrack, newLesson, setTrackK, stallInfo, trackActive, trackK, trackKeys, trackList
};
