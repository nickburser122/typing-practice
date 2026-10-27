import { S, nf, t, uiLang } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { newCodeLesson } from "../engine/code.js";
import { newLesson } from "../engine/tracks.js";
import { renderCode, stopCodeClock } from "../features/code.js";
import { freeLessonFits, newFreeLesson, renderFree } from "../features/free.js";
import { renderShortcuts } from "../features/shortcuts.js";
import { renderSteps } from "../features/steps.js";
import { renderPractice } from "./practice.js";
import { renderSettings, setSetting, syncRows } from "./settings.js";
import { renderKeys } from "./stats.js";
import { renderTest, stopTick } from "./test.js";

const U = { main: null, typer: null, spans: [], kb: null, rows: [], nav: null, tools: null, memo: {}, tick: null, tword: [], tshown: null };

function h(tag, attrs) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k === "value" || k === "checked" || k === "selected" || k === "disabled") el[k] = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  for (let i = 2; i < arguments.length; i++) {
    const kids = [].concat(arguments[i]).flat(Infinity);
    for (const c of kids) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
  }
  return el;
}

function pct(x) {
  return nf(x * 100) + (uiLang() === "ar" ? "٪" : "%");
}

function bdi(text, cls) {
  const props = cls ? { class: cls } : {};
  if (!/[A-Za-z\u0600-\u06FF]/.test(String(text))) props.dir = "ltr";
  return h("bdi", props, text);
}

function glyph(ch) {
  return /[ً-ْٰ]/.test(ch) ? "ـ" + ch : ch;
}

function ensureCaret(box) {
  let c = box.querySelector(":scope > .caret");
  if (!c) {
    c = document.createElement("span");
    c.className = "caret";
    c.setAttribute("aria-hidden", "true");
    box.append(c);
  }
  return c;
}

function placeCaret(box, el, rtl) {
  if (!box) return;
  const c = ensureCaret(box);
  if (!el) {
    c.style.opacity = "0";
    return;
  }
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = (rtl ? r.right - 3 : r.left - 1) - b.left;
  const y = r.top - b.top;
  const jump = c._y != null && Math.abs(y - c._y) > 2;
  if (jump) c.style.transition = "none";
  c.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
  c.style.height = r.height.toFixed(1) + "px";
  c.style.opacity = "";
  c._y = y;
  if (jump) {
    void c.offsetWidth;
    c.style.transition = "";
  }
}

let fadeTimer = null;

function typingFade() {
  const root = document.getElementById("app");
  if (!root) return;
  root.classList.add("typing");
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove("typing"), 1800);
}

function clearFade() {
  const root = document.getElementById("app");
  if (root && root.classList.contains("typing")) root.classList.remove("typing");
  clearTimeout(fadeTimer);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function applyChrome() {
  const r = document.documentElement;
  const st = S.settings;
  const ui = uiLang();
  r.lang = ui;
  r.dir = ui === "ar" ? "rtl" : "ltr";
  if (st.theme === "system") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", st.theme);
  r.setAttribute("data-font", st.font);
  r.style.setProperty("--tsize", st.fontSize + "px");
  r.style.setProperty("--tlh", String(st.lineHeight));
}

function mountShell() {
  const root = document.getElementById("app");
  root.className = "shell";
  U.brand = h("h1", { class: "brand", "aria-label": "Tarq" });
  U.nav = h("nav", { class: "nav", "aria-label": "Tarq" });
  U.tools = h("div", { class: "tools" });
  root.append(h("header", { class: "top" }, U.brand, U.nav, U.tools));
  U.main = h("main", { id: "main" });
  root.append(U.main);
  U.quiet = h("div", { class: "quiet", role: "status", "aria-live": "polite" });
  root.append(U.quiet);
}

let quietTimer = null;

function quietNote(key) {
  if (!U.quiet) return;
  U.quiet.textContent = t(key);
  U.quiet.classList.add("on");
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => U.quiet.classList.remove("on"), 3500);
}

