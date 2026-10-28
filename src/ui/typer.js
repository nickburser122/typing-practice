import { S, layoutInfo, nf, t } from "../core/state.js";
import { GEOM, LEFT_HAND } from "../data/layouts.js";
import { model } from "../engine/model.js";
import { keyModel, skillOf, statusOf } from "../engine/skill.js";
import { charStat, layoutData } from "../engine/stats.js";
import {
  learnTrack, newLesson, setTrackK, trackActive, trackK, trackKeys
} from "../engine/tracks.js";
import { resultNodes } from "../features/code.js";
import { fingerOf } from "../input/keys.js";
import { U, glyph, go, h, pct, placeCaret, render } from "./dom.js";
import { setSetting } from "./settings.js";

function buildKeyboard(opts) {
  const lay = layoutInfo();
  const root = h("div", { class: "kb" + (opts.zones || S.settings.fingerZones ? " fz" : ""), dir: "ltr" });
  const keys = {};
  const shifts = [];
  const mod = (w, label) => h("div", { class: "k mod", style: "--w:" + w }, h("span", { class: "kk" }, label));
  const spacer = w => h("div", { class: "k sp0", style: "--w:" + w });
  const key = (code, w) => {
    const isBtn = !!opts.onClick;
    const el = h(isBtn ? "button" : "div", {
      class: "k" + (code === "KeyF" || code === "KeyJ" ? " bump" : ""),
      style: "--w:" + (w || 1),
      "data-code": code,
      "data-f": fingerOf(code) || null,
      type: isBtn ? "button" : null
    }, h("span", { class: "kk" }));
    if (isBtn) el.addEventListener("click", () => opts.onClick(code));
    keys[code] = el;
    return el;
  };
  const row = (...kids) => h("div", { class: "kr" }, kids);
  root.append(row(GEOM[0].map(c => key(c)), mod(2, "⌫")));
  root.append(row(mod(1.5, "Tab"), GEOM[1].slice(0, 12).map(c => key(c)), key("Backslash", 1.5)));
  root.append(row(mod(1.75, "Caps"), GEOM[2].map(c => key(c)), mod(2.25, "Enter")));
  const sl = mod(2.25, "Shift");
  const sr = mod(2.75, "Shift");
  shifts.push(sl, sr);
  root.append(row(sl, GEOM[3].map(c => key(c)), sr));
  const space = h("div", { class: "k mod", style: "--w:6.25" }, h("span", { class: "kk" }));
  root.append(row(spacer(3.75), space));
  const api = {
    root, keys, shifts, space, layer: -1,
    update(layer) {
      if (api.layer === layer) return;
      api.layer = layer;
      for (const code in keys) {
        const m = lay.map[code];
        keys[code].firstChild.textContent = m ? glyph(m[layer ? 1 : 0]) : "";
      }
    },
    clearHint() {
      root.querySelectorAll(".hint").forEach(e => e.classList.remove("hint"));
    }
  };
  api.update(0);
  return api;
}

function setHint() {
  const kb = U.kb;
  if (!kb) return;
  kb.clearHint();
  const l = S.lesson;
  if (!l || l.done) return;
  const ch = l.chars[l.idx];
  if (ch === " ") {
    kb.space.classList.add("hint");
    kb.update(0);
    return;
  }
  const r = layoutInfo().rev[ch];
  if (!r) return;
  kb.update(r.shift ? 1 : 0);
  kb.keys[r.code].classList.add("hint");
  if (r.shift) kb.shifts[LEFT_HAND.has(r.code) ? 1 : 0].classList.add("hint");
}

function renderTyper() {
  const box = U.typer;
  const lay = layoutInfo();
  box.textContent = "";
  const code = !!S.lesson.code;
  box.setAttribute("dir", !code && lay.lang === "ar" ? "rtl" : "ltr");
  box.setAttribute("lang", code ? "en" : lay.lang);
  U.spans = [];
  let w = null;
  S.lesson.chars.forEach(ch => {
    if (!w) {
      w = h("span", { class: "w" });
      box.append(w);
    }
    const sp = document.createElement("span");
    sp.textContent = ch === " " ? " " : ch;
    U.spans.push(sp);
    w.append(sp);
    if (ch === " ") w = null;
  });
  if (!code && lay.lang === "ar") {
    Array.from(box.children).forEach(word => {
      const kids = Array.from(word.children);
      const body = kids.length && kids[kids.length - 1].textContent.trim() === "" ? kids.slice(0, -1) : kids;
      if (!body.length || !body.every(k => /^[!-~]$/.test(k.textContent))) return;
      const run = document.createElement("bdi");
      run.setAttribute("dir", "ltr");
      body.forEach(k => run.append(k));
      word.insertBefore(run, word.firstChild);
    });
  }
  for (let i = 0; i < U.spans.length; i++) paint(i);
  caretLearn();
}

function caretLearn() {
  const l = S.lesson;
  if (!U.typer || !l) return;
  const el = l.done ? null : U.spans[l.idx];
  const inRun = !!(el && el.parentNode && el.parentNode.nodeName === "BDI");
  placeCaret(U.typer, el, !l.code && layoutInfo().lang === "ar" && !inRun);
}

