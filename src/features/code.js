import { S, nf, t } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { CODE_NAMES } from "../data/code-sets.js";
import { LAYOUTS } from "../data/layouts.js";
import { codeHistory, codeSid, finishCode, newCodeLesson } from "../engine/code.js";
import { T } from "../i18n/strings.js";
import { U, bdi, h, pct, render } from "../ui/dom.js";
import { hwNote } from "../ui/practice.js";
import { seg } from "../ui/stats.js";
import { historyCard, resultCard } from "../ui/test.js";
import { caretLearn, paint, renderTyper } from "../ui/typer.js";

function codeSeconds() {
  const n = Number(S.settings.codeTimer);
  return isFinite(n) && n > 0 ? n : 0;
}

function codeClockLabel(left) {
  const sec = codeSeconds();
  if (!sec) return "";
  return nf(left === undefined ? sec : Math.max(0, left)) + " " + t("tt.s");
}

function updateClock(left) {
  const el = document.getElementById("codeclock");
  if (el) el.textContent = codeClockLabel(left);
}

function codeClockStart(now) {
  if (!codeSeconds() || S.codeClock) return false;
  S.codeClock = { t0: now, dur: codeSeconds() * 1000, h: null };
  return true;
}

function codeClockLeft(now) {
  const c = S.codeClock;
  return c ? Math.max(0, Math.ceil((c.dur - (now - c.t0)) / 1000)) : 0;
}

function stopCodeClock() {
  if (S.codeClock && S.codeClock.h) clearInterval(S.codeClock.h);
  S.codeClock = null;
}

function tickCodeClock() {
  if (!S.codeClock) return;
  const now = performance.now();
  updateClock(codeClockLeft(now));
  if (now - S.codeClock.t0 >= S.codeClock.dur) codeRoundEnd(now);
}

function armCodeClock() {
  if (S.codeClock && !S.codeClock.h) S.codeClock.h = setInterval(tickCodeClock, 250);
}

function codeRoundEnd(now) {
  const c = S.codeClock;
  if (!c) return;
  stopCodeClock();
  const l = S.lesson;
  if (l && l.code && !l.done && l.idx > 1) {
    l.done = true;
    const dur = Math.max(1, now - l.start);
    finishCode(l, dur);
    S.codeRes.dur = c.dur / 1000;
    scheduleSave();
  }
  newCodeLesson();
  if (U.typer) {
    renderTyper();
    renderCodeRes();
    updateClock();
  }
}

function codeLabel(id) {
  if (id === "mix") return t("code.mix");
  return T["code.set." + id] ? t("code.set." + id) : CODE_NAMES[id];
}

function resultNodes(r) {
  return [bdi(nf(r.wpm) + " " + t("wpm")), " · ", bdi(pct(r.acc))];
}

function renderCodeRes() {
  const box = U.res;
  if (!box) return;
  box.textContent = "";
  const r = S.codeRes;
  if (!r || !S.settings.result) return;
  box.append(resultCard(r, "en", null, S.settings.codeTimer !== "off"));
  const hist = historyCard(codeHistory(), t("code.hist"));
  if (hist) box.append(hist);
}

const CODE_GROUPS = {
  lang: ["py", "r", "js", "ts", "cpp", "c", "rust", "go", "java", "cs", "php", "ruby", "swift", "kotlin"],
  shell: ["sh", "git", "commit", "docker", "names"],
  data: ["sql", "yaml", "json", "html", "css", "md", "regex"]
};

function codeOptions() {
  const out = [{ v: "mix", l: t("code.mix") }];
  Object.keys(CODE_GROUPS).forEach(g => CODE_GROUPS[g].forEach(id => out.push({ v: id, l: codeLabel(id), g: t("code.g." + g) })));
  return out;
}

let ddCount = 0;

