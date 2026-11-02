import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, session, stats, storage, tracks } from "./helpers.mjs";

const LID = "en-qwerty";

function setLesson(text) {
  tracks.newLesson();
  const chars = text.split("");
  S.lesson.chars = chars;
  S.lesson.flag = new Uint8Array(chars.length);
  S.lesson.mark = new Uint8Array(chars.length);
  S.lesson.errTs = new Float64Array(chars.length);
  S.lesson.idx = 0;
  S.lesson.errs = 0;
  S.lesson.done = false;
}

function feed(seq, step) {
  let ts = 1000;
  for (const c of seq) {
    ts += step || 200;
    session.handleChar(c, ts, noHooks);
  }
}

test("a swapped neighbour is charged to the pair and leaves both key accuracies alone", () => {
  fresh(LID);
  base.seedRng(3);
  setLesson("abcdefghij");
  feed(["b", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  const a = stats.charStat(LID, "a", false);
  assert.equal(a.e, 0);
  assert.equal(a.o.indexOf(1), -1);
  const L = stats.layoutData(LID);
  assert.ok(L.pairs.ab.te > 0.9);
  assert.equal(S.data.lessons.length >= 0, true);
});

test("an ordinary wrong key is still charged to the key", () => {
  fresh(LID);
  base.seedRng(3);
  setLesson("abcdefghij");
  feed(["z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  const a = stats.charStat(LID, "a", false);
  assert.equal(a.e, 1);
  assert.equal(a.o.indexOf(1) >= 0, true);
  assert.equal(stats.layoutData(LID).pairs.ab, undefined);
});

test("the lesson still counts a swap as an error for lesson accuracy", () => {
  fresh(LID);
  setLesson("abcdefghij");
  feed(["b", "a"]);
  assert.equal(S.lesson.errs, 1);
});

test("clean repetitions of a pair lower its swap rate over time", () => {
  fresh(LID);
  base.seedRng(3);
  setLesson("abababababababababab");
  feed("babababababababababab".split(""));
  const early = stats.layoutData(LID).pairs.ab;
  const rate0 = early.te / (early.te + early.tc + 3);
  setLesson("ababababababababababababababababababababababab");
  feed("ababababababababababababababababababababababab".split(""));
  const p = stats.layoutData(LID).pairs.ab;
  assert.ok(p.te / (p.te + p.tc + 3) < rate0);
});

test("swap counts survive sanitizing and bad values are clamped", () => {
  const out = storage.sanitizeData({ layouts: { [LID]: { pairs: { ab: { n: 8, m: 300, te: 2.5, tc: 9 }, cd: { n: 8, m: 300, te: "x", tc: -4 } } } } });
  const p = out.layouts[LID].pairs;
  assert.equal(p.ab.te, 2.5);
  assert.equal(p.ab.tc, 9);
  assert.equal(p.cd.te, 0);
  assert.equal(p.cd.tc, 0);
});

test("a pair that is often swapped becomes a focus pair of the next lesson", () => {
  fresh(LID);
  base.seedRng(5);
  stats.layoutData(LID).k = 12;
  const L = stats.layoutData(LID);
  L.pairs.er = { n: 0, m: 500, te: 6, tc: 4 };
  let hit = 0;
  for (let i = 0; i < 6; i++) {
    tracks.newLesson();
    if (S.lesson.focusPair === "er") hit++;
  }
  assert.ok(hit >= 5, "focus pair er in " + hit + " of 6 lessons");
});
