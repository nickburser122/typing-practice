import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { S, base, fresh, layouts, noHooks, order, session, state, stats, storage, testMode, tracks, typeLesson, words } from "./helpers.mjs";

const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/baseline.json", import.meta.url), "utf8"));
const LIDS = Object.keys(layouts.LAYOUTS);

test("lessons are identical to the reference generator for every layout and key count", () => {
  let seed = 100;
  for (const lid of LIDS) {
    fresh(lid);
    const total = order.currentOrder().length;
    const got = [];
    for (const k of [2, 4, 7, 12, 20, total]) {
      fresh(lid);
      stats.layoutData(lid).k = k;
      base.seedRng(seed++);
      for (let i = 0; i < 3; i++) {
        tracks.newLesson();
        got.push(k + ":" + S.lesson.chars.join(""));
      }
    }
    assert.deepEqual(got, fixtures.lessons[lid], lid);
  }
});

test("unlock order is identical to the reference for every layout", () => {
  for (const lid of LIDS) assert.equal(order.computeOrder(lid, "smart").join(""), fixtures.order[lid], lid);
});

test("lessons only contain unlocked keys and keys the layout can type", () => {
  for (const lid of LIDS) {
    fresh(lid);
    const typeable = stats.allCharsOfLayout();
    typeable.add(" ");
    base.seedRng(9);
    for (const k of [2, 3, 5, 9, 15, order.currentOrder().length]) {
      stats.layoutData(lid).k = k;
      const active = new Set(order.activeKeys());
      active.add(" ");
      for (let i = 0; i < 6; i++) {
        tracks.newLesson();
        for (const c of S.lesson.chars) {
          assert.ok(typeable.has(c), `${lid} k=${k}: ${c} cannot be typed`);
          assert.ok(active.has(c) || active.has(c.toLowerCase()), `${lid} k=${k}: ${c} is not unlocked`);
        }
      }
    }
  }
});

test("track lessons are identical to the reference for every layout", () => {
  let seed = 124;
  for (const lid of LIDS) {
    fresh(lid);
    const got = {};
    for (const tr of tracks.trackList()) {
      if (tr === "letters") continue;
      S.settings.learnTracks = Object.assign({}, S.settings.learnTracks, { active: tr });
      const maxk = tracks.trackKeys(tr).length;
      const arr = [];
      for (const k of [1, 2, Math.max(1, maxk >> 1), maxk]) {
        stats.layoutData(lid).tracks[tr].k = k;
        base.seedRng(seed++);
        for (let i = 0; i < 2; i++) {
          tracks.newLesson();
          arr.push(k + ":" + S.lesson.chars.join(""));
        }
      }
      got[tr] = arr;
    }
    assert.deepEqual(got, fixtures.tracks[lid], lid);
  }
});

test("test-mode word generation is identical to the reference", () => {
  let seed = 204;
  for (const lid of LIDS) {
    fresh(lid);
    base.seedRng(seed++);
    S.testOv = { mode: "words", amt: 60, list: "all", punct: true, num: true, caps: true, dia: true };
    assert.equal(testMode.genTestWords(80, { prev: "", left: 5, cap: true }).join(" "), fixtures.test[lid], lid);
    S.testOv = { mode: "time", amt: 30, list: "200", punct: false, num: false, caps: false, dia: false };
    assert.equal(testMode.genTestWords(40, { prev: "", left: 5, cap: true }).join(" "), fixtures.test[lid + ":plain"], lid + " plain");
    S.testOv = null;
  }
});

test("a space before the first letter does not start the test clock", () => {
  fresh("en-qwerty");
  testMode.testNew();
  S.test.words = ["alpha", "beta", "gamma", "delta"];
  testMode.testChar(" ", 500);
  assert.equal(S.test.running, false);
  assert.equal(S.test.strokes, 0);
  testMode.testChar("a", 900);
  assert.equal(S.test.running, true);
  assert.equal(S.test.start, 900);
});

test("test-mode speed and accuracy follow the five-characters-per-word rule", () => {
  fresh("en-qwerty");
  testMode.testNew();
  S.test.words = ["alpha", "beta", "gamma", "delta"];
  let ts = 1000;
  for (const ch of "alpha beta") {
    testMode.testChar(ch, ts);
    ts += 200;
  }
  testMode.testFinish(ts - 200);
  const r = S.test.res;
  assert.equal(r.acc, 1);
  assert.ok(Math.abs(r.wpm - 66.67) < 0.1, String(r.wpm));
  assert.equal(r.chars.ok, 9);
});

