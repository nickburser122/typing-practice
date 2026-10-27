import { bindK, newTracks } from "../core/schema.js";
import { S, layoutInfo } from "../core/state.js";

function layoutData(lid) {
  const L = S.data.layouts;
  if (!L[lid]) L[lid] = bindK({ chars: {}, pairs: {}, tracks: newTracks(), rec: [], sh: { ok: 0, same: 0 }, lk: 0, tot: 0, rescue: 0, bk: null, raise: null, placed: false });
  if (!L[lid].rec) L[lid].rec = [];
  return L[lid];
}

function legacyChars(lid) {
  const L = S.data.layouts[lid + ":code"];
  return L ? L.chars : null;
}

function mergedStat(lid, ch) {
  const s = charStat(lid, ch, false);
  const old = legacyChars(lid);
  const o = old && old[ch];
  if (!o) return s;
  if (!s) return o;
  const x = Object.assign({}, o.x);
  for (const k in s.x) x[k] = (x[k] || 0) + s.x[k];
  return { n: s.n + o.n, a: s.a + o.a, e: s.e + o.e, t: o.t.concat(s.t).slice(-40), o: o.o.concat(s.o).slice(-40), x, ls: Math.max(s.ls || 0, o.ls || 0) };
}

function charStat(lid, ch, create) {
  const L = layoutData(lid);
  let s = L.chars[ch];
  if (!s && create) s = L.chars[ch] = { n: 0, a: 0, e: 0, t: [], o: [], x: {} };
  return s;
}

function recentAccuracy(lid, n) {
  const own = S.data.lessons.filter(l => l.lid === lid);
  if (own.length < n) return null;
  return sum(own.slice(-n).map(l => l.acc)) / n;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function errRate(s) {
  return s && s.o.length ? sum(s.o) / s.o.length : 0;
}

function allCharsOfLayout() {
  const lay = layoutInfo();
  const set = new Set();
  for (const code in lay.map) {
    const m = lay.map[code];
    if (m[0].length === 1) set.add(m[0]);
    if (m[1].length === 1) set.add(m[1]);
  }
  return set;
}

function slowestInto(lid, ch, min) {
  const L = layoutData(lid);
  const out = [];
  for (const k in L.pairs) {
    if (k.length === 2 && k[1] === ch && L.pairs[k].n >= min) out.push({ pair: k, m: L.pairs[k].m, n: L.pairs[k].n });
  }
  out.sort((a, b) => b.m - a.m);
  return out.slice(0, 3);
}

export {
  allCharsOfLayout, charStat, errRate, layoutData, legacyChars, median, mergedStat, recentAccuracy,
  slowestInto, sum
};
