import { GEOM, LAYOUTS } from "../data/layouts.js";

const FINGER_ROWS = [
  "p p r m i i i i m r p p p",
  "p r m i i i i m r p p p p",
  "p r m i i i i m r p p",
  "p r m i i i i m r p"
].map(r => r.split(" "));

const STRETCH = [[5, 6], [4, 5], [4, 5], [4, 5]];

const FINGER_F = { i: 1, m: 1.05, r: 1.35, p: 1.6 };

const ROW_F = [1.7, 1.2, 1, 1.3];

const DIFF_CACHE = {};

function keyDiff(ri, ci) {
  return FINGER_F[FINGER_ROWS[ri][ci]] * ROW_F[ri] * (STRETCH[ri].indexOf(ci) >= 0 ? 1.15 : 1);
}

function diffMap(lid) {
  if (DIFF_CACHE[lid]) return DIFF_CACHE[lid];
  const lay = LAYOUTS[lid.split(":")[0]];
  const d = {};
  GEOM.forEach((row, ri) => row.forEach((code, ci) => {
    const m = lay.map[code];
    if (!m) return;
    const v = keyDiff(ri, ci);
    if (m[0].length === 1 && !(m[0] in d)) d[m[0]] = v;
    if (m[1].length === 1 && !(m[1] in d)) d[m[1]] = v * 1.5;
  }));
  d[" "] = 1;
  DIFF_CACHE[lid] = d;
  return d;
}

export { FINGER_ROWS, diffMap };
