import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, skill, stats } from "./helpers.mjs";

const LID = "en-qwerty";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

function fill(seed) {
  base.seedRng(seed);
  LETTERS.forEach(c => {
    const s = stats.charStat(LID, c, true);
    s.n = 30;
    s.a = 30;
    s.t = Array.from({ length: 12 + Math.floor(base.rnd() * 28) }, () => 150 + base.rnd() * 300);
    s.o = Array.from({ length: s.t.length }, () => (base.rnd() < 0.06 ? 1 : 0));
  });
}

function same(a, b) {
  assert.deepEqual(a, b);
}

function checkAll() {
  same(skill.globalMs(LID), skill.uncachedGlobalMs(LID));
  LETTERS.forEach(c => {
    const s = stats.charStat(LID, c, false);
    same(skill.skillOf(LID, c, s), skill.uncachedSkillOf(LID, c, s));
  });
}

test("cached key estimates equal the uncached ones for the same data", () => {
  fresh(LID);
  fill(1);
  checkAll();
  checkAll();
});

test("a new sample, a replaced array or a replaced stat object is picked up at once", () => {
  fresh(LID);
  fill(2);
  checkAll();
  const a = stats.charStat(LID, "a", false);
  a.t.push(900);
  a.o.push(1);
  checkAll();
  a.t = a.t.map(v => v * 1.5);
  checkAll();
  stats.layoutData(LID).chars.b = { n: 30, a: 30, e: 0, t: [100, 120, 110, 90, 95, 105, 99], o: [0, 0, 0, 0, 0, 0, 0], x: {} };
  checkAll();
  const ring = stats.charStat(LID, "c", false);
  ring.t.push(777);
  ring.t.shift();
  checkAll();
});

test("changing the target speed or replacing all data is picked up at once", () => {
  fresh(LID);
  fill(3);
  checkAll();
  S.settings.targetWpm = 60;
  checkAll();
  S.data = JSON.parse(JSON.stringify(S.data));
  checkAll();
  S.data.layouts[LID].chars.a.t.length = 3;
  checkAll();
  fresh(LID);
  checkAll();
});

test("status and need read the same numbers as before the cache", () => {
  fresh(LID);
  fill(4);
  stats.layoutData(LID).k = 26;
  LETTERS.forEach(c => {
    const s = stats.charStat(LID, c, false);
    const k = skill.uncachedSkillOf(LID, c, s);
    const expected = s.n < S.derived.minS ? "sparse" : k.upper <= skill.gateOf(c) && k.acc >= S.derived.targetAcc - 0.03 ? "steady" : "learning";
    assert.equal(skill.statusOf(s, c), expected);
  });
});

test("a cached estimate is not shared across layouts", () => {
  fresh(LID);
  fill(5);
  const a = skill.globalMs(LID);
  fresh("en-dvorak");
  assert.notEqual(skill.globalMs("en-dvorak"), a);
  assert.equal(skill.globalMs("en-dvorak"), skill.uncachedGlobalMs("en-dvorak"));
});
