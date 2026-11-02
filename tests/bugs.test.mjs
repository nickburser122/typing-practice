import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, layouts, order, session, skill, stats, storage, tracks, typeLesson } from "./helpers.mjs";

const LID = "en-qwerty";

function pushLesson(acc, tr) {
  const rec = { ts: Date.now(), lid: LID, wpm: 30, acc, n: 100 };
  if (tr) rec.tr = tr;
  S.data.lessons.push(rec);
}

test("a poor lesson on another track does not hold back the next letter unlock", () => {
  fresh(LID);
  pushLesson(0.98, "letters");
  pushLesson(0.98, "letters");
  pushLesson(0.98, "letters");
  pushLesson(0.5, "digits");
  assert.equal(skill.lessonAccuracyOk(LID, "letters"), true);
  assert.equal(stats.recentAccuracy(LID, 3, "letters") > 0.97, true);
  assert.equal(skill.lessonAccuracyOk(LID, "digits"), false);
});

test("lessons without a track are treated as letters", () => {
  fresh(LID);
  pushLesson(0.97);
  pushLesson(0.97);
  pushLesson(0.97);
  assert.equal(skill.lessonAccuracyOk(LID, "letters"), true);
  assert.equal(stats.recentAccuracy(LID, 3, "digits"), null);
});

test("finished lessons record the track they belong to", () => {
  fresh(LID);
  base.seedRng(5);
  tracks.newLesson();
  typeLesson(300, 0, 1);
  S.settings.learnTracks = Object.assign({}, S.settings.learnTracks, { active: "digits" });
  tracks.newLesson();
  typeLesson(300, 0, 1);
  assert.deepEqual(S.data.lessons.map(l => l.tr), ["letters", "digits"]);
});

test("the lesson track survives sanitizing and unknown tracks fall back to letters", () => {
  const out = storage.sanitizeData({
    lessons: [
      { ts: 1, lid: LID, wpm: 30, acc: 0.9, n: 50, tr: "symbols" },
      { ts: 2, lid: LID, wpm: 30, acc: 0.9, n: 50, tr: "nonsense" },
      { ts: 3, lid: LID, wpm: 30, acc: 0.9, n: 50 }
    ]
  });
  assert.deepEqual(out.lessons.map(l => l.tr), ["symbols", "letters", "letters"]);
});

test("starting from the first keys changes only this layout and leaves global settings alone", () => {
  fresh(LID, { order: "smart", startKeys: 6 });
  const other = Object.keys(layouts.LAYOUTS).find(k => k !== LID);
  stats.layoutData(other).k = 12;
  order.startFromFirstKeys();
  assert.equal(S.settings.order, "smart");
  assert.equal(S.settings.startKeys, 6);
  assert.equal(stats.layoutData(LID).k, 2);
  assert.equal(stats.layoutData(LID).placed, true);
  assert.equal(S.data.onboard, "done");
  assert.equal(stats.layoutData(other).k, 12);
});

test("the hardware keyboard flag survives sanitizing and defaults to false", () => {
  assert.equal(storage.sanitizeData({ hw: true }).hw, true);
  assert.equal(storage.sanitizeData({ hw: "yes" }).hw, false);
  assert.equal(storage.sanitizeData(null).hw, false);
});

test("Esc in Learn asks twice only once more than 30% of the lesson is typed", () => {
  fresh(LID);
  base.seedRng(9);
  tracks.newLesson();
  const L = S.lesson;
  assert.equal(session.needsEscConfirm(L), false);
  L.idx = Math.floor(L.chars.length * 0.3);
  assert.equal(session.needsEscConfirm(L), false);
  L.idx = Math.floor(L.chars.length * 0.3) + 2;
  assert.equal(session.needsEscConfirm(L), true);
  L.done = true;
  assert.equal(session.needsEscConfirm(L), false);
  assert.equal(session.needsEscConfirm(null), false);
});
