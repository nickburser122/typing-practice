import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, noHooks, session, stats, tracks } from "./helpers.mjs";

const LID = "en-qwerty";

function fullStats() {
  fresh(LID);
  base.seedRng(3);
  stats.layoutData(LID).k = 26;
  "abcdefghijklmnopqrstuvwxyz ".split("").forEach(c => {
    const s = stats.charStat(LID, c, true);
    s.n = 60;
    s.a = 60;
    s.e = 3;
    s.t = Array.from({ length: 40 }, () => 200 + base.rnd() * 150);
    s.o = Array.from({ length: 40 }, () => (base.rnd() < 0.05 ? 1 : 0));
    s.ls = Date.now() - 86400000;
  });
}

test("building a lesson with full statistics stays within the time budget", () => {
  fullStats();
  for (let i = 0; i < 10; i++) tracks.newLesson();
  const times = [];
  for (let i = 0; i < 60; i++) {
    const t0 = performance.now();
    tracks.newLesson();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  assert.ok(median < 8, "median " + median.toFixed(2) + " ms");
});

test("handling a keystroke stays far under a millisecond", () => {
  fullStats();
  const times = [];
  for (let r = 0; r < 40; r++) {
    tracks.newLesson();
    const lesson = S.lesson;
    let ts = 1000;
    for (let i = 0; i < lesson.chars.length - 1; i++) {
      ts += 180;
      const t0 = performance.now();
      session.handleChar(lesson.chars[i], ts, noHooks);
      if (r > 5) times.push(performance.now() - t0);
    }
    session.handleChar(lesson.chars[lesson.chars.length - 1], ts + 180, { painted() {}, finished() {} });
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  assert.ok(mean < 0.25, "mean " + mean.toFixed(4) + " ms");
  assert.ok(p99 < 1, "p99 " + p99.toFixed(3) + " ms");
});
