import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, stats, storage, tracks, typeLesson } from "./helpers.mjs";

const LID = "en-qwerty";

function installStorage() {
  const map = new Map();
  const tabs = [];
  const muted = new Set();
  let current = null;
  const fake = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      const s = String(v);
      const changed = map.get(k) !== s;
      map.set(k, s);
      if (changed) emit(k, s);
    },
    removeItem(k) {
      if (!map.has(k)) return;
      map.delete(k);
      emit(k, null);
    }
  };
  function emit(key, value) {
    for (const t of tabs) {
      if (t === current || muted.has(t)) continue;
      inTab(t, () => storage.onStorageEvent(key, value));
    }
  }
  function inTab(t, fn) {
    const keep = { data: S.data, tab: S.tab, cur: current };
    S.data = t.data;
    S.tab = t.tab;
    current = t;
    try {
      return fn();
    } finally {
      t.data = S.data;
      t.tab = S.tab;
      S.data = keep.data;
      S.tab = keep.tab;
      current = keep.cur;
    }
  }
  function open(id) {
    const t = { id, data: null, tab: null };
    tabs.push(t);
    inTab(t, () => {
      S.tab = { id, lease: false, raw: null };
      storage.loadAll();
    });
    return t;
  }
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  return { open, inTab, map, muted };
}

function setup() {
  fresh(LID);
  S.noSave = false;
  return installStorage();
}

function lesson(ctx, tab, seed) {
  ctx.inTab(tab, () => {
    storage.claimLease();
    base.seedRng(seed);
    tracks.newLesson();
    typeLesson(300, 0, 1);
    storage.saveNow();
  });
}

function done(ctx) {
  S.noSave = true;
  delete globalThis.localStorage;
}

test("interleaved lessons from two tabs are all kept", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  for (let i = 0; i < 10; i++) lesson(ctx, i % 2 ? b : a, 100 + i);
  const stored = JSON.parse(ctx.map.get("tarq:data"));
  assert.equal(stored.lessons.length, 10);
  assert.equal(stored.layouts[LID].tot, 10);
  done(ctx);
});

test("a tab that sat idle adopts newer data before it records anything", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  for (let i = 0; i < 5; i++) lesson(ctx, b, 10 + i);
  lesson(ctx, a, 99);
  const stored = JSON.parse(ctx.map.get("tarq:data"));
  assert.equal(stored.lessons.length, 6);
  done(ctx);
});

test("a tab without the lease cannot overwrite what another tab saved", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  lesson(ctx, a, 1);
  ctx.muted.add(a);
  lesson(ctx, b, 2);
  const before = ctx.map.get("tarq:data");
  const wrote = ctx.inTab(a, () => {
    stats.layoutData(LID).tracks.letters.k = 20;
    storage.scheduleSave();
    return storage.saveNow();
  });
  assert.equal(wrote, false);
  assert.equal(ctx.map.get("tarq:data"), before);
  assert.equal(ctx.inTab(a, () => S.data.lessons.length), 2);
  done(ctx);
});

test("another tab's save is adopted when this tab holds no lease", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  lesson(ctx, b, 3);
  assert.equal(ctx.inTab(a, () => S.data.lessons.length), 1);
  assert.equal(ctx.inTab(a, () => S.tab.lease), false);
  done(ctx);
});

test("unsaved keystrokes are not dropped when another tab's data arrives", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  ctx.inTab(a, () => {
    storage.claimLease();
    base.seedRng(4);
    tracks.newLesson();
    typeLesson(300, 0, 1);
  });
  ctx.inTab(a, () => {
    const kind = storage.onStorageEvent("tarq:data", JSON.stringify({ layouts: {}, lessons: [] }));
    assert.equal(kind, null);
    assert.equal(S.data.lessons.length, 1);
    storage.saveNow();
  });
  assert.equal(JSON.parse(ctx.map.get("tarq:data")).lessons.length, 1);
  done(ctx);
});

test("giving up the lease on page hide saves first and frees it", () => {
  const ctx = setup();
  const a = ctx.open("A");
  ctx.inTab(a, () => {
    storage.claimLease();
    base.seedRng(5);
    tracks.newLesson();
    typeLesson(300, 0, 1);
    storage.releaseLease();
  });
  assert.equal(JSON.parse(ctx.map.get("tarq:data")).lessons.length, 1);
  assert.equal(ctx.map.has("tarq:lease"), false);
  assert.equal(ctx.inTab(a, () => S.tab.lease), false);
  done(ctx);
});

test("erasing and importing take over regardless of what another tab saved", () => {
  const ctx = setup();
  const a = ctx.open("A");
  const b = ctx.open("B");
  lesson(ctx, b, 6);
  ctx.inTab(a, () => storage.eraseAll());
  assert.equal(ctx.map.has("tarq:data"), false);
  assert.equal(ctx.inTab(b, () => S.data.lessons.length), 0);
  done(ctx);
});
