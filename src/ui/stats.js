import { S, layoutInfo, nf, t } from "../core/state.js";
import { CLASS_ORDER } from "../engine/mix.js";
import { activeKeys } from "../engine/order.js";
import { keyModel, needOf, statusOf } from "../engine/skill.js";
import {
  allCharsOfLayout, charStat, errRate, layoutData, legacyChars, median, mergedStat, slowestInto
} from "../engine/stats.js";
import { stallInfo } from "../engine/tracks.js";
import { U, bdi, clamp01, glyph, h, pct, render } from "./dom.js";
import { renderProgress } from "./progress.js";
import { buildKeyboard, iso } from "./typer.js";

function spark(vals, target, rel) {
  const W = 240;
  const H = 44;
  const pad = 4;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("aria-hidden", "true");
  if (!vals.length) return svg;
  let lo = 0;
  let max = Math.max(Math.max.apply(null, vals), target || 0) * 1.1 || 1;
  if (rel) {
    lo = Math.min.apply(null, vals);
    max = Math.max.apply(null, vals);
    if (max - lo < 0.02) {
      lo -= 0.01;
      max += 0.01;
    }
  }
  const y = v => H - pad - ((v - lo) / (max - lo)) * (H - 2 * pad);
  const x = i => (vals.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (vals.length - 1));
  if (target) {
    const tl = document.createElementNS(NS, "line");
    tl.setAttribute("class", "tg");
    tl.setAttribute("x1", "0");
    tl.setAttribute("x2", String(W));
    tl.setAttribute("y1", String(y(target)));
    tl.setAttribute("y2", String(y(target)));
    svg.append(tl);
  }
  if (vals.length > 1) {
    const pl = document.createElementNS(NS, "polyline");
    pl.setAttribute("class", "ln");
    pl.setAttribute("points", vals.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" "));
    svg.append(pl);
  }
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("class", "dt");
  dot.setAttribute("r", "3");
  dot.setAttribute("cx", String(x(vals.length - 1)));
  dot.setAttribute("cy", String(y(vals[vals.length - 1])));
  svg.append(dot);
  return svg;
}

function statLabel(st) {
  return t("st." + st);
}

function heatFor(ch) {
  const K = S.keysUI;
  const P = S.derived;
  const s = viewStat(S.settings.layout, ch);
  if (K.metric === "n") {
    if (!s || s.n === 0) return null;
    return clamp01(s.n / (P.minS * 2)) * 0.9;
  }
  if (!s || s.n < P.minS) return null;
  if (K.metric === "need") return clamp01((needOf(s, ch) - 0.8) / 1.6);
  if (K.metric === "speed") return clamp01((median(s.t) / P.targetMs - 0.8) / 1.2);
  return clamp01(errRate(s) / 0.15);
}

function classOfChar(ch) {
  if (/\p{M}/u.test(ch)) return "dia";
  if (/\p{N}/u.test(ch)) return "digits";
  if (/\p{L}/u.test(ch)) return ch !== ch.toLowerCase() ? "capitals" : "letters";
  if (CLASS_ORDER.punct.en.indexOf(ch) >= 0 || CLASS_ORDER.punct.ar.indexOf(ch) >= 0) return "punct";
  return "symbols";
}

function clsOptions() {
  return layoutInfo().lang === "ar" ? ["letters", "digits", "punct", "symbols", "dia", "code"] : ["letters", "capitals", "digits", "punct", "symbols", "code"];
}

function viewStat(lid, ch) {
  return clsFilter() === "code" ? charStat(lid + ":code", ch, false) : mergedStat(lid, ch);
}

function clsFilter() {
  const c = S.keysUI.cls;
  return clsOptions().indexOf(c) >= 0 ? c : "all";
}

function paintHeat(kb) {
  const K = S.keysUI;
  const cf = clsFilter();
  const lay = layoutInfo();
  for (const code in kb.keys) {
    const el = kb.keys[code];
    const m = lay.map[code];
    const ch = m ? m[K.layer ? 1 : 0] : "";
    el.classList.remove("u", "hi", "sel", "dim");
    el.style.removeProperty("--t");
    if (ch.length !== 1) {
      el.classList.add("u");
      continue;
    }
    if (cf !== "all" && cf !== "code" && classOfChar(ch) !== cf) {
      el.classList.add("u", "dim");
      continue;
    }
    const tv = heatFor(ch);
    if (tv == null) el.classList.add("u");
    else {
      el.style.setProperty("--t", tv.toFixed(3));
      if (tv > 0.55) el.classList.add("hi");
    }
    if (K.sel === ch) el.classList.add("sel");
  }
}

