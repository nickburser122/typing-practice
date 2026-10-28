import { S } from "./state.js";

const DAY_CAP = 730;
const PB_CAP = 400;
const DAY_MS = 864e5;

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function dayNum(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return NaN;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS);
}

function numToKey(n) {
  const d = new Date(n * DAY_MS);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

function clamp(v, lo, hi, dflt) {
  return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
}

function emptyDay() {
  return { s: 0, ms: 0, k: 0, w: 0, a: 0, b: 0, l: 0, t: 0, c: 0 };
}

function pbKey(kind, parts) {
  return kind + "|" + parts.join("|");
}

function testPbKey(x) {
  return pbKey("t", [x.lid, x.mode, x.amt, x.list, x.ext || 0]);
}

function codePbKey(x) {
  return pbKey("c", [x.lid, x.set]);
}

function lessonPbKey(lid) {
  return pbKey("l", [lid]);
}

function addTo(days, lid, ts, kind, wpm, acc, ms, keys) {
  if (!(ts > 0)) return;
  const key = dayKey(ts);
  const byLid = days[lid] || (days[lid] = {});
  const d = byLid[key] || (byLid[key] = emptyDay());
  d.s += 1;
  d.ms += Math.max(0, Math.round(ms));
  d.k += Math.max(0, Math.round(keys));
  d.w += Math.max(0, wpm);
  d.a += Math.max(0, Math.min(1, acc));
  if (wpm > d.b) d.b = wpm;
  d[kind] += 1;
}

function trimDays(days) {
  for (const lid of Object.keys(days)) {
    const keys = Object.keys(days[lid]).sort();
    for (let i = 0; i < keys.length - DAY_CAP; i++) delete days[lid][keys[i]];
    if (!keys.length) delete days[lid];
  }
}

function trimPbs(pbs) {
  const keys = Object.keys(pbs);
  if (keys.length <= PB_CAP) return;
  keys.sort((a, b) => pbs[a].ts - pbs[b].ts);
  for (let i = 0; i < keys.length - PB_CAP; i++) delete pbs[keys[i]];
}

function putPb(pbs, key, wpm, acc, ts) {
  const cur = pbs[key];
  if (!cur || wpm > cur.wpm) {
    pbs[key] = { wpm: Math.round(wpm * 10) / 10, acc: Math.round(acc * 1000) / 1000, ts };
    return true;
  }
  return false;
}

function testMs(x) {
  if (x.mode === "time") return x.amt * 1000;
  if (x.mode === "quote") return 0;
  return x.wpm > 0 ? (x.amt * 5) / x.wpm * 60000 : 0;
}

function lessonMs(x) {
  return x.wpm > 0 && x.n > 1 ? ((x.n - 1) / 5 / x.wpm) * 60000 : 0;
}

function backfill(data) {
  const days = {};
  const pbs = {};
  data.lessons.forEach(x => {
    addTo(days, x.lid, x.ts, "l", x.wpm, x.acc, lessonMs(x), x.n);
    if (x.acc >= 0.9) putPb(pbs, lessonPbKey(x.lid), x.wpm, x.acc, x.ts);
  });
  data.tests.forEach(x => {
    addTo(days, x.lid, x.ts, "t", x.wpm, x.acc, testMs(x), (x.wpm * testMs(x)) / 12000);
    putPb(pbs, testPbKey(x), x.wpm, x.acc, x.ts);
  });
  data.code.forEach(x => {
    addTo(days, x.lid, x.ts, "c", x.wpm, x.acc, 0, 0);
    putPb(pbs, codePbKey(x), x.wpm, x.acc, x.ts);
  });
  trimDays(days);
  trimPbs(pbs);
  data.days = days;
  data.pbs = pbs;
}

function sanitizeDays(input, isLid) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  Object.keys(input).slice(0, 64).forEach(lid => {
    const src = input[lid];
    if (!isLid(lid) || !src || typeof src !== "object") return;
    const dst = {};
    Object.keys(src).slice(0, DAY_CAP + 50).forEach(key => {
      const d = src[key];
      if (!d || typeof d !== "object" || !isFinite(dayNum(key))) return;
      dst[key] = {
        s: clamp(d.s, 0, 1e6, 0), ms: clamp(d.ms, 0, 1e9, 0), k: clamp(d.k, 0, 1e9, 0),
        w: clamp(d.w, 0, 1e9, 0), a: clamp(d.a, 0, 1e6, 0), b: clamp(d.b, 0, 1000, 0),
        l: clamp(d.l, 0, 1e6, 0), t: clamp(d.t, 0, 1e6, 0), c: clamp(d.c, 0, 1e6, 0)
      };
    });
    if (Object.keys(dst).length) out[lid] = dst;
  });
  trimDays(out);
  return out;
}

function sanitizePbs(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  Object.keys(input).slice(0, PB_CAP + 50).forEach(key => {
    const p = input[key];
    if (!/^[ltc]\|[\w:.-]+(\|[\w:.-]+)*$/.test(key) || key.length > 80 || !p || typeof p !== "object") return;
    const wpm = clamp(p.wpm, 0, 1000, -1);
    if (wpm < 0) return;
    out[key] = { wpm, acc: clamp(p.acc, 0, 1, 0), ts: clamp(p.ts, 0, 8.64e15, 0) };
  });
  trimPbs(out);
  return out;
}

