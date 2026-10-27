import { MIX_KEYS } from "../core/schema.js";
import { S, layoutInfo, nf, t } from "../core/state.js";
import {
  CUSTOM_CAP, clearCustom, customBytes, customText, hasCustom, saveCustom, scheduleSave
} from "../core/storage.js";
import { LAYOUTS } from "../data/layouts.js";
import { codeSid, newCodeLesson } from "../engine/code.js";
import { compose, legacyMix } from "../engine/mix.js";
import { codeClockLabel, codeOptions, dropdown, renderCodeRes, stopCodeClock } from "./code.js";
import { applyKbFade } from "../input/keys.js";
import { U, h, render } from "../ui/dom.js";
import { hwNote } from "../ui/practice.js";
import { seg } from "../ui/stats.js";
import { langSeg } from "../ui/test.js";
import { buildKeyboard, caretLearn, paint, renderTyper, setHint } from "../ui/typer.js";

function splitWeights(ws, total) {
  const n = ws.length;
  const base = ws.map(w => Math.max(1, w));
  const s = base.reduce((a, x) => a + x, 0);
  const spare = total - n;
  const raw = base.map(w => w / s * spare);
  const out = raw.map(x => 1 + Math.floor(x));
  let left = total - out.reduce((a, x) => a + x, 0);
  raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((p, q) => q.f - p.f).forEach(e => {
    if (left > 0) {
      out[e.i]++;
      left--;
    }
  });
  return out;
}

function normalizeMix(m) {
  const on = MIX_KEYS.filter(k => m[k].on);
  const out = {};
  MIX_KEYS.forEach(k => { out[k] = { on: !!m[k].on, weight: 0 }; });
  if (!on.length) return out;
  const parts = splitWeights(on.map(k => m[k].weight), 100);
  on.forEach((k, i) => { out[k].weight = parts[i]; });
  return out;
}

function setMixWeight(m, key, v) {
  const on = MIX_KEYS.filter(k => m[k].on);
  if (on.length < 2 || !m[key].on) return normalizeMix(m);
  const others = on.filter(k => k !== key);
  const val = Math.max(1, Math.min(100 - others.length, Math.round(v)));
  const out = {};
  MIX_KEYS.forEach(k => { out[k] = { on: !!m[k].on, weight: 0 }; });
  out[key].weight = val;
  const parts = splitWeights(others.map(k => m[k].weight), 100 - val);
  others.forEach((k, i) => { out[k].weight = parts[i]; });
  return out;
}

function chipKeys() {
  const base = layoutInfo().lang === "ar" ? ["letters", "digits", "punct", "symbols", "code", "dia"] : ["letters", "capitals", "digits", "punct", "symbols", "code"];
  return hasCustom() ? base.concat(["custom"]) : base;
}

function practiceMix() {
  const base = S.settings.mix || legacyMix(S.settings);
  const vis = chipKeys();
  const m = {};
  MIX_KEYS.forEach(k => { m[k] = { on: vis.indexOf(k) >= 0 && !!base[k].on, weight: base[k].weight }; });
  if (!vis.some(k => m[k].on)) m.letters.on = true;
  return normalizeMix(m);
}

function codeOnly(m) {
  return MIX_KEYS.every(k => m[k].on === (k === "code"));
}

function codeMode() {
  return S.view === "code" || (S.view === "free" && codeOnly(practiceMix()));
}

function mixSig(m) {
  return MIX_KEYS.filter(k => m[k].on).map(k => k + ":" + m[k].weight).join("|");
}

function builtinPresets() {
  const ar = layoutInfo().lang === "ar";
  const mk = (names, ws) => {
    const m = {};
    MIX_KEYS.forEach(k => {
      const i = names.indexOf(k);
      m[k] = { on: i >= 0, weight: i >= 0 ? ws[i] : 0 };
    });
    return normalizeMix(m);
  };
  return [
    { id: "text", name: t("fp.p.text"), mix: mk(["letters"], [100]) },
    { id: "numbers", name: t("fp.p.numbers"), mix: mk(["digits"], [100]) },
    { id: "prose", name: t("fp.p.prose"), mix: ar ? mk(["letters", "punct"], [85, 15]) : mk(["letters", "capitals", "punct"], [70, 15, 15]) },
    { id: "code", name: t("fp.p.code"), mix: mk(["code"], [100]) }
  ];
}

function freeLessonFits() {
  const l = S.lesson;
  if (!l || l.done) return false;
  return codeMode() ? !!(l.code && l.sid === codeSid()) : !!l.free;
}

