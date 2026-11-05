import { TRACK_KEYS, sanitizeMix } from "./schema.js";
import { CODE_IDS } from "../data/code-sets.js";
import { LAYOUTS } from "../data/layouts.js";

const SCHEMA = [
  { id: "lang", sec: "practice", type: "select", def: "en" },
  { id: "layout", sec: "practice", type: "select", def: "en-qwerty" },
  { id: "inputMode", sec: "practice", type: "seg", def: "layout", opts: ["layout", "system"], help: true },
  { id: "order", help: true, sec: "practice", type: "seg", def: "smart", opts: ["smart", "position", "frequency"] },
  { id: "progression", sec: "practice", type: "seg", def: "auto", opts: ["auto", "manual"], help: true },
  { id: "startKeys", sec: "practice", type: "range", def: 4, min: 2, max: 12, step: 1, help: true },
  { id: "digitSource", sec: "practice", type: "seg", def: "either", opts: ["row", "numpad", "either"], help: true },
  { id: "targetWpm", help: true, sec: "practice", type: "range", def: 30, min: 8, max: 150, step: 1 },
  { id: "targetAcc", help: true, sec: "practice", type: "range", def: 95, min: 80, max: 100, step: 1 },
  { id: "focusLevel", help: true, sec: "practice", type: "seg", def: "normal", opts: ["gentle", "normal", "sharp"] },
  { id: "wordLen", help: true, sec: "text", type: "seg", def: "mixed", opts: ["short", "mixed", "long"] },
  { id: "hideErrors", help: true, sec: "practice", type: "switch", def: false },
  { id: "session", help: true, sec: "practice", type: "seg", def: 0, opts: [0, 10, 15, 20, 30] },
  { id: "onError", help: true, sec: "practice", type: "seg", def: "stop", opts: ["stop", "advance"] },
  { id: "shiftPolicy", help: true, sec: "rules", type: "seg", def: "off", opts: ["off", "hint", "strict"] },
  { id: "capsPolicy", help: true, sec: "rules", type: "seg", def: "allow", opts: ["allow", "strict"] },
  { id: "backspace", help: true, sec: "rules", type: "seg", def: "allow", opts: ["allow", "off"] },
  { id: "kbFade", help: true, sec: "rules", type: "switch", def: false },
  { id: "fingerZones", help: true, sec: "rules", type: "switch", def: false },
  { id: "text", help: true, sec: "text", type: "seg", def: "auto", opts: ["auto", "real", "generated"] },
  { id: "wordLevel", help: true, sec: "text", type: "seg", def: "balanced", opts: ["common", "balanced", "wide"] },
  { id: "lessonWords", help: true, sec: "text", type: "range", def: 20, min: 8, max: 60, step: 1 },
  { id: "caps", help: true, sec: "text", type: "switch", def: false, when: s => LAYOUTS[s.layout].lang === "en" },
  { id: "digits", help: true, sec: "text", type: "switch", def: false },
  { id: "punct", help: true, sec: "text", type: "switch", def: false },
  { id: "dia", help: true, sec: "text", type: "switch", def: false, when: s => LAYOUTS[s.layout].lang === "ar" },
  { id: "testFeed", help: true, sec: "test", type: "switch", def: true },
  { id: "confident", help: true, sec: "test", type: "switch", def: false },
  { id: "testMode", sec: "test", type: "seg", def: "time", opts: ["time", "words", "quote", "custom"], hidden: true },
  { id: "testTime", sec: "test", type: "seg", def: 30, opts: [15, 30, 60, 120], hidden: true },
  { id: "testWords", sec: "test", type: "seg", def: 25, opts: [10, 25, 50, 100], hidden: true },
  { id: "testQuote", sec: "test", type: "seg", def: "medium", opts: ["short", "medium", "long", "all"], hidden: true },
  { id: "testDiff", sec: "test", type: "seg", def: "normal", opts: ["normal", "expert", "master"], hidden: true },
  { id: "testStop", sec: "test", type: "seg", def: "off", opts: ["off", "letter", "word"], hidden: true },
  { id: "testList", sec: "test", type: "seg", def: "1000", opts: ["200", "1000", "all"], hidden: true },
  { id: "testPunct", sec: "test", type: "switch", def: false, hidden: true },
  { id: "testNum", sec: "test", type: "switch", def: false, hidden: true },
  { id: "testCaps", sec: "test", type: "switch", def: false, hidden: true },
  { id: "testDia", sec: "test", type: "switch", def: false, hidden: true },
  { id: "scOS", sec: "shortcuts", type: "seg", def: "auto", opts: ["auto", "win", "mac"], hidden: true },
  { id: "codeSet", sec: "code", type: "seg", def: "mix", opts: ["mix"].concat(CODE_IDS), hidden: true },
  { id: "codeTimer", sec: "code", type: "seg", def: "after", opts: ["off", "after", "15", "30", "60"], hidden: true },
  { id: "scCat", sec: "shortcuts", type: "seg", def: "all", opts: ["all", "edit", "excel", "word", "gdocs", "ppt", "editor", "browser", "terminal", "system"], hidden: true },
  { id: "scView", sec: "shortcuts", type: "seg", def: "practice", opts: ["practice", "cheat"], hidden: true },
  { id: "ui", sec: "display", type: "seg", def: "auto", opts: ["auto", "en", "ar"] },
  { id: "theme", sec: "display", type: "seg", def: "system", opts: ["system", "light", "dark"] },
  { id: "font", help: true, sec: "display", type: "select", def: "sans", opts: ["sans", "mono", "naskh", "vazir", "system"] },
  { id: "fontSize", help: true, sec: "display", type: "range", def: 36, min: 20, max: 64, step: 2 },
  { id: "caret", help: true, sec: "display", type: "seg", def: "line", opts: ["line", "block", "underline"] },
  { id: "caretSmooth", help: true, sec: "display", type: "switch", def: true },
  { id: "width", help: true, sec: "display", type: "seg", def: "normal", opts: ["narrow", "normal", "wide"] },
  { id: "zen", help: true, sec: "display", type: "switch", def: false },
  { id: "keyboard", help: true, sec: "display", type: "switch", def: true },
  { id: "liveWpm", help: true, sec: "display", type: "switch", def: false },
  { id: "liveAcc", help: true, sec: "display", type: "switch", def: false },
  { id: "numerals", help: true, sec: "display", type: "seg", def: "latin", opts: ["latin", "arabic"] }
];

