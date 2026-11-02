import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, order, session, stats, storage, testMode, tracks } from "./helpers.mjs";

const LID = "en-qwerty";
const LETTERS = "abcdefghijklmnopqrstuvwxyz ".split("");

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
  S.lesson.start = 0;
}

function feed(seq) {
  let ts = 1000;
  for (const c of seq) {
    ts += 200;
    session.handleChar(c, ts, noHooks);
  }
}

function everythingSteady() {
  stats.layoutData(LID).k = order.currentOrder().length;
  LETTERS.forEach(c => {
    const s = stats.charStat(LID, c, true);
    s.n = 60;
    s.a = 60;
    s.t = Array.from({ length: 40 }, () => 150);
    s.o = Array.from({ length: 40 }, () => 0);
    s.ls = Date.now();
  });
}

test("a real word typed with an error becomes a weak word and clean typing fades it", () => {
  fresh(LID);
  everythingSteady();
  setLesson("quick brown fox");
  feed("quixk".split("").concat(["c", "k", " "], "brown fox".split("")));
  const L = stats.layoutData(LID);
  assert.deepEqual(L.weak.map(x => x.w), ["quick"]);
  assert.equal(L.weak[0].s, 1);
  setLesson("quick brown fox");
  feed("quick brown fox".split(""));
  assert.ok(L.weak.length === 0 || L.weak[0].s < 1);
  for (let i = 0; i < 6; i++) {
    setLesson("quick brown fox");
    feed("quick brown fox".split(""));
  }
  assert.equal(L.weak.length, 0);
});

test("words that are not real words are never remembered", () => {
  fresh(LID);
  everythingSteady();
  setLesson("xqzv brown");
  feed("xqzx".split("").concat(["v", " "], "brown".split("")));
  assert.deepEqual(stats.layoutData(LID).weak || [], []);
});

test("words missed in a test are remembered and typed ones are not", () => {
  fresh(LID, { testMode: "words", testWords: 10 });
  testMode.testNew();
  S.test.words = ["quick", "brown"];
  S.test.words0 = ["quick", "brown"];
  let ts = 1000;
  for (const c of "quixk brown") {
    ts += 200;
    testMode.testChar(c, ts);
  }
  assert.deepEqual(stats.layoutData(LID).weak.map(x => x.w), ["quick"]);
});

test("the list keeps the 60 worst words", () => {
  const out = storage.sanitizeData({ layouts: { [LID]: { weak: Array.from({ length: 80 }, (_, i) => ({ w: "word" + i, s: i + 1 })).concat([{ w: 5, s: 1 }, { w: "ok", s: "x" }]) } } });
  const weak = out.layouts[LID].weak;
  assert.equal(weak.length, 60);
  assert.ok(weak.every(x => typeof x.w === "string" && x.s > 0));
});

test("once every key is steady lessons bring back the weak words", () => {
  fresh(LID);
  base.seedRng(4);
  everythingSteady();
  stats.layoutData(LID).weak = [{ w: "quick", s: 3 }, { w: "maybe", s: 2 }, { w: "people", s: 1 }];
  let withWeak = 0;
  for (let i = 0; i < 8; i++) {
    tracks.newLesson();
    const text = S.lesson.chars.join("");
    if (["quick", "maybe", "people"].some(w => text.split(" ").indexOf(w) >= 0)) withWeak++;
  }
  assert.ok(withWeak >= 7, "weak words in " + withWeak + " of 8 lessons");
});

test("while a key is still blocking, weak words do not crowd the lesson", () => {
  fresh(LID);
  base.seedRng(4);
  stats.layoutData(LID).weak = [{ w: "the", s: 3 }];
  tracks.newLesson();
  const words = S.lesson.chars.join("").split(" ");
  assert.ok(words.filter(w => w === "the").length <= 1);
});

test("a practice lesson is built from exactly the given words", () => {
  fresh(LID);
  base.seedRng(4);
  assert.equal(tracks.newWordsLesson([]), false);
  assert.equal(tracks.newWordsLesson(["quick", "maybe"]), true);
  const words = S.lesson.chars.join("").split(" ");
  assert.equal(words.length, S.settings.lessonWords);
  assert.ok(words.every(w => w === "quick" || w === "maybe"));
  assert.ok(words.indexOf("quick") >= 0 && words.indexOf("maybe") >= 0);
  assert.equal(S.lesson.done, false);
  assert.equal(S.lesson.idx, 0);
});

test("a code lesson never creates or changes the letters layout", async () => {
  const { newCodeLesson } = await import("../src/engine/code.js");
  fresh(LID);
  S.codeRes = null;
  S.codeRecent = [];
  newCodeLesson();
  const before = JSON.stringify(S.data.layouts[LID] || null);
  const quiet = { painted() {}, finished() {} };
  let ts = 1000;
  for (const c of S.lesson.chars.slice()) {
    ts += 200;
    session.handleChar(c, ts, quiet);
  }
  assert.equal(JSON.stringify(S.data.layouts[LID] || null), before);
});