function dropdown(opts, value, onPick, label) {
  const uid = "dd" + ++ddCount;
  let cur = opts.find(o => o.v === value) || opts[0];
  let act = 0;
  const caption = h("span", null, h("bdi", null, cur.l));
  const btn = h("button", { type: "button", class: "dd", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": label }, caption, h("span", { class: "ddc", "aria-hidden": "true" }));
  const list = h("div", { class: "ddl", role: "listbox", tabindex: "-1", "aria-label": label, hidden: true });
  const items = [];
  let group = null;
  opts.forEach((o, i) => {
    if (o.g && o.g !== group) {
      group = o.g;
      list.append(h("div", { class: "ddg", role: "presentation" }, o.g));
    }
    const it = h("div", { class: "ddo", role: "option", id: uid + "-" + i, "aria-selected": o.v === cur.v ? "true" : "false" }, h("bdi", null, o.l));
    it.addEventListener("click", () => pick(i));
    items.push(it);
    list.append(it);
  });
  const wrap = h("div", { class: "ddw" }, btn, list);
  const away = e => { if (!wrap.contains(e.target)) close(false); };
  function mark(i) {
    act = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((it, k) => it.classList.toggle("act", k === act));
    list.setAttribute("aria-activedescendant", items[act].id);
    items[act].scrollIntoView({ block: "nearest" });
  }
  function open() {
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    mark(Math.max(0, opts.indexOf(cur)));
    list.focus();
    document.addEventListener("pointerdown", away);
  }
  function close(refocus) {
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", away);
    if (refocus) btn.focus();
  }
  function pick(i) {
    cur = opts[i];
    caption.textContent = "";
    caption.append(h("bdi", null, cur.l));
    items.forEach((it, k) => it.setAttribute("aria-selected", k === i ? "true" : "false"));
    close(true);
    onPick(cur.v);
  }
  btn.addEventListener("click", () => (list.hidden ? open() : close(true)));
  btn.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (list.hidden) open();
    }
  });
  list.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "ArrowDown") mark(act + 1);
    else if (e.key === "ArrowUp") mark(act - 1);
    else if (e.key === "Home") mark(0);
    else if (e.key === "End") mark(items.length - 1);
    else if (e.key === "Enter" || e.key === " ") pick(act);
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") {
      close(false);
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const q = e.key.toLowerCase();
      const n = opts.length;
      for (let k = 1; k <= n; k++) {
        const j = (act + k) % n;
        if (opts[j].l.toLowerCase().indexOf(q) === 0) {
          mark(j);
          break;
        }
      }
    } else return;
    e.preventDefault();
  });
  return wrap;
}

function renderCode() {
  const st = S.settings;
  if (!S.lesson || !S.lesson.code || S.lesson.sid !== codeSid()) newCodeLesson();
  U.typer = h("div", { class: "typer code", id: "typer", tabindex: "0", role: "textbox", "aria-readonly": "true", "aria-label": t("a.typer") });
  const stage = h("div", { class: "stage", "data-focus": S.focused ? "1" : "0" }, U.typer, h("div", { class: "fh" }, h("span", null, t("click"))));
  const sel = dropdown(codeOptions(), st.codeSet, v => {
    st.codeSet = v;
    scheduleSave();
    S.codeRecent = [];
    newCodeLesson();
    render();
  }, t("code.set"));
  U.res = h("div", { class: "coderes", id: "coderes", "aria-live": "polite" });
  U.main.append(...[
    h("div", { class: "cfg" }, sel, seg(["off", "after", "15", "30", "60"].map(v => ({ v, l: v === "off" || v === "after" ? t("code.t." + v) : nf(Number(v)) + " " + t("tt.s") })), st.codeTimer, v => {
      st.codeTimer = v;
      scheduleSave();
      stopCodeClock();
      render();
    }), h("span", { class: "clock", id: "codeclock", "aria-live": "off" }, codeClockLabel())),
    LAYOUTS[st.layout].lang === "ar" ? h("p", { class: "msg" }, t("code.layoutNote")) : null,
    h("div", { class: "card pcard" }, stage),
    U.res
  ].filter(Boolean));
  const hw = hwNote();
  if (hw) U.main.prepend(hw);
  renderTyper();
  renderCodeRes();
}

const codeHooks = {
  painted(i, j) {
    paint(i);
    paint(j);
    caretLearn();
    if (codeClockStart(performance.now())) armCodeClock();
  },
  finished() {
    newCodeLesson();
    if (U.typer) {
      renderTyper();
      renderCodeRes();
    }
  }
};

export {
  CODE_GROUPS, codeClockLabel, codeClockLeft, codeClockStart, codeHooks, codeLabel, codeOptions,
  codeRoundEnd, dropdown, renderCode, renderCodeRes, resultNodes, stopCodeClock, updateClock
};