function seg(items, current, onPick, kind) {
  const role = kind === "toggle" ? null : "radiogroup";
  return h("div", { class: "seg", role },
    items.map(it => h("button", {
      type: "button",
      role: kind === "toggle" ? null : "radio",
      "aria-checked": kind === "toggle" ? null : String(it.v === current),
      "aria-pressed": kind === "toggle" ? String(it.v === current) : null,
      onclick: () => onPick(it.v)
    }, it.l)));
}

function signedMs(x) {
  return (Math.round(x) < 0 ? "\u2212" : "+") + nf(Math.abs(Math.round(x)));
}

function renderDetail(ch) {
  const lid = S.settings.layout;
  const P = S.derived;
  const s = viewStat(lid, ch);
  const box = h("div", { class: "detail" });
  if (!ch) return box;
  box.append(h("div", { class: "big", lang: layoutInfo().lang }, glyph(ch)));
  const st = statusOf(s, ch);
  const rows = [];
  rows.push([t("d.samples"), bdi(nf(s ? s.n : 0) + (!s || s.n < P.minS ? " / " + nf(P.minS) : ""))]);
  if (s && s.t.length >= 3) {
    rows.push([t("d.speed"), bdi(nf(median(s.t)) + " " + t("ms"))]);
    rows.push([t("d.speedT"), bdi(nf(P.targetMs) + " " + t("ms")), "mute"]);
    const km = keyModel(lid, ch, s);
    rows.push([t("d.exp"), bdi(nf(km.expected) + " " + t("ms")), "mute"]);
    rows.push([t("d.corr"), bdi(signedMs(km.correction) + " " + t("ms"))]);
    rows.push([t("d.wt"), bdi(pct(km.weight)), "mute"]);
  }
  if (s && s.o.length >= 3) {
    rows.push([t("d.acc"), bdi(pct(1 - errRate(s)))]);
    rows.push([t("d.accT"), bdi(pct(P.targetAcc)), "mute"]);
  }
  rows.push([t("d.status"), statLabel(st)]);
  const dl = h("dl");
  rows.forEach(r => dl.append(h("dt", { class: r[2] || null }, r[0]), h("dd", { class: r[2] || null }, r[1])));
  box.append(dl);
  if (s && s.t.length > 1) {
    box.append(h("div", { class: "sub" }, t("d.trend")), spark(s.t, P.targetMs));
  }
  if (s && Object.keys(s.x).length) {
    const items = Object.keys(s.x).sort((a, b) => s.x[b] - s.x[a]).slice(0, 3);
    box.append(h("div", { class: "sub" }, t("d.instead")),
      h("ul", null, items.map(k => h("li", null, h("span", { lang: layoutInfo().lang }, k === "\u21E7" ? t("d.shiftSame") : k === "\u21EA" ? t("d.capsMiss") : glyph(k === " " ? "␣" : k)), h("span", null, bdi("× " + nf(s.x[k])))))));
  }
  const slow = slowestInto(lid, ch, 5);
  if (slow.length) {
    box.append(h("div", { class: "sub" }, t("d.slow")),
      h("ul", null, slow.map(p => h("li", null, h("span", { lang: layoutInfo().lang, dir: layoutInfo().lang === "ar" ? "rtl" : "ltr" }, p.pair), h("span", null, bdi(nf(p.m) + " " + t("ms")), " ", bdi("(" + nf(p.n) + ")"))))));
  }
  return box;
}

function attentionLine() {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const below = [];
  let measured = 0;
  let any = 0;
  for (const ch in L.chars) {
    const s = L.chars[ch];
    if (s.a > 0) any++;
    const st = statusOf(s, ch);
    if (st === "sparse") continue;
    measured++;
    if (st === "learning") below.push({ ch, need: needOf(s, ch) });
  }
  if (!any) return null;
  if (!measured) return h("span", null, t("attn.sparse"));
  if (!below.length) return h("span", null, t("attn.ok"));
  below.sort((a, b) => b.need - a.need);
  return h("span", null, t("st.learning") + ": ", below.slice(0, 5).map((b, i) => [i ? " " : "", h("b", { lang: layoutInfo().lang }, glyph(b.ch))]));
}

function stallLine() {
  const s = stallInfo();
  if (!s) return null;
  const k = s.c ? iso(s.c) : "";
  const text = s.kind === "speed" ? t("stall.speed") : s.kind === "key" ? t("stall.acc") : t("stall.lessons");
  return text.replace("{k}", k).replace("{ms}", nf(s.ms)).replace("{gate}", nf(s.gate)).replace("{acc}", pct(s.acc)).replace("{target}", pct(s.target));
}

