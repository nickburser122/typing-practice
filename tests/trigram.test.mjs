import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, order, session, stats, storage, tracks } from "./helpers.mjs";

const LID = "en-qwerty";

function setLesson(text) {
  tracks.newLesson();
  const chars = text.split("");
  S.lesson.chars = chars;
  S.lesson.flag = new Uint8Array(chars.length);
  S.lesson.mark = new Uint8Array(chars.length);
  S.lesson.errTs = new Float64Array(chars.length);
  S.lesson.cts = new Float64Array(chars.length);
  S.lesson.idx = 0;
  S.lesson.errs = 0;
  S.lesson.done = false;
  S.lesson.start = 0;
}

function feed(seq, step) {
  let ts = 1000;
  for (const c of seq) {
    ts += step || 200;
    session.handleChar(c, ts, noHooks);
  }
}

test("clean letter triples are timed and counted", () => {
  fresh(LID);
  setLesson("the then thin the");
  feed("the then thin the".split(""));
  const tri = stats.layoutData(LID).tri;
  assert.ok(tri.the.n >= 3);
  assert.ok(tri.the.m > 100 && tri.the.m < 400);
  assert.equal(tri["he "], undefined);
});

test("a triple with a mistake inside it is not timed", () => {
  fresh(LID);
  setLesson("abc abc");
  feed(["a", "x", "b", "c"].concat([" ", "a", "b", "c"]));
  const tri = stats.layoutData(LID).tri || {};
  assert.equal(tri.abc && tri.abc.n, 1);
});

test("triple statistics are sanitized and capped at 400", () => {
  const many = {};
  for (let i = 0; i < 450; i++) many["a" + String.fromCharCode(98 + (i % 24)) + String.fromCharCode(97 + Math.floor(i / 24))] = { n: i + 1, m: 300 };
  many.bad = { n: "x", m: 100 };
  many.toolong = { n: 3, m: 100 };
  many.zzz = { n: 1000, m: -5 };
  const out = storage.sanitizeData({ layouts: { [LID]: { tri: many } } }).layouts[LID].tri;
  assert.ok(Object.keys(out).length <= 400);
  assert.equal(out.bad, undefined);
  assert.equal(out.toolong, undefined);
  assert.equal(out.zzz.m >= 1, true);
});

function steadyAll() {
  stats.layoutData(LID).k = order.currentOrder().length;
  "abcdefghijklmnopqrstuvwxyz ".split("").forEach(c => {
    const s = stats.charStat(LID, c, true);
    s.n = 60;
    s.a = 60;
    s.t = Array.from({ length: 40 }, () => 150);
    s.o = Array.from({ length: 40 }, () => 0);
    s.ls = Date.now();
  });
}

test("in fluency, words with slow triples are drawn more often", () => {
  fresh(LID);
  base.seedRng(8);
  steadyAll();
  const L = stats.layoutData(LID);
  L.tri = { ing: { n: 30, m: 700 }, the: { n: 30, m: 120 }, tio: { n: 30, m: 650 } };
  L.pairs.ng = { n: 30, m: 140 };
  L.pairs.he = { n: 30, m: 120 };
  L.pairs.io = { n: 30, m: 120 };
  let hit = 0;
  let all = 0;
  for (let i = 0; i < 12; i++) {
    tracks.newLesson();
    S.lesson.chars.join("").split(" ").forEach(w => {
      all++;
      if (w.indexOf("ing") >= 0 || w.indexOf("tio") >= 0) hit++;
    });
  }
  assert.ok(hit / all > 0.15, "share " + (hit / all).toFixed(3));
});

test("the fluency mix is about 20 percent weak words and 10 percent review, the rest chosen by need", () => {
  fresh(LID);
  base.seedRng(9);
  steadyAll();
  const L = stats.layoutData(LID);
  L.weak = ["people", "maybe", "other", "house", "water", "about", "which", "their", "would", "there"].map(w => ({ w, misses: 2, slowMs: 0, ls: 0 }));
  let weakWords = 0;
  let words = 0;
  for (let i = 0; i < 10; i++) {
    tracks.newLesson();
    S.lesson.chars.join("").split(" ").forEach(w => {
      words++;
      if (L.weak.some(x => x.w === w)) weakWords++;
    });
  }
  const share = weakWords / words;
  assert.ok(share > 0.15 && share < 0.4, "weak share " + share.toFixed(3));
});
