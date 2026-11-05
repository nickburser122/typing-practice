import { layoutInfo } from "../core/state.js";
import { ensureLex } from "./lexicon.js";
import { layoutData, median } from "./stats.js";

const WEAK_CAP = 300;

function isRealWord(lex, w) {
  if (!lex.wset) lex.wset = new Set(lex.entries.map(e => e.w));
  return lex.wset.has(w);
}

function weakScore(e) {
  return e.misses + Math.min(3, e.slowMs / 150);
}

function noteWords(lid, items, now) {
  const L = layoutData(lid);
  const lex = ensureLex(layoutInfo().lang);
  const weak = L.weak || (L.weak = []);
  const at = now == null ? Date.now() : now;
  items.forEach(it => {
    const w = it.w;
    if (typeof w !== "string" || w.length < 3 || !isRealWord(lex, w)) return;
    const slow = it.slow > 0 ? it.slow : 0;
    const i = weak.findIndex(x => x.w === w);
    if (i < 0) {
      if (it.bad || slow > 0) weak.push({ w, misses: it.bad ? 1 : 0, slowMs: slow, ls: at });
      return;
    }
    const e = weak[i];
    e.misses = it.bad ? e.misses * 0.8 + 1 : e.misses * 0.7;
    e.slowMs = slow > 0 ? e.slowMs * 0.8 + slow : e.slowMs * 0.7;
    e.ls = at;
    if (weakScore(e) < 0.2) weak.splice(i, 1);
  });
  weak.sort((a, b) => weakScore(b) - weakScore(a));
  if (weak.length > WEAK_CAP) weak.length = WEAK_CAP;
}

function slowExcess(per, clean) {
  const base = [];
  per.forEach((v, i) => {
    if (v != null && clean[i]) base.push(v);
  });
  const out = per.map(() => 0);
  if (base.length < 6) return out;
  const med = median(base);
  per.forEach((v, i) => {
    if (v != null && clean[i] && v > 1.5 * med && v - med >= 60) out[i] = v - med;
  });
  return out;
}

function lessonWordItems(lesson) {
  const spans = [];
  let start = 0;
  const n = lesson.chars.length;
  for (let i = 0; i <= n; i++) {
    if (i === n || lesson.chars[i] === " ") {
      if (i > start) spans.push([start, i]);
      start = i + 1;
    }
  }
  const bad = spans.map(([a, b]) => {
    for (let j = a; j < b; j++) if (lesson.flag[j]) return true;
    return false;
  });
  const per = spans.map(([a, b]) => (lesson.cts && b - a >= 3 && lesson.cts[b - 1] > lesson.cts[a] && lesson.cts[a] > 0 ? (lesson.cts[b - 1] - lesson.cts[a]) / (b - a - 1) : null));
  const slow = slowExcess(per, bad.map(b => !b));
  return spans.map(([a, b], i) => ({ w: lesson.chars.slice(a, b).join(""), bad: bad[i], slow: slow[i] }));
}

function weakWords(lid, aset) {
  const L = layoutData(lid);
  return (L.weak || []).filter(x => x.w.split("").every(c => aset.has(c))).map(x => ({ w: x.w, s: weakScore(x) }));
}

export { WEAK_CAP, lessonWordItems, noteWords, slowExcess, weakScore, weakWords };
