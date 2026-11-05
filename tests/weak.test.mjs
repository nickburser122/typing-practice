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
  assert.equal(L.weak[0].misses, 1);
  assert.equal(L.weak[0].slowMs, 0);
  setLesson("quick brown fox");
  feed("quick brown fox".split(""));
  assert.ok(L.weak.length === 0 || L.weak[0].misses < 1);
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

test("the list keeps the 300 worst words and reads the old shape", () => {
  const out = storage.sanitizeData({ layouts: { [LID]: { weak: Array.from({ length: 340 }, (_, i) => ({ w: "word" + i, misses: i + 1, slowMs: 10, ls: 5 })).concat([{ w: 5, misses: 1 }, { w: "ok", misses: "x" }, { w: "legacy", s: 2.5 }]) } } });
  const weak = out.layouts[LID].weak;
  assert.equal(weak.length, 300);
  assert.ok(weak.every(x => typeof x.w === "string" && x.misses >= 0 && x.slowMs >= 0 && x.ls >= 0));
  const legacy = storage.sanitizeData({ layouts: { [LID]: { weak: [{ w: "legacy", s: 2.5 }] } } }).layouts[LID].weak[0];
  assert.deepEqual(legacy, { w: "legacy", misses: 2.5, slowMs: 0, ls: 0 });
});

test("once every key is steady lessons bring back the weak words", () => {
  fresh(LID);
  base.seedRng(4);
  everythingSteady();
  stats.layoutData(LID).weak = [{ w: "quick", misses: 3, slowMs: 0, ls: 0 }, { w: "maybe", misses: 2, slowMs: 0, ls: 0 }, { w: "people", misses: 1, slowMs: 0, ls: 0 }];
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
  stats.layoutData(LID).weak = [{ w: "the", misses: 3, slowMs: 0, ls: 0 }];
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

function feedTimed(seq) {
  let ts = 1000;
  for (const [c, gap] of seq) {
    ts += gap;
    session.handleChar(c, ts, noHooks);
  }
}

function timedWords(text, slowWord) {
  const out = [];
  text.split(" ").forEach((w, wi, all) => {
    w.split("").forEach((c, i) => out.push([c, i === 0 ? 180 : w === slowWord ? 520 : 150]));
    if (wi < all.length - 1) out.push([" ", 180]);
  });
  return out;
}

test("a clean but slow word is remembered with its extra time per character", () => {
  fresh(LID);
  everythingSteady();
  const text = "people maybe other house water about which their";
  setLesson(text);
  feedTimed(timedWords(text, "house"));
  const weak = stats.layoutData(LID).weak;
  assert.deepEqual(weak.map(x => x.w), ["house"]);
  assert.equal(weak[0].misses, 0);
  assert.ok(weak[0].slowMs > 200, String(weak[0].slowMs));
  assert.ok(weak[0].ls > 0);
});

test("evenly typed words add nothing, and a slow word fades when typed at pace", () => {
  fresh(LID);
  everythingSteady();
  const text = "people maybe other house water about which their";
  setLesson(text);
  feedTimed(timedWords(text, null));
  assert.deepEqual(stats.layoutData(LID).weak, []);
  setLesson(text);
  feedTimed(timedWords(text, "house"));
  assert.equal(stats.layoutData(LID).weak.length, 1);
  for (let i = 0; i < 8; i++) {
    setLesson(text);
    feedTimed(timedWords(text, null));
  }
  assert.deepEqual(stats.layoutData(LID).weak, []);
});

test("a slow word in a test is remembered too and offered for practice with the missed ones", () => {
  fresh(LID, { testMode: "words", testWords: 10 });
  testMode.testNew();
  const words = ["people", "maybe", "other", "house", "water", "about", "which", "their"];
  S.test.words = words.slice();
  S.test.words0 = words.slice();
  let ts = 1000;
  words.forEach((w, wi) => {
    const typed = w === "water" ? "watxr" : w;
    typed.split("").forEach((c, i) => {
      ts += i === 0 ? 180 : w === "house" ? 520 : 150;
      testMode.testChar(c, ts);
    });
    ts += 180;
    if (wi < words.length - 1) testMode.testChar(" ", ts);
  });
  const weak = stats.layoutData(LID).weak;
  assert.ok(weak.some(x => x.w === "house" && x.slowMs > 200));
  assert.ok(weak.some(x => x.w === "water" && x.misses > 0));
  const list = testMode.practiceWords(S.test);
  assert.ok(list.indexOf("water") >= 0 && list.indexOf("house") >= 0);
  assert.equal(list.indexOf("people"), -1);
});
