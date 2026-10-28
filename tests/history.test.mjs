import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, storage, testMode, tracks, typeLesson } from "./helpers.mjs";

const hist = await import("../src/core/history.js");
const LID = "en-qwerty";

function at(y, m, d, h) {
  return new Date(y, m - 1, d, h === undefined ? 12 : h).getTime();
}

function setDays(map, lid) {
  S.data.days = { [lid || LID]: {} };
  for (const key of Object.keys(map)) {
    const v = map[key];
    S.data.days[lid || LID][key] = Object.assign({ s: 1, ms: 60000, k: 300, w: 40, a: 0.95, b: 40, l: 1, t: 0, c: 0 }, v);
  }
}

test("day keys round-trip across daylight-saving boundaries", () => {
  for (const [y, m, d] of [[2026, 3, 8], [2026, 3, 9], [2026, 11, 1], [2026, 12, 31], [2028, 2, 29], [2027, 1, 1]]) {
    const key = hist.dayKey(at(y, m, d, 23));
    assert.equal(key, y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    assert.equal(hist.numToKey(hist.dayNum(key)), key);
    assert.equal(hist.dayNum(hist.numToKey(hist.dayNum(key) + 1)), hist.dayNum(key) + 1);
  }
  assert.ok(Number.isNaN(hist.dayNum("2026-13-40x")));
  assert.ok(Number.isNaN(hist.dayNum("nope")));
});

test("legacy data without history is backfilled from the retained lessons, tests and code rounds", () => {
  const ts1 = at(2026, 5, 1);
  const ts2 = at(2026, 5, 2);
  const d = storage.sanitizeData({
    lessons: [
      { ts: ts1, lid: LID, wpm: 30, acc: 0.95, n: 26 },
      { ts: ts1 + 1000, lid: LID, wpm: 40, acc: 0.97, n: 26 },
      { ts: ts2, lid: LID, wpm: 90, acc: 0.5, n: 26 }
    ],
    tests: [{ ts: ts2, lid: LID, mode: "time", amt: 30, list: "1000", ext: 0, wpm: 55, raw: 60, acc: 0.96, cons: 80 }],
    code: [{ ts: ts2, lid: LID, set: "mix", wpm: 22, raw: 25, acc: 0.9, cons: 70 }]
  });
  const rows = Object.keys(d.days[LID]).sort();
  assert.equal(rows.length, 2);
  const day1 = d.days[LID][rows[0]];
  assert.equal(day1.s, 2);
  assert.equal(day1.l, 2);
  assert.equal(day1.b, 40);
  assert.ok(Math.abs(day1.w / day1.s - 35) < 1e-9);
  const day2 = d.days[LID][rows[1]];
  assert.equal(day2.s, 3);
  assert.equal(day2.t, 1);
  assert.equal(day2.c, 1);
  assert.equal(d.pbs["l|" + LID].wpm, 40);
  assert.equal(d.pbs["t|" + LID + "|time|30|1000|0"].wpm, 55);
  assert.equal(d.pbs["c|" + LID + "|mix"].wpm, 22);
});

test("hostile history input is clamped and cannot pollute prototypes", () => {
  const raw = JSON.parse('{"days":{"__proto__":{"2026-01-01":{"s":1}},"en-qwerty":{"2026-01-01":{"s":1e99,"ms":-5,"w":"x","b":9999,"a":5},"2026-01-02":{"s":1,"a":5,"w":9999},"bad":{"s":1},"__proto__":{"s":3}},"nope":{"2026-01-01":{"s":1}}},"pbs":{"__proto__":{"wpm":1},"t|en-qwerty|time|30|1000|0":{"wpm":1e9,"acc":7,"ts":-1},"x|y":{"wpm":5},"t|a b":{"wpm":5}}}');
  const d = storage.sanitizeData(raw);
  S.data = d;
  assert.equal(({}).s, undefined);
  assert.deepEqual(Object.keys(d.days), [LID]);
  assert.deepEqual(Object.keys(d.days[LID]).sort(), ["2026-01-01", "2026-01-02"]);
  const r = d.days[LID]["2026-01-01"];
  assert.equal(r.s, 1e6);
  assert.equal(r.ms, 0);
  assert.equal(r.w, 0);
  assert.equal(r.b, 1000);
  assert.equal(r.a, 5);
  assert.equal(hist.dayRows(LID)[1].acc, 1);
  assert.equal(hist.dayRows(LID)[1].wpm, 1000);
  assert.deepEqual(Object.keys(d.pbs), ["t|en-qwerty|time|30|1000|0"]);
  assert.equal(d.pbs["t|en-qwerty|time|30|1000|0"].wpm, 1000);
  assert.equal(d.pbs["t|en-qwerty|time|30|1000|0"].acc, 1);
});

test("history stored with data is trusted over a re-backfill and survives export and import", () => {
  fresh(LID);
  setDays({ "2026-06-01": { s: 4, w: 160, b: 52 } });
  S.data.pbs = { "l|en-qwerty": { wpm: 52, acc: 0.98, ts: 5 } };
  S.data.lessons = [{ ts: at(2026, 7, 1), lid: LID, wpm: 10, acc: 1, n: 26 }];
  const text = JSON.stringify(storage.buildExport(true));
  fresh(LID);
  assert.equal(storage.applyImport(text), true);
  assert.deepEqual(Object.keys(S.data.days[LID]), ["2026-06-01"]);
  assert.equal(S.data.days[LID]["2026-06-01"].s, 4);
  assert.equal(S.data.pbs["l|en-qwerty"].wpm, 52);
});

test("finishing lessons records sessions per day and a lesson personal best", () => {
  fresh(LID, { progression: "manual" });
  base.seedRng(7);
  tracks.newLesson();
  typeLesson(180, 0, 3);
  const rows = hist.dayRows(LID);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].s, 3);
  assert.equal(rows[0].l, 3);
  assert.ok(rows[0].ms > 0 && rows[0].k > 0);
  assert.ok(rows[0].wpm > 0 && rows[0].acc === 1);
  assert.ok(S.data.pbs["l|" + LID].wpm >= rows[0].wpm - 1e-6 || Math.abs(S.data.pbs["l|" + LID].wpm - rows[0].best) < 0.1);
});

