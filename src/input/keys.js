import { S, layoutInfo, t } from "../core/state.js";
import { GEOM, LAYOUTS, LEFT_HAND } from "../data/layouts.js";
import { codeLayoutId } from "../engine/code.js";
import { FINGER_ROWS } from "../engine/difficulty.js";
import { statusOf } from "../engine/skill.js";
import { charStat, layoutData } from "../engine/stats.js";
import { codeMode, freeHooks } from "../features/free.js";
import { U, h } from "../ui/dom.js";
import { hooks } from "../ui/practice.js";

function produceChars(e) {
  U.shiftNote = null;
  if (e.code === "Space" || e.key === " ") return " ";
  const trk = S.view === "practice" && S.lesson && !S.lesson.code ? S.lesson.track : null;
  if (trk === "digits" || trk === "numpad") {
    const pad = !!(e.code && e.code.indexOf("Numpad") === 0);
    const row = !!(e.code && (/^Digit[0-9]$/.test(e.code) || (trk === "numpad" && e.code === "Period")));
    const source = trk === "numpad" ? "numpad" : S.settings.digitSource;
    if ((source === "row" && pad) || (source === "numpad" && row)) return "";
  }
  if (e.code && e.code.indexOf("Numpad") === 0 && e.key && e.key.length === 1 && /[0-9+\-*/.]/.test(e.key)) return e.key;
  const capsOn = !!(e.getModifierState && e.getModifierState("CapsLock"));
  const policy = S.settings.shiftPolicy;
  const shiftable = !!e.shiftKey && !!e.code && /^(Key|Digit|Minus|Equal|Bracket|Semicolon|Quote|Comma|Period|Slash|Backquote|Backslash|IntlBackslash)/.test(e.code);
  const noteShift = () => {
    if (policy === "off" || !shiftable) return "";
    const wrong = wrongShift(e.code);
    U.shiftNote = wrong ? "same" : "ok";
    return wrong && policy === "strict" ? "\u21E7" : "";
  };
  if (S.settings.inputMode === "system") {
    const k = e.key;
    if (!k) return "";
    if (k.length === 1) {
      if (S.settings.capsPolicy === "strict" && capsOn && !e.shiftKey && k !== k.toLowerCase() && k === k.toUpperCase()) return "\u21EA";
      return noteShift() || k;
    }
    if (k.length === 2 && /[؀-ۿ]{2}/.test(k)) return noteShift() || k;
    return "";
  }
  const lay = codeMode() ? LAYOUTS[codeLayoutId()] : layoutInfo();
  const m = lay.map[e.code];
  if (!m) return "";
  let shift = e.shiftKey;
  if (lay.lang === "en" && /^[a-z]$/.test(m[0]) && capsOn) {
    if (S.settings.capsPolicy === "strict" && !e.shiftKey) return "\u21EA";
    shift = !shift;
  }
  if (shift && e.shiftKey) {
    const bad = noteShift();
    if (bad) return bad;
  }
  return m[shift ? 1 : 0];
}

function wrongShift(code) {
  if (!U.shiftL && !U.shiftR) return false;
  return LEFT_HAND.has(code) ? !U.shiftR : !U.shiftL;
}

function trackShift(e) {
  if (e.repeat) return;
  const down = e.type === "keydown";
  if (e.code === "ShiftLeft") U.shiftL = down;
  else if (e.code === "ShiftRight") U.shiftR = down;
  if (typeof e.getModifierState === "function") setCapsNote(e.getModifierState("CapsLock"));
}

function clearShift() {
  U.shiftL = false;
  U.shiftR = false;
}

function setCapsNote(on) {
  const show = !!on && S.settings.capsPolicy !== "strict";
  let el = document.getElementById("capsnote");
  if (!el) {
    if (!show) return;
    el = h("div", { class: "capsnote", id: "capsnote", role: "status" });
    document.body.append(el);
  }
  el.textContent = show ? t("note.caps") : "";
  el.hidden = !show;
}

function shiftAccount(e) {
  const note = U.shiftNote;
  if (!note) return;
  layoutData(S.settings.layout).sh[note === "same" ? "same" : "ok"]++;
  if (S.settings.shiftPolicy !== "hint" || !U.kb) return;
  const used = U.shiftL && !U.shiftR ? 0 : U.shiftR && !U.shiftL ? 1 : LEFT_HAND.has(e.code) ? 1 : 0;
  U.kb.shifts.forEach(s => s.classList.remove("used"));
  const el = U.kb.shifts[used];
  el.classList.add("used");
  clearTimeout(U.shiftFlash);
  U.shiftFlash = setTimeout(() => el.classList.remove("used"), 500);
}

function backspaceLesson() {
  const l = S.lesson;
  if (S.settings.backspace === "off" || codeMode() || !l || l.done || l.idx === 0 || l.mark[l.idx - 1] !== 2) return;
  l.idx--;
  l.mark[l.idx] = 0;
  (S.view === "free" ? freeHooks : hooks).painted(l.idx, l.idx + 1);
}

let FINGER_OF = null;

function fingerOf(code) {
  if (!FINGER_OF) {
    FINGER_OF = { Backslash: "p" };
    GEOM.slice(0, 4).forEach((row, r) => row.forEach((c, i) => { if (FINGER_ROWS[r][i]) FINGER_OF[c] = FINGER_ROWS[r][i]; }));
  }
  return FINGER_OF[code] || "";
}

function applyKbFade() {
  const kb = U.kb;
  if (!kb) return;
  const lay = layoutInfo();
  const lid = S.settings.layout;
  const on = S.settings.kbFade;
  for (const code in kb.keys) {
    const m = lay.map[code];
    kb.keys[code].classList.toggle("kfade", !!(on && m && statusOf(charStat(lid, m[0], false), m[0]) === "steady"));
  }
}

export { applyKbFade, backspaceLesson, clearShift, fingerOf, produceChars, shiftAccount, trackShift };
