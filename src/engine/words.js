import { SHARP, rnd } from "../core/base.js";
import { EXTRA_RATE, FOCUS_S, WORD_LEN } from "../core/settings.js";
import { S, layoutInfo, typeable } from "../core/state.js";
import { AR_MARKS, DIGITS, EXTRA_PUNCT } from "../data/layouts.js";
import { ensureLex } from "./lexicon.js";
import { model } from "./model.js";
import { activeKeys } from "./order.js";
import { needOf, staleOf, statusOf } from "./skill.js";
import { charStat, layoutData } from "./stats.js";
import { weakWords } from "./weak.js";

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
  const weights = activeArr.map(a => (a === focus ? 1 + s * 3 : 1));
  let w = "";
  let guard = 0;
  while (w.length < len && guard++ < 200) {
    const c = pickW(activeArr, weights);
    if (w.length >= 2 && w[w.length - 1] === c && w[w.length - 2] === c) continue;
    w += c;
  }
  return w;
}

function mustWord(ctx, must) {
  const w = fallbackWord(ctx).split("");
  if (w.indexOf(must) < 0 && w.length) w[rand(w.length)] = must;
  return w.join("");
}

function genWord(ctx, must) {
  const { lex, aset, focus, s, minL, maxL, needs, pscore } = ctx;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out = [];
    let p2 = "^";
    let p1 = "^";
    if (must && attempt % 2 === 0) {
      out.push(must);
      p1 = must;
    }
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
    if (must && out.indexOf(must) < 0) continue;
    if (/^(.{1,2})\1+$/.test(w)) continue;
    if (focus && s > 0.3 && out.indexOf(focus) < 0 && rnd() < s) continue;
    return w;
  }
  return must ? mustWord(ctx, must) : fallbackWord(ctx);
}