test("an inaccurate lesson never sets the lesson personal best", () => {
  fresh(LID, { progression: "manual" });
  base.seedRng(9);
  tracks.newLesson();
  typeLesson(120, 0.4, 2);
  assert.equal(S.data.pbs["l|" + LID], undefined);
  assert.equal(hist.dayRows(LID)[0].s, 2);
});

test("a test personal best outlives the 200-test retention window", () => {
  fresh(LID);
  S.data.pbs = { [hist.testPbKey({ lid: LID, mode: "time", amt: 30, list: "1000", ext: 0 })]: { wpm: 120, acc: 1, ts: 1 } };
  testMode.testNew();
  S.test.words = ["alpha", "beta", "gamma", "delta"];
  let ts = 1000;
  for (const ch of "alpha beta") {
    testMode.testChar(ch, ts);
    ts += 200;
  }
  testMode.testFinish(ts - 200);
  assert.equal(S.test.res.pbPrev, 120);
  assert.equal(S.test.res.isPb, false);
  assert.equal(hist.dayRows(LID)[0].t, 1);
  assert.equal(S.data.pbs[hist.testPbKey({ lid: LID, mode: "time", amt: 30, list: "1000", ext: 0 })].wpm, 120);
});

test("beating a stored personal best raises it and reports a new best", () => {
  fresh(LID);
  const key = hist.testPbKey({ lid: LID, mode: "time", amt: 30, list: "1000", ext: 0 });
  S.data.pbs = { [key]: { wpm: 5, acc: 1, ts: 1 } };
  testMode.testNew();
  S.test.words = ["alpha", "beta", "gamma", "delta"];
  let ts = 1000;
  for (const ch of "alpha beta") {
    testMode.testChar(ch, ts);
    ts += 200;
  }
  testMode.testFinish(ts - 200);
  assert.equal(S.test.res.pbPrev, 5);
  assert.equal(S.test.res.isPb, true);
  assert.ok(S.data.pbs[key].wpm > 60);
});

