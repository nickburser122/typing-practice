import { S, layoutInfo, nf, t } from "../core/state.js";
import { scheduleSave } from "../core/storage.js";
import { LAYOUT_BY_LANG } from "../data/layouts.js";
import { median } from "../engine/stats.js";
import { QUOTE_LENS, testBackspace, testChar, testHistory, testNetNow, testNew, testTick } from "../engine/test.js";
import { produceChars } from "../input/keys.js";
import { U, bdi, clearFade, glyph, go, h, pct, placeCaret, quietNote, render, typingFade } from "./dom.js";
import { hwNote, setFocused } from "./practice.js";
import { setSetting } from "./settings.js";
import { seg, spark } from "./stats.js";

function stopTick() {
  if (U.tick) {
    clearInterval(U.tick);
    U.tick = null;
  }
}

function langSeg() {
  const st = S.settings;
  return seg([{ v: "en", l: t("o.lang.en") }, { v: "ar", l: t("o.lang.ar") }], st.lang, v => {
    if (v === st.lang) return;
    U.memo[st.lang] = st.layout;
    setSetting("layout", U.memo[v] || LAYOUT_BY_LANG[v][0]);
    S.test = null;
    render();
  });
}

function setTestOpt(id, v) {
  S.settings[id] = v;
  scheduleSave();
  testNew();
  render();
}

function labelled(group, label) {
  group.setAttribute("aria-label", label);
  return group;
}

function ruleHint(st) {
  const bits = [t("tt.hint")];
  if (st.testDiff !== "normal") bits.push(t("tt.h." + st.testDiff));
  if (st.testStop !== "off") bits.push(t("tt.h." + st.testStop));
  if (!st.confident) bits.push(t("tt.h.back"));
  return bits.join(" ");
}

function renderTest() {
  const st = S.settings;
  if (!S.test || S.test.lid !== st.layout) testNew();
  const mode = st.testMode;
  const plain = mode === "time" || mode === "words";
  const amount = mode === "time"
    ? seg([15, 30, 60, 120].map(v => ({ v, l: nf(v) })), st.testTime, v => setTestOpt("testTime", v))
    : mode === "words"
      ? seg([10, 25, 50, 100].map(v => ({ v, l: nf(v) })), st.testWords, v => setTestOpt("testWords", v))
      : mode === "quote"
        ? labelled(seg(QUOTE_LENS.map(v => ({ v, l: v === "all" ? t("tt.lall") : t("tt.q" + v) })), st.testQuote, v => setTestOpt("testQuote", v)), t("tt.quote"))
        : null;
  const cfg = h("div", { class: "cfg" },
    langSeg(),
    seg([{ v: "time", l: t("tt.time") }, { v: "words", l: t("tt.words") }, { v: "quote", l: t("tt.quote") }, { v: "custom", l: t("tt.custom") }], mode, v => setTestOpt("testMode", v)),
    amount,
    plain ? seg([{ v: "200", l: t("tt.l200") }, { v: "1000", l: t("tt.l1000") }, { v: "all", l: t("tt.lall") }], st.testList, v => setTestOpt("testList", v)) : null,
    plain ? seg([{ v: true, l: t("tt.punct") }], st.testPunct, () => setTestOpt("testPunct", !st.testPunct), "toggle") : null,
    plain ? seg([{ v: true, l: t("tt.num") }], st.testNum, () => setTestOpt("testNum", !st.testNum), "toggle") : null,
    plain && layoutInfo().lang === "en" ? seg([{ v: true, l: t("s.caps") }], st.testCaps, () => setTestOpt("testCaps", !st.testCaps), "toggle") : null,
    plain && layoutInfo().lang !== "en" ? seg([{ v: true, l: t("tt.dia") }], st.testDia, () => setTestOpt("testDia", !st.testDia), "toggle") : null,
    labelled(seg(["normal", "expert", "master"].map(v => ({ v, l: t("tt.diff." + v) })), st.testDiff, v => setTestOpt("testDiff", v)), t("tt.diffLabel")),
    labelled(seg(["off", "letter", "word"].map(v => ({ v, l: t("tt.stop." + v) })), st.testStop, v => setTestOpt("testStop", v)), t("tt.stopLabel"))
  );
  U.tbody = h("div", { class: "tbody" });
  U.thist = h("div", { class: "thist" });
  U.tshown = null;
  U.hintEl = S.testOv ? null : h("p", { class: "hintline", "aria-live": "polite" }, ruleHint(st));
  U.main.append(...[S.testOv ? null : cfg, U.tbody, U.hintEl, U.thist].filter(Boolean));
  const hwt = hwNote();
  if (hwt) U.main.prepend(hwt);
  renderTestLive();
  renderTestHistory();
  U.tick = setInterval(tickTest, 100);
}

