import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, session, skill, stats, storage, testMode, tracks } from "./helpers.mjs";

const LID = "en-qwerty";
const DAY = 86400000;
const today = () => Math.floor(Date.now() / DAY);

function stat(ch, t, td, o, od, ls) {
  const L = stats.layoutData(LID);
  L.chars[ch] = { n: t.length, a: t.length, e: 0, t: t.slice(), o: o || t.map(() => 0), x: {}, ls: ls === undefined ? Date.now() : ls };
  if (td) L.chars[ch].td = td;
  if (od) L.chars[ch].od = od;
  return L.chars[ch];
}

test("lesson samples are stamped with the day and as not-from-a-test", () => {
  fresh(LID);
  base.seedRng(2);
  tracks.newLesson();
  let ts = 1000;
  for (const c of S.lesson.chars.slice(0, 12)) {
    ts += 220;
    session.handleChar(c, ts, noHooks);
  }
  const first = S.lesson.chars[1];
  const st = stats.charStat(LID, first, false);
  assert.ok(st.td.length > 0 && st.od.length > 0);
  assert.equal(st.td[st.td.length - 1], today() * 2);
  assert.equal(st.od[st.od.length - 1], today() * 2);
});

test("samples typed in a test are stamped as test samples", () => {
  fresh(LID, { testMode: "words", testWords: 10 });
  testMode.testNew();
  S.test.words = ["alpha", "beta"];
  S.test.words0 = ["alpha", "beta"];
  let ts = 1000;
  for (const c of "alpha beta") {
    ts += 200;
    testMode.testChar(c, ts);
  }
  const a = stats.charStat(LID, "l", false);
  assert.equal(a.od[a.od.length - 1] % 2, 1);
  assert.equal(a.td[a.td.length - 1] % 2, 1);
});

test("old samples count for much less than recent ones", () => {
  fresh(LID);
  const old = today() - 90;
  const t = [...Array(35).fill(200), ...Array(5).fill(400)];
  const aged = stat("e", t, [...Array(35).fill(old * 2), ...Array(5).fill(today() * 2)]);
  const plain = stat("t", t, t.map(() => today() * 2));
  const a = skill.uncachedSkillOf(LID, "e", aged);
  const p = skill.uncachedSkillOf(LID, "t", plain);
  assert.ok(a.ms > p.ms + 60, a.ms + " vs " + p.ms);
});

test("test samples count half as much as lesson samples", () => {
  fresh(LID);
  const t = [...Array(20).fill(200), ...Array(20).fill(400)];
  const stampsLesson = t.map(() => today() * 2);
  const stampsTest = [...Array(20).fill(today() * 2), ...Array(20).fill(today() * 2 + 1)];
  const asLesson = stat("e", t, stampsLesson);
  const asTest = stat("t", t, stampsTest);
  assert.ok(skill.uncachedSkillOf(LID, "t", asTest).ms < skill.uncachedSkillOf(LID, "e", asLesson).ms);
});

test("samples without stamps are as old as the key was last seen", () => {
  fresh(LID);
  const t = Array(30).fill(250);
  const recent = stat("e", t, null, null, null, Date.now());
  const stale = stat("t", t, null, null, null, Date.now() - 60 * DAY);
  assert.ok(skill.uncachedSkillOf(LID, "t", stale).ne < skill.uncachedSkillOf(LID, "e", recent).ne * 0.5);
});

test("a cached estimate changes when only the date moves on", () => {
  fresh(LID);
  const t = Array(30).fill(250);
  const s = stat("e", t, t.map(() => today() * 2));
  const before = skill.skillOf(LID, "e", s).ne;
  const real = Date.now;
  Date.now = () => real() + 40 * DAY;
  try {
    const later = skill.skillOf(LID, "e", s).ne;
    assert.ok(later < before * 0.5, before + " then " + later);
    assert.equal(later, skill.uncachedSkillOf(LID, "e", s).ne);
  } finally {
    Date.now = real;
  }
});

test("stamps survive sanitizing and are clamped", () => {
  const out = storage.sanitizeData({ layouts: { [LID]: { chars: { e: { n: 3, a: 3, e: 0, t: [200, 210, 220], o: [0, 0, 0], td: [100, 101, "x", -5], od: [200, 202] } } } } });
  const c = out.layouts[LID].chars.e;
  assert.deepEqual(c.td, [100, 101]);
  assert.deepEqual(c.od, [200, 202]);
});