test("a wrong key lowers accuracy but the corrected word still counts", () => {
  fresh("en-qwerty");
  testMode.testNew();
  S.test.words = ["alpha", "beta"];
  let ts = 1000;
  for (const ch of "alpho") {
    testMode.testChar(ch, ts);
    ts += 150;
  }
  testMode.testBackspace(false);
  testMode.testChar("a", ts);
  testMode.testFinish(ts + 150);
  assert.equal(S.test.strokes, 6);
  assert.equal(S.test.bad, 1);
  assert.ok(Math.abs(S.test.res.acc - 5 / 6) < 1e-9);
});

test("a words test ends as soon as the last word is typed correctly", () => {
  fresh("en-qwerty", { testMode: "words", testWords: 10 });
  testMode.testNew();
  S.test.words = ["ab", "cd"];
  S.test.mode = "words";
  S.test.amt = 2;
  let ts = 1000;
  for (const ch of "ab cd") {
    testMode.testChar(ch, ts);
    ts += 100;
  }
  assert.equal(S.test.done, true);
});

test("hostile saved data is sanitized without polluting prototypes", () => {
  const evil = JSON.parse('{"layouts":{"en-qwerty":{"k":"x","chars":{"a":{"n":"7","t":[1e99,-5,"z",300],"o":[1,0,"q"]},"__proto__":{"polluted":1}},"pairs":{"ab":{"n":1e99,"m":"x"},"__proto__":{"polluted":1}}},"__proto__":{"polluted":1}},"lessons":[{"wpm":1e9,"acc":-4}],"tests":"no"}');
  const clean = storage.sanitizeData(evil);
  assert.equal({}.polluted, undefined);
  assert.equal(clean.lessons[0].wpm, 500);
  assert.equal(clean.lessons[0].acc, 0);
  assert.deepEqual(clean.layouts["en-qwerty"].chars.a.t, [300]);
  assert.equal(clean.layouts["en-qwerty"].pairs.ab.n, 1e9);
});

test("data written or erased by another tab is adopted", () => {
  fresh("en-qwerty");
  assert.equal(storage.adoptData(JSON.stringify({ layouts: { "en-qwerty": { k: 9 } } })), true);
  assert.equal(stats.layoutData("en-qwerty").k, 9);
  assert.equal(storage.adoptData("{broken"), false);
  assert.equal(stats.layoutData("en-qwerty").k, 9);
  assert.equal(storage.adoptData(null), true);
  assert.notEqual(stats.layoutData("en-qwerty").k, 9);
  assert.equal(S.data.lessons.length, 0);
  assert.equal(storage.adoptSettings(JSON.stringify({ theme: "dark" })), true);
  assert.equal(S.settings.theme, "dark");
  assert.equal(storage.adoptSettings(null), true);
  assert.equal(S.settings.theme, state.S.settings.theme);
});

test("export and import round-trip progress and reject foreign or newer files", () => {
  fresh("en-qwerty");
  stats.layoutData("en-qwerty").k = 11;
  const text = JSON.stringify(storage.buildExport(true));
  fresh("en-qwerty");
  assert.equal(storage.applyImport(text), true);
  assert.equal(stats.layoutData("en-qwerty").k, 11);
  assert.equal(storage.applyImport(JSON.stringify({ app: "other", version: 1 })), false);
  assert.equal(storage.applyImport(JSON.stringify({ app: "tarq", version: 999 })), false);
  assert.equal(storage.applyImport("nonsense"), false);
});

test("typing a lesson updates per-key statistics and finishes once", () => {
  fresh("en-qwerty");
  base.seedRng(3);
  tracks.newLesson();
  let finished = 0;
  const hooks = { painted() {}, finished() { finished++; tracks.newLesson(); } };
  let ts = 1000;
  const lesson = S.lesson;
  while (S.lesson === lesson) {
    ts += 220;
    session.handleChar(lesson.chars[lesson.idx], ts, hooks);
  }
  assert.equal(finished, 1);
  assert.equal(S.data.lessons.length, 1);
  assert.ok(Object.keys(stats.layoutData("en-qwerty").chars).length >= 4);
  assert.ok(S.data.lessons[0].wpm > 30 && S.data.lessons[0].wpm < 70);
});