function renderKeys() {
  const K = S.keysUI;
  const lay = layoutInfo();
  const lid = lay.id;
  const all = allCharsOfLayout();
  if (!K.sel || !all.has(K.sel)) K.sel = S.lesson && S.lesson.focus ? S.lesson.focus : activeKeys()[0];
  const cf = clsFilter();
  if (cf === "code") {
    const lc = legacyChars(lid) || {};
    const ks = Object.keys(lc).filter(c => c.length === 1 && lc[c].a > 0);
    if (ks.length && ks.indexOf(K.sel) < 0) K.sel = ks[0];
  } else if (cf !== "all" && classOfChar(K.sel) !== cf) {
    const pool = Array.from(all).filter(c => c.length === 1 && classOfChar(c) === cf);
    K.sel = pool.find(c => charStat(lid, c, false)) || pool[0] || K.sel;
  }
  const tabs = h("div", { class: "tabs" },
    seg([{ v: "progress", l: t("keys.progress") }, { v: "kb", l: t("keys.kb") }, { v: "list", l: t("keys.list") }, { v: "pairs", l: t("keys.pairs") }], K.tab, v => { K.tab = v; render(); }),
    h("span", { class: "gap" }));
  if (K.tab === "kb") {
    tabs.append(
      seg([{ v: "need", l: t("metric.need") }, { v: "speed", l: t("metric.speed") }, { v: "acc", l: t("metric.acc") }, { v: "n", l: t("metric.n") }], K.metric, v => { K.metric = v; render(); }),
      seg([{ v: 0, l: t("layer.normal") }, { v: 1, l: t("layer.shift") }], K.layer, v => { K.layer = v; render(); })
    );
  }
  U.main.append(tabs);
  if (K.tab === "progress") {
    U.main.append(...renderProgress(seg, render).filter(Boolean));
    return;
  }
  if (K.tab !== "pairs") {
    const fb = seg([{ v: "all", l: t("cls.all") }].concat(clsOptions().map(c => ({ v: c, l: t("fp.c." + c) }))), clsFilter(), v => { K.cls = v; render(); });
    fb.setAttribute("aria-label", t("cls.label"));
    U.main.append(h("div", { class: "tabs" }, fb));
  }
  const attn = attentionLine();
  U.main.append(h("div", { class: "attn", "aria-live": "polite" }, attn));
  const stalled = stallLine();
  if (stalled) U.main.append(h("div", { class: "attn", id: "stallnote" }, stalled));
  const shc = layoutData(lid).sh;
  if (shc && shc.ok + shc.same > 0) U.main.append(h("div", { class: "attn", id: "shiftsum" }, t("d.shiftSum").replace("{a}", nf(shc.ok)).replace("{b}", nf(shc.same))));
  if (K.tab === "kb") {
    const kb = buildKeyboard({
      onClick: code => {
        const m = lay.map[code];
        const ch = m ? m[K.layer ? 1 : 0] : "";
        if (ch.length === 1) {
          K.sel = ch;
          render();
        }
      }
    });
    kb.update(K.layer);
    paintHeat(kb);
    const l0 = K.metric === "n" ? t("leg.n0") : t("leg.lo");
    const l1 = K.metric === "n" ? t("leg.n1") : t("leg.hi");
    const legend = h("div", { class: "legend" }, h("span", null, l0), h("span", { class: "bar" }), h("span", null, l1), h("span", { class: "none" }, h("span", { class: "dash" }), h("span", null, t("leg.none"))));
    U.main.append(h("div", { class: "keys-grid" }, h("div", { class: "card kcard" }, kb.root, legend), renderDetail(K.sel)));
  } else if (K.tab === "list") {
    U.main.append(renderList());
  } else {
    U.main.append(renderPairs());
  }
  U.main.append(renderLessons());
  U.main.append(h("details", { class: "how" }, h("summary", null, t("how.sum")), h("p", null, t("how.body"))));
}

