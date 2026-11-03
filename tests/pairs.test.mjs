import test from "node:test";
import assert from "node:assert/strict";
import { S, fresh, stats } from "./helpers.mjs";

const LID = "en-qwerty";
const { pairRows } = await import("../src/engine/pairs.js");
const { ensureLex } = await import("../src/engine/lexicon.js");

function typed(ch, ms) {
  const s = stats.charStat(LID, ch, true);
  s.n = 40;
  s.a = 40;
  s.t = Array.from({ length: 30 }, () => ms);
  s.o = Array.from({ length: 30 }, () => 0);
  s.ls = Date.now();
}

function setup() {
  fresh(LID);
  "etaoinshrdlucmfwypvbgk".split("").forEach(c => typed(c, 200));
  stats.layoutData(LID).k = 22;
  return stats.layoutData(LID);
}

test("a fresh layout has no pair rows", () => {
  fresh(LID);
  assert.deepEqual(pairRows(LID), []);
});

test("pairs that are slow and common rank above slow and rare ones", () => {
  const L = setup();
  const bn = ensureLex("en").bn;
  const pairs = Object.keys(bn).filter(k => k.length === 2 && "etaoinshrdlucmfwypvbgk".includes(k[0]) && "etaoinshrdlucmfwypvbgk".includes(k[1]) && k[0] !== k[1]).sort((a, b) => bn[b] - bn[a]);
  const common = pairs[0];
  const rare = pairs.filter(k => bn[k] > 0)[pairs.filter(k => bn[k] > 0).length - 1];
  assert.ok(bn[common] > bn[rare] * 5);
  L.pairs[rare] = { n: 20, m: 700 };
  L.pairs[common] = { n: 20, m: 700 };
  const rows = pairRows(LID);
  assert.equal(rows[0].k, common);
  assert.ok(rows.map(r => r.k).indexOf(rare) > 0);
});

test("a pair that is often swapped shows up even without enough timing samples", () => {
  const L = setup();
  L.pairs.er = { n: 0, m: 500, te: 4, tc: 2 };
  const row = pairRows(LID).find(r => r.k === "er");
  assert.ok(row);
  assert.ok(Math.abs(row.swaps - 4 / 9) < 0.001);
  assert.equal(row.m, null);
  assert.equal(row.d, null);
});

test("a rarely swapped pair with few samples is left out", () => {
  const L = setup();
  L.pairs.th = { n: 3, m: 900, te: 0.2, tc: 20 };
  assert.equal(pairRows(LID).find(r => r.k === "th"), undefined);
});

test("swaps raise a pair's rank among equally slow pairs", () => {
  const L = setup();
  const bn = ensureLex("en").bn;
  const a = "th";
  const b = "he";
  assert.ok(bn[a] > 0 && bn[b] > 0);
  L.pairs[a] = { n: 20, m: 600 };
  L.pairs[b] = { n: 20, m: 600, te: 6, tc: 3 };
  const rows = pairRows(LID);
  const ia = rows.findIndex(r => r.k === a);
  const ib = rows.findIndex(r => r.k === b);
  assert.ok(rows[ib].swaps > 0.4);
  assert.ok(rows[ib].impact > 0);
  assert.ok(ia >= 0 && ib >= 0);
  const noSwap = Object.assign({}, L.pairs[b], { te: 0, tc: 10 });
  L.pairs[b] = noSwap;
  const after = pairRows(LID).find(r => r.k === b);
  assert.ok(rows[ib].impact > after.impact);
});

test("rows carry speed, extra time and a swap rate for the table", () => {
  const L = setup();
  L.pairs.th = { n: 20, m: 500, te: 1, tc: 10 };
  const row = pairRows(LID).find(r => r.k === "th");
  assert.equal(row.n, 20);
  assert.equal(row.m, 500);
  assert.ok(row.d > 250 && row.d < 350);
  assert.ok(row.swaps > 0 && row.swaps < 0.2);
});
