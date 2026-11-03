import { layoutInfo, S } from "../core/state.js";
import { ensureLex } from "./lexicon.js";
import { model } from "./model.js";
import { layoutData, median } from "./stats.js";

function pairRows(lid) {
  const L = layoutData(lid);
  const P = S.derived;
  const M = model(lid);
  const bn = ensureLex(layoutInfo().lang).bn;
  const rec = M.recMs || 600;
  const rows = [];
  for (const k in L.pairs) {
    if (k.length !== 2) continue;
    const p = L.pairs[k];
    const s2 = L.chars[k[1]];
    const timed = p.n >= 8 && !!s2 && s2.n >= P.minS;
    const swaps = p.te > 0.5 ? p.te / (p.te + (p.tc || 0) + 3) : 0;
    if (!timed && swaps <= 0) continue;
    const d = timed ? p.m - median(s2.t) : null;
    const freq = bn[k] || 0;
    const slow = timed && M.pexcess[k] ? freq * 0.83 * M.pexcess[k] : 0;
    const impact = slow + freq * 0.83 * swaps * rec;
    rows.push({ k, n: p.n, m: timed ? p.m : null, d, swaps, impact });
  }
  rows.sort((a, b) => b.impact - a.impact || (b.d || 0) - (a.d || 0));
  return rows;
}

export { pairRows };
