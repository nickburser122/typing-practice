import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, session, testMode, tracks } from "./helpers.mjs";

const LID = "en-qwerty";

function dayTotals() {
  let ms = 0;
  let s = 0;
  const days = S.data.days[LID] || {};
  for (const k of Object.keys(days)) {
    ms += days[k].ms;
    s += days[k].s;
  }
  return { ms, s };
}

function runLesson(gap) {
  fresh(LID);
  base.seedRng(8);
  tracks.newLesson();
  const lesson = S.lesson;
  let ts = 1000;
  for (let i = 0; i < lesson.chars.length; i++) {
    ts += 300;
    if (i === 40) ts += gap;
    session.handleChar(lesson.chars[i], ts, noHooks);
  }
  return { rec: S.data.lessons[0], totals: dayTotals(), n: lesson.chars.length };
}

test("a pause in the middle of a lesson does not lower its speed", () => {
  const still = runLesson(0);
  const paused = runLesson(30000);
  assert.ok(paused.rec.wpm / still.rec.wpm > 0.85, paused.rec.wpm + " vs " + still.rec.wpm);
});

test("a pause in the middle of a lesson adds at most the pause cap to practice time", () => {
  const still = runLesson(0);
  const paused = runLesson(30000);
  assert.ok(paused.totals.ms - still.totals.ms <= 4000 + 5, String(paused.totals.ms - still.totals.ms));
});

test("the lesson record keeps its active time", () => {
  const paused = runLesson(30000);
  assert.ok(paused.rec.ams > 0);
  assert.ok(Math.abs(paused.rec.ams - paused.totals.ms) <= 1);
});

function startTest(extra, words) {
  fresh(LID, extra);
  testMode.testNew();
  S.test.words = words.slice();
  S.test.words0 = words.slice();
  return S.test;
}

function type(text, ts0, step) {
  let ts = ts0;
  for (const ch of text) {
    testMode.testChar(ch, ts);
    ts += step;
  }
  return ts;
}

test("test speed stays wall-clock while practice time ignores long pauses", () => {
  const T = startTest({ testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  let ts = type("alpha ", 1000, 160);
  ts += 30000;
  type("beta", ts, 160);
  assert.equal(T.done, true);
  assert.ok(T.res.dur > 30);
  assert.ok(dayTotals().ms < 8000, String(dayTotals().ms));
});

test("a failed expert test adds its time to Progress but no record, best or averages", () => {
  const T = startTest({ testDiff: "expert", testMode: "words", testWords: 10 }, ["alpha", "beta", "gamma"]);
  type("bexa", 1000, 300);
  testMode.testChar(" ", 2500);
  assert.equal(T.res.failed, "expert");
  assert.equal(S.data.tests.length, 0);
  assert.deepEqual(S.data.pbs, {});
  const totals = dayTotals();
  assert.ok(totals.ms >= 1000, String(totals.ms));
  assert.equal(totals.s, 0);
  const day = Object.values(S.data.days[LID])[0];
  assert.equal(day.w, 0);
  assert.equal(day.a, 0);
  assert.equal(day.b, 0);
  assert.ok(day.k >= 4);
});

test("a failed master test adds its time too", () => {
  startTest({ testDiff: "master", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  type("alp", 1000, 300);
  testMode.testChar("z", 2000);
  assert.ok(dayTotals().ms >= 1000);
  assert.equal(S.data.tests.length, 0);
});

test("the placement test adds its time but is not a test record", () => {
  fresh(LID);
  S.testOv = { mode: "words", amt: 10 };
  testMode.testNew();
  S.test.words = ["alpha", "beta"];
  S.test.words0 = ["alpha", "beta"];
  type("alpha beta", 1000, 300);
  assert.equal(S.test.done, true);
  assert.equal(S.data.tests.length, 0);
  assert.deepEqual(S.data.pbs, {});
  assert.ok(dayTotals().ms >= 1000);
  S.testOv = null;
});

test("a test with no keystrokes records nothing", () => {
  const T = startTest({ testMode: "words", testWords: 10 }, ["alpha"]);
  testMode.testFinish(1000);
  assert.equal(T.done, true);
  assert.deepEqual(S.data.days, {});
});
