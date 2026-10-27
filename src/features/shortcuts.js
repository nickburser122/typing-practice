import { S, nf, t, uiLang } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { SC_DATA } from "../data/shortcuts.js";
import { ringPush } from "../engine/session.js";
import { rand } from "../engine/words.js";
import { U, bdi, h, render } from "../ui/dom.js";
import { seg } from "../ui/stats.js";

const SC_CODES = { Left: "ArrowLeft", Right: "ArrowRight", Up: "ArrowUp", Down: "ArrowDown", Backspace: "Backspace", Delete: "Delete", Home: "Home", End: "End", Esc: "Escape", Tab: "Tab", Space: "Space", ".": "Period", ",": "Comma", "/": "Slash", "\\": "Backslash", "[": "BracketLeft", "]": "BracketRight", "`": "Backquote", "-": "Minus", "=": "Equal", ";": "Semicolon" };
for (let d = 0; d < 10; d++) SC_CODES[String(d)] = "Digit" + d;
const SC_SYM = { Left: "←", Right: "→", Up: "↑", Down: "↓", Backspace: "⌫", Delete: "Del", Esc: "Esc", PageUp: "PgUp", PageDown: "PgDn" };
const SC_MAC = { Cmd: "⌘", Option: "⌥", Ctrl: "⌃", Shift: "⇧" };
const SC_INTERVALS = [0, 2, 15, 1440, 4320, 10080];

const SC_CATS = ["edit", "excel", "word", "gdocs", "ppt", "editor", "browser", "terminal", "system"];
const SC_NAV = ["Home", "End", "PageUp", "PageDown", "Delete", "Backspace", "Insert", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].concat(Array.from({ length: 12 }, (_, i) => "F" + (i + 1)));
const SC_HOLD = /^(Win\+|Ctrl\+(Shift\+)?Tab$|Ctrl\+(Shift\+)?[NTWQ]$|Ctrl\+[1-9]$|Ctrl\+Page(Up|Down)$|Alt\+(Tab|F4|Space)$|Ctrl\+Alt\+Delete$|Ctrl\+Shift\+(Esc|Delete|P)$|F11$|Cmd\+(Shift\+)?[QHMNTW]$|Cmd\+(Tab|Space|,|Option\+Esc)$|Cmd\+[1-9]$|Cmd\+Shift\+[345]$|Ctrl\+Cmd\+)/;
const SC = { item: null, asked: 0, hadErr: false, shown: false, kind: "", last: null, timer: null };

