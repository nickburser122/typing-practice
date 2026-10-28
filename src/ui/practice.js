import { S, t } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { newCodeLesson } from "../engine/code.js";
import { handleChar } from "../engine/session.js";
import { layoutData } from "../engine/stats.js";
import { learnTrack, newLesson, trackList } from "../engine/tracks.js";
import { codeHooks, stopCodeClock, updateClock } from "../features/code.js";
import { codeMode, freeHooks, newFreeLesson, renderPreview } from "../features/free.js";
import { scOnKey } from "../features/shortcuts.js";
import { extraToggles, startSteps, stepsOnKey } from "../features/steps.js";
import { backspaceLesson, produceChars, shiftAccount } from "../input/keys.js";
import { U, go, h, render, startPlacement, typingFade } from "./dom.js";
import { seg } from "./stats.js";
import { langSeg, onTestKey } from "./test.js";
import {
  buildKeyboard, buildStrip, caretLearn, paint, renderTyper, setHint, updateLive, updateMeta,
  updateWhy
} from "./typer.js";

function setTrack(v) {
  S.settings.learnTracks.active = v;
  scheduleSave();
  newLesson();
  render();
}

function trackBar() {
  const tr = learnTrack();
  const box = seg(trackList().map(v => ({ v, l: t("lt." + v) })), tr, setTrack);
  box.setAttribute("aria-label", t("lt.track"));
  const note = tr === "letters" ? null : t(tr === "digits" ? "lt.uses.digits." + S.settings.digitSource : "lt.uses." + tr);
  return h("div", { class: "tracks" }, box, note ? h("p", { class: "msg", id: "trnote" }, note) : null);
}

function renderPractice() {
  if (S.lesson && (S.lesson.code || S.lesson.free)) newLesson();
  U.typer = h("div", { class: "typer", id: "typer", tabindex: "0", role: "textbox", "aria-readonly": "true", "aria-label": t("a.typer") });
  const stage = h("div", { class: "stage", "data-focus": S.focused ? "1" : "0" },
    U.typer, h("div", { class: "fh" }, h("span", null, t("click"))));
  const kbwrap = h("div", { class: "kbwrap" + (S.settings.keyboard ? "" : " off") });
  const lidP = S.settings.layout;
  const LP = layoutData(lidP);
  const fresh = !LP.placed && !Object.keys(LP.chars).length && !S.data.lessons.some(l => l.lid === lidP);
  U.main.append(...[
    h("div", { class: "cfg" }, langSeg(), ...extraToggles()),
    trackBar(),
    fresh ? h("div", { class: "place" },
      h("button", { type: "button", class: "btn", onclick: startSteps }, t(S.data.onboard === "steps" && S.data.onboardStep > 0 ? "fs.resume" : "fs.new")),
      h("button", { type: "button", class: "btn", onclick: () => {
        S.settings.startKeys = 2;
        S.settings.order = "position";
        LP.k = 2;
        LP.placed = true;
        S.data.onboard = "done";
        scheduleSave();
        newLesson();
        render();
      } }, t("fs.first")),
      h("button", { type: "button", class: "btn", onclick: () => {
        S.data.onboard = "done";
        startPlacement();
      } }, t("fs.know")),
      h("span", { class: "msg" }, t("pl.note"))) : null,
    h("div", { class: "card pcard" },
      h("div", { class: "strip", id: "strip" }),
      h("button", { type: "button", class: "why", id: "why", hidden: true, "aria-expanded": "false", onmousedown: e => e.preventDefault(), onclick: () => { S.whyOpen = !S.whyOpen; updateWhy(); } }),
      stage,
      h("div", { class: "meta", "aria-live": "off" }, h("span", { id: "result" }), h("span", { id: "live", class: "live" }))),
    kbwrap
  ].filter(Boolean));
  const hw = hwNote();
  if (hw) U.main.prepend(hw);
  U.kb = buildKeyboard({});
  kbwrap.append(U.kb.root);
  buildStrip();
  renderTyper();
  updateMeta();
  updateWhy();
  updateLive();
  setHint();
}

const hooks = {
  painted(i, j) {
    paint(i);
    paint(j);
    caretLearn();
    setHint();
    updateLive();
  },
  finished() {
    newLesson();
    if (U.typer) {
      renderTyper();
      buildStrip();
      updateMeta();
      updateWhy();
          updateLive();
      setHint();
    }
  }
};

function setFocused(v) {
  S.focused = v;
  const st = document.querySelector(".stage");
  if (st) st.setAttribute("data-focus", v ? "1" : "0");
}

function restartLesson() {
  if (S.view === "free" && !codeMode()) {
    newFreeLesson();
    if (U.typer) {
      renderTyper();
      renderPreview();
      setHint();
    }
    return;
  }
  if (codeMode()) {
    stopCodeClock();
    if (S.view === "free") newFreeLesson();
    else newCodeLesson();
    if (U.typer) renderTyper();
    updateClock();
    return;
  }
  newLesson();
  if (U.typer) {
    renderTyper();
    updateLive();
    setHint();
  }
}

function hwNote() {
  if (!window.matchMedia) return null;
  if (!window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(max-width: 520px)").matches) return null;
  return h("p", { class: "hwnote", role: "note" }, t("hw"));
}

function onKeyDown(e) {
  if (typeof e.key !== "string") return;
  if (e.key === "Tab") U.tabbed = true;
  if ((S.view === "settings" || S.view === "keys") && e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const box = e.target;
    e.preventDefault();
    if (box && box.tagName === "INPUT" && box.value) {
      box.value = "";
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    go(S.back || "practice");
    return;
  }
  if (S.view === "shortcuts") {
    scOnKey(e);
    return;
  }
  if (S.view === "steps") {
    stepsOnKey(e);
    return;
  }
  if (S.view !== "practice" && S.view !== "free" && S.view !== "test" && S.view !== "code") return;
  const tg = e.target;
  if (tg && (tg.tagName === "INPUT" || tg.tagName === "SELECT" || tg.tagName === "TEXTAREA")) return;
  if (U.tabbed && (e.key === " " || e.key === "Enter") && tg && (tg.tagName === "BUTTON" || tg.tagName === "SUMMARY" || tg.tagName === "A" || tg.tagName === "LABEL")) return;
  if (e.key.length === 1) U.tabbed = false;
  if (S.view === "test") {
    onTestKey(e);
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    restartLesson();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Backspace") {
    e.preventDefault();
    backspaceLesson();
    return;
  }
  const out = produceChars(e);
  if (!out) return;
  if (!S.focused) setFocused(true);
  if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.blur();
  e.preventDefault();
  if (e.repeat) return;
  shiftAccount(e);
  typingFade();
  const ts = e.timeStamp || performance.now();
  for (const ch of out.split("")) handleChar(ch, ts, codeMode() ? codeHooks : S.view === "free" ? freeHooks : hooks);
}

export { hooks, hwNote, onKeyDown, renderPractice, setFocused };