test("summary compares this week with the week before and finds the best day", () => {
  fresh(LID);
  setDays({
    "2026-08-01": { w: 30, b: 33 }, "2026-08-02": { w: 32, b: 35 },
    "2026-08-08": { w: 40, b: 60 }, "2026-08-09": { w: 44, b: 48 }
  });
  const sm = hist.summary(LID, at(2026, 8, 9));
  assert.equal(sm.rows.length, 4);
  assert.equal(sm.week.days, 2);
  assert.ok(Math.abs(sm.week.wpm - 42) < 1e-9);
  assert.ok(Math.abs(sm.before.wpm - 31) < 1e-9);
  assert.ok(Math.abs(sm.delta - 11) < 1e-9);
  assert.equal(sm.best.key, "2026-08-08");
  assert.equal(sm.first, "2026-08-01");
  assert.equal(sm.all.s, 4);
  assert.equal(sm.all.ms, 240000);
  assert.equal(sm.all.k, 1200);
});

test("rolling average weights days by session count", () => {
  fresh(LID);
  setDays({ "2026-08-01": { s: 1, w: 20 }, "2026-08-02": { s: 3, w: 120 }, "2026-08-20": { s: 1, w: 50 } });
  const rows = hist.dayRows(LID);
  const r = hist.rolling(rows, 7);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0] - 20) < 1e-9);
  assert.ok(Math.abs(r[1] - 35) < 1e-9);
  assert.ok(Math.abs(r[2] - 50) < 1e-9);
});

test("the heat map spans whole weeks ending today", () => {
  fresh(LID);
  setDays({ "2026-08-12": { ms: 120000 } });
  const cells = hist.heatCells(LID, at(2026, 8, 14), 4);
  assert.equal(cells[cells.length - 1].key, "2026-08-14");
  assert.equal(cells[0].row, 0);
  assert.equal(new Date(hist.dayNum(cells[0].key) * 864e5).getUTCDay(), 0);
  assert.ok(cells.length > 21 && cells.length <= 28);
  assert.equal(cells.find(c => c.key === "2026-08-12").ms, 120000);
  assert.ok(cells.every((c, i) => i === 0 || c.n === cells[i - 1].n + 1));
});

test("history is capped per layout and personal bests are capped overall", () => {
  fresh(LID);
  const days = {};
  for (let i = 0; i < hist.DAY_CAP + 40; i++) days[hist.numToKey(hist.dayNum("2024-01-01") + i)] = { s: 1 };
  const d = storage.sanitizeData({ days: { [LID]: days } });
  const keys = Object.keys(d.days[LID]).sort();
  assert.equal(keys.length, hist.DAY_CAP);
  assert.equal(keys[keys.length - 1], hist.numToKey(hist.dayNum("2024-01-01") + hist.DAY_CAP + 39));
  const pbs = {};
  for (let i = 0; i < hist.PB_CAP + 30; i++) pbs["t|en-qwerty|time|" + (i + 1) + "|1000|0"] = { wpm: 10, acc: 1, ts: i + 1 };
  const e = storage.sanitizeData({ days: { [LID]: { "2026-01-01": { s: 1 } } }, pbs });
  assert.equal(Object.keys(e.pbs).length, hist.PB_CAP);
  assert.equal(e.pbs["t|en-qwerty|time|1|1000|0"], undefined);
});

test("personal bests are grouped by kind for the active layout only", () => {
  fresh(LID);
  S.data.pbs = {
    "l|en-qwerty": { wpm: 50, acc: 0.95, ts: 1 },
    "t|en-qwerty|words|25|1000|0": { wpm: 61, acc: 0.97, ts: 2 },
    "t|en-qwerty|time|60|1000|0": { wpm: 58, acc: 0.96, ts: 3 },
    "t|en-qwerty|time|15|1000|0": { wpm: 64, acc: 0.96, ts: 4 },
    "t|ar-standard|time|15|1000|0": { wpm: 20, acc: 0.9, ts: 5 },
    "c|en-qwerty|mix": { wpm: 30, acc: 0.9, ts: 6 }
  };
  const pb = hist.personalBests(LID);
  assert.equal(pb.lesson.wpm, 50);
  assert.deepEqual(pb.tests.map(x => x.mode + x.amt), ["time15", "time60", "words25"]);
  assert.equal(pb.code.length, 1);
  assert.equal(hist.personalBests("ar-standard").tests.length, 1);
});

test("erasing everything clears history", () => {
  fresh(LID);
  setDays({ "2026-08-01": {} });
  S.data.pbs = { "l|en-qwerty": { wpm: 9, acc: 1, ts: 1 } };
  storage.adoptData(null);
  assert.deepEqual(S.data.days, {});
  assert.deepEqual(S.data.pbs, {});
});
