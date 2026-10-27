import { S, layoutInfo, nf, t } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { LEFT_HAND } from "../data/layouts.js";
import { currentK } from "../engine/order.js";
import { layoutData } from "../engine/stats.js";
import { newLesson } from "../engine/tracks.js";
import { fingerOf } from "../input/keys.js";
import { U, go, h, render, startPlacement } from "../ui/dom.js";
import { hwNote } from "../ui/practice.js";
import { confirmBtn, rowLabel, setSetting, syncRows } from "../ui/settings.js";
import { seg } from "../ui/stats.js";
import { buildKeyboard } from "../ui/typer.js";

const EXTRAS = ["caps", "digits", "punct", "dia"];

function extraIds() {
  return layoutInfo().lang === "ar" ? ["digits", "punct", "dia"] : ["caps", "digits", "punct"];
}

function extraToggles() {
  const st = S.settings;
  if (!extraIds().some(id => st[id])) return [];
  return extraIds().map(id => seg([{ v: true, l: t("s." + id) }], st[id], () => {
    setSetting(id, !st[id]);
    render();
  }, "toggle")).concat([h("span", { class: "msg", id: "legacynote" }, t("lt.legacy"))]);
}

function startRow() {
  const row = h("div", { class: "srow", "data-label": t("s.start").toLowerCase() });
  const begin = confirmBtn(t("pl.begin"), () => beginAgain());
  const plain = h("button", { type: "button", class: "btn", onclick: () => beginAgain() }, t("pl.begin"));
  const progressed = currentK() > Math.max(2, S.settings.startKeys);
  row.append(
    h("div", { class: "lab" }, h("div", null, h("div", null, t("s.start")), h("div", { class: "help" }, t("s.start.h")))),
    h("div", { class: "dataactions" }, progressed ? begin : plain, h("button", { type: "button", class: "btn", onclick: startPlacement }, t("pl.skip"))));
  U.rows.push({ row, rst: h("span", { hidden: true }), update: () => {}, r: { id: "__start", def: undefined } });
  return row;
}

function stepsRow() {
  const row = h("div", { class: "srow", "data-sid": "__steps", "data-label": rowLabel("steps", t("s.steps")) });
  row.append(
    h("div", { class: "lab" }, h("div", null, h("div", null, t("s.steps")), h("div", { class: "help" }, t("s.steps.h")))),
    h("div", { class: "dataactions" }, h("button", { type: "button", class: "btn", onclick: startSteps }, t("fs.open"))));
  U.rows.push({ row, rst: h("span", { hidden: true }), update: () => {}, r: { id: "__steps", def: undefined } });
  return row;
}

const STEP_HOME = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"];
const STEP_REACH = ["KeyF", "KeyR", "KeyF", "KeyJ", "KeyU", "KeyJ", "KeyD", "KeyE", "KeyD", "KeyK", "KeyI", "KeyK", "KeyS", "KeyW", "KeyS", "KeyL", "KeyO", "KeyL"];
const STEP_COUNT = 5;

function startSteps() {
  if (S.data.onboard === "new") S.data.onboard = "steps";
  S.steps = { i: S.data.onboard === "steps" ? S.data.onboardStep || 0 : 0, got: [], n: 0, line: "" };
  scheduleSave();
  go("steps");
}

function stepsPaint() {
  const kb = U.kb;
  const st = S.steps;
  if (!kb || !st) return;
  kb.clearHint();
  const all = Object.keys(kb.keys).map(c => kb.keys[c]).concat([kb.space], kb.shifts);
  all.forEach(el => el.classList.remove("got"));
  const el = c => (c === "Space" ? kb.space : c === "ShiftLeft" ? kb.shifts[0] : c === "ShiftRight" ? kb.shifts[1] : kb.keys[c]);
  st.got.forEach(c => el(c) && el(c).classList.add("got"));
  if (st.i === 0) ["KeyF", "KeyJ"].filter(c => st.got.indexOf(c) < 0).forEach(c => kb.keys[c].classList.add("hint"));
  else if (st.i === 2 && STEP_REACH[st.n]) kb.keys[STEP_REACH[st.n]].classList.add("hint");
  else if (st.i === 3) ["Space", "ShiftLeft", "ShiftRight"].filter(c => st.got.indexOf(c) < 0).forEach(c => el(c).classList.add("hint"));
  const line = document.getElementById("stepline");
  if (line) line.textContent = st.i === 2 ? nf(st.n) + " / " + nf(STEP_REACH.length) : st.line;
}

function stepsNext() {
  const st = S.steps;
  if (!st) return;
  st.moving = false;
  if (st.i >= STEP_COUNT - 1) {
    finishSteps(st.skipped ? "skipped" : "done");
    return;
  }
  st.i++;
  st.got = [];
  st.n = 0;
  st.line = "";
  if (S.data.onboard === "steps") {
    S.data.onboardStep = st.i;
    scheduleSave();
  }
  render();
}

function skipAllSteps() {
  finishSteps("skipped");
}

function finishSteps(state) {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const freshProfile = !L.placed && !Object.keys(L.chars).length && !S.data.lessons.some(l => l.lid === lid);
  if (freshProfile) {
    S.settings.startKeys = 2;
    S.settings.order = "position";
    S.settings.liveWpm = false;
    S.settings.learnTracks.active = "letters";
    L.k = 2;
    L.placed = true;
  }
  S.data.onboard = S.data.onboard === "done" ? "done" : state;
  S.data.onboardStep = 0;
  S.steps = null;
  scheduleSave();
  newLesson();
  go("practice");
}

function stepsOnKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.key === "Tab") return;
  const tg = e.target;
  if (tg && (tg.tagName === "INPUT" || tg.tagName === "SELECT")) return;
  if ((e.key === " " || e.key === "Enter") && tg && tg.tagName === "BUTTON" && U.tabbed) return;
  const st = S.steps;
  if (!st || e.repeat) return;
  const code = e.code || "";
  if (e.key.length === 1 || code.indexOf("Shift") === 0) e.preventDefault();
  if (e.key.length === 1) U.tabbed = false;
  const add = c => { if (st.got.indexOf(c) < 0) st.got.push(c); };
  let done = false;
  if (st.i === 0 && (code === "KeyF" || code === "KeyJ")) {
    add(code);
    done = st.got.length === 2;
  } else if (st.i === 1 && STEP_HOME.indexOf(code) >= 0) {
    add(code);
    const f = fingerOf(code);
    st.line = t("fs.f." + f) + " \u2014 " + t("fs.hand." + (LEFT_HAND.has(code) ? "l" : "r"));
    done = st.got.length === STEP_HOME.length;
  } else if (st.i === 2 && code === STEP_REACH[st.n]) {
    st.n++;
    done = st.n === STEP_REACH.length;
  } else if (st.i === 3 && (code === "Space" || code === "ShiftLeft" || code === "ShiftRight")) {
    add(code);
    done = st.got.length === 3;
  }
  stepsPaint();
  if (done && !st.moving) {
    st.moving = true;
    if (U.stepDelay) setTimeout(stepsNext, U.stepDelay);
    else stepsNext();
  }
}

function renderSteps() {
  const st = S.steps || (S.steps = { i: 0, got: [], n: 0, line: "" });
  const i = st.i;
  const last = i === STEP_COUNT - 1;
  const kbwrap = h("div", { class: "kbwrap" });
  let extra = null;
  if (last) {
    const pace = S.settings.targetWpm === 15 ? "relaxed" : S.settings.targetWpm === 30 ? "standard" : null;
    const box = seg([{ v: "relaxed", l: t("fs.pace.relaxed") }, { v: "standard", l: t("fs.pace.standard") }], pace, v => {
      setSetting("targetWpm", v === "relaxed" ? 15 : 30);
      render();
    });
    box.setAttribute("aria-label", t("fs.pace"));
    extra = h("div", null, h("ul", { class: "posture" }, h("li", null, t("fs.p1")), h("li", null, t("fs.p2")), h("li", null, t("fs.p3"))), h("div", { class: "sub" }, t("fs.pace")), box);
  }
  U.main.append(...[
    h("div", { class: "card stepcard" },
      h("div", { class: "stepmeta" }, t("fs.title") + " \u00B7 " + t("fs.of") + " " + nf(i + 1) + " / " + nf(STEP_COUNT)),
      h("h2", null, t("fs.s" + (i + 1) + ".t")),
      h("p", { class: "stepbody" }, t("fs.s" + (i + 1) + ".b")),
      h("p", { class: "stepline", id: "stepline", "aria-live": "polite" }),
      extra,
      h("div", { class: "stepactions" },
        h("button", { type: "button", class: "btn go", onclick: last ? () => finishSteps("done") : stepsNext }, last ? t("fs.finish") : t("fs.next")),
        last ? null : h("button", { type: "button", class: "btn", onclick: () => { st.skipped = true; stepsNext(); } }, t("fs.skip")),
        h("button", { type: "button", class: "btn", onclick: skipAllSteps }, t("fs.skipall")))),
    kbwrap
  ].filter(Boolean));
  const hw = hwNote();
  if (hw) U.main.prepend(hw);
  U.kb = buildKeyboard({ zones: true });
  kbwrap.append(U.kb.root);
  U.typer = null;
  if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.blur();
  stepsPaint();
}

function beginAgain() {
  const L = layoutData(S.settings.layout);
  L.k = Math.max(2, S.settings.startKeys);
  L.lk = 0;
  L.tot = 0;
  L.rescue = 0;
  L.bk = null;
  L.raise = null;
  L.placed = true;
  scheduleSave();
  newLesson();
  go("practice");
}

function extrasRow() {
  const st = S.settings;
  const row = h("div", { class: "srow", "data-label": t("s.extras").toLowerCase() });
  const wrap = h("div", { class: "chips", role: "group", "aria-label": t("s.extras") });
  const why = h("div", { class: "help why-off", hidden: true });
  const update = () => {
    if (!wrap.firstChild) {
      EXTRAS.forEach(id => wrap.append(h("button", {
        type: "button", "data-id": id,
        onclick: () => {
          setSetting(id, !st[id]);
          syncRows();
        }
      }, t("s." + id))));
    }
    const live = extraIds();
    let reason = "";
    wrap.querySelectorAll("button").forEach(b => {
      const id = b.getAttribute("data-id");
      const off = live.indexOf(id) < 0;
      b.disabled = off;
      b.classList.toggle("off", off);
      b.setAttribute("aria-pressed", String(!off && !!st[id]));
      if (off) reason = t("s." + id + ".off");
    });
    why.textContent = reason;
    why.hidden = !reason;
  };
  update();
  row.append(h("div", { class: "lab" }, h("div", null, h("div", null, t("s.extras")), why)), h("div", { class: "ctl" }, wrap));
  U.rows.push({ row, rst: h("span", { hidden: true }), update, r: { id: "__extras", def: undefined } });
  return row;
}

export {
  EXTRAS, extraToggles, extrasRow, finishSteps, renderSteps, startRow, startSteps, stepsOnKey, stepsRow
};
