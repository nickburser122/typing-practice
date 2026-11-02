import test from "node:test";
import assert from "node:assert/strict";

const { altGraph, isShortcut } = await import("../src/input/modifiers.js");

function key(props, graph) {
  return Object.assign({ ctrlKey: false, altKey: false, metaKey: false, getModifierState: m => !!graph && m === "AltGraph" }, props);
}

test("AltGr reports control plus alt on Windows and is not a shortcut", () => {
  const e = key({ ctrlKey: true, altKey: true, key: "@" }, true);
  assert.equal(altGraph(e), true);
  assert.equal(isShortcut(e), false);
});

test("control and alt without AltGr stay shortcuts", () => {
  assert.equal(isShortcut(key({ ctrlKey: true, key: "c" })), true);
  assert.equal(isShortcut(key({ altKey: true, key: "b" })), true);
  assert.equal(isShortcut(key({ ctrlKey: true, altKey: true, key: "x" })), true);
});

test("meta is always a shortcut and plain keys never are", () => {
  assert.equal(isShortcut(key({ metaKey: true, key: "c" })), true);
  assert.equal(isShortcut(key({ metaKey: true, ctrlKey: true, altKey: true }, true)), true);
  assert.equal(isShortcut(key({ key: "a" })), false);
});

test("events without getModifierState are treated as having no AltGr", () => {
  const e = { ctrlKey: true, altKey: true, metaKey: false, key: "@" };
  assert.equal(altGraph(e), false);
  assert.equal(isShortcut(e), true);
});

test("word deletion is Ctrl+Backspace or Option+Backspace and never Command", async () => {
  const { wordDelete } = await import("../src/input/modifiers.js");
  assert.equal(wordDelete(key({ ctrlKey: true, key: "Backspace" })), true);
  assert.equal(wordDelete(key({ altKey: true, key: "Backspace" })), true);
  assert.equal(wordDelete(key({ key: "Backspace" })), false);
  assert.equal(wordDelete(key({ metaKey: true, key: "Backspace" })), false);
});
