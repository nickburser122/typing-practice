import { SHARP, rnd } from "../core/base.js";
import { S, layoutInfo, typeable } from "../core/state.js";
import { AR_MARKS, DIGITS, EXTRA_PUNCT } from "../data/layouts.js";
import { ensureLex } from "./lexicon.js";
import { confusionsOf, model, neighborsOf } from "./model.js";
import { activeKeys } from "./order.js";
import { needOf, staleOf, statusOf } from "./skill.js";
import { charStat, layoutData, slowestInto } from "./stats.js";

function buildContext() {
  const st = S.settings;
  const lay = layoutInfo();
  const lex = ensureLex(lay.lang);
  const lid = st.layout;
  const P = S.derived;
  const L = layoutData(lid);
  const activeArr = activeKeys();
  const aset = new Set(activeArr);
  const needs = new Map();
  const pscore = {};
  let focus = null;
  let focusPair = null;
  const focusPairs = [];
  const raised = c => L.raise && L.raise.c === c && (L.tot || 0) < L.raise.until;
  if (st.algo === "classic") {
    activeArr.forEach(c => needs.set(c, needOf(charStat(lid, c, false), c) + (raised(c) ? 1.5 : 0)));
    focus = pickFocus(activeArr, needs);
  } else {
    const M = model(lid);
    let maxImp = 0;
    let maxCost = 0;
    activeArr.forEach(c => {
      const s = charStat(lid, c, false);
      if (s && s.n >= P.minS) {
        maxImp = Math.max(maxImp, M.impact[c] || 0);
        maxCost = Math.max(maxCost, M.cost[c] || 0);
      }
    });
    const damp = M.base ? Math.min(1, maxCost / (0.2 * M.base)) : 1;
    activeArr.forEach(c => {
      const s = charStat(lid, c, false);
      let p;
      if (!s || s.n < P.minS) p = 3 + 2 * (1 - (s ? s.n : 0) / P.minS);
      else {
        p = 1 + 4 * damp * (maxImp ? (M.impact[c] || 0) / maxImp : 0);
        p += 0.5 * staleOf(s);
      }
      if (raised(c)) p += 1.5;
      needs.set(c, p);
    });
    focus = pickFocus(activeArr, needs);
    let maxPair = 0;
    for (const k in M.pimpact) if (aset.has(k[0]) && aset.has(k[1])) maxPair = Math.max(maxPair, M.pimpact[k]);
    let maxEx = 0;
    for (const k in M.pexcess) if (aset.has(k[0]) && aset.has(k[1])) maxEx = Math.max(maxEx, M.pexcess[k]);
    const dampP = M.base ? Math.min(1, maxEx / (0.2 * M.base)) : 1;
    if (maxPair > 0) {
      for (const k in M.pimpact) {
        if (aset.has(k[0]) && aset.has(k[1])) pscore[k] = dampP * (M.pimpact[k] / maxPair);
      }
      Object.keys(pscore).filter(k => pscore[k] >= 0.35).sort((a, b) => pscore[b] - pscore[a]).slice(0, 3).forEach(k => focusPairs.push(k));
      focusPair = focusPairs[0] || null;
    }
  }
  let drill = null;
  if (L.rescue > 0 && L.bk && aset.has(L.bk.c)) {
    drill = {
      key: L.bk.c,
      neigh: new Set(neighborsOf(L.bk.c).filter(c => aset.has(c))),
      pairs: slowestInto(lid, L.bk.c, 3).map(p => p.pair).filter(k => aset.has(k[0]))
    };
    focus = drill.key;
    if (drill.pairs.length) focusPair = drill.pairs[0];
  }
  const minL = Math.min(st.wordMin, st.wordMax);
  const maxL = Math.max(st.wordMin, st.wordMax);
  return { lex, aset, activeArr, focus, focusPair, focusPairs, pscore, s: st.focus / 100, needs, minL, maxL, confs: confusionsOf(lid, aset), drill };
}

function pickFocus(chars, needs) {
  let best = null;
  let bv = -1;
  chars.forEach(c => {
    const v = needs.get(c) + rnd() * 0.001;
    if (v > bv) {
      bv = v;
      best = c;
    }
  });
  return best;
}

