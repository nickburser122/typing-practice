import test from "node:test";
import assert from "node:assert/strict";
import { S, fresh, layouts, tracks } from "./helpers.mjs";

const fatigue = await import("../src/engine/fatigue.js");
const LID = "en-qwerty";
const OTHER = Object.keys(layouts.LAYOUTS).find(k => k !== LID);
const MIN = 60000;

function tired(lid, tr, at) {
  [100, 100, 100, 100, 100].forEach((m, i) => fatigue.noteSession(lid, tr, m, 0.01, at + i * MIN));
  [140, 140, 140].forEach((m, i) => fatigue.noteSession(lid, tr, m, 0.05, at + (5 + i) * MIN));
}

test("tiredness is tracked per layout and track", () => {
  fresh(LID);
  tired(LID, "digits", 0);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
  assert.equal(fatigue.gateUnlock(OTHER, "digits", true), true);
  assert.equal(fatigue.gateUnlock(LID, "digits", true), false);
});

test("tiredness delays an unlock by two lessons at most", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  const seen = [1, 2, 3, 4].map(() => fatigue.gateUnlock(LID, "letters", true));
  assert.deepEqual(seen, [false, false, true, true]);
});

test("a lesson that is not ready to unlock never counts as a delay", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  assert.deepEqual([1, 2, 3].map(() => fatigue.gateUnlock(LID, "letters", false)), [false, false, false]);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), false);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), false);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
});

test("ten idle minutes end the sitting and its baseline", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  const later = 8 * MIN + 11 * MIN;
  fatigue.noteSession(LID, "letters", 140, 0.05, later);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
});

test("a steady slow sitting is not tiredness because the baseline is from the same sitting", () => {
  fresh(LID);
  for (let i = 0; i < 12; i++) fatigue.noteSession(LID, "letters", 140, 0.04, i * MIN);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
});

test("recovery clears the hold", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  [100, 100, 100].forEach((m, i) => fatigue.noteSession(LID, "letters", m, 0.01, (8 + i) * MIN));
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
});

test("resetting a sitting forgets its baseline", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  fatigue.resetSitting(LID, "letters");
  assert.equal(fatigue.gateUnlock(LID, "letters", true), true);
});

test("the Keys page explanation names tiredness when it is what holds the next key", () => {
  fresh(LID);
  tired(LID, "letters", Date.now() - 8 * MIN);
  assert.equal(fatigue.gateUnlock(LID, "letters", true), false);
  const info = tracks.stallInfo();
  assert.equal(info.kind, "fatigue");
  assert.equal(info.track, "letters");
});

test("saved state never needs to know about sittings", () => {
  fresh(LID);
  tired(LID, "letters", 0);
  assert.equal(JSON.stringify(S.data).indexOf("sitting"), -1);
  assert.equal(JSON.stringify(S.data).indexOf("held"), -1);
});
