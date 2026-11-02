import test from "node:test";
import assert from "node:assert/strict";
import { S, fresh, storage } from "./helpers.mjs";

const LID = "en-qwerty";
const baseMod = await import("../src/core/base.js");

const DAYS = { [LID]: { "2023-11-14": { s: 4, ms: 900000, k: 2400, w: 120.5, a: 3.8, b: 41, l: 3, t: 1, c: 0 }, "2023-11-15": { s: 2, ms: 400000, k: 900, w: 60, a: 1.9, b: 33, l: 2, t: 0, c: 0 } } };
const PBS = { "t|words|25|normal": { wpm: 61.2, acc: 0.97, ts: 1700000000000 }, "l|en-qwerty": { wpm: 48.4, acc: 0.98, ts: 1700000100000 } };

function v4Data() {
  return {
    v: 4,
    layouts: {
      [LID]: {
        chars: { a: { n: 40, a: 40, e: 2, t: Array.from({ length: 30 }, () => 220), o: Array.from({ length: 30 }, () => 0), x: {}, ls: 1700000000000 } },
        pairs: { ab: { n: 9, m: 310 } },
        k: 12,
        rec: [],
        sh: { ok: 0, same: 0 },
        lk: 4,
        tot: 77,
        rescue: 2,
        bk: { c: "q", n: 3 },
        raise: { c: "e", until: 90 },
        tracks: { letters: { k: null, lk: 0 }, digits: { k: 4, lk: 2 } },
        placed: true
      }
    },
    lessons: [
      { ts: 1700000000000, lid: LID, wpm: 40, acc: 0.96, n: 120 },
      { ts: 1700000100000, lid: LID, wpm: 44, acc: 0.97, n: 118 }
    ],
    tests: [{ ts: 1700000200000, lid: LID, mode: "words", wpm: 52, acc: 0.95, dur: 30, amt: 25 }],
    code: [],
    sc: {},
    days: DAYS,
    pbs: PBS,
    saved: 1700000300000,
    onboard: "done",
    onboardStep: 0
  };
}

function v4Settings() {
  return { layout: LID, lang: "en", unlock: "assist", focus: 90, wordMin: 5, wordMax: 9, pause: 3500, minSamples: 25, reviewRate: 20, extraRate: 30, lineHeight: 2.2, strip: true, result: true, algo: "impact", carrier: "steady", targetWpm: 40 };
}

function install(store) {
  const map = new Map(Object.entries(store));
  const fake = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k)
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  S.noSave = false;
  S.tab = null;
  return map;
}

function done() {
  S.noSave = true;
  S.tab = null;
  delete globalThis.localStorage;
}

test("the data version is 5 and a v5 reader accepts v4 files", () => {
  assert.equal(baseMod.VERSION, 5);
  fresh(LID);
  const file = JSON.stringify({ app: "tarq", version: 4, settings: v4Settings(), data: v4Data() });
  assert.equal(storage.applyImport(file), true);
  assert.equal(storage.applyImport(JSON.stringify({ app: "tarq", version: 6, settings: {}, data: {} })), false);
});

test("loading v4 data keeps every record and fills in the new fields", () => {
  fresh(LID);
  const map = install({ "tarq:settings": JSON.stringify(v4Settings()), "tarq:data": JSON.stringify(v4Data()) });
  storage.loadAll();
  assert.equal(S.data.lessons.length, 2);
  assert.ok(S.data.lessons.every(l => l.tr === "letters"));
  assert.equal(S.data.tests.length, 1);
  assert.equal(S.data.layouts[LID].tot, 77);
  assert.equal(S.data.layouts[LID].k, 12);
  assert.deepEqual(S.data.layouts[LID].raise, { c: "e", until: 90 });
  assert.equal(S.data.layouts[LID].tracks.digits.k, 4);
  assert.deepEqual(S.data.layouts[LID].weak, []);
  assert.equal("rescue" in S.data.layouts[LID], false);
  assert.equal("bk" in S.data.layouts[LID], false);
  assert.equal(S.data.early, true);
  storage.saveNow(true);
  assert.equal(JSON.parse(map.get("tarq:data")).v, 5);
  done();
});

test("personal bests and day totals pass through unchanged", () => {
  fresh(LID);
  install({ "tarq:settings": JSON.stringify(v4Settings()), "tarq:data": JSON.stringify(v4Data()) });
  storage.loadAll();
  assert.deepEqual(JSON.parse(JSON.stringify(S.data.pbs)), PBS);
  assert.deepEqual(JSON.parse(JSON.stringify(S.data.days)), DAYS);
  done();
});

test("old settings are mapped or ignored", () => {
  fresh(LID);
  install({ "tarq:settings": JSON.stringify(v4Settings()), "tarq:data": JSON.stringify(v4Data()) });
  storage.loadAll();
  assert.equal(S.settings.focusLevel, "sharp");
  assert.equal(S.settings.wordLen, "long");
  assert.equal(S.settings.targetWpm, 40);
  ["unlock", "focus", "wordMin", "wordMax", "pause", "minSamples", "reviewRate", "extraRate", "lineHeight", "strip", "result", "algo", "carrier"].forEach(k => assert.equal(k in S.settings, false, k));
  done();
});

test("the untouched v4 data is copied once to tarq:backup-v4 and never overwritten", () => {
  fresh(LID);
  const rawData = JSON.stringify(v4Data());
  const rawSettings = JSON.stringify(v4Settings());
  const map = install({ "tarq:settings": rawSettings, "tarq:data": rawData });
  storage.loadAll();
  const first = map.get("tarq:backup-v4");
  assert.ok(first);
  const parsed = JSON.parse(first);
  assert.equal(parsed.data, rawData);
  assert.equal(parsed.settings, rawSettings);
  S.data.lessons.push({ ts: 1, lid: LID, tr: "letters", wpm: 1, acc: 1, n: 1 });
  storage.saveNow(true);
  storage.loadAll();
  assert.equal(map.get("tarq:backup-v4"), first);
  done();
});

test("v5 data and fresh installs get no v4 backup", () => {
  fresh(LID);
  const v5 = Object.assign(v4Data(), { v: 5, early: false });
  const map = install({ "tarq:settings": JSON.stringify({ layout: LID }), "tarq:data": JSON.stringify(v5) });
  storage.loadAll();
  assert.equal(map.has("tarq:backup-v4"), false);
  const map2 = install({});
  storage.loadAll();
  assert.equal(map2.has("tarq:backup-v4"), false);
  done();
});

test("erasing everything also removes the v4 backup", () => {
  fresh(LID);
  const map = install({ "tarq:settings": JSON.stringify(v4Settings()), "tarq:data": JSON.stringify(v4Data()) });
  storage.loadAll();
  assert.equal(map.has("tarq:backup-v4"), true);
  storage.eraseAll();
  assert.equal(map.has("tarq:backup-v4"), false);
  done();
});