function renderTestLive() {
  const T = S.test;
  const lay = layoutInfo();
  U.tbody.textContent = "";
  if (!T.words.length) {
    U.tlive = null;
    U.tinner = null;
    U.tword = [];
    U.tbody.append(h("div", { class: "card tcard tempty" }, h("p", { class: "empty" }, t("tt.customEmpty")), h("div", { class: "acts" }, h("button", { type: "button", class: "btn go", onclick: () => go("free") }, t("tt.customGo")))));
    return;
  }
  U.tlive = h("div", { class: "tlive" });
  U.tinner = h("div", { class: "tw-inner" });
  U.ttyper = h("div", { class: "typer ttyper", tabindex: "0", role: "textbox", "aria-readonly": "true", "aria-label": t("a.typer"), dir: lay.lang === "ar" ? "rtl" : "ltr", lang: lay.lang }, U.tinner);
  const stage = h("div", { class: "stage", "data-focus": S.focused ? "1" : "0" }, U.ttyper, h("div", { class: "fh" }, h("span", null, t("click"))));
  U.tbody.append(h("div", { class: "card tcard" }, U.tlive, stage));
  U.tword = [];
  for (let i = 0; i < T.words.length; i++) appendTestWord(i);
  paintTestWord(0);
  updateTestLive();
}

function appendTestWord(i) {
  const w = S.test.words[i];
  const el = h("span", { class: "tw" });
  const letters = w.split("").map(ch => {
    const sp = document.createElement("span");
    sp.className = "c";
    sp.textContent = ch;
    el.append(sp);
    return sp;
  });
  const sp = document.createElement("span");
  sp.className = "c sp";
  sp.textContent = " ";
  el.append(sp);
  U.tinner.append(el);
  U.tword[i] = { el, letters, sp, extras: [] };
}

function paintTestWord(i) {
  const T = S.test;
  const o = U.tword[i];
  if (!o) return;
  const w = T.words[i];
  const cur = i === T.wi && !T.done;
  const typed = i < T.wi ? T.committed[i] : i === T.wi ? T.typed : null;
  o.extras.forEach(e => e.remove());
  o.extras = [];
  for (let j = 0; j < w.length; j++) {
    let c = "c";
    if (typed != null && j < typed.length) c += typed[j] === w[j] ? " d" : " x";
    else if (typed != null && i < T.wi) c += " m";
    else if (cur && typed != null && j === typed.length) c += " cur";
    o.letters[j].className = c;
  }
  if (typed != null && typed.length > w.length) {
    for (let j = w.length; j < typed.length; j++) {
      const s = document.createElement("span");
      s.className = "c ex";
      s.textContent = typed[j];
      o.sp.before(s);
      o.extras.push(s);
    }
  }
  o.sp.className = "c sp" + (cur && typed.length >= w.length ? " cur" : "");
  if (cur) placeCaret(U.tinner, typed != null && typed.length < w.length ? o.letters[typed.length] : o.sp, layoutInfo().lang === "ar");
}

function scrollTest() {
  const o = U.tword[S.test.wi];
  if (!o || !U.tinner) return;
  const lh = o.el.offsetHeight || 1;
  const shift = Math.max(0, o.el.offsetTop - lh);
  U.tinner.style.transform = "translateY(" + -shift + "px)";
}

function updateTestLive() {
  const T = S.test;
  const el = U.tlive;
  if (!el || !T) return;
  el.textContent = "";
  const now = performance.now();
  let main;
  if (T.mode === "time") {
    const left = T.running ? Math.max(0, Math.ceil((T.start + T.amt * 1000 - now) / 1000)) : T.amt;
    main = bdi(nf(left));
  } else main = bdi(nf(T.wi) + " / " + nf(T.words.length));
  el.append(h("span", { class: "tbig" }, main));
  if (S.settings.liveWpm && T.running) {
    const mins = (now - T.start) / 60000;
    if (mins > 0.04) el.append(h("span", { class: "tsub" }, bdi(nf(testNetNow(T) / 5 / mins) + " " + t("wpm"))));
  }
  if (S.settings.liveAcc && T.strokes > 0) el.append(h("span", { class: "tsub" }, bdi(pct((T.strokes - T.bad) / T.strokes))));
}