function decorate(word, ctx) {
  const st = S.settings;
  const rate = EXTRA_RATE / 100;
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
const POOLS = { lex: null, key: "", pool: null, wide: null };

function poolFor(lex, aset, activeArr, minL, maxL, allowWide) {
  const key = activeArr.join("") + "|" + minL + "|" + maxL;
  if (POOLS.lex !== lex || POOLS.key !== key) {
    POOLS.lex = lex;
    POOLS.key = key;
    POOLS.pool = lex.entries.filter(e => e.len >= minL && e.len <= maxL && e.chars.every(c => aset.has(c)));
    POOLS.wide = null;
  }
  let pool = POOLS.pool;
  if (pool.length < 40 && allowWide) {
    if (!POOLS.wide) POOLS.wide = lex.entries.filter(e => e.len >= 2 && e.len <= Math.max(maxL, 9) && e.chars.every(c => aset.has(c)));
    if (POOLS.wide.length > pool.length) pool = POOLS.wide;
  }
  return pool;
}

const CAND_CAP = 1200;
const NEED_ARR = new Float64Array(65536);
const STALE_ARR = new Float64Array(65536);
const STEADY_ARR = new Uint8Array(65536);

function codesOf(e) {
  if (!e.cc) {
    const cc = new Uint16Array(e.len);
    for (let j = 0; j < e.len; j++) cc[j] = e.chars[j].charCodeAt(0);
    e.cc = cc;
    const pc = new Float64Array(Math.max(0, e.len - 1));
    for (let j = 1; j < e.len; j++) pc[j - 1] = cc[j - 1] * 65536 + cc[j];
    e.pc = pc;
  }
  return e.cc;
}

function pairsOf(e) {
  if (!e.pr) {
    const pr = [];
    for (let j = 1; j < e.len; j++) pr.push(e.chars[j - 1] + e.chars[j]);
    e.pr = pr;
  }
  return e.pr;
}

function focusTemp(s) {
  return s <= 0.4 ? 1.2 : s <= 0.75 ? 0.7 : 0.4;
}

function buildContext() {
  const st = S.settings;
  const lay = layoutInfo();
  const lex = ensureLex(lay.lang);
  const lid = st.layout;
  const L = layoutData(lid);
  const activeArr = activeKeys();
  const aset = new Set(activeArr);
  const needs = new Map();
  const blockers = [];
  const raised = c => L.raise && L.raise.c === c && (L.tot || 0) < L.raise.until;
  activeArr.forEach(c => {
    const s = charStat(lid, c, false);
    needs.set(c, needOf(s, c) + (raised(c) ? 1.5 : 0));
    if (statusOf(s, c) !== "steady") blockers.push(c);
  });
  let focus = null;
  let bv = -1;
  (blockers.length ? blockers : activeArr).forEach(c => {
    const v = (blockers.length ? needs.get(c) : needs.get(c) * (lex.fn[c] || 0.002)) + rnd() * 0.001;
    if (v > bv) {
      bv = v;
      focus = c;
    }
  });
  const M = model(lid);
  const pairNeed = {};
  const scale = 0.5 * (M.base || 300);
  for (const k in M.pexcess) if (aset.has(k[0]) && aset.has(k[1])) pairNeed[k] = Math.min(2, M.pexcess[k] / scale);
  for (const k in L.pairs) {
    const p = L.pairs[k];
    if (!(p.te > 0.5) || !aset.has(k[0]) || !aset.has(k[1])) continue;
    pairNeed[k] = Math.min(2, (pairNeed[k] || 0) + 6 * (p.te / (p.te + (p.tc || 0) + 3)));
  }
  const focusPairs = Object.keys(pairNeed).filter(k => pairNeed[k] >= 0.35).sort((a, b) => pairNeed[b] - pairNeed[a]).slice(0, 3);
  const minL = WORD_LEN[st.wordLen][0];
  const maxL = WORD_LEN[st.wordLen][1];
  const s = FOCUS_S[st.focusLevel];
  return { lex, aset, activeArr, focus, fluency: blockers.length === 0, focusPair: focusPairs[0] || null, focusPairs, pairNeed, pscore: pairNeed, s, T: focusTemp(s), needs, minL, maxL };
}

function buildWords() {
  const st = S.settings;
  const ctx = buildContext();
  const { lex, aset, activeArr, focus, focusPair, focusPairs, pairNeed, needs, minL, maxL, T } = ctx;
  const lid = st.layout;
  const N = st.lessonWords;
  const pool = poolFor(lex, aset, activeArr, minL, maxL, st.text !== "generated");
  let share = 0;
  if (st.text === "real") share = pool.length >= 5 ? 1 : 0;
  else if (st.text === "auto") share = pool.length >= 40 ? 1 : pool.length >= 8 ? pool.length / 40 : 0;
  const recent = new Set();
  const last = S.recent || [];
  if (pool.length > 4 * N) last.forEach(a => a.forEach(w => recent.add(w)));
  else if (pool.length > 2 * N && last.length) last[last.length - 1].forEach(w => recent.add(w));
  let avail = pool.filter(e => !recent.has(e.w));
  if (avail.length < 8) avail = pool;
  const focusCode = focus ? focus.charCodeAt(0) : -1;
  const fpCodes = focusPairs.map(k => k.charCodeAt(0) * 65536 + k.charCodeAt(1));
  if (avail.length > CAND_CAP * 1.5) {
    const keep = new Uint8Array(avail.length);
    for (let n = 0; n < CAND_CAP; n++) keep[rand(avail.length)] = 1;
    for (let i = 0; i < avail.length; i++) {
      if (keep[i]) continue;
      const e = avail[i];
      const cc = codesOf(e);
      let hit = cc.indexOf(focusCode) >= 0;
      for (let q = 0; q < fpCodes.length && !hit; q++) if (e.pc.indexOf(fpCodes[q]) >= 0) hit = true;
      if (hit) keep[i] = 1;
    }
    avail = avail.filter((e, i) => keep[i] === 1);
  }
  const steady = new Set(activeArr.filter(c => statusOf(charStat(lid, c, false), c) === "steady"));
  const stale = {};
  activeArr.forEach(c => { stale[c] = staleOf(charStat(lid, c, false)); });
  const exp = LEVEL_EXP[st.wordLevel] || 1.25;
  const pairKeys = Object.keys(pairNeed);
  const anyPair = pairKeys.length > 0;
  const pairMap = new Map();
  pairKeys.forEach(k => pairMap.set(k.charCodeAt(0) * 65536 + k.charCodeAt(1), pairNeed[k]));
  activeArr.forEach(c => {
    const code = c.charCodeAt(0);
    NEED_ARR[code] = needs.get(c) || 0;
    STALE_ARR[code] = stale[c] || 0;
    STEADY_ARR[code] = steady.has(c) ? 1 : 0;
  });
  const wS = new Float64Array(avail.length);
  const wR = new Float64Array(avail.length);
  const fIdx = [];
  const pIdx = [];
  let anyR = false;
  for (let i = 0; i < avail.length; i++) {
    const e = avail[i];
    const cc = codesOf(e);
    const len = e.len;
    let nv = 0;
    let hasFocus = false;
    let allSteady = true;
    let sv = 0;
    for (let j = 0; j < len; j++) {
      const code = cc[j];
      nv += NEED_ARR[code];
      if (code === focusCode) hasFocus = true;
      if (STEADY_ARR[code] === 0) allSteady = false;
      sv += STALE_ARR[code];
    }
    nv /= len;
    let pv = 0;
    let hasPair = false;
    if (anyPair) {
      const pc = e.pc;
      for (let j = 0; j < pc.length; j++) {
        const v = pairMap.get(pc[j]);
        if (v !== undefined) pv += v;
        if (!hasPair) {
          for (let q = 0; q < fpCodes.length; q++) {
            if (fpCodes[q] === pc[j]) {
              hasPair = true;
              break;
            }
          }
        }
      }
      pv = len > 1 ? pv / (len - 1) : 0;
    }
    if (e.bwe !== exp) {
      e.bwe = exp;
      e.bwv = Math.pow(e.base, exp);
    }
    wS[i] = e.bwv * Math.exp((nv + 1.5 * pv) / T);
    if (hasFocus) fIdx.push(i);
    if (hasPair) pIdx.push(i);
    if (allSteady) {
      wR[i] = e.bwv * (1 + (3 * sv) / len);
      anyR = true;
    }
  }
  const weakAvail = ctx.fluency ? weakWords(lid, aset) : [];
  const nW = weakAvail.length ? Math.min(Math.round(N * 0.3), weakAvail.length) : 0;
  const nR = steady.size >= 3 && anyR ? Math.round(N * 0.1) : 0;
  const nF = focus ? Math.round(N * (ctx.fluency ? 0.3 : 0.6)) : 0;
  const nP = focusPairs.length ? Math.min(Math.round(N * (ctx.fluency ? 0.4 : 0.25)), Math.max(0, N - nF - nR - nW)) : 0;
  const roles = [];
  for (let i = 0; i < nW; i++) roles.push("w");
  for (let i = 0; i < nF; i++) roles.push("f");
  for (let i = 0; i < nP; i++) roles.push("p");
  for (let i = 0; i < nR; i++) roles.push("r");
  while (roles.length < N) roles.push("c");
  for (let i = roles.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const tmp = roles[i];
    roles[i] = roles[j];
    roles[j] = tmp;
  }
  const allIdx = avail.map((e, i) => i);
  const words = [];
  const raw = [];
  const used = new Set();
  let prev = "";
  const sampler = (idx, weights) => {
    const cum = new Float64Array(idx.length);
    let tot = 0;
    for (let j = 0; j < idx.length; j++) {
      tot += weights[idx[j]];
      cum[j] = tot;
    }
    return { idx, cum, tot };
  };
  const cache = new Map();
  const fromIdx = (idx, weights) => {
    if (!idx.length) return null;
    let sm = cache.get(weights);
    if (!sm) {
      sm = new Map();
      cache.set(weights, sm);
    }
    let s = sm.get(idx);
    if (!s) {
      s = sampler(idx, weights);
      sm.set(idx, s);
    }
    if (!(s.tot > 0)) return null;
    for (let tries = 0; tries < 12; tries++) {
      const r = rnd() * s.tot;
      let lo = 0;
      let hi = s.cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.cum[mid] >= r) hi = mid;
        else lo = mid + 1;
      }
      const cand = avail[s.idx[lo]].w;
      if (cand !== prev && !used.has(cand)) return cand;
    }
    return null;
  };
  for (let i = 0; i < N; i++) {
    const role = roles[i];
    let w = null;
    if (role === "w") {
      const open = weakAvail.filter(x => !used.has(x.w) && x.w !== prev);
      if (open.length) {
        let tot = 0;
        open.forEach(x => { tot += x.s; });
        let r = rnd() * tot;
        w = open[open.length - 1].w;
        for (let j = 0; j < open.length; j++) {
          r -= open[j].s;
          if (r <= 0) {
            w = open[j].w;
            break;
          }
        }
      }
    }
    if (w == null && avail.length && (share >= 1 || rnd() < share)) {
      if (role === "p") w = fromIdx(pIdx, wS);
      if (w == null && (role === "f" || role === "p")) w = fromIdx(fIdx, wS);
      if (w == null && role === "r") w = fromIdx(allIdx, wR);
      if (w == null && role !== "f" && role !== "p") w = fromIdx(allIdx, wS);
    }
    if (w == null) {
      const must = role === "f" || role === "p" ? focus : null;
      for (let tries = 0; tries < 12; tries++) {
        const cand = genWord(ctx, must);
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