function newFreeLesson() {
  applyKbFade();
  const mix = practiceMix();
  if (codeOnly(mix)) {
    newCodeLesson();
    return;
  }
  const b = compose(mix, S.settings.lessonWords);
  const chars = b.words.join(" ").split("");
  const cm = new Uint8Array(chars.length);
  let pos = 0;
  b.tokens.forEach(tk => {
    if (tk.src === "code") cm.fill(1, pos, pos + tk.t.length);
    pos += tk.t.length + 1;
  });
  S.lesson = {
    chars,
    cm,
    idx: 0,
    flag: new Uint8Array(chars.length),
    mark: new Uint8Array(chars.length),
    errTs: new Float64Array(chars.length),
    start: 0,
    prevTs: null,
    errs: 0,
    focus: b.focus,
    focusPair: b.focusPair,
    done: false,
    free: true
  };
}

function setMix(m, focusSel) {
  S.settings.mix = m;
  S.mixLedger = null;
  S.focusAfter = focusSel || null;
  scheduleSave();
  stopCodeClock();
  newFreeLesson();
  render();
}

function toggleChip(key) {
  const m = practiceMix();
  const vis = chipKeys();
  if (m[key].on && vis.filter(k => m[k].on).length === 1) {
    const note = document.getElementById("fpnote");
    if (note) note.textContent = t("fp.last");
    return;
  }
  const next = {};
  MIX_KEYS.forEach(k => { next[k] = { on: vis.indexOf(k) >= 0 && m[k].on, weight: m[k].weight }; });
  next[key].on = !m[key].on;
  if (next[key].on) next[key].weight = 20;
  setMix(normalizeMix(next), "[data-chip=\"" + key + "\"]");
}

function savePreset(name) {
  const nm = String(name || "").trim().slice(0, 24);
  if (!nm) return false;
  const list = S.settings.presets.filter(p => p.name !== nm);
  if (list.length >= 6) return false;
  list.push({ name: nm, mix: practiceMix() });
  S.settings.presets = list;
  scheduleSave();
  return true;
}

function deletePreset(name) {
  S.settings.presets = S.settings.presets.filter(p => p.name !== name);
  scheduleSave();
}

function previewText() {
  const l = S.lesson;
  if (!l) return "";
  const text = l.chars.slice(0, 40).join("");
  return l.chars.length > 40 ? text + "\u2026" : text;
}

function renderPreview() {
  const box = document.getElementById("fpreview");
  if (!box) return;
  box.textContent = "";
  const code = !!(S.lesson && S.lesson.code);
  box.append(h("span", { class: "pl" }, t("fp.preview")), h("bdi", { dir: code || layoutInfo().lang === "en" ? "ltr" : "rtl", lang: code ? "en" : layoutInfo().lang }, previewText()));
}

const freeHooks = {
  painted(i, j) {
    paint(i);
    paint(j);
    caretLearn();
    setHint();
  },
  finished() {
    newFreeLesson();
    if (U.typer) {
      renderTyper();
      renderPreview();
      setHint();
    }
  }
};