function tickTest() {
  const T = S.test;
  if (S.view !== "test" || !T) return;
  testTick(performance.now());
  if (T.done) {
    if (U.tshown !== T) renderTestResult();
  } else updateTestLive();
}

function afterTestKey(prevWi) {
  const T = S.test;
  while (U.tword.length < T.words.length) appendTestWord(U.tword.length);
  if (prevWi !== T.wi) paintTestWord(prevWi);
  paintTestWord(T.wi);
  scrollTest();
  updateTestLive();
  if (T.done && U.tshown !== T) renderTestResult();
}

function newTest(repeat) {
  testNew(repeat);
  render();
  window.scrollTo(0, 0);
}

function onTestKey(e) {
  const T = S.test;
  if (!T) return;
  if (e.key === "Escape") {
    e.preventDefault();
    const now = performance.now();
    if (T.running && !T.done && T.strokes > 0 && !(U.escAt && now - U.escAt < 2000)) {
      U.escAt = now;
      quietNote("tt.escAsk");
      return;
    }
    U.escAt = 0;
    newTest(false);
    return;
  }
  if (!T.words.length) return;
  if (T.done) {
    if (e.key === "Enter" && !(e.target && e.target.tagName === "BUTTON")) {
      e.preventDefault();
      newTest(false);
    }
    return;
  }
  if (e.key === "Backspace") {
    e.preventDefault();
    const before = T.wi;
    testBackspace(e.ctrlKey || e.altKey);
    if (before !== T.wi) paintTestWord(before);
    paintTestWord(T.wi);
    if (before !== T.wi) {
      scrollTest();
      updateTestLive();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const out = produceChars(e);
  if (!out) return;
  if (!S.focused) setFocused(true);
  if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.blur();
  e.preventDefault();
  if (e.repeat) return;
  const prev = T.wi;
  const ts = e.timeStamp || performance.now();
  typingFade();
  for (const ch of out.split("")) testChar(ch, ts);
  afterTestKey(prev);
}

function speedChart(series) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 560;
  const H = 190;
  const L = 38;
  const R = 10;
  const Tp = 10;
  const B = 28;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "chart");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("tr.chart"));
  const mk = (tag, attrs, text) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  const rawMax = Math.max.apply(null, series.map(p => Math.max(p.wpm, p.raw || 0)).concat([10]));
  const step = rawMax > 120 ? 40 : rawMax > 60 ? 20 : 10;
  const ymax = Math.ceil((rawMax * 1.05) / step) * step;
  const xmax = series[series.length - 1].s;
  const x = s => L + (s / xmax) * (W - L - R);
  const y = v => H - B - (v / ymax) * (H - B - Tp);
  for (let v = 0; v <= ymax; v += ymax / 2) {
    mk("line", { class: "gl", x1: L, x2: W - R, y1: y(v), y2: y(v) });
    mk("text", { class: "ax", x: L - 8, y: y(v) + 4, "text-anchor": "end" }, nf(v));
  }
  const xs = [0, xmax / 2, xmax];
  xs.forEach((s, i) => mk("text", { class: "ax", x: x(s), y: H - 8, "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle" }, nf(s, s % 1 ? 1 : 0) + (i === 2 ? " " + t("tt.s") : "")));
  const rawPts = series.filter(p => p.raw != null);
  if (rawPts.length > 1) mk("polyline", { class: "lr", points: rawPts.map(p => x(p.s).toFixed(1) + "," + y(p.raw).toFixed(1)).join(" ") });
  const pts = [[0, 0]].concat(series.map(p => [p.s, p.wpm])).filter((p, i) => i === 0 || p[1] > 0 || i > 1);
  if (pts.length > 1) mk("polyline", { class: "lw", points: pts.map(p => x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1)).join(" ") });
  series.forEach(p => {
    if (p.err > 0) mk("circle", { class: "er", cx: x(p.s), cy: H - B - 8, r: 3 });
  });
  return svg;
}

