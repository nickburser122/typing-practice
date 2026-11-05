import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, testMode, tracks, typeLesson } from "./helpers.mjs";

const LID = "en-qwerty";
const sl = await import("../src/engine/sessionlen.js");

test("nothing is due when the session length is off", () => {
  fresh(LID, { session: 0 });
  sl.resetSession();
  sl.noteWork(10 * 3600000, 5000, 10);
  assert.equal(sl.sessionDue(), false);
});

test("a session becomes due once its practice time reaches the limit", () => {
  fresh(LID, { session: 10 });
  sl.resetSession();
  sl.noteWork(9 * 60000, 3000, 30);
  assert.equal(sl.sessionDue(), false);
  sl.noteWork(60000, 500, 5);
  assert.equal(sl.sessionDue(), true);
});

test("the summary reports time, characters, speed and accuracy", () => {
  fresh(LID, { session: 10 });
  sl.resetSession();
  sl.noteWork(5 * 60000, 1500, 15);
  sl.noteWork(5 * 60000, 1500, 15);
  const s = sl.sessionSummary();
  assert.equal(s.ms, 600000);
  assert.equal(s.chars, 3000);
  assert.ok(Math.abs(s.wpm - 60) < 0.01);
  assert.ok(Math.abs(s.acc - 0.99) < 0.0001);
});

test("once shown a session is not due again until it is reset", () => {
  fresh(LID, { session: 10 });
  sl.resetSession();
  sl.noteWork(11 * 60000, 3000, 30);
  assert.equal(sl.sessionDue(), true);
  S.session.shown = true;
  assert.equal(sl.sessionDue(), false);
  sl.resetSession();
  assert.equal(S.session.ms, 0);
  assert.equal(S.session.shown, false);
  assert.equal(sl.sessionDue(), false);
});

test("finished lessons and tests add their active time and keystrokes", () => {
  fresh(LID, { session: 20, testMode: "words", testWords: 10 });
  sl.resetSession();
  base.seedRng(6);
  tracks.newLesson();
  typeLesson(300, 0, 3);
  assert.ok(S.session.ms > 0 && S.session.chars > 100);
  const before = S.session.chars;
  testMode.testNew();
  S.test.words = ["alpha", "beta"];
  S.test.words0 = ["alpha", "beta"];
  let ts = 1000;
  for (const c of "alpha beta") {
    ts += 200;
    testMode.testChar(c, ts);
  }
  assert.ok(S.session.chars > before);
});

test("a length that is not on the list is ignored", () => {
  fresh(LID, { session: 17 });
  sl.resetSession();
  sl.noteWork(60 * 60000, 100, 0);
  assert.equal(sl.sessionDue(), false);
});