function renderFree() {
  const st = S.settings;
  const m = practiceMix();
  const code = codeMode();
  const vis = chipKeys();
  if (!freeLessonFits()) newFreeLesson();
  U.typer = h("div", { class: "typer" + (code ? " code" : ""), id: "typer", tabindex: "0", role: "textbox", "aria-readonly": "true", "aria-label": t("a.typer") });
  const stage = h("div", { class: "stage", "data-focus": S.focused ? "1" : "0" }, U.typer, h("div", { class: "fh" }, h("span", null, t("click"))));
  const chips = h("div", { class: "chips", role: "group", "aria-label": t("fp.chips") }, vis.map(k => {
    const box = seg([{ v: true, l: t("fp.c." + k) }], m[k].on, () => toggleChip(k), "toggle");
    box.firstChild.setAttribute("data-chip", k);
    return box;
  }));
  const onKeys = vis.filter(k => m[k].on);
  const rows = [];
  const outs = {};
  const sliders = {};
  const paintWeights = mm => onKeys.forEach(k => {
    sliders[k].value = mm[k].weight;
    sliders[k].setAttribute("aria-valuetext", nf(mm[k].weight) + "%");
    outs[k].textContent = nf(mm[k].weight) + "%";
  });
  onKeys.forEach(k => {
    const input = h("input", { type: "range", min: 1, max: 100, step: 1, value: m[k].weight, "aria-label": t("fp.share") + " " + t("fp.c." + k), disabled: onKeys.length < 2 });
    const out = h("output", null, nf(m[k].weight) + "%");
    sliders[k] = input;
    outs[k] = out;
    input.addEventListener("input", () => {
      const next = setMixWeight(practiceMix(), k, Number(input.value));
      S.settings.mix = next;
      paintWeights(next);
    });
    input.addEventListener("change", () => {
      S.mixLedger = null;
      scheduleSave();
      stopCodeClock();
      newFreeLesson();
      render();
    });
    rows.push(h("label", { class: "mixrow" }, h("span", null, t("fp.c." + k)), input, out));
  });
  const sig = mixSig(m);
  const presetBtn = (name, mix, onDel) => {
    const box = seg([{ v: true, l: name }], mixSig(mix) === sig, () => setMix(mix), "toggle");
    if (!onDel) return box;
    return h("span", { class: "presetx" }, box, h("button", { type: "button", class: "btn", "aria-label": t("fp.del") + " " + name, onclick: onDel }, "\u00D7"));
  };
  const nameBox = h("input", { type: "text", class: "pname", maxlength: 24, "aria-label": t("fp.name"), placeholder: t("fp.name") });
  const full = st.presets.length >= 6;
  const presets = h("div", { class: "presets" },
    builtinPresets().map(p => presetBtn(p.name, p.mix)),
    st.presets.map(p => presetBtn(p.name, p.mix, () => {
      deletePreset(p.name);
      S.focusAfter = ".pname";
      render();
    })));
  const saveRow = h("div", { class: "presets" }, nameBox, h("button", { type: "button", class: "btn", disabled: full, onclick: () => {
    if (savePreset(nameBox.value)) {
      S.focusAfter = ".pname";
      render();
    }
  } }, t("fp.save")), full ? h("span", { class: "msg" }, t("fp.full")) : null);
  const cta = h("textarea", { class: "ctext", rows: 4, dir: "auto", "aria-label": t("fp.custom"), placeholder: t("fp.custom.ph") });
  cta.value = customText();
  const cbytes = h("span", { class: "msg", id: "cbytes" });
  const showBytes = () => { cbytes.textContent = nf(customBytes(cta.value)) + " / " + nf(CUSTOM_CAP) + " " + t("d.bytes"); };
  showBytes();
  cta.addEventListener("input", showBytes);
  const cmsg = h("p", { class: "msg", id: "cmsg", role: "status", "aria-live": "polite" }, S.customMsg || "");
  S.customMsg = "";
  const customBox = h("div", { class: "customs" },
    h("div", { class: "sub" }, t("fp.custom")),
    h("p", { class: "msg" }, t("fp.custom.note")),
    cta,
    h("div", { class: "presets" },
      h("button", { type: "button", class: "btn", id: "csave", onclick: () => {
        const r = saveCustom(cta.value);
        S.customMsg = r.truncated ? t("fp.custom.cut") : hasCustom() ? t("fp.custom.saved") : "";
        S.focusAfter = ".ctext";
        render();
      } }, t("fp.custom.save")),
      h("button", { type: "button", class: "btn", id: "cclear", onclick: () => {
        clearCustom();
        S.focusAfter = ".ctext";
        render();
      } }, t("fp.custom.clear")),
      cbytes),
    cmsg);
  const det = h("details", { class: "mixd" },
    h("summary", null, t("fp.mix")),
    h("p", { class: "msg" }, t("fp.mix.h")),
    rows,
    h("div", { class: "sub" }, t("fp.presets")),
    presets,
    saveRow,
    customBox);
  det.open = !!S.mixOpen;
  det.addEventListener("toggle", () => { S.mixOpen = det.open; });
  U.res = code ? h("div", { class: "coderes", id: "coderes", "aria-live": "polite" }) : null;
  const codeRow = m.code.on ? h("div", { class: "cfg" },
    dropdown(codeOptions(), st.codeSet, v => {
      st.codeSet = v;
      scheduleSave();
      S.codeRecent = [];
      newFreeLesson();
      render();
    }, t("code.set")),
    code ? seg(["off", "after", "15", "30", "60"].map(v => ({ v, l: v === "off" || v === "after" ? t("code.t." + v) : nf(Number(v)) + " " + t("tt.s") })), st.codeTimer, v => {
      st.codeTimer = v;
      scheduleSave();
      stopCodeClock();
      render();
    }) : null,
    code ? h("span", { class: "clock", id: "codeclock", "aria-live": "off" }, codeClockLabel()) : null) : null;
  const kbwrap = code ? null : h("div", { class: "kbwrap" + (st.keyboard ? "" : " off") });
  U.main.append(...[
    h("div", { class: "cfg" }, langSeg()),
    chips,
    h("p", { class: "msg", id: "fpnote", role: "status", "aria-live": "polite" }),
    det,
    h("p", { class: "preview", id: "fpreview", "aria-hidden": "true" }),
    codeRow,
    LAYOUTS[st.layout].lang === "ar" && code ? h("p", { class: "msg" }, t("code.layoutNote")) : null,
    h("div", { class: "card pcard" }, stage),
    U.res,
    kbwrap
  ].filter(Boolean));
  const hw = hwNote();
  if (hw) U.main.prepend(hw);
  if (kbwrap) {
    U.kb = buildKeyboard({});
    kbwrap.append(U.kb.root);
  }
  renderTyper();
  renderPreview();
  if (code) renderCodeRes();
  setHint();
  if (S.focusAfter) {
    const el = U.main.querySelector(S.focusAfter);
    S.focusAfter = null;
    if (el) el.focus();
  }
}

export {
  builtinPresets, chipKeys, codeMode, freeHooks, freeLessonFits, mixSig, newFreeLesson, normalizeMix,
  practiceMix, renderFree, renderPreview, savePreset, setMixWeight
};