function ensureHistory() {
  const d = S.data;
  if (!d.days || typeof d.days !== "object") d.days = {};
  if (!d.pbs || typeof d.pbs !== "object") d.pbs = {};
  return d;
}

function recordSession(kind, lid, wpm, acc, ms, keys, ts) {
  const d = ensureHistory();
  addTo(d.days, lid, ts || Date.now(), kind, wpm, acc, ms, keys);
  trimDays(d.days);
}

function pbOf(key) {
  const p = ensureHistory().pbs[key];
  return p ? p.wpm : null;
}

function notePb(key, wpm, acc, ts) {
  const d = ensureHistory();
  const prev = d.pbs[key] ? d.pbs[key].wpm : null;
  putPb(d.pbs, key, wpm, acc, ts || Date.now());
  trimPbs(d.pbs);
  return prev;
}

function bestOf(stored, recs) {
  let best = stored;
  recs.forEach(x => {
    if (best == null || x.wpm > best) best = x.wpm;
  });
  return best;
}

function dayRows(lid) {
  const byLid = ensureHistory().days[lid];
  if (!byLid) return [];
  return Object.keys(byLid).sort().map(key => {
    const d = byLid[key];
    return { key, n: dayNum(key), s: d.s, ms: d.ms, k: d.k, wpm: d.s ? Math.min(1000, d.w / d.s) : 0, acc: d.s ? Math.min(1, d.a / d.s) : 0, best: d.b, l: d.l, t: d.t, c: d.c };
  });
}

function windowStats(rows, fromNum, toNum) {
  let s = 0;
  let ms = 0;
  let k = 0;
  let w = 0;
  let a = 0;
  let days = 0;
  rows.forEach(r => {
    if (r.n < fromNum || r.n > toNum) return;
    s += r.s;
    ms += r.ms;
    k += r.k;
    w += r.wpm * r.s;
    a += r.acc * r.s;
    days++;
  });
  return { s, ms, k, days, wpm: s ? w / s : null, acc: s ? a / s : null };
}

function summary(lid, todayTs) {
  const rows = dayRows(lid);
  const today = dayNum(dayKey(todayTs));
  const all = windowStats(rows, -Infinity, Infinity);
  const week = windowStats(rows, today - 6, today);
  const before = windowStats(rows, today - 13, today - 7);
  const month = windowStats(rows, today - 29, today);
  let best = null;
  rows.forEach(r => {
    if (r.s >= 1 && (!best || r.best > best.best)) best = r;
  });
  return {
    rows, all, week, before, month, best,
    delta: week.wpm != null && before.wpm != null ? week.wpm - before.wpm : null,
    first: rows.length ? rows[0].key : null
  };
}

function rolling(rows, span) {
  return rows.map((r, i) => {
    let s = 0;
    let w = 0;
    for (let j = i; j >= 0 && r.n - rows[j].n < span; j--) {
      s += rows[j].s;
      w += rows[j].wpm * rows[j].s;
    }
    return s ? w / s : null;
  });
}

function heatCells(lid, todayTs, weeks) {
  const byKey = {};
  dayRows(lid).forEach(r => { byKey[r.key] = r; });
  const today = dayNum(dayKey(todayTs));
  const todayDow = new Date(today * DAY_MS).getUTCDay();
  const start = today - todayDow - (weeks - 1) * 7;
  const cells = [];
  for (let n = start; n <= today; n++) {
    const key = numToKey(n);
    const r = byKey[key];
    cells.push({ key, n, col: Math.floor((n - start) / 7), row: (n - start) % 7, ms: r ? r.ms : 0, s: r ? r.s : 0, wpm: r ? r.wpm : 0 });
  }
  return cells;
}

function personalBests(lid) {
  const pbs = ensureHistory().pbs;
  const out = { lesson: null, tests: [], code: [] };
  for (const key of Object.keys(pbs)) {
    const parts = key.split("|");
    if (parts[1] !== lid) continue;
    const p = pbs[key];
    if (parts[0] === "l") out.lesson = p;
    else if (parts[0] === "t") out.tests.push({ mode: parts[2], amt: Number(parts[3]), list: parts[4], ext: Number(parts[5]), pb: p });
    else if (parts[0] === "c") out.code.push({ set: parts[2], pb: p });
  }
  out.tests.sort((a, b) => (a.mode === b.mode ? a.amt - b.amt : a.mode === "time" ? -1 : 1) || a.list.localeCompare(b.list) || a.ext - b.ext);
  out.code.sort((a, b) => a.set.localeCompare(b.set));
  return out;
}

export {
  DAY_CAP, PB_CAP, backfill, bestOf, codePbKey, dayKey, dayNum, dayRows, heatCells, lessonPbKey, notePb,
  numToKey, pbOf, personalBests, recordSession, rolling, sanitizeDays, sanitizePbs, summary,
  testPbKey
};