function paint(i) {
  const l = S.lesson;
  const sp = U.spans[i];
  if (!sp) return;
  let c = l.chars[i] === " " ? "c sp" : "c";
  if (l.mark[i] === 1) c += " d";
  else if (l.mark[i] === 2) c += " x";
  else if (i === l.idx && !l.done) c += l.flag[i] ? " cur err" : " cur";
  sp.className = c;
}

function buildStrip() {
  const strip = document.getElementById("strip");
  if (!strip) return;
  strip.textContent = "";
  if (!S.settings.strip) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const lid = S.settings.layout;
  const focus = S.lesson ? S.lesson.focus : null;
  const tr = learnTrack();
  trackActive(tr).forEach(ch => {
    const st = statusOf(charStat(lid, ch, false), ch);
    let cls = "chip";
    if (ch === focus) cls += " f";
    else if (st === "steady") cls += " s";
    else if (st === "sparse") cls += " n";
    strip.append(h("button", {
      type: "button", class: cls,
      onclick: () => {
        S.keysUI.sel = ch;
        S.keysUI.tab = "kb";
        go("keys");
      }
    }, glyph(ch)));
  });
  const kk = trackK(tr);
  const ord = trackKeys(tr);
  if (kk < ord.length) strip.append(h("span", { class: "chip nx", lang: layoutInfo().lang, title: t("next.key"), "aria-label": t("next.key") + ": " + ord[kk] }, glyph(ord[kk])));
  strip.append(h("span", { class: "gap" }));
  const k = trackK(tr);
  strip.append(
    h("button", { type: "button", class: "step", "aria-label": t("step.less"), disabled: k <= (tr === "letters" ? 2 : 1), onclick: () => stepKeys(-1) }, "−"),
    h("button", { type: "button", class: "step", "aria-label": t("step.more"), disabled: k >= ord.length, onclick: () => stepKeys(1) }, "+")
  );
}

function stepKeys(d) {
  const tr = learnTrack();
  setTrackK(tr, trackK(tr) + d);
  newLesson();
  render();
}

function iso(x) {
  return "\u2068" + x + "\u2069";
}

function fill(str, o) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
}

function whyRaw(l) {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const fp = l.focusPair;
  if (typeof fp === "string" && fp.length === 2 && L.pairs[fp] && L.pairs[fp].n >= 3) {
    const d = Math.round(model(lid).pexcess[fp] / 5) * 5;
    if (d >= 10) return { kind: "pairSlow", fp, d, ms: L.pairs[fp].m, n: L.pairs[fp].n };
  }
  if (!l.focus) return null;
  const ch = l.focus;
  const s = charStat(lid, ch, false);
  if (!s || s.n < S.derived.minS) return { kind: "new", ch, n: s ? s.n : 0 };
  const sk = skillOf(lid, ch, s);
  const usual = keyModel(lid, ch, s).expected;
  const d = Math.round((sk.ms - usual) / 5) * 5;
  const kind = d >= 15 ? "slow" : sk.acc < S.derived.targetAcc ? "acc" : "steady";
  return { kind, ch, d, ms: sk.ms, usual, acc: sk.acc, n: s.n };
}

function whyInfo() {
  const l = S.lesson;
  if (!l || l.code) return null;
  if (l.whyRaw === undefined) l.whyRaw = whyRaw(l);
  const r = l.whyRaw;
  if (!r) return null;
  const k = iso(r.ch || r.fp);
  if (r.kind === "pairSlow") return { text: fill(t("why.pair"), { a: iso(r.fp[1]), b: iso(r.fp[0]) }), detail: fill(t("why.detailPair"), { k, ms: nf(r.ms), n: nf(r.n) }) };
  if (r.kind === "new") return { text: fill(t("why.focus"), { k }), detail: fill(t("why.detailNew"), { k, n: nf(r.n) }) };
  return { text: fill(t("why.focus"), { k }), detail: fill(t("why.detail"), { k, ms: nf(r.ms), u: nf(r.usual), acc: pct(r.acc), n: nf(r.n) }) };
}

function updateWhy() {
  const el = document.getElementById("why");
  if (!el) return;
  const w = whyInfo();
  el.textContent = "";
  el.hidden = !w;
  if (!w) return;
  el.setAttribute("aria-expanded", S.whyOpen ? "true" : "false");
  el.append(w.text);
  if (S.whyOpen) el.append(h("span", { class: "whyd" }, w.detail));
}

function updateMeta() {
  const el = document.getElementById("result");
  if (!el) return;
  const r = S.lastResult;
  el.textContent = "";
  if (S.settings.result && r) el.append(...resultNodes(r));
}

function updateLive() {
  const el = document.getElementById("live");
  if (!el) return;
  const l = S.lesson;
  if (!S.settings.liveWpm || !l || l.done || l.idx < 6 || !l.start) {
    el.textContent = "";
    return;
  }
  const mins = (performance.now() - l.start) / 60000;
  el.textContent = mins > 0 ? nf(((l.idx - 1) / 5) / mins) + " " + t("wpm") : "";
}

export {
  buildKeyboard, buildStrip, caretLearn, iso, paint, renderTyper, setHint, updateLive, updateMeta,
  updateWhy, whyInfo, whyRaw
};
