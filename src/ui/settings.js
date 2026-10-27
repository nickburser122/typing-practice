import { VERSION } from "../core/base.js";
import { PREVIEW, SCHEMA, SCHEMA_BY_ID, defaultSettings } from "../core/settings.js";
import { S, nf, refreshDerived, t, uiLang } from "../core/state.js";
import {
  CUSTOM_CAP, applyImport, buildExport, customBytes, customText, dataFootprint, eraseAll, saveNow,
  scheduleSave
} from "../core/storage.js";
import { LAYOUTS, LAYOUT_BY_LANG } from "../data/layouts.js";
import { newLesson } from "../engine/tracks.js";
import { EXTRAS, extrasRow, startRow, stepsRow } from "../features/steps.js";
import { T } from "../i18n/strings.js";
import { U, applyChrome, h, quietNote, render, renderNav } from "./dom.js";

const BASIC = ["lang", "layout", "inputMode", "targetWpm", "targetAcc", "wordLevel", "theme", "font", "keyboard"];

const REGEN = ["wordLevel", "reviewRate", "digitSource", "lang", "layout", "order", "startKeys", "targetWpm", "targetAcc", "minSamples", "focus", "text", "lessonWords", "wordMin", "wordMax", "caps", "digits", "punct", "dia", "extraRate", "progression", "inputMode", "pause"];

function setSetting(id, v) {
  const st = S.settings;
  st[id] = v;
  if (id === "lang") st.layout = LAYOUT_BY_LANG[v][0];
  if (id === "layout") st.lang = LAYOUTS[v].lang;
  if (id === "wordMin" && st.wordMax < v) st.wordMax = v;
  if (id === "wordMax" && st.wordMin > v) st.wordMin = v;
  refreshDerived();
  applyChrome();
  scheduleSave();
  if (REGEN.indexOf(id) < 0) return;
  const cur = S.lesson;
  if (id !== "lang" && id !== "layout" && cur && !cur.done && cur.idx > 0) quietNote("note.nextLesson");
  else newLesson();
}

function optLabel(id, v) {
  if (id === "lang") return t("o.lang." + v);
  return t("o." + id + "." + v);
}

function fmtRange(r, v) {
  if (r.id === "lineHeight") return nf(v, 1);
  if (r.id === "fontSize") return nf(v) + " px";
  return nf(v);
}

function rowLabel(id, lab) {
  const k = T["k." + id];
  return (lab + (k ? " " + k[0] + " " + k[1] : "")).toLowerCase();
}

