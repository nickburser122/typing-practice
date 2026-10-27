import { dayKey, dayNum, heatCells, numToKey, personalBests, rolling, summary } from "../core/history.js";
import { S, nf, t, uiLang } from "../core/state.js";
import { codeLabel } from "../features/code.js";
import { bdi, h, pct } from "./dom.js";

const NS = "http://www.w3.org/2000/svg";
const RANGES = [{ v: "30" }, { v: "90" }, { v: "all" }];

function locale() {
  return (uiLang() === "ar" ? "ar" : "en") + "-u-nu-" + (S.settings.numerals === "arabic" ? "arab" : "latn");
}

function fmtDate(key, opts) {
  return new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: "UTC" }, opts)).format(new Date(dayNum(key) * 864e5));
}

function shortDate(key) {
  return fmtDate(key, { month: "short", day: "numeric" });
}

function longDate(key) {
  return fmtDate(key, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function dur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return nf(s) + " " + t("pg.sec");
  const m = Math.round(s / 60);
  if (m < 60) return nf(m) + " " + t("pg.m");
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return nf(hh) + " " + t("pg.h") + (mm ? " " + nf(mm) + " " + t("pg.m") : "");
}

function signed(v, dec) {
  const r = dec ? Math.round(v * 10) / 10 : Math.round(v);
  const s = nf(Math.abs(r), dec ? 1 : 0);
  return (r > 0 ? "+" : r < 0 ? "−" : "") + s;
}

function mk(svg, tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  if (text != null) el.textContent = text;
  svg.append(el);
  return el;
}

function tile(label, val, sub) {
  return h("div", { class: "stat" }, h("div", { class: "sl" }, label), h("div", { class: "sv" }, val), sub ? h("div", { class: "ss" }, sub) : null);
}

function tiles(sm) {
  const st = sm.streak;
  const streakSub = st.current > 0 && !st.activeToday ? t("pg.today") : t("pg.longest").replace("{n}", nf(st.longest));
  let weekSub = t("pg.noprev");
  if (sm.delta != null) weekSub = t("pg.delta").replace("{d}", signed(sm.delta, true) + " " + t("wpm"));
  return h("div", { class: "stats pg-tiles" },
    tile(t("pg.streak"), bdi(nf(st.current) + " " + t("pg.days")), streakSub),
    tile(t("pg.time"), bdi(dur(sm.all.ms)), t("pg.sessions").replace("{n}", nf(sm.all.s))),
    tile(t("pg.week").replace("{n}", nf(7)), sm.week.wpm != null ? bdi(nf(sm.week.wpm) + " " + t("wpm")) : "–", weekSub),
    tile(t("pg.active"), bdi(nf(sm.month.days) + " / " + nf(30)), t("pg.ofN").replace("{n}", nf(30))));
}

function niceMax(v) {
  const step = v > 120 ? 40 : v > 60 ? 20 : v > 30 ? 10 : 5;
  return Math.max(step * 2, Math.ceil((v * 1.08) / step) * step);
}

function trendChart(cfg) {
  const W = 560;
  const H = 210;
  const L = 40;
  const R = 14;
  const Tp = 14;
  const B = 30;
  const pts = cfg.pts;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "chart trend");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", cfg.label);
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("dir", "ltr");
  const vals = pts.map(p => p.v).concat(pts.map(p => p.r).filter(v => v != null));
  let lo = cfg.lo;
  let hi = cfg.hi;
  if (lo == null) {
    lo = 0;
    hi = niceMax(Math.max.apply(null, vals.concat(cfg.target || 0, 5)));
  } else {
    const mn = Math.min.apply(null, vals);
    lo = Math.max(0, Math.floor((mn - 0.02) * 20) / 20);
    if (hi - lo < 0.1) lo = Math.max(0, hi - 0.1);
  }
  const n0 = cfg.from;
  const n1 = Math.max(cfg.to, n0 + 1);
  const x = n => L + ((n - n0) / (n1 - n0)) * (W - L - R);
  const y = v => H - B - ((v - lo) / (hi - lo)) * (H - B - Tp);
  const fmt = cfg.fmt;
  for (let i = 0; i <= 2; i++) {
    const v = lo + ((hi - lo) * i) / 2;
    mk(svg, "line", { class: "gl", x1: L, x2: W - R, y1: y(v), y2: y(v) });
    mk(svg, "text", { class: "ax", x: L - 8, y: y(v) + 4, "text-anchor": "end" }, fmt(v));
  }
  [[n0, "start"], [Math.round((n0 + n1) / 2), "middle"], [n1, "end"]].forEach(([n, a]) => mk(svg, "text", { class: "ax", x: x(n), y: H - 8, "text-anchor": a }, shortDate(numToKey(n))));
  if (cfg.target && cfg.target > lo && cfg.target < hi) {
    mk(svg, "line", { class: "lr", x1: L, x2: W - R, y1: y(cfg.target), y2: y(cfg.target) });
    mk(svg, "text", { class: "ax", x: L + 6, y: y(cfg.target) - 5, "text-anchor": "start" }, t("pg.target") + " " + fmt(cfg.target));
  }
  const rp = pts.filter(p => p.r != null);
  if (rp.length > 1) mk(svg, "polyline", { class: "lw", points: rp.map(p => x(p.n).toFixed(1) + "," + y(p.r).toFixed(1)).join(" ") });
  pts.forEach(p => mk(svg, "circle", { class: "dot", cx: x(p.n).toFixed(1), cy: y(p.v).toFixed(1), r: 3.2 }));
  const last = pts[pts.length - 1];
  const cross = mk(svg, "line", { class: "cross", y1: Tp, y2: H - B, x1: 0, x2: 0, visibility: "hidden" });
  const ring = mk(svg, "circle", { class: "ring", r: 5.5, cx: 0, cy: 0, visibility: "hidden" });
  const tip = h("div", { class: "tip", role: "status", hidden: true });
  const box = h("div", { class: "chartbox trendbox" }, svg, tip);
  let cur = -1;
  const show = i => {
    if (i < 0 || i >= pts.length) return;
    cur = i;
    const p = pts[i];
    cross.setAttribute("x1", String(x(p.n)));
    cross.setAttribute("x2", String(x(p.n)));
    cross.setAttribute("visibility", "visible");
    ring.setAttribute("cx", String(x(p.n)));
    ring.setAttribute("cy", String(y(p.v)));
    ring.setAttribute("visibility", "visible");
    tip.textContent = "";
    tip.append(h("b", null, longDate(p.key)), h("div", null, cfg.name + ": ", bdi(fmt(p.v))), cfg.extra(p));
    tip.hidden = false;
    const pc = Math.max(14, Math.min(86, (x(p.n) / W) * 100));
    tip.style.left = pc + "%";
    tip.style.top = y(p.v) < H * 0.45 ? "56%" : "4px";
  };
  const hide = () => {
    cur = -1;
    cross.setAttribute("visibility", "hidden");
    ring.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };
  const nearest = ev => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return -1;
    const px = ((ev.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(x(p.n) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  svg.addEventListener("pointermove", ev => show(nearest(ev)));
  svg.addEventListener("pointerdown", ev => show(nearest(ev)));
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", ev => {
    if (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "Home" || ev.key === "End") {
      ev.preventDefault();
      if (ev.key === "Home") show(0);
      else if (ev.key === "End") show(pts.length - 1);
      else show(cur < 0 ? pts.length - 1 : Math.max(0, Math.min(pts.length - 1, cur + (ev.key === "ArrowRight" ? 1 : -1))));
    } else if (ev.key === "Escape" && cur >= 0) {
      ev.stopPropagation();
      hide();
    }
  });
  if (last && cfg.endLabel) mk(svg, "text", { class: "ax endl", x: Math.min(W - R, x(last.n) + 6), y: y(last.r != null ? last.r : last.v) - 9, "text-anchor": x(last.n) > W - 60 ? "end" : "start" }, fmt(last.r != null ? last.r : last.v));
  return box;
}

function legend(items) {
  return h("div", { class: "pglegend" }, items.map(it => h("span", { class: "lg" }, h("i", { class: "pgsw " + it.k }), it.l)));
}

function chartCard(title, chart, leg) {
  return h("div", { class: "card pgcard" }, h("div", { class: "pgh" }, h("div", { class: "sub" }, title), leg), chart);
}

function windowRows(sm, range) {
  const today = dayNum(sm.todayKey);
  const from = range === "all" ? (sm.rows.length ? sm.rows[0].n : today) : today - (Number(range) - 1);
  return { from: Math.min(from, today), to: today };
}

function buildPoints(sm, win) {
  const roll = rolling(sm.rows, 7);
  return sm.rows.map((r, i) => ({ key: r.key, n: r.n, r: roll[i], row: r })).filter(p => p.n >= win.from && p.n <= win.to);
}

function trends(sm, K) {
  const win = windowRows(sm, K.range);
  const base = buildPoints(sm, win);
  if (!base.length) return h("p", { class: "empty" }, t("pg.nodata"));
  const speedPts = base.map(p => ({ key: p.key, n: p.n, v: p.row.wpm, r: p.r, row: p.row }));
  const accPts = base.map(p => ({ key: p.key, n: p.n, v: p.row.acc, r: null, row: p.row }));
  const accRoll = rollingAcc(sm.rows, 7);
  base.forEach((p, i) => { accPts[i].r = accRoll[sm.rows.indexOf(p.row)]; });
  const extra = p => h("div", { class: "tipsub" }, t("pg.sess") + ": ", bdi(nf(p.row.s)), " · ", bdi(dur(p.row.ms)), " · ", t("pg.best") + " ", bdi(nf(p.row.best) + " " + t("wpm")));
  const extraAcc = p => h("div", { class: "tipsub" }, t("pg.sess") + ": ", bdi(nf(p.row.s)), " · ", bdi(dur(p.row.ms)));
  const leg = legend([{ k: "dot", l: t("pg.daily") }, { k: "line", l: t("pg.roll").replace("{n}", nf(7)) }]);
  return h("div", { class: "pgcharts" },
    chartCard(t("pg.speed"), trendChart({ pts: speedPts, from: win.from, to: win.to, label: t("pg.speed"), name: t("d.speed"), fmt: v => nf(v), extra, target: S.settings.targetWpm, endLabel: true }), leg),
    chartCard(t("pg.acc"), trendChart({ pts: accPts, from: win.from, to: win.to, label: t("pg.acc"), name: t("d.acc"), fmt: v => pct(v), extra: extraAcc, lo: 0, hi: 1, endLabel: true }), leg));
}

function rollingAcc(rows, span) {
  return rows.map((r, i) => {
    let s = 0;
    let a = 0;
    for (let j = i; j >= 0 && r.n - rows[j].n < span; j--) {
      s += rows[j].s;
      a += rows[j].acc * rows[j].s;
    }
    return s ? a / s : null;
  });
}

function heatmap(lid, todayTs) {
  const weeks = 52;
  const cells = heatCells(lid, todayTs, weeks);
  const mx = Math.max.apply(null, cells.map(c => c.ms).concat(60000));
  const level = ms => (ms <= 0 ? 0 : ms < mx * 0.25 ? 1 : ms < mx * 0.5 ? 2 : ms < mx * 0.75 ? 3 : 4);
  const CS = 14;
  const G = 3;
  const LEFT = 0;
  const TOP = 18;
  const W = LEFT + weeks * (CS + G);
  const H = TOP + 7 * (CS + G);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "chart heat");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("pg.heat"));
  svg.setAttribute("dir", "ltr");
  let lastMonth = -1;
  let lastLabel = -9;
  const tip = h("div", { class: "tip", role: "status", hidden: true });
  cells.forEach(c => {
    const mo = new Date(c.n * 864e5).getUTCMonth();
    if (c.row === 0 && mo !== lastMonth) {
      lastMonth = mo;
      if (c.col - lastLabel >= 3) {
        lastLabel = c.col;
        mk(svg, "text", { class: "ax", x: LEFT + c.col * (CS + G), y: 11 }, fmtDate(c.key, { month: "short" }));
      }
    }
    const r = mk(svg, "rect", { class: "hc l" + level(c.ms), x: LEFT + c.col * (CS + G), y: TOP + c.row * (CS + G), width: CS, height: CS, rx: 3 });
    const show = () => {
      tip.textContent = "";
      tip.append(h("b", null, longDate(c.key)), h("div", null, c.s ? t("pg.heatTip").replace("{m}", dur(c.ms)) : t("pg.rest")));
      tip.hidden = false;
      tip.style.left = Math.max(14, Math.min(86, ((LEFT + c.col * (CS + G) + CS / 2) / W) * 100)) + "%";
      tip.style.top = ((TOP + c.row * (CS + G)) / H) * 100 + "%";
    };
    r.addEventListener("pointerenter", show);
    r.addEventListener("pointerleave", () => { tip.hidden = true; });
  });
  const scale = h("div", { class: "pglegend" }, h("span", { class: "lg" }, t("pg.less")), [0, 1, 2, 3, 4].map(l => h("i", { class: "pgsw hc l" + l })), h("span", { class: "lg" }, t("pg.more")));
  const card = h("div", { class: "card pgcard" }, h("div", { class: "pgh" }, h("div", { class: "sub" }, t("pg.heat")), scale), h("div", { class: "chartbox heatbox" }, h("div", { class: "heatin" }, svg, tip)));
  requestAnimationFrame(() => {
    const box = card.querySelector(".heatbox");
    if (box) box.scrollLeft = box.scrollWidth;
  });
  return card;
}