function rand(n) {
  return Math.floor(rnd() * n);
}

function pickW(items, weights) {
  let tot = 0;
  for (let i = 0; i < weights.length; i++) tot += weights[i];
  let r = rnd() * tot;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function fallbackWord(ctx) {
  const { activeArr, focus, s, minL, maxL } = ctx;
  const hi = Math.max(minL, Math.min(maxL, minL + 2));
  const len = minL + rand(hi - minL + 1);
  const weights = activeArr.map(a => (a === focus ? 1 + s * 3 : 1) * (ctx.drill && ctx.drill.neigh.has(a) ? 1.8 : 1));
  let w = "";
  let guard = 0;
  while (w.length < len && guard++ < 200) {
    const c = pickW(activeArr, weights);
    if (w.length >= 2 && w[w.length - 1] === c && w[w.length - 2] === c) continue;
    w += c;
  }
  return w;
}

function genWord(ctx) {
  const { lex, aset, focus, s, minL, maxL, needs, pscore } = ctx;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out = [];
    let p2 = "^";
    let p1 = "^";
    while (out.length < maxL) {
      const cands = [];
      const ws = [];
      const collect = tbl => {
        if (!tbl) return;
        tbl.forEach((cnt, c) => {
          if (c === "$") {
            if (out.length >= minL) {
              cands.push(c);
              ws.push(cnt * (out.length >= maxL - 1 ? 4 : 1));
            }
          } else if (aset.has(c)) {
            let w = cnt;
            if (c === focus) w *= 1 + s * 3 * SHARP;
            const nd = needs.get(c) || 1;
            if (nd > 1) w *= 1 + s * 0.4 * SHARP * (nd - 1);
            const ps = pscore[p1 + c];
            if (ps) w *= 1 + s * 4 * SHARP * ps;
            cands.push(c);
            ws.push(w);
          }
        });
      };
      collect(lex.tri.get(p2 + p1));
      if (!cands.length) collect(lex.bi.get(p1));
      if (!cands.length) break;
      const c = pickW(cands, ws);
      if (c === "$") break;
      out.push(c);
      p2 = p1;
      p1 = c;
    }
    if (out.length < minL) continue;
    const w = out.join("");
    if (/(.)\1\1/.test(w)) continue;
    if (focus && s > 0.3 && out.indexOf(focus) < 0 && rnd() < s) continue;
    return w;
  }
  return fallbackWord(ctx);
}

function decorate(word, ctx) {
  const st = S.settings;
  const rate = st.extraRate / 100;
  const lang = layoutInfo().lang;
  if (st.digits && rnd() < rate * 0.8) {
    const digs = DIGITS.filter(typeable);
    if (digs.length) {
      const len = 1 + rand(4);
      let n = "";
      for (let i = 0; i < len; i++) {
        let d = digs[rand(digs.length)];
        if (i === 0 && len > 1 && d === "0") d = digs[(digs.indexOf(d) + 1) % digs.length];
        n += d;
      }
      return n;
    }
  }
  if (st.dia && lang === "ar") {
    const marks = AR_MARKS.filter(typeable);
    if (marks.length && rnd() < rate * 1.5) word += marks[rand(marks.length)];
  }
  if (st.caps && lang === "en" && rnd() < rate) word = word[0].toUpperCase() + word.slice(1);
  if (st.punct && rnd() < rate) {
    const ps = EXTRA_PUNCT[lang].filter(typeable);
    if (ps.length) word += ps[rand(ps.length)];
  }
  return word;
}

const LEVEL_EXP = { common: 2.5, balanced: 1.25, wide: 0.4 };

