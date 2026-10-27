import { VERSION } from "./base.js";
import { defaultSettings } from "./settings.js";
import { LAYOUTS } from "../data/layouts.js";
import { T } from "../i18n/strings.js";

const S = {
  settings: defaultSettings(),
  data: { v: VERSION, layouts: {}, lessons: [], tests: [], code: [], sc: {}, days: {}, pbs: {} },
  view: "practice",
  lesson: null,
  focused: false,
  storage: "unknown",
  lastResult: null,
  keysUI: { tab: "kb", range: "90", metric: "need", layer: 0, sel: null, sort: "need", cls: "all" },
  derived: {}
};

function uiLang() {
  const u = S.settings.ui;
  if (u === "ar" || u === "en") return u;
  const nav = (typeof navigator !== "undefined" && (navigator.language || "")) || "en";
  return nav.toLowerCase().indexOf("ar") === 0 ? "ar" : "en";
}

function t(key) {
  const row = T[key];
  if (!row) return key;
  return row[uiLang() === "ar" ? 1 : 0];
}

function nf(n, dec) {
  if (n == null || !isFinite(n)) return "";
  let s = dec ? n.toFixed(dec) : String(Math.round(n));
  if (S.settings.numerals === "arabic") {
    s = s.replace(/\d/g, d => String.fromCharCode(0x0660 + Number(d))).replace(".", "٫");
  }
  return s;
}

function layoutInfo() {
  return LAYOUTS[S.settings.layout];
}

const lessonListeners = [];

function onLessonBuilt(fn) {
  lessonListeners.push(fn);
}

function emitLessonBuilt() {
  for (const fn of lessonListeners) fn();
}

function refreshDerived() {
  const s = S.settings;
  S.derived = {
    targetMs: 12000 / s.targetWpm,
    targetAcc: s.targetAcc / 100,
    minS: s.minSamples
  };
}

function typeable(ch) {
  return !!layoutInfo().rev[ch];
}

export { S, emitLessonBuilt, layoutInfo, nf, onLessonBuilt, refreshDerived, t, typeable, uiLang };