function pbLabel(x) {
  const quote = x.mode === "quote";
  const base = quote
    ? t("pg.pbQuote").replace("{len}", x.amt >= 4 ? t("tt.lall") : t("tt.q" + ["short", "medium", "long"][x.amt - 1]))
    : t(x.mode === "time" ? "pg.pbTime" : "pg.pbWords").replace("{n}", nf(x.amt));
  const bits = quote ? [] : [t("tt.l" + x.list)];
  if (x.ext & 1) bits.push(t("tt.punct"));
  if (x.ext & 2) bits.push(t("tt.num"));
  if (x.ext & 4) bits.push(t("tt.caps"));
  if (x.ext & 8) bits.push(t("tt.dia"));
  if (x.ext & 16) bits.push(t("tt.diff.expert"));
  if (x.ext & 32) bits.push(t("tt.diff.master"));
  if (x.ext & 64) bits.push(t("tt.stopLabel"));
  return [base, bits.length ? h("span", { class: "pbsub" }, bits.join(" · ")) : null];
}

function bests(lid) {
  const pb = personalBests(lid);
  const rows = [];
  if (pb.lesson) rows.push({ label: t("pg.pbLesson").replace("{a}", pct(0.9)), p: pb.lesson });
  pb.tests.forEach(x => rows.push({ label: pbLabel(x), p: x.pb }));
  pb.code.forEach(x => rows.push({ label: t("pg.pbCode").replace("{set}", codeLabel(x.set)), p: x.pb }));
  if (!rows.length) return null;
  return h("div", { class: "card pgcard" }, h("div", { class: "pgh" }, h("div", { class: "sub" }, t("pg.pbs"))),
    h("div", { class: "pbgrid" }, rows.map(r => h("div", { class: "pbrow" },
      h("div", { class: "pbl" }, r.label),
      h("div", { class: "pbv" }, bdi(nf(r.p.wpm) + " " + t("wpm"))),
      h("div", { class: "pbd" }, bdi(pct(r.p.acc)), " · ", r.p.ts ? shortDate(dayKey(r.p.ts)) : "")))));
}