function renderTestResult() {
  clearFade();
  const T = S.test;
  const r = T.res;
  U.tshown = T;
  U.tbody.textContent = "";
  if (!r) return;
  const acts = T.place
    ? h("div", { class: "acts" },
      h("button", { type: "button", class: "btn go", onclick: () => go("practice") }, t("pl.go")),
      h("span", { class: "msg" }, t("pl.keys") + ": ", bdi(nf(r.placed))))
    : h("div", { class: "acts" },
      h("button", { type: "button", class: "btn go", onclick: () => newTest(false) }, t("tr.next")),
      h("button", { type: "button", class: "btn", onclick: () => newTest(true) }, t("tr.repeat")),
      r.custom ? h("span", { class: "msg" }, t("tr.customNote")) : r.fed ? h("span", { class: "msg" }, t("tr.fed")) : null);
  U.tbody.append(resultCard(r, layoutInfo().lang, acts, true));
  renderTestHistory();
}

function resultCard(r, lang, acts, showTime) {
  let pbLine = null;
  if (r.failed) pbLine = h("div", { class: "pb fail" }, t(r.failed === "master" ? "tr.failMaster" : "tr.failExpert"), " ", t("tr.failNote"));
  else if (r.isPb) pbLine = h("div", { class: "pb" }, t("tr.pbNew"));
  else if (r.pbPrev != null) pbLine = h("div", { class: "pb" }, t("tr.pb") + ": ", bdi(nf(r.pbPrev) + " " + t("wpm")));
  const c = r.chars;
  const stat = (label, val, sub, sm) => h("div", { class: "stat" }, h("div", { class: "sl" }, label), h("div", { class: sm ? "sv sm" : "sv" }, val), sub ? h("div", { class: "ss" }, sub) : null);
  const chips = (items, fmt) => h("div", { class: "chips" }, items.map(x => h("span", { class: "kchip" }, h("b", { lang }, glyph(x.c)), h("span", null, bdi(fmt(x))))));
  const keysBlock = r.slow.length || r.miss.length
    ? h("div", { class: "res-keys" },
      r.slow.length ? h("div", null, h("div", { class: "sl" }, t("tr.slow")), chips(r.slow, x => nf(x.m) + " " + t("ms"))) : null,
      r.miss.length ? h("div", null, h("div", { class: "sl" }, t("tr.miss")), chips(r.miss, x => "× " + nf(x.e))) : null)
    : h("p", { class: "mute" }, t("tr.noKeys"));
  return h("div", { class: "card rcard" },
    h("div", { class: "res-top" },
      h("div", { class: "heroes" },
        h("div", { class: "hero" }, h("div", { class: "sl" }, t("wpm")), h("div", { class: "hv" }, bdi(nf(r.wpm))), pbLine),
        h("div", { class: "hero" }, h("div", { class: "sl" }, t("tr.acc")), h("div", { class: "hv" }, bdi(pct(r.acc))))),
      h("div", { class: "chartbox" }, speedChart(r.series))),
    h("div", { class: "stats" },
      stat(t("tr.raw"), bdi(nf(r.raw) + " " + t("wpm"))),
      stat(t("tr.cons"), bdi(pct(r.cons / 100))),
      showTime ? stat(t("tr.time"), bdi(nf(r.dur, r.dur % 1 ? 1 : 0) + " " + t("tt.s"))) : null,
      stat(t("tr.chars"), bdi([c.ok, c.bad, c.extra, c.miss].map(v => nf(v)).join(" / ")), t("tr.chars.h"), true)),
    keysBlock,
    acts);
}

function historyCard(hs, title) {
  if (!hs.length) return null;
  const last = hs.slice(-20);
  const best = Math.max.apply(null, hs.map(x => x.wpm));
  return h("div", { class: "card hist" },
    h("div", { class: "hh" },
      h("span", { class: "hl" }, title),
      h("span", { class: "hs" }, t("tr.pb") + ": ", bdi(nf(best) + " " + t("wpm")), " · " + t("tr.median") + ": ", bdi(nf(median(last.map(x => x.wpm))) + " " + t("wpm")))),
    hs.length > 1 ? spark(hs.slice(-40).map(x => x.wpm)) : null);
}

function renderTestHistory() {
  const box = U.thist;
  if (!box) return;
  box.textContent = "";
  const card = historyCard(testHistory(), t("tr.hist"));
  if (card) box.append(card);
}

export { historyCard, langSeg, onTestKey, renderTest, resultCard, stopTick };