function settingRow(r) {
  const st = S.settings;
  const lab = t("s." + r.id);
  const row = h("div", { class: "srow", "data-sid": r.id, "data-label": rowLabel(r.id, lab) });
  const left = h("div", { class: "lab" }, h("div", null, h("div", null, lab), r.help ? h("div", { class: "help" }, t("s." + r.id + ".h")) : null, r.when ? h("div", { class: "help why-off", hidden: true }, t("s." + r.id + ".off")) : null));
  const ctl = h("div", { class: "ctl" });
  const rst = h("button", { type: "button", class: "rst", onclick: () => { setSetting(r.id, r.def); if (r.id === "ui" || r.id === "numerals" || r.id === "theme") renderSettings(); else syncRows(); } }, t("d.reset"));
  let control = null;
  let update = () => {};
  if (r.type === "select") {
    const isFont = r.id === "font";
    const wrap = h("div", { class: isFont ? "chips" : "seg", role: "radiogroup", "aria-label": lab });
    const build = () => {
      let opts;
      if (r.id === "lang") opts = ["en", "ar"].map(v => [v, optLabel("lang", v)]);
      else if (r.id === "layout") opts = LAYOUT_BY_LANG[st.lang].map(v => [v, LAYOUTS[v].name]);
      else opts = r.opts.map(v => [v, optLabel(r.id, v)]);
      const sig = opts.map(o => o[0]).join("|");
      if (wrap.getAttribute("data-sig") !== sig) {
        wrap.setAttribute("data-sig", sig);
        wrap.textContent = "";
        opts.forEach(o => {
          const b = h("button", { type: "button", role: "radio", "data-v": o[0], onclick: () => {
            setSetting(r.id, o[0]);
            if (r.id === "layout" || r.id === "lang") renderSettings();
            else syncRows();
          } }, o[1]);
          if (isFont) b.setAttribute("data-f", o[0]);
          wrap.append(b);
        });
      }
      wrap.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", String(b.getAttribute("data-v") === st[r.id])));
    };
    build();
    control = wrap;
    update = build;
  } else if (r.type === "seg") {
    const wrap = h("div", { class: "seg", role: "radiogroup", "aria-label": lab });
    const btns = r.opts.map(v => {
      const b = h("button", { type: "button", role: "radio", "data-v": v, onclick: () => { setSetting(r.id, v); if (r.id === "ui" || r.id === "numerals") renderSettings(); else syncRows(); } }, optLabel(r.id, v));
      wrap.append(b);
      return b;
    });
    update = () => btns.forEach(b => b.setAttribute("aria-checked", String(b.getAttribute("data-v") === st[r.id])));
    update();
    control = wrap;
  } else if (r.type === "switch") {
    const b = h("button", { type: "button", class: "sw", role: "switch", "aria-label": lab, onclick: () => { setSetting(r.id, !st[r.id]); syncRows(); } });
    update = () => b.setAttribute("aria-checked", String(!!st[r.id]));
    update();
    control = b;
  } else if (r.type === "range") {
    const out = h("span", { class: "val" });
    const inp = h("input", { type: "range", id: "set-" + r.id, min: r.min, max: r.max, step: r.step, "aria-label": lab, oninput: () => {
      setSetting(r.id, Number(inp.value));
      syncRows();
    } });
    update = () => {
      inp.value = String(st[r.id]);
      inp.style.setProperty("--p", (((st[r.id] - r.min) / (r.max - r.min)) * 100).toFixed(1) + "%");
      out.textContent = fmtRange(r, st[r.id]);
    };
    update();
    control = h("span", { style: "display:inline-flex;align-items:center;gap:10px" }, inp, out);
  }
  ctl.append(rst, control);
  row.append(left, ctl);
  if (r.id === "font") row.append(h("div", { class: "pv", "aria-hidden": "true", dir: st.lang === "ar" ? "rtl" : "ltr", lang: st.lang }, PREVIEW[st.lang]));
  U.rows.push({ row, rst, update, r });
  return row;
}

function syncRows() {
  U.rows.forEach(o => {
    const r = o.r;
    const st = S.settings;
    o.update();
    o.rst.hidden = st[r.id] === r.def;
    const off = r.when ? !r.when(st) : false;
    o.row.classList.toggle("off", off);
    o.row.classList.toggle("chg", st[r.id] !== r.def);
    if (r.when) {
      o.row.querySelectorAll("button, input").forEach(c => { c.disabled = off; });
      const why = o.row.querySelector(".why-off");
      if (why) why.hidden = !off;
    }
    o.row.hidden = o.row.getAttribute("data-filtered") === "1";
  });
}

function applyFilter(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll(".sec").forEach(sec => {
    let visible = 0;
    sec.querySelectorAll(".srow").forEach(row => {
      const hit = !q || (row.getAttribute("data-label") || "").indexOf(q) >= 0;
      row.setAttribute("data-filtered", hit ? "0" : "1");
      if (row.getAttribute("data-label") !== null) row.hidden = !hit;
      if (!row.hidden) visible++;
    });
    sec.hidden = visible === 0;
  });
  const adv = document.querySelector("details.adv");
  if (adv) {
    const any = Array.prototype.some.call(adv.querySelectorAll(".sec"), s => !s.hidden);
    adv.hidden = !any;
    if (q && any) adv.open = true;
  }
}

function confirmBtn(label, action) {
  const b = h("button", { type: "button", class: "btn warn" }, label);
  let timer = null;
  b.addEventListener("click", () => {
    if (b.classList.contains("sure")) {
      clearTimeout(timer);
      action();
      return;
    }
    b.classList.add("sure");
    b.textContent = t("d.sure");
    timer = setTimeout(() => {
      b.classList.remove("sure");
      b.textContent = label;
    }, 4000);
  });
  return b;
}