function scOS() {
  const o = S.settings.scOS;
  if (o === "win" || o === "mac") return o;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const p = (nav && ((nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent)) || "";
  return /Mac|iPhone|iPad/.test(p) ? "mac" : "win";
}

function scParse(str) {
  const o = { ctrl: false, shift: false, alt: false, meta: false, code: null };
  str.split("+").forEach(p => {
    const l = p.toLowerCase();
    if (l === "ctrl") o.ctrl = true;
    else if (l === "shift") o.shift = true;
    else if (l === "alt" || l === "option") o.alt = true;
    else if (l === "win" || l === "cmd") o.meta = true;
    else o.code = SC_CODES[p] || (/^[A-Za-z]$/.test(p) ? "Key" + p.toUpperCase() : p);
  });
  return o;
}

function scTokens(str, os) {
  return str.split("+").map(p => (os === "mac" && SC_MAC[p]) || SC_SYM[p] || (p === "Win" ? "Win" : p));
}

function scMode(os, chords) {
  const c = chords[0];
  return SC_HOLD.test(c) || (os === "mac" && /^Ctrl\+(Up|Down|Left|Right)$/.test(c)) ? "recall" : "press";
}

function scItems(os, cat) {
  const out = [];
  SC_DATA.forEach(d => {
    const chords = os === "mac" ? d[4] : d[3];
    if (!chords) return;
    if (cat !== "all" && d[5] !== cat) return;
    out.push({ id: d[0], en: d[1], ar: d[2], chords, cat: d[5], mode: scMode(os, chords) });
  });
  return out;
}

function scStat(os, id, create) {
  const k = os + "|" + id;
  let s = S.data.sc[k];
  if (!s && create) s = S.data.sc[k] = { b: 0, n: 0, e: 0, ms: [], due: 0, ls: 0 };
  return s;
}

function scState(os, id) {
  const s = scStat(os, id, false);
  if (!s || !s.n) return "sparse";
  return s.b >= 4 ? "steady" : "learning";
}

function scPick(os, cat) {
  const items = scItems(os, cat);
  if (!items.length) return null;
  const now = Date.now();
  const seen = items.filter(i => scStat(os, i.id, false) && scStat(os, i.id, false).n > 0);
  const fresh = items.filter(i => !(scStat(os, i.id, false) && scStat(os, i.id, false).n > 0));
  const due = seen.filter(i => scStat(os, i.id, false).due <= now && (!SC.last || i.id !== SC.last));
  const learning = due.filter(i => scStat(os, i.id, false).b < 4);
  let pool;
  if (learning.length >= 3 || (learning.length && !fresh.length)) pool = learning;
  else if (fresh.length) pool = fresh.slice(0, 2);
  else if (due.length) pool = due;
  else pool = seen.slice().sort((a, b) => scStat(os, a.id, false).due - scStat(os, b.id, false).due).slice(0, 3);
  if (!pool.length) pool = items;
  let cand = pool.filter(i => i.id !== SC.last);
  if (!cand.length) cand = pool;
  const minB = Math.min.apply(null, cand.map(i => (scStat(os, i.id, false) ? scStat(os, i.id, false).b : 0)));
  const low = cand.filter(i => (scStat(os, i.id, false) ? scStat(os, i.id, false).b : 0) === minB);
  return low[rand(low.length)];
}

function scRecord(os, item, ok, ms) {
  const s = scStat(os, item.id, true);
  const fast = ms <= (item.mode === "press" ? 2500 : 5000);
  s.n++;
  if (!ok) s.e++;
  ringPush(s.ms, Math.round(ms), 10);
  if (ok && fast) s.b = Math.min(5, s.b + 1);
  else if (!ok) s.b = Math.max(0, s.b - 2);
  s.due = Date.now() + SC_INTERVALS[s.b] * 60000;
  s.ls = Date.now();
  scheduleSave();
}

function scMatch(e, chords) {
  return chords.some(c => {
    const p = scParse(c);
    return e.code === p.code && e.ctrlKey === p.ctrl && e.shiftKey === p.shift && e.altKey === p.alt && e.metaKey === p.meta;
  });
}

function scKeycaps(str, os, cls) {
  return h("span", { class: "kcaps" + (cls ? " " + cls : ""), dir: "ltr", lang: "en" }, scTokens(str, os).map((tk, i) => [i ? h("i", null, "+") : null, h("kbd", { class: "kcap" }, tk)]));
}

function scNext() {
  const os = scOS();
  const item = scPick(os, S.settings.scCat);
  SC.item = item;
  SC.hadErr = false;
  SC.shown = false;
  SC.t0 = performance.now();
  if (SC.timer) clearTimeout(SC.timer);
  SC.timer = null;
  if (item && item.mode === "press") {
    const s = scStat(os, item.id, false);
    if (!s || s.n < 2) SC.shown = true;
    else SC.timer = setTimeout(() => { SC.shown = true; renderShortcutCard(); }, 4000);
  }
}

function scAnswer(ok) {
  const os = scOS();
  const item = SC.item;
  if (!item) return;
  const ms = Math.min(20000, performance.now() - SC.t0);
  if (!ok) {
    if (!SC.hadErr) {
      SC.hadErr = true;
      SC.errMs = ms;
    }
    SC.shown = true;
    renderShortcutCard();
    return;
  }
  scRecord(os, item, !SC.hadErr, SC.hadErr ? SC.errMs : ms);
  SC.last = item.id;
  scNext();
  renderShortcutCard();
  renderShortcutList();
}

function scRecall(ok) {
  const item = SC.item;
  if (!item) return;
  scRecord(scOS(), item, ok, 0);
  SC.last = item.id;
  scNext();
  renderShortcutCard();
  renderShortcutList();
}

function scOnKey(e) {
  if (S.view !== "shortcuts" || S.settings.scView === "cheat" || !SC.item || SC.item.mode !== "press") return;
  const tg = e.target;
  if (tg && (tg.tagName === "INPUT" || tg.tagName === "SELECT" || tg.tagName === "TEXTAREA")) return;
  if (["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock"].indexOf(e.key) >= 0) return;
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  const hit = scMatch(e, SC.item.chords);
  const nav = SC_NAV.indexOf(e.code) >= 0 && SC.item.chords.some(c => scParse(c).code === e.code);
  if (!mod && !hit && !nav) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  scAnswer(hit);
}

function scLabel(item) {
  return uiLang() === "ar" ? item.ar : item.en;
}

function renderShortcutCard() {
  const box = U.sccard;
  if (!box) return;
  const os = scOS();
  const item = SC.item;
  box.textContent = "";
  if (!item) {
    box.append(h("p", { class: "mute" }, t("sc.none")));
    return;
  }
  const skip = h("button", { type: "button", class: "btn", onclick: () => { SC.last = item.id; scNext(); renderShortcutCard(); } }, t("sc.skip"));
  const reveal = h("button", { type: "button", class: "btn", onclick: () => { SC.shown = true; renderShortcutCard(); } }, t("sc.show"));
  if (item.mode === "recall") {
    box.append(
      h("div", { class: "sl" }, t("sc.recall")),
      h("div", { class: "scact" }, scLabel(item)),
      h("div", { class: "sckeys" + (SC.shown ? "" : " veil") }, SC.shown ? scKeycaps(item.chords[0], os) : reveal),
      h("div", { class: "acts" },
        SC.shown ? h("button", { type: "button", class: "btn", onclick: () => scRecall(true) }, t("sc.knew")) : null,
        SC.shown ? h("button", { type: "button", class: "btn", onclick: () => scRecall(false) }, t("sc.again")) : null,
        skip),
      h("div", { class: "acts" }, h("span", { class: "msg" }, t("sc.note"))));
    return;
  }
  box.append(
    h("div", { class: "sl" }, t("sc.press")),
    h("div", { class: "scact" }, scLabel(item)),
    h("div", { class: "sckeys" + (SC.shown ? "" : " veil") }, SC.shown ? scKeycaps(item.chords[0], os, SC.hadErr ? "dim" : "") : reveal),
    h("div", { class: "acts" }, skip));
}

function scStateLabels() {
  return { sparse: t("st.new"), learning: t("st.learning"), steady: t("st.steady") };
}

function renderShortcutList() {
  const box = U.sclist;
  if (!box) return;
  if (S.settings.scView === "cheat") {
    renderCheatSheet();
    return;
  }
  const os = scOS();
  const items = scItems(os, S.settings.scCat);
  box.textContent = "";
  const steady = items.filter(i => scState(os, i.id) === "steady").length;
  const lab = scStateLabels();
  const rows = items.map(i => h("tr", null,
    h("td", null, scLabel(i)),
    h("td", { class: "kc" }, scKeycaps(i.chords[0], os)),
    h("td", { class: "stc" }, lab[scState(os, i.id)])));
  box.append(h("div", { class: "card hist" },
    h("div", { class: "hh" }, h("span", { class: "hl" }, t("sc.items")), h("span", { class: "hs" }, t("sc.progress") + ": ", bdi(nf(steady) + " / " + nf(items.length)))),
    h("div", { class: "tablewrap flat" }, h("table", { class: "sctable" }, h("tbody", null, rows)))));
}

function renderCheatSheet() {
  const box = U.sclist;
  if (!box) return;
  const os = scOS();
  const q = (SC.q || "").trim().toLowerCase();
  const items = scItems(os, S.settings.scCat).filter(i => !q || (i.en + " " + i.ar + " " + i.chords.join(" ")).toLowerCase().indexOf(q) >= 0);
  const lab = scStateLabels();
  box.textContent = "";
  if (!items.length) {
    box.append(h("p", { class: "mute" }, t(q ? "sc.nomatch" : "sc.none")));
    return;
  }
  SC_CATS.forEach(c => {
    const g = items.filter(i => i.cat === c);
    if (!g.length) return;
    box.append(
      h("div", { class: "scgh" }, t("sc." + c)),
      h("div", { class: "tablewrap flat" }, h("table", { class: "sctable" }, h("tbody", null, g.map(i => h("tr", null,
        h("td", null, scLabel(i)),
        h("td", { class: "kc" }, i.chords.map((c2, j) => [j ? " " : null, scKeycaps(c2, os)])),
        h("td", { class: "stc" }, lab[scState(os, i.id)])))))));
  });
}

function renderShortcuts() {
  const st = S.settings;
  const os = scOS();
  const cheat = st.scView === "cheat";
  U.sccard = h("div", { class: "card sccard" });
  U.sclist = h("div", { class: "thist" });
  const apps = [{ v: "all", l: t("sc.all") }].concat(SC_CATS.map(c => ({ v: c, l: t("sc." + c) })));
  const search = h("input", { type: "search", class: "scq", dir: "auto", value: SC.q || "", placeholder: t("sc.search"), "aria-label": t("sc.search"), oninput: ev => { SC.q = ev.target.value; renderCheatSheet(); } });
  U.main.append(
    h("div", { class: "cfg" },
      seg([{ v: "practice", l: t("sc.practice") }, { v: "cheat", l: t("sc.cheat") }], st.scView, v => { st.scView = v; scheduleSave(); render(); }),
      seg([{ v: "win", l: t("sc.win") }, { v: "mac", l: t("sc.mac") }], os, v => { st.scOS = v; scheduleSave(); SC.last = null; scNext(); render(); }),
      cheat ? search : null),
    h("div", { class: "cfg" }, seg(apps, st.scCat, v => { st.scCat = v; scheduleSave(); SC.last = null; scNext(); render(); })),
    cheat ? null : U.sccard, U.sclist);
  if (!cheat && (!SC.item || !scItems(os, st.scCat).some(i => i.id === SC.item.id))) scNext();
  if (!cheat) renderShortcutCard();
  renderShortcutList();
}

export { SC_CATS, renderShortcuts, scItems, scMatch, scMode, scOnKey, scParse };