function renderNav() {
  U.brand.textContent = "";
  const ar = uiLang() === "ar";
  const NS = "http://www.w3.org/2000/svg";
  const mark = document.createElementNS(NS, "svg");
  mark.setAttribute("viewBox", "0 0 64 64");
  mark.setAttribute("class", "mark");
  mark.setAttribute("aria-hidden", "true");
  [["rect", { x: 3, y: 3, width: 58, height: 58, rx: 14 }], ["rect", { x: 22, y: 43, width: 20, height: 4.5, rx: 2.25 }]].forEach(q => {
    const el = document.createElementNS(NS, q[0]);
    for (const k in q[1]) el.setAttribute(k, String(q[1][k]));
    mark.append(el);
  });
  const wl = h("span", { class: "wl", lang: "en" }, "Tarq");
  const wa = h("span", { class: "wa", lang: "ar", dir: "rtl" }, "طَرق");
  const cur = h("i", { "aria-hidden": "true" });
  U.brand.append(mark, h("span", { class: "wm" }, ar ? [wa, cur, wl] : [wl, cur, wa]));
  U.nav.textContent = "";
  renderTools();
  ["practice", "free", "test", "shortcuts"].forEach(v => {
    U.nav.append(h("button", {
      type: "button",
      "aria-current": S.view === v ? "page" : null,
      onclick: () => go(v)
    }, t("nav." + v)));
  });
}

const ICONS = {
  sun: [["circle", { cx: 12, cy: 12, r: 4 }], ["path", { d: "M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" }]],
  moon: [["path", { d: "M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z" }]],
  stats: [["path", { d: "M5 20v-8M12 20V4M19 20v-5" }]],
  sliders: [["path", { d: "M4 7h9M19 7h1M4 17h1M11 17h9" }], ["circle", { cx: 16, cy: 7, r: 2.2 }], ["circle", { cx: 8, cy: 17, r: 2.2 }]],
  system: [["rect", { x: 3, y: 4.5, width: 18, height: 12, rx: 2.5 }], ["path", { d: "M8.5 20h7M12 16.5V20" }]]
};

function icon(name) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  (ICONS[name] || []).forEach(p => {
    const el = document.createElementNS(NS, p[0]);
    for (const k in p[1]) el.setAttribute(k, String(p[1][k]));
    svg.append(el);
  });
  return svg;
}

function setTheme(v) {
  S.settings.theme = v;
  applyChrome();
  scheduleSave();
  renderTools();
  if (S.view === "settings") syncRows();
}

function renderTools() {
  U.tools.textContent = "";
  const cur = S.settings.theme;
  const grp = h("div", { class: "iseg", role: "radiogroup", "aria-label": t("tool.theme") });
  [["system", "system"], ["light", "sun"], ["dark", "moon"]].forEach(p => {
    grp.append(h("button", {
      type: "button", role: "radio", "aria-checked": String(cur === p[0]),
      title: t("o.theme." + p[0]), "aria-label": t("o.theme." + p[0]),
      onclick: () => setTheme(p[0])
    }, icon(p[1])));
  });
  const other = uiLang() === "ar" ? "en" : "ar";
  const ib = (v, ic, key) => h("button", {
    type: "button", class: "ibtn", title: t(key), "aria-label": t(key),
    "aria-current": S.view === v ? "page" : null, onclick: () => go(v)
  }, icon(ic));
  U.tools.append(ib("keys", "stats", "nav.stats"), grp, h("button", {
    type: "button", class: "ibtn", lang: other,
    title: t("tool.lang"), "aria-label": t("tool.lang"),
    onclick: () => { setSetting("ui", other); render(); }
  }, other === "ar" ? "ع" : "EN"), ib("settings", "sliders", "nav.settings"));
}

function startPlacement() {
  S.view = "test";
  S.test = null;
  S.testOv = { mode: "time", amt: 60, list: "1000", punct: false, num: false };
  render();
}

function go(view) {
  stopCodeClock();
  if (view !== "settings" && view !== "keys") S.back = view;
  S.view = view;
  S.testOv = null;
  if (view === "free") {
    if (!freeLessonFits()) newFreeLesson();
  } else if (view === "code" && (!S.lesson || !S.lesson.code || S.lesson.done)) newCodeLesson();
  else if (view !== "code" && S.lesson && (S.lesson.code || S.lesson.free)) newLesson();
  if (view === "practice" && S.lesson && S.lesson.done) newLesson();
  if (view === "test") S.test = null;
  render();
  window.scrollTo(0, 0);
  if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.blur();
}

function render() {
  clearFade();
  applyChrome();
  renderNav();
  stopTick();
  U.main.textContent = "";
  U.typer = null;
  U.kb = null;
  if (S.view === "practice") renderPractice();
  else if (S.view === "free") renderFree();
  else if (S.view === "steps") renderSteps();
  else if (S.view === "test") renderTest();
  else if (S.view === "code") renderCode();
  else if (S.view === "shortcuts") renderShortcuts();
  else if (S.view === "keys") renderKeys();
  else renderSettings();
}

export {
  U, applyChrome, bdi, clamp01, clearFade, glyph, go, h, mountShell, pct, placeCaret, quietNote, render,
  renderNav, startPlacement, typingFade
};