function copyText(text, ta, msg) {
  const ok = () => { msg.className = "msg"; msg.textContent = t("d.copied"); };
  const fallback = () => {
    ta.focus();
    ta.select();
    try { if (document.execCommand("copy")) ok(); } catch (err) { msg.textContent = ""; }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
  else fallback();
}

function saveFile(text, dl) {
  if (dl) {
    dl.save({ filename: "tarq-export.json", data: text }).catch(() => {});
    return;
  }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tarq-export.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function dataSection() {
  const sec = h("section", { class: "sec" });
  sec.append(h("h2", null, t("sec.data")));
  const inViewer = !!(window.claude && typeof window.claude.use === "function");
  const storageVal = h("span", { class: "msg" });
  const refreshStorage = () => {
    if (S.storage === "memory") {
      storageVal.textContent = t("d.mem");
      return;
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => { storageVal.textContent = p ? t("d.persist") : t("d.temp"); }, () => { storageVal.textContent = t("d.temp"); });
    } else storageVal.textContent = t("d.temp");
  };
  refreshStorage();
  const ask = h("button", { type: "button", class: "btn", onclick: () => {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(refreshStorage, refreshStorage);
  } }, t("d.ask"));
  sec.append(h("p", { class: "note" }, t("d.note")));
  const fp = dataFootprint();
  const loc = (uiLang() === "ar" ? "ar" : "en") + (S.settings.numerals === "arabic" ? "-u-nu-arab" : "-u-nu-latn");
  const when = fp.saved ? new Date(fp.saved).toLocaleDateString(loc, { year: "numeric", month: "short", day: "numeric" }) : t("d.never");
  const usage = nf(fp.bytes / 1024, 1) + " " + t("d.kb") + " · " + t("d.custom") + ": " + nf(customBytes(customText())) + " / " + nf(CUSTOM_CAP) + " " + t("d.bytes") + " · " + nf(fp.lessons) + " " + t("d.nLessons") + " · " + nf(fp.tests) + " " + t("d.nTests") + " · " + t("d.lastSave") + ": " + when;
  sec.append(h("div", { class: "srow", "data-label": t("d.usage").toLowerCase() }, h("div", { class: "lab" }, t("d.usage")), h("div", { class: "ctl" }, h("span", { class: "val" }, usage))));
  sec.append(h("div", { class: "srow", "data-label": t("d.storage").toLowerCase() }, h("div", { class: "lab" }, t("d.storage")), h("div", { class: "ctl" }, storageVal, ask)));

  const exportPanel = h("div", { class: "panel", hidden: true });
  const importPanel = h("div", { class: "panel", hidden: true });
  const showExport = full => {
    importPanel.hidden = true;
    exportPanel.hidden = false;
    exportPanel.textContent = "";
    const text = JSON.stringify(buildExport(full), null, 2);
    const ta = h("textarea", { readonly: true, "aria-label": t("d.export"), value: text });
    ta.value = text;
    const msg = h("span", { class: "msg", "aria-live": "polite" });
    const acts = h("div", { class: "acts" }, h("button", { type: "button", class: "btn go", onclick: () => copyText(text, ta, msg) }, t("d.copy")));
    let dl = null;
    const saveBtn = h("button", { type: "button", class: "btn", hidden: true, onclick: () => saveFile(text, dl) }, t("d.save"));
    if (inViewer) {
      window.claude.use("downloads").then(d => {
        if (d) {
          dl = d;
          saveBtn.hidden = false;
        }
      }, () => {});
    } else saveBtn.hidden = false;
    acts.append(saveBtn, msg);
    exportPanel.append(ta, acts);
  };
  const showImport = () => {
    exportPanel.hidden = true;
    importPanel.hidden = false;
    importPanel.textContent = "";
    const ta = h("textarea", { "aria-label": t("d.paste"), placeholder: t("d.paste") });
    const msg = h("span", { class: "msg", "aria-live": "polite" });
    const file = h("input", { type: "file", accept: ".json,application/json", class: "sr", id: "import-file", onchange: () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { ta.value = String(rd.result || ""); };
      rd.readAsText(f);
    } });
    const apply = h("button", { type: "button", class: "btn go", onclick: () => {
      if (applyImport(ta.value)) {
        newLesson();
        S.lastResult = null;
        renderSettings();
        const m = document.getElementById("import-msg");
        if (m) m.textContent = t("d.done");
      } else {
        msg.className = "msg bad";
        msg.textContent = t("d.bad");
      }
    } }, t("d.apply"));
    importPanel.append(ta, h("div", { class: "acts" }, h("label", { class: "btn", for: "import-file", style: "display:inline-flex;align-items:center;cursor:pointer" }, t("d.file")), file, apply, msg));
  };
  sec.append(
    h("div", { class: "srow", "data-label": t("d.export").toLowerCase() }, h("div", { class: "lab" }, t("d.export")), h("div", { class: "dataactions" },
      h("button", { type: "button", class: "btn", onclick: () => showExport(false) }, t("d.exportS")),
      h("button", { type: "button", class: "btn", onclick: () => showExport(true) }, t("d.exportA")))),
    exportPanel,
    h("div", { class: "srow", "data-label": t("d.import").toLowerCase() }, h("div", { class: "lab" }, t("d.import"), h("span", { id: "import-msg", class: "msg" })), h("div", { class: "dataactions" }, h("button", { type: "button", class: "btn", onclick: showImport }, t("d.import")))),
    importPanel,
    h("div", { class: "srow", "data-label": t("d.resetStats").toLowerCase() }, h("div", { class: "lab" }, t("d.resetStats")), h("div", { class: "dataactions" }, confirmBtn(t("d.resetStats"), () => {
      S.data = { v: VERSION, layouts: {}, lessons: [], tests: [], code: [], sc: {}, days: {}, pbs: {} };
      S.lastResult = null;
      S.test = null;
      saveNow();
      newLesson();
      renderSettings();
    }))),
    h("div", { class: "srow", "data-label": t("d.resetSettings").toLowerCase() }, h("div", { class: "lab" }, t("d.resetSettings")), h("div", { class: "dataactions" }, confirmBtn(t("d.resetSettings"), () => {
      S.settings = defaultSettings();
      refreshDerived();
      saveNow();
      newLesson();
      applyChrome();
      render();
    }))),
    h("div", { class: "srow", "data-label": t("d.eraseAll").toLowerCase() }, h("div", { class: "lab" }, t("d.eraseAll")), h("div", { class: "dataactions" }, confirmBtn(t("d.eraseAll"), () => {
      eraseAll();
      S.lastResult = null;
      S.test = null;
      S.sess = null;
      S.recent = [];
      newLesson();
      render();
    })))
  );
  return sec;
}