const MIN_SAMPLES = 20;
const REVIEW_RATE = 10;
const EXTRA_RATE = 15;
const FOCUS_S = { gentle: 0.3, normal: 0.6, sharp: 0.9 };
const WORD_LEN = { short: [2, 5], mixed: [3, 7], long: [5, 10] };

function lineHeightFor(lang) {
  return lang === "ar" ? 2.3 : 1.9;
}

const PREVIEW = { en: "The quick brown fox jumps over 12 lazy dogs.", ar: "نصٌّ قصير لتجربة الخط والحجم والمسافة بين الأسطر 12" };

const SCHEMA_BY_ID = {};
SCHEMA.forEach(r => { SCHEMA_BY_ID[r.id] = r; });

function defaultSettings() {
  const s = {};
  SCHEMA.forEach(r => { s[r.id] = r.def; });
  s.mix = null;
  s.learnTracks = { active: "letters" };
  s.presets = [];
  return s;
}

function sanitizeSettings(input) {
  const out = defaultSettings();
  if (!input || typeof input !== "object") return out;
  SCHEMA.forEach(r => {
    const v = input[r.id];
    if (v === undefined) return;
    if (r.type === "switch") {
      if (typeof v === "boolean") out[r.id] = v;
    } else if (r.type === "range") {
      if (typeof v === "number" && isFinite(v)) {
        out[r.id] = Math.round(Math.min(r.max, Math.max(r.min, v)) / r.step) * r.step;
        out[r.id] = Math.round(out[r.id] * 1000) / 1000;
      }
    } else if (r.id === "lang") {
      if (v === "en" || v === "ar") out[r.id] = v;
    } else if (r.id === "layout") {
      if (typeof v === "string" && LAYOUTS[v]) out[r.id] = v;
    } else if (r.opts) {
      if (r.opts.indexOf(v) >= 0) out[r.id] = v;
    }
  });
  out.lang = LAYOUTS[out.layout].lang;
  if (input.focusLevel === undefined && typeof input.focus === "number" && isFinite(input.focus)) out.focusLevel = input.focus <= 40 ? "gentle" : input.focus <= 75 ? "normal" : "sharp";
  if (input.wordLen === undefined && typeof input.wordMax === "number" && isFinite(input.wordMax)) {
    const lo = typeof input.wordMin === "number" && isFinite(input.wordMin) ? input.wordMin : 3;
    out.wordLen = input.wordMax <= 5 ? "short" : lo >= 5 ? "long" : "mixed";
  }
  out.mix = sanitizeMix(input.mix);
  const lt = input.learnTracks;
  out.learnTracks = { active: lt && TRACK_KEYS.indexOf(lt.active) >= 0 ? lt.active : "letters" };
  out.shiftPolicy = ["off", "hint", "strict"].indexOf(input.shiftPolicy) >= 0 ? input.shiftPolicy : (input.strictShift === true ? "strict" : "off");
  out.presets = [];
  if (Array.isArray(input.presets)) {
    input.presets.slice(0, 6).forEach(p => {
      const name = p && typeof p.name === "string" ? p.name.trim().slice(0, 24) : "";
      const mix = p ? sanitizeMix(p.mix) : null;
      if (name && mix && !out.presets.some(x => x.name === name)) out.presets.push({ name, mix });
    });
  }
  return out;
}

export {
  EXTRA_RATE, FOCUS_S, MIN_SAMPLES, PREVIEW, REVIEW_RATE, SCHEMA, SCHEMA_BY_ID, WORD_LEN, defaultSettings, lineHeightFor,
  sanitizeSettings
};
