import { S } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { GEOM, LAYOUTS, LETTERS, RANK_CODES } from "../data/layouts.js";
import { diffMap } from "./difficulty.js";
import { ensureLex } from "./lexicon.js";
import { layoutData } from "./stats.js";

const ORDER_CACHE = {};

function smartOrder(lid) {
  const lay = LAYOUTS[lid];
  const lex = ensureLex(lay.lang);
  const dm = diffMap(lid);
  const letters = LETTERS[lay.lang];
  const normal = [];
  const home = new Set();
  GEOM.forEach((row, ri) => row.forEach((code, ci) => {
    const m = lay.map[code];
    if (m && m[0].length === 1 && letters.has(m[0]) && normal.indexOf(m[0]) < 0) {
      normal.push(m[0]);
      if (ri === 2 && ci <= 9) home.add(m[0]);
    }
  }));
  const nset = new Set(normal);
  const docs = [];
  lex.entries.forEach((e, i) => {
    if (e.len < 2) return;
    if (!e.chars.every(c => nset.has(c))) return;
    docs.push({ u: Array.from(new Set(e.chars)), w: 1 / (i + 3) });
  });
  let dmin = Infinity;
  let dmax = 0;
  normal.forEach(c => {
    dmin = Math.min(dmin, dm[c]);
    dmax = Math.max(dmax, dm[c]);
  });
  let fmax = 0;
  normal.forEach(c => { fmax = Math.max(fmax, lex.freq[c] || 0); });
  const chosen = [];
  const cs = new Set();
  const cov = (d, extra) => {
    let n = 0;
    for (let i = 0; i < d.u.length; i++) if (cs.has(d.u[i]) || d.u[i] === extra) n++;
    return Math.pow(n / d.u.length, 3);
  };
  while (chosen.length < normal.length) {
    let cands = normal.filter(c => !cs.has(c));
    if (chosen.length < 6) {
      const hc = cands.filter(c => home.has(c));
      if (hc.length) cands = hc;
    }
    const base = docs.map(d => cov(d, null));
    const gains = cands.map(c => {
      let g = 0;
      for (let i = 0; i < docs.length; i++) {
        if (docs[i].u.indexOf(c) >= 0) g += docs[i].w * (cov(docs[i], c) - base[i]);
      }
      return g;
    });
    const gmax = Math.max.apply(null, gains) || 1;
    let best = null;
    let bv = -1;
    cands.forEach((c, i) => {
      const ease = dmax > dmin ? (dmax - dm[c]) / (dmax - dmin) : 1;
      const v = 0.4 * ease + 0.4 * (gains[i] / gmax) + 0.2 * ((lex.freq[c] || 0) / fmax);
      if (v > bv) {
        bv = v;
        best = c;
      }
    });
    chosen.push(best);
    cs.add(best);
  }
  return chosen;
}

function computeOrder(lid, mode) {
  const ck = lid + "|" + mode;
  if (ORDER_CACHE[ck]) return ORDER_CACHE[ck];
  const lay = LAYOUTS[lid];
  const lex = ensureLex(lay.lang);
  const letters = LETTERS[lay.lang];
  const normal = [];
  RANK_CODES.forEach(code => {
    const m = lay.map[code];
    if (m && m[0].length === 1 && letters.has(m[0]) && normal.indexOf(m[0]) < 0) normal.push(m[0]);
  });
  let head = normal.slice();
  if (mode === "frequency") head.sort((a, b) => (lex.freq[b] || 0) - (lex.freq[a] || 0));
  if (mode === "smart") head = smartOrder(lid);
  const tail = [];
  for (const code in lay.map) {
    const m = lay.map[code];
    if (m[1].length === 1 && letters.has(m[1]) && normal.indexOf(m[1]) < 0 && tail.indexOf(m[1]) < 0) tail.push(m[1]);
  }
  tail.sort((a, b) => (lex.freq[b] || 0) - (lex.freq[a] || 0));
  ORDER_CACHE[ck] = head.concat(tail);
  return ORDER_CACHE[ck];
}

function currentOrder() {
  return computeOrder(S.settings.layout, S.settings.order);
}

function currentK() {
  const order = currentOrder();
  const L = layoutData(S.settings.layout);
  let k = L.k == null ? S.settings.startKeys : L.k;
  return Math.max(2, Math.min(order.length, k));
}

function activeKeys() {
  return currentOrder().slice(0, currentK());
}

function setK(k) {
  const order = currentOrder();
  layoutData(S.settings.layout).k = Math.max(2, Math.min(order.length, k));
  scheduleSave();
}

export { activeKeys, computeOrder, currentK, currentOrder, setK };
