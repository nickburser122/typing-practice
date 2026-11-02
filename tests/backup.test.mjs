import test from "node:test";
import assert from "node:assert/strict";
import { S, fresh, stats, storage } from "./helpers.mjs";

const LID = "en-qwerty";

function install(failKey) {
  const map = new Map();
  const fake = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (k === failKey) throw new Error("quota");
      map.set(k, String(v));
    },
    removeItem: k => map.delete(k)
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true, writable: true });
  S.noSave = false;
  S.tab = null;
  storage.loadAll();
  return map;
}

function finish() {
  S.noSave = true;
  S.tab = null;
  delete globalThis.localStorage;
}

function exportWith(k) {
  fresh(LID);
  stats.layoutData(LID).k = k;
  const text = JSON.stringify(storage.buildExport(true));
  return text;
}

test("importing keeps the previous data in one backup slot and restoring brings it back", () => {
  const incoming = exportWith(14);
  fresh(LID);
  const map = install();
  stats.layoutData(LID).k = 6;
  assert.equal(storage.hasBackup(), false);
  assert.equal(storage.applyImport(incoming), true);
  assert.equal(stats.layoutData(LID).k, 14);
  assert.equal(storage.hasBackup(), true);
  assert.equal(storage.restoreBackup(), true);
  assert.equal(stats.layoutData(LID).k, 6);
  assert.equal(JSON.parse(map.get("tarq:data")).layouts[LID].k, 6);
  finish();
});

test("restoring twice returns to the imported state", () => {
  const incoming = exportWith(14);
  fresh(LID);
  install();
  stats.layoutData(LID).k = 6;
  storage.applyImport(incoming);
  storage.restoreBackup();
  assert.equal(storage.restoreBackup(), true);
  assert.equal(stats.layoutData(LID).k, 14);
  finish();
});

test("a rejected import changes nothing and keeps the earlier backup", () => {
  const incoming = exportWith(14);
  fresh(LID);
  install();
  stats.layoutData(LID).k = 6;
  storage.applyImport(incoming);
  stats.layoutData(LID).k = 9;
  assert.equal(storage.applyImport("nonsense"), false);
  assert.equal(stats.layoutData(LID).k, 9);
  assert.equal(storage.restoreBackup(), true);
  assert.equal(stats.layoutData(LID).k, 6);
  finish();
});

test("a backup that does not fit never turns on the in-memory warning", () => {
  const incoming = exportWith(14);
  fresh(LID);
  install("tarq:backup");
  S.storage = "local";
  storage.applyImport(incoming);
  assert.equal(S.storage, "local");
  assert.equal(storage.hasBackup(), false);
  assert.equal(stats.layoutData(LID).k, 14);
  finish();
});

test("erasing everything also erases the backup", () => {
  const incoming = exportWith(14);
  fresh(LID);
  const map = install();
  storage.applyImport(incoming);
  assert.equal(map.has("tarq:backup"), true);
  storage.eraseAll();
  assert.equal(map.has("tarq:backup"), false);
  assert.equal(storage.hasBackup(), false);
  finish();
});

test("a damaged backup is refused instead of applied", () => {
  fresh(LID);
  const map = install();
  map.set("tarq:backup", "{broken");
  assert.equal(storage.hasBackup(), false);
  assert.equal(storage.restoreBackup(), false);
  finish();
});
