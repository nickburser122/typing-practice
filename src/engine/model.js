import { S, layoutInfo } from "../core/state.js";
import { GEOM, LAYOUTS } from "../data/layouts.js";
import { ensureLex } from "./lexicon.js";
import { layoutData, median, sum } from "./stats.js";

function model(lid) {
  const lay = LAYOUTS[lid];
  const lex = ensureLex(lay.lang);
  const L = layoutData(lid);
  const P = S.derived;
  const meds = [];
  let eSum = 0;
  let eN = 0;
  for (const ch in L.chars) {
    const s = L.chars[ch];
    if (s.t.length >= 8) meds.push(median(s.t));
    eSum += sum(s.o);
    eN += s.o.length;
  }
  const base = meds.length >= 4 ? median(meds) : null;
  const gErr = eN >= 30 ? eSum / eN : 0.03;
  const recMs = L.rec && L.rec.length >= 5 ? median(L.rec) : 700;
  const est = {};
  const cost = {};
  const impact = {};
  const keys = new Set(Object.keys(lex.fn));
  for (const ch in L.chars) keys.add(ch);
  let tAvg = 0;
  let cover = 0;
  keys.forEach(ch => {
    const s = L.chars[ch];
    const fn = lex.fn[ch] || 0.002;
    const n = s ? Math.min(s.t.length, 40) : 0;
    let e;
    if (n === 0) e = base;
    else if (base == null) e = median(s.t);
    else e = (n * median(s.t) + 6 * base) / (n + 6);
    const er = s && s.o.length ? (sum(s.o) + 10 * gErr) / (s.o.length + 10) : gErr;
    est[ch] = e;
    const exT = base != null && e != null ? Math.max(0, e - base) : 0;
    const exE = Math.max(0, er - gErr) * recMs;
    cost[ch] = exT + exE;
    impact[ch] = fn * cost[ch];
    if (e != null) tAvg += fn * (e + er * recMs);
    if (s && s.n >= P.minS) cover += fn;
  });
  const pexcess = {};
  const pimpact = {};
  const ratios = [];
  for (const k in L.pairs) {
    const p = L.pairs[k];
    if (p.n >= 6 && est[k[1]]) ratios.push(p.m / est[k[1]]);
  }
  const r0 = ratios.length >= 5 ? Math.max(1, median(ratios)) : 1;
  for (const k in L.pairs) {
    const p = L.pairs[k];
    if (k.length !== 2 || p.n < 6 || !est[k[1]]) continue;
    const ex = Math.max(0, p.m - est[k[1]] * r0) * (p.n / (p.n + 8));
    const bn = lex.bn[k] || 0;
    if (!bn) continue;
    pexcess[k] = ex;
    pimpact[k] = bn * 0.83 * ex;
  }
  const gain = d => (tAvg > d + 1 ? 12000 / (tAvg - d) - 12000 / tAvg : 0);
  const items = [];
  for (const ch in impact) {
    const s = L.chars[ch];
    if (s && s.n >= P.minS && impact[ch] > 0 && lex.fn[ch]) items.push({ type: "key", id: ch, gain: gain(impact[ch]), cost: cost[ch], n: s.n });
  }
  for (const k in pimpact) {
    if (pimpact[k] > 0) items.push({ type: "pair", id: k, gain: gain(pimpact[k]), cost: pexcess[k], n: L.pairs[k].n });
  }
  items.sort((a, b) => b.gain - a.gain);
  return { base, gErr, recMs, est, cost, impact, pexcess, pimpact, items, tAvg, cover, wpm: tAvg > 0 ? 12000 / tAvg : null, ready: base != null && cover >= 0.6 };
}

function confusionsOf(lid, aset) {
  const L = layoutData(lid);
  const agg = {};
  for (const c in L.chars) {
    if (c.length !== 1 || !aset.has(c)) continue;
    const s = L.chars[c];
    if (!s.a) continue;
    for (const x in s.x) {
      if (x.length !== 1 || x === c || !aset.has(x) || s.x[x] < 2) continue;
      if (s.x[x] / s.a < 0.03) continue;
      const k = c < x ? c + x : x + c;
      agg[k] = (agg[k] || 0) + s.x[x];
    }
  }
  return Object.keys(agg).map(k => ({ a: k[0], b: k[1], n: agg[k] })).sort((p, q) => q.n - p.n).slice(0, 2);
}

function neighborsOf(ch) {
  const lay = layoutInfo();
  const r = lay.rev[ch];
  if (!r) return [];
  let pos = null;
  GEOM.forEach((row, ri) => {
    const ci = row.indexOf(r.code);
    if (ci >= 0) pos = [ri, ci];
  });
  if (!pos) return [];
  const out = [];
  [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, 1], [1, -1]].forEach(d => {
    const row = GEOM[pos[0] + d[0]];
    const code = row ? row[pos[1] + d[1]] : null;
    const m = code ? lay.map[code] : null;
    if (m && m[0].length === 1) out.push(m[0]);
  });
  return out;
}

export { confusionsOf, model, neighborsOf };
