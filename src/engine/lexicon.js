import { WORDS } from "../data/words.js";

const LEX = {};

function addTo(map, key, c, w) {
  let m = map.get(key);
  if (!m) {
    m = new Map();
    map.set(key, m);
  }
  m.set(c, (m.get(c) || 0) + w);
}

function ensureLex(lang) {
  if (LEX[lang]) return LEX[lang];
  const words = WORDS[lang];
  const entries = [];
  const freq = {};
  const bfreq = {};
  const tri = new Map();
  const bi = new Map();
  words.forEach((w, i) => {
    const chars = w.split("");
    const base = 1 / Math.pow(i + 20, 0.4);
    entries.push({ w, chars, base, len: chars.length });
    const fw = 1 / (i + 3);
    for (const c of chars) freq[c] = (freq[c] || 0) + fw;
    freq[" "] = (freq[" "] || 0) + fw;
    for (let j = 1; j < chars.length; j++) {
      const k = chars[j - 1] + chars[j];
      bfreq[k] = (bfreq[k] || 0) + fw;
    }
    const seq = ["^", "^"].concat(chars, ["$"]);
    for (let j = 2; j < seq.length; j++) {
      addTo(tri, seq[j - 2] + seq[j - 1], seq[j], base);
      addTo(bi, seq[j - 1], seq[j], base);
    }
  });
  let ft = 0;
  for (const c in freq) ft += freq[c];
  const fn = {};
  for (const c in freq) fn[c] = freq[c] / ft;
  let bt = 0;
  for (const k in bfreq) bt += bfreq[k];
  const bn = {};
  for (const k in bfreq) bn[k] = bfreq[k] / bt;
  LEX[lang] = { entries, freq, tri, bi, fn, bn };
  return LEX[lang];
}

export { ensureLex };
