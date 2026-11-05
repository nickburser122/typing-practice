import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, skill, stats, storage, tracks } from "./helpers.mjs";

const settingsMod = await import("../src/core/settings.js");

const LID = "en-qwerty";
const REMOVED = ["minSamples", "pause", "reviewRate", "extraRate", "focus", "wordMin", "wordMax", "lineHeight", "strip", "result", "carrier", "algo", "unlock"];

test("removed settings are no longer part of the schema or the defaults", () => {
  const d = settingsMod.defaultSettings();
  REMOVED.forEach(k => {
    assert.equal(settingsMod.SCHEMA_BY_ID[k], undefined, k);
    assert.equal(k in d, false, k);
  });
});

test("old settings are read without error and then ignored", () => {
  const legacy = { layout: LID, minSamples: 35, pause: 4800, reviewRate: 30, extraRate: 40, lineHeight: 2.5, strip: false, result: false, carrier: "active", algo: "classic", unlock: "assist", wordMin: 2, wordMax: 12, focus: 90 };
  const out = settingsMod.sanitizeSettings(legacy);
  REMOVED.forEach(k => assert.equal(k in out, false, k));
  assert.equal(out.layout, LID);
});

test("the old focus slider maps to Gentle, Normal or Sharp and an explicit level wins", () => {
  const level = v => settingsMod.sanitizeSettings({ focus: v }).focusLevel;
  assert.equal(level(0), "gentle");
  assert.equal(level(40), "gentle");
  assert.equal(level(60), "normal");
  assert.equal(level(75), "normal");
  assert.equal(level(80), "sharp");
  assert.equal(level(100), "sharp");
  assert.equal(settingsMod.sanitizeSettings({ focus: 100, focusLevel: "gentle" }).focusLevel, "gentle");
  assert.equal(settingsMod.sanitizeSettings({}).focusLevel, "normal");
});

test("the old word length range maps to Short, Mixed or Long", () => {
  const len = (a, b) => settingsMod.sanitizeSettings({ wordMin: a, wordMax: b }).wordLen;
  assert.equal(len(3, 7), "mixed");
  assert.equal(len(2, 5), "short");
  assert.equal(len(3, 4), "short");
  assert.equal(len(6, 10), "long");
  assert.equal(len(5, 12), "long");
  assert.equal(len(2, 12), "mixed");
  assert.equal(settingsMod.sanitizeSettings({ wordMin: 2, wordMax: 4, wordLen: "long" }).wordLen, "long");
  assert.equal(settingsMod.sanitizeSettings({}).wordLen, "mixed");
});

test("an export from the old version imports cleanly", () => {
  fresh(LID);
  const file = JSON.stringify({ app: "tarq", version: 4, settings: { layout: LID, focus: 95, wordMin: 6, wordMax: 9, pause: 3000, unlock: "assist" }, data: {} });
  assert.equal(storage.applyImport(file), true);
  assert.equal(S.settings.focusLevel, "sharp");
  assert.equal(S.settings.wordLen, "long");
  assert.equal("pause" in S.settings, false);
});

test("the constants that used to be settings are fixed", () => {
  assert.equal(settingsMod.MIN_SAMPLES, 20);
  assert.equal(settingsMod.REVIEW_RATE, 10);
  assert.equal(settingsMod.EXTRA_RATE, 15);
  fresh(LID);
  assert.equal(S.derived.minS, 20);
});

test("the idle pause follows the typist: five times the typical keystroke, between 1 and 4 seconds", () => {
  const give = ms => {
    fresh(LID);
    "etaoinshrdl".split("").forEach(c => {
      const s = stats.charStat(LID, c, true);
      s.n = 30;
      s.a = 30;
      s.t = Array.from({ length: 30 }, () => ms);
      s.o = Array.from({ length: 30 }, () => 0);
    });
    return skill.pauseMs();
  };
  assert.equal(give(100), 1000);
  const mid = give(500);
  assert.ok(mid > 1500 && mid < 3500, String(mid));
  assert.equal(give(2000), 4000);
});

test("line height depends on the script", () => {
  assert.equal(settingsMod.lineHeightFor("en"), 1.9);
  assert.ok(settingsMod.lineHeightFor("ar") > settingsMod.lineHeightFor("en"));
});

test("word length changes how long the practice words are", () => {
  const avg = len => {
    fresh(LID, { wordLen: len });
    base.seedRng(9);
    stats.layoutData(LID).k = 26;
    let tot = 0;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      tracks.newLesson();
      S.lesson.chars.join("").split(" ").forEach(w => {
        tot += w.length;
        n++;
      });
    }
    return tot / n;
  };
  const s = avg("short");
  const m = avg("mixed");
  const l = avg("long");
  assert.ok(s < m && m < l, s + " " + m + " " + l);
  assert.ok(s <= 5.2);
});

test("the new comfort and flow settings exist with safe defaults and clamp bad values", () => {
  const d = settingsMod.defaultSettings();
  assert.equal(d.caret, "line");
  assert.equal(d.caretSmooth, true);
  assert.equal(d.width, "normal");
  assert.equal(d.hideErrors, false);
  assert.equal(d.session, 0);
  assert.equal(d.zen, false);
  const bad = settingsMod.sanitizeSettings({ caret: "star", caretSmooth: "yes", width: "huge", hideErrors: 1, session: 17, zen: "on" });
  assert.equal(bad.caret, "line");
  assert.equal(bad.caretSmooth, true);
  assert.equal(bad.width, "normal");
  assert.equal(bad.hideErrors, false);
  assert.equal(bad.session, 0);
  assert.equal(bad.zen, false);
  const good = settingsMod.sanitizeSettings({ caret: "block", caretSmooth: false, width: "narrow", hideErrors: true, session: 20, zen: true });
  assert.equal(good.caret, "block");
  assert.equal(good.caretSmooth, false);
  assert.equal(good.width, "narrow");
  assert.equal(good.hideErrors, true);
  assert.equal(good.session, 20);
  assert.equal(good.zen, true);
});

test("every visible setting has a label in both languages", async () => {
  const { T } = await import("../src/i18n/strings.js");
  settingsMod.SCHEMA.filter(r => !r.hidden).forEach(r => {
    assert.ok(T["s." + r.id] && T["s." + r.id][0] && T["s." + r.id][1], "label " + r.id);
    if (r.help) assert.ok(T["s." + r.id + ".h"] && T["s." + r.id + ".h"][1], "help " + r.id);
    if (r.type === "seg" || (r.type === "select" && r.opts)) {
      r.opts.forEach(o => assert.ok(T["o." + r.id + "." + o] && T["o." + r.id + "." + o][1], "option " + r.id + "." + o));
    }
  });
});