test("progress does not stall or run away on any layout over a long simulated run", () => {
  for (const lid of LIDS) {
    fresh(lid);
    base.seedRng(7);
    tracks.newLesson();
    typeLesson(300, 0.03, 150);
    const k = order.currentK();
    assert.ok(k > 4 && k <= order.currentOrder().length, `${lid} k=${k}`);
    for (const c of Object.keys(stats.layoutData(lid).chars)) {
      const s = stats.layoutData(lid).chars[c];
      assert.ok(s.t.every(Number.isFinite), `${lid} ${c} has non-finite timings`);
    }
  }
});

test("word generation never yields an empty lesson", () => {
  for (const lid of LIDS) {
    fresh(lid);
    for (const k of [2, 3, 4]) {
      stats.layoutData(lid).k = k;
      const w = words.buildWords();
      assert.ok(w.words.length > 0 && w.words.every(x => x.length > 0), `${lid} k=${k}`);
    }
  }
});

const tracksModule = await import("../src/engine/tracks.js");

test("settings saved before strict unlocking existed keep assisted unlocking", () => {
  fresh("en-qwerty");
  storage.adoptSettings(JSON.stringify({ layout: "en-qwerty", targetWpm: 40 }));
  assert.equal(S.settings.unlock, "assist");
  storage.adoptSettings(JSON.stringify({ layout: "en-qwerty", unlock: "strict" }));
  assert.equal(S.settings.unlock, "strict");
  storage.adoptSettings(null);
  assert.equal(S.settings.unlock, "strict");
});

test("strict unlocking moves a fast accurate typist forward quickly", () => {
  fresh("en-qwerty", { unlock: "strict" });
  base.seedRng(11);
  tracks.newLesson();
  typeLesson(220, 0.03, 100);
  assert.ok(order.currentK() >= 20, "k=" + order.currentK());
  assert.equal(tracksModule.stallInfo(), null);
});

test("strict unlocking holds an inaccurate typist and says why", () => {
  fresh("en-qwerty", { unlock: "strict" });
  base.seedRng(11);
  tracks.newLesson();
  typeLesson(300, 0.15, 80);
  assert.equal(order.currentK(), 4);
  const info = tracksModule.stallInfo();
  assert.equal(info.kind, "key");
  assert.ok(info.acc < info.target);
  assert.equal(info.n, 4);
});

test("strict unlocking holds a slow typist and reports the speed gap", () => {
  fresh("en-qwerty", { unlock: "strict" });
  base.seedRng(11);
  tracks.newLesson();
  typeLesson(900, 0.01, 80);
  assert.equal(order.currentK(), 4);
  const info = tracksModule.stallInfo();
  assert.equal(info.kind, "speed");
  assert.ok(info.ms > info.gate);
});

test("no stall hint appears before enough lessons have been spent on the same keys", () => {
  fresh("en-qwerty", { unlock: "strict" });
  base.seedRng(11);
  tracks.newLesson();
  typeLesson(300, 0.15, 10);
  assert.equal(tracksModule.stallInfo(), null);
});

test("assisted unlocking still moves an inaccurate typist forward", () => {
  fresh("en-qwerty", { unlock: "assist" });
  base.seedRng(11);
  tracks.newLesson();
  typeLesson(300, 0.15, 200);
  assert.ok(order.currentK() > 15, "k=" + order.currentK());
  assert.equal(tracksModule.stallInfo(), null);
});

test("a learning track waits in strict mode and moves on after patience in assist mode", () => {
  for (const [unlock, expectMoved] of [["strict", false], ["assist", true]]) {
    fresh("en-qwerty", { unlock, progression: "auto" });
    S.settings.learnTracks = Object.assign({}, S.settings.learnTracks, { active: "digits" });
    base.seedRng(2);
    tracks.newLesson();
    typeLesson(1500, 0.2, 35);
    const k = stats.layoutData("en-qwerty").tracks.digits.k;
    assert.equal(k !== null && k > 2, expectMoved, unlock + " k=" + k);
  }
});

test("track counters survive saving and loading", () => {
  fresh("en-qwerty");
  stats.layoutData("en-qwerty").tracks.punct.lk = 12;
  const copy = storage.sanitizeData(JSON.parse(JSON.stringify(S.data)));
  assert.equal(copy.layouts["en-qwerty"].tracks.punct.lk, 12);
  const hostile = storage.sanitizeData({ layouts: { "en-qwerty": { tracks: { punct: { lk: "x" }, digits: { lk: -5 } } } } });
  assert.equal(hostile.layouts["en-qwerty"].tracks.punct.lk, 0);
  assert.equal(hostile.layouts["en-qwerty"].tracks.digits.lk, 0);
});