function tableView(sm, K) {
  const win = windowRows(sm, K.range);
  const rows = sm.rows.filter(r => r.n >= win.from && r.n <= win.to).slice(-60).reverse();
  if (!rows.length) return null;
  return h("details", { class: "how pgtable" }, h("summary", null, t("pg.table")),
    h("div", { class: "tablewrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, t("pg.date")), h("th", { class: "num" }, t("pg.sess")), h("th", { class: "num" }, t("pg.time")), h("th", { class: "num" }, t("d.speed")), h("th", { class: "num" }, t("d.acc")))),
      h("tbody", null, rows.map(r => h("tr", null, h("td", null, longDate(r.key)), h("td", { class: "num" }, nf(r.s)), h("td", { class: "num" }, bdi(dur(r.ms))), h("td", { class: "num" }, bdi(nf(r.wpm))), h("td", { class: "num" }, bdi(pct(r.acc)))))))));
}

function renderProgress(seg, rerender) {
  const K = S.keysUI;
  const lid = S.settings.layout;
  const now = Date.now();
  const sm = summary(lid, now);
  sm.todayKey = dayKey(now);
  if (!sm.rows.length) return [h("p", { class: "empty" }, t("pg.empty"))];
  const range = seg(RANGES.map(r => ({ v: r.v, l: r.v === "all" ? t("pg.rall") : t("pg.rN").replace("{n}", nf(Number(r.v))) })), K.range, v => { K.range = v; rerender(); });
  range.setAttribute("aria-label", t("pg.range"));
  return [
    tiles(sm),
    h("div", { class: "tabs pgrange" }, h("span", { class: "gap" }), range),
    trends(sm, K),
    heatmap(lid, now),
    bests(lid),
    tableView(sm, K)
  ];
}

export { renderProgress };