function renderList() {
  const K = S.keysUI;
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const set = new Set(activeKeys());
  for (const ch in L.chars) if (L.chars[ch].a > 0) set.add(ch);
  const legacy = legacyChars(lid);
  if (legacy) for (const ch in legacy) if (legacy[ch].a > 0) set.add(ch);
  const cfl = clsFilter();
  const rows = Array.from(set).filter(ch => cfl === "all" || (cfl === "code" ? !!(legacy && legacy[ch] && legacy[ch].a > 0) : classOfChar(ch) === cfl)).map(ch => {
    const s = viewStat(lid, ch);
    return { ch, s, n: s ? s.n : 0, med: s && s.t.length ? median(s.t) : null, err: s && s.o.length ? errRate(s) : null, st: statusOf(s, ch), need: needOf(s, ch) };
  });
  const rank = { learning: 0, sparse: 1, steady: 2 };
  const sorters = {
    need: (a, b) => rank[a.st] - rank[b.st] || (a.st === "sparse" ? b.n - a.n : b.need - a.need),
    n: (a, b) => b.n - a.n,
    speed: (a, b) => (b.med == null ? -1 : b.med) - (a.med == null ? -1 : a.med),
    acc: (a, b) => (b.err == null ? -1 : b.err) - (a.err == null ? -1 : a.err)
  };
  rows.sort(sorters[K.sort] || sorters.need);
  if (!rows.length) return h("p", { class: "empty" }, t("attn.sparse"));
  const th = (key, label, cls) => h("th", { class: cls || null, "aria-sort": K.sort === key ? "descending" : null },
    h("button", { type: "button", class: "rst", style: "color:" + (K.sort === key ? "var(--ink)" : "var(--mute)") + ";font-weight:" + (K.sort === key ? "500" : "400"), onclick: () => { K.sort = key; render(); } }, label));
  const table = h("table", null,
    h("thead", null, h("tr", null, h("th", null, t("c.key")), th("n", t("c.samples"), "num"), th("speed", t("c.speed"), "num"), th("acc", t("c.acc"), "num"), th("need", t("c.status")))),
    h("tbody", null, rows.map(r => h("tr", { class: "row", tabindex: "0", onclick: () => { K.sel = r.ch; K.tab = "kb"; render(); }, onkeydown: ev => { if (ev.key === "Enter") { K.sel = r.ch; K.tab = "kb"; render(); } } },
      h("td", { class: "g", lang: layoutInfo().lang }, glyph(r.ch === " " ? "␣" : r.ch)),
      h("td", { class: "num" }, nf(r.n)),
      h("td", { class: "num" }, r.med == null || r.n < 3 ? "—" : nf(r.med) + " " + t("ms")),
      h("td", { class: "num" }, r.err == null || r.s.o.length < 3 ? "—" : pct(1 - r.err)),
      h("td", null, statLabel(r.st))))));
  return h("div", { class: "tablewrap" }, table);
}

function renderPairs() {
  const lid = S.settings.layout;
  const P = S.derived;
  const L = layoutData(lid);
  const out = [];
  for (const k in L.pairs) {
    const p = L.pairs[k];
    if (k.length !== 2 || p.n < 8) continue;
    const s2 = L.chars[k[1]];
    if (!s2 || s2.n < P.minS) continue;
    out.push({ k, n: p.n, m: p.m, d: p.m - median(s2.t) });
  }
  out.sort((a, b) => b.d - a.d);
  if (!out.length) return h("p", { class: "empty" }, t("p.empty"));
  const lang = layoutInfo().lang;
  return h("div", { class: "tablewrap" }, h("table", null,
    h("thead", null, h("tr", null, h("th", null, t("p.pair")), h("th", { class: "num" }, t("p.n")), h("th", { class: "num" }, t("p.speed")), h("th", { class: "num" }, t("p.diff")))),
    h("tbody", null, out.slice(0, 30).map(r => h("tr", null,
      h("td", { class: "g", lang, dir: lang === "ar" ? "rtl" : "ltr" }, r.k),
      h("td", { class: "num" }, nf(r.n)),
      h("td", { class: "num" }, nf(r.m) + " " + t("ms")),
      h("td", { class: "num" }, (r.d > 0 ? "+" : "−") + nf(Math.abs(r.d)) + " " + t("ms")))))));
}

function renderLessons() {
  const lid = S.settings.layout;
  const ls = S.data.lessons.filter(l => l.lid === lid);
  const box = h("div", { class: "lessons" });
  if (!ls.length) return box;
  const last = ls.slice(-20);
  box.append(h("div", { class: "row" },
    h("span", null, t("l.title") + ": ", bdi(nf(ls.length))),
    h("span", null, t("l.median") + ": ", bdi(nf(median(last.map(l => l.wpm))) + " " + t("wpm")), " · ", bdi(pct(median(last.map(l => l.acc)))))));
  if (ls.length > 1) {
    box.append(h("div", { class: "pair" },
      h("div", null, h("div", { class: "sub" }, t("d.speed")), spark(ls.slice(-40).map(l => l.wpm), S.settings.targetWpm)),
      h("div", null, h("div", { class: "sub" }, t("d.acc")), spark(ls.slice(-40).map(l => l.acc), 0, true))));
  }
  return box;
}

export { classOfChar, clsFilter, clsOptions, renderDetail, renderKeys, seg, signedMs, spark };
