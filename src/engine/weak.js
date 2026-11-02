import { layoutInfo } from "../core/state.js";
import { ensureLex } from "./lexicon.js";
import { layoutData } from "./stats.js";

const WEAK_CAP = 60;

function isRealWord(lex, w) {
  if (!lex.wset) lex.wset = new Set(lex.entries.map(e => e.w));
  return lex.wset.has(w);
}

function noteWords(lid, items) {
  const L = layoutData(lid);
  const lex = ensureLex(layoutInfo().lang);
  const weak = L.weak || (L.weak = []);
  items.forEach(it => {
    const w = it.w;
    if (typeof w !== "string" || w.length < 3 || !isRealWord(lex, w)) return;
    const i = weak.findIndex(x => x.w === w);
    if (it.bad) {
      if (i >= 0) weak[i].s = weak[i].s * 0.8 + 1;
      else weak.push({ w, s: 1 });
    } else if (i >= 0) {
      weak[i].s *= 0.7;
      if (weak[i].s < 0.2) weak.splice(i, 1);
    }
  });
  weak.sort((a, b) => b.s - a.s);
  if (weak.length > WEAK_CAP) weak.length = WEAK_CAP;
}

function lessonWordItems(lesson) {
  const items = [];
  let start = 0;
  const n = lesson.chars.length;
  for (let i = 0; i <= n; i++) {
    if (i === n || lesson.chars[i] === " ") {
      if (i > start) {
        let bad = false;
        for (let j = start; j < i; j++) if (lesson.flag[j]) bad = true;
        items.push({ w: lesson.chars.slice(start, i).join(""), bad });
      }
      start = i + 1;
    }
  }
  return items;
}

function weakWords(lid, aset) {
  const L = layoutData(lid);
  return (L.weak || []).filter(x => x.w.split("").every(c => aset.has(c)));
}

export { WEAK_CAP, lessonWordItems, noteWords, weakWords };