function buildWords() {
  const st = S.settings;
  const ctx = buildContext();
  const { lex, aset, activeArr, focus, focusPair, focusPairs, pscore, s, needs, minL, maxL, confs, drill } = ctx;
  const lid = st.layout;
  const N = st.lessonWords;
  let pool = lex.entries.filter(e => e.len >= minL && e.len <= maxL && e.chars.every(c => aset.has(c)));
  if (pool.length < 40 && st.text !== "generated") {
    const wide = lex.entries.filter(e => e.len >= 2 && e.len <= Math.max(maxL, 9) && e.chars.every(c => aset.has(c)));
    if (wide.length > pool.length) pool = wide;
  }
  let share = 0;
  if (st.text === "real") share = pool.length >= 5 ? 1 : 0;
  else if (st.text === "auto") share = pool.length >= 40 ? 1 : pool.length >= 8 ? pool.length / 40 : 0;
  const recent = new Set();
  const last = S.recent || [];
  if (pool.length > 4 * N) last.forEach(a => a.forEach(w => recent.add(w)));
  else if (pool.length > 2 * N && last.length) last[last.length - 1].forEach(w => recent.add(w));
  let avail = pool.filter(e => !recent.has(e.w));
  if (avail.length < 8) avail = pool;
  const steady = new Set(activeArr.filter(c => statusOf(charStat(lid, c, false), c) === "steady"));
  const stale = {};
  activeArr.forEach(c => { stale[c] = staleOf(charStat(lid, c, false)); });
  const confSet = confs.map(x => x.a + x.b);
  const wF = [];
  const wC = [];
  const wR = [];
  avail.forEach(e => {
    let kt = 0;
    for (const c of e.chars) kt += Math.max(0, (needs.get(c) || 1) - 0.8);
    kt /= e.len;
    let pt = 0;
    for (let j = 1; j < e.len; j++) pt += pscore[e.chars[j - 1] + e.chars[j]] || 0;
    pt = e.len > 1 ? pt / (e.len - 1) : 0;
    const bw = Math.pow(e.base, LEVEL_EXP[st.wordLevel] || 1.25);
    let f = bw * (1 + s * SHARP * (3 * kt + 6 * pt));
    if (e.chars.indexOf(focus) >= 0) f *= 1 + s * 6 * SHARP;
    for (const fp of focusPairs) if (e.w.indexOf(fp) >= 0) f *= 1 + s * 4 * SHARP;
    confSet.forEach(cp => {
      const ha = e.chars.indexOf(cp[0]) >= 0;
      const hb = e.chars.indexOf(cp[1]) >= 0;
      if (ha || hb) f *= 1 + s * 2;
      if (ha && hb) f *= 1 + s * 4;
    });
    if (drill) {
      for (const c of e.chars) if (drill.neigh.has(c)) f *= 1.4;
      for (const dp of drill.pairs) if (e.w.indexOf(dp) >= 0) f *= 3;
    }
    wF.push(f);
    wC.push(bw * (1 + 0.6 * s * kt));
    let rv = 0;
    if (e.chars.every(c => steady.has(c))) {
      let sv = 0;
      for (const c of e.chars) sv += stale[c] || 0;
      rv = bw * (1 + (3 * sv) / e.len);
    }
    wR.push(rv);
  });
  const hasR = steady.size >= 3 && wR.some(v => v > 0) && !drill;
  const nR = hasR ? Math.round(N * 0.1) : 0;
  const nF = Math.round(N * 0.6);
  const roles = [];
  for (let i = 0; i < nF; i++) roles.push("f");
  for (let i = 0; i < nR; i++) roles.push("r");
  while (roles.length < N) roles.push("c");
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = roles[i];
    roles[i] = roles[j];
    roles[j] = tmp;
  }
  const words = [];
  const raw = [];
  const used = new Set();
  let prev = "";
  for (let i = 0; i < N; i++) {
    let w = null;
    if (avail.length && (share >= 1 || rnd() < share)) {
      const ws = roles[i] === "f" ? wF : roles[i] === "r" ? wR : wC;
      for (let tries = 0; tries < 12; tries++) {
        const cand = pickW(avail, ws).w;
        if (cand !== prev && (!used.has(cand) || avail.length < N)) {
          w = cand;
          break;
        }
      }
    }
    if (w == null) {
      for (let tries = 0; tries < 12; tries++) {
        const cand = activeArr.length <= 6 ? fallbackWord(ctx) : genWord(ctx);
        if (!used.has(cand) || tries === 11) {
          w = cand;
          break;
        }
      }
    }
    used.add(w);
    prev = w;
    raw.push(w);
    words.push(decorate(w, ctx));
  }
  S.recent = (S.recent || []).concat([raw]).slice(-3);
  return { words, focus, focusPair };
}

export { LEVEL_EXP, buildWords, pickW, rand };