function renderSettings() {
  const prevScroll = window.scrollY;
  const prevFocus = document.activeElement && document.activeElement.closest ? document.activeElement.closest("[data-sid]") : null;
  const focusId = prevFocus ? prevFocus.getAttribute("data-sid") : null;
  const q = document.getElementById("filter") ? document.getElementById("filter").value : "";
  U.rows = [];
  applyChrome();
  renderNav();
  U.main.textContent = "";
  const wrap = h("div", { class: "settings" });
  wrap.append(h("input", { class: "search", id: "filter", type: "search", placeholder: t("d.filter"), "aria-label": t("d.filter"), value: q, oninput: ev => applyFilter(ev.target.value) }));
  const main = h("section", { class: "sec" }, h("h2", null, t("sec.main")));
  BASIC.forEach(id => main.append(settingRow(SCHEMA_BY_ID[id])));
  main.append(extrasRow(), startRow(), stepsRow());
  wrap.append(main);
  const adv = h("details", { class: "adv" }, h("summary", null, t("sec.adv")));
  adv.open = !!U.advOpen;
  adv.addEventListener("toggle", () => { U.advOpen = adv.open; });
  ["practice", "rules", "text", "test", "display"].forEach(sec => {
    const rows = SCHEMA.filter(r => r.sec === sec && !r.hidden && BASIC.indexOf(r.id) < 0 && EXTRAS.indexOf(r.id) < 0);
    if (!rows.length) return;
    const s = h("section", { class: "sec" }, h("h3", null, t("sec." + sec)));
    rows.forEach(r => s.append(settingRow(r)));
    adv.append(s);
  });
  wrap.append(adv, dataSection());
  U.main.append(wrap);
  syncRows();
  if (q) applyFilter(q);
  window.scrollTo(0, prevScroll);
  if (focusId) {
    const el = document.querySelector('[data-sid="' + focusId + '"] select, [data-sid="' + focusId + '"] [aria-checked="true"], [data-sid="' + focusId + '"] button.sw, [data-sid="' + focusId + '"] input');
    if (el) el.focus({ preventScroll: true });
  }
}

export { applyFilter, confirmBtn, renderSettings, rowLabel, setSetting, settingRow, syncRows };
