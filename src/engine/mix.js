import { rnd } from "../core/base.js";
import { MIX_KEYS, sanitizeMix } from "../core/schema.js";
import { S, layoutInfo, typeable } from "../core/state.js";
import { customWords, hasCustom } from "../core/storage.js";
import { LAYOUTS } from "../data/layouts.js";
import { codeNeed, codePool, codeSid, isPlain } from "./code.js";
import { ensureLex } from "./lexicon.js";
import { activeKeys, currentOrder } from "./order.js";
import { needOf, statusOf } from "./skill.js";
import { charStat, layoutData } from "./stats.js";
import { buildWords, pickW, rand } from "./words.js";

const CLASS_ORDER = {
  digits: ["4", "7", "5", "6", "3", "8", "2", "9", "1", "0"],
  numpad: ["5", "4", "6", "8", "2", "7", "9", "1", "3", "0", "."],
  punct: {
    en: [".", ",", "'", "?", "!", ";", ":", "-", "\"", "(", ")", "/"],
    ar: ["\u060C", ".", "\u061F", "\u061B", ":", "-", "\u00AB", "\u00BB", "(", ")"]
  },
  symbols: ["_", "=", "+", "-", "*", "/", "\\", "|", "&", "<", ">", "{", "}", "[", "]", "#", "@", "$", "%", "^", "~", "`"],
  dia: ["\u064E", "\u064F", "\u0650", "\u0652", "\u0651", "\u064B", "\u064C", "\u064D"]
};

const DIGIT_SETS = ["0123456789".split(""), "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669".split("")];

function classKeys(cls) {
  const lang = layoutInfo().lang;
  if (cls === "letters") return currentOrder().slice();
  if (cls === "capitals") return lang === "en" ? activeKeys().map(c => c.toUpperCase()).filter(c => typeable(c) && c !== c.toLowerCase()) : [];
  let list;
  if (cls === "punct") list = CLASS_ORDER.punct[lang];
  else if (cls === "dia") list = lang === "ar" ? CLASS_ORDER.dia : [];
  else list = CLASS_ORDER[cls];
  return list.filter(typeable);
}

function defaultMix() {
  const m = {};
  MIX_KEYS.forEach(k => { m[k] = { on: k === "letters", weight: 50 }; });
  return m;
}

function legacyMix(st) {
  const lang = LAYOUTS[st.layout].lang;
  const m = defaultMix();
  const w = Math.max(1, Math.min(100, Math.round(st.extraRate)));
  m.letters.weight = 100;
  m.capitals = { on: !!st.caps && lang === "en", weight: w };
  m.digits = { on: !!st.digits, weight: w };
  m.punct = { on: !!st.punct, weight: w };
  m.dia = { on: !!st.dia && lang === "ar", weight: w };
  return m;
}

function digitSet() {
  let best = [];
  DIGIT_SETS.forEach(set => {
    const ok = set.filter(typeable);
    if (ok.length > best.length) best = ok;
  });
  return best;
}

function typeableText(s) {
  for (const c of s) if (c !== " " && !typeable(c)) return false;
  return true;
}

function tokenNeed(text) {
  const lid = S.settings.layout;
  let sc = 0;
  for (const c of text) {
    if (c === " " || /\p{L}/u.test(c)) continue;
    sc += needOf(charStat(lid, c, false), c);
  }
  return sc;
}

function bestOf(make, tries) {
  let best = null;
  let bs = -1;
  for (let i = 0; i < tries; i++) {
    const c = make();
    if (!c) continue;
    const sc = tokenNeed(c) * (0.5 + rnd());
    if (sc > bs) {
      bs = sc;
      best = c;
    }
  }
  return best;
}

const NUMBER_KINDS = [["int", 4], ["decimal", 2], ["price", 2], ["time", 1.5], ["date", 1.5], ["short", 1], ["version", 1], ["grouped", 1.5], ["percent", 1]];

function numberToken() {
  const lang = layoutInfo().lang;
  const D = digitSet();
  if (!D.length) return "";
  const full = D.length === 10;
  const dg = () => D[rand(D.length)];
  const nz = D.filter(d => d !== D[0]);
  const lead = () => (full ? D[1 + rand(9)] : (nz.length ? nz : D)[rand((nz.length ? nz : D).length)]);
  const run = n => { let s = ""; for (let i = 0; i < n; i++) s += i === 0 ? lead() : dg(); return s; };
  const any = n => { let s = ""; for (let i = 0; i < n; i++) s += dg(); return s; };
  const m = n => String(n).split("").map(c => D[+c]).join("");
  const p2 = n => m((n < 10 ? "0" : "") + n);
  const dec = lang === "ar" && typeable("\u066B") ? "\u066B" : ".";
  const thou = lang === "ar" && typeable("\u066C") ? "\u066C" : " ";
  const kind = full ? pickW(NUMBER_KINDS.map(x => x[0]), NUMBER_KINDS.map(x => x[1])) : "int";
  let out;
  if (kind === "decimal") out = run(1 + rand(2)) + dec + any(1 + rand(2));
  else if (kind === "price") out = m(1 + rand(499)) + dec + p2(rand(100));
  else if (kind === "time") out = p2(rand(24)) + ":" + p2(rand(60));
  else if (kind === "date") out = m(2020 + rand(10)) + "-" + p2(1 + rand(12)) + "-" + p2(1 + rand(28));
  else if (kind === "short") out = p2(1 + rand(28)) + "/" + p2(1 + rand(12));
  else if (kind === "version") out = m(1 + rand(9)) + "." + m(rand(20)) + "." + m(rand(10));
  else if (kind === "grouped") out = m(1 + rand(999)) + thou + m(100 + rand(900)) + (rand(2) ? thou + m(100 + rand(900)) : "");
  else if (kind === "percent") out = m(1 + rand(99)) + "%";
  else out = run(1 + rand(5));
  return typeableText(out) ? out : run(1 + rand(4));
}

function carrierCtx(useActive) {
  const lid = S.settings.layout;
  const L = layoutData(lid);
  const order = currentOrder();
  let pool;
  if (S.settings.carrier === "active") pool = activeKeys();
  else {
    const steady = order.filter(c => statusOf(L.chars[c], c) === "steady");
    pool = steady.length >= 4 ? steady : useActive ? activeKeys() : order.slice(0, 4);
  }
  const set = new Set(pool);
  const words = ensureLex(layoutInfo().lang).entries.filter(e => e.len >= 2 && e.len <= 7 && e.chars.every(c => set.has(c)));
  return { pool, set, words };
}

function carrierWord(cc) {
  if (cc.words.length >= 5) return cc.words[rand(cc.words.length)].w;
  const len = 2 + rand(3);
  let s = "";
  for (let i = 0; i < len; i++) s += cc.pool[rand(cc.pool.length)];
  return s;
}

function punctPatterns() {
  const lang = layoutInfo().lang;
  const list = lang === "ar"
    ? [a => a + "\u060C", a => a + ".", a => "\u00AB" + a + "\u00BB", a => "(" + a + ")", a => a + "\u061F", (a, b) => a + "\u061B " + b, (a, b) => a + "-" + b, (a, b) => a + ": " + b, a => a + "!"]
    : [a => a + ",", a => a + ".", a => "\"" + a + "\"", a => "(" + a + ")", a => a + "'s", a => a + "?", (a, b) => a + "; " + b, (a, b) => a + "-" + b, (a, b) => a + ": " + b, a => a + "!", (a, b) => a + "/" + b, a => "'" + a + "'"];
  return list.filter(f => typeableText(f("a", "b").replace(/[a-z]/g, "")));
}

function symbolPatterns() {
  const list = [() => "{}", () => "[]", () => "<>", () => "()", () => "&&", () => "||", () => "==", () => "+=", () => "->", () => "=>", () => "!=",
    a => "#" + a, a => "@" + a, a => "$" + a, a => a + "%", (a, b) => a + "_" + b, (a, b) => a + "=" + b, (a, b) => a + "*" + b, (a, b) => a + "+" + b,
    (a, b) => a + "|" + b, (a, b) => a + "&" + b, (a, b) => a + "^" + b, a => "~/" + a, a => "`" + a + "`", a => "{" + a + "}", a => "[" + a + "]", a => "<" + a + ">", (a, b) => a + "\\" + b];
  return list.filter(f => typeableText(f("", "")));
}

function codeLinePool() {
  return codePool().filter(typeableText);
}

function pickCodeLine(pool) {
  const recent = new Set(S.codeRecent || []);
  let avail = pool.filter(x => !recent.has(x));
  if (avail.length < 4) avail = pool;
  const sid = codeSid();
  const score = text => {
    let ex = 0;
    for (const ch of text) if (!isPlain(ch)) ex += Math.max(0, codeNeed(sid, ch) - 1);
    return (1 + Math.min(ex, 8)) * (0.5 + rnd());
  };
  let best = null;
  let bs = -1;
  for (let i = 0; i < 3; i++) {
    const c = avail[rand(avail.length)];
    const sc = score(c);
    if (sc > bs) {
      bs = sc;
      best = c;
    }
  }
  S.codeRecent = (S.codeRecent || []).concat([best]).slice(-30);
  return best;
}

function mixPlan(mix) {
  const lang = layoutInfo().lang;
  const m = sanitizeMix(mix) || defaultMix();
  const w = k => (m[k].on ? Math.max(1, m[k].weight) : 0);
  const lw = w("letters");
  const cw = lang === "en" ? w("capitals") : 0;
  const dw = lang === "ar" ? w("dia") : 0;
  const plan = { w: { words: lw + cw + dw, numbers: w("digits"), punct: w("punct"), symbols: w("symbols"), code: w("code"), custom: w("custom") }, capRate: 0, diaRate: 0, marks: [] };
  if (plan.w.words) {
    plan.capRate = cw / plan.w.words;
    plan.diaRate = dw / plan.w.words;
  }
  if (plan.w.numbers && !digitSet().length) plan.w.numbers = 0;
  if (plan.w.punct && !punctPatterns().length) plan.w.punct = 0;
  if (plan.w.symbols && !symbolPatterns().length) plan.w.symbols = 0;
  if (plan.w.code && !codeLinePool().length) plan.w.code = 0;
  if (plan.w.custom && !hasCustom()) plan.w.custom = 0;
  if (plan.diaRate) {
    plan.marks = CLASS_ORDER.dia.filter(typeable);
    if (!plan.marks.length) plan.diaRate = 0;
  }
  if (!Object.keys(plan.w).some(k => plan.w[k] > 0)) plan.w.words = 1;
  return plan;
}

const SRC_AVG = { words: 5, numbers: 5, punct: 7, symbols: 6, code: 28, custom: 5 };

function compose(mix, N) {
  const lid = S.settings.layout;
  const plan = mixPlan(mix);
  const srcs = Object.keys(plan.w).filter(k => plan.w[k] > 0);
  const key = lid + "|" + JSON.stringify(plan.w);
  if (!S.mixLedger || S.mixLedger.key !== key) S.mixLedger = { key, made: {} };
  const made = S.mixLedger.made;
  srcs.forEach(k => { if (!made[k]) made[k] = 0; });
  let wordsB = null;
  let wi = 0;
  const nextWord = () => {
    if (!wordsB || wi >= wordsB.words.length) {
      const keep = S.settings;
      S.settings = Object.assign({}, keep, { caps: false, digits: false, punct: false, dia: false });
      try {
        const b = buildWords();
        if (!wordsB) wordsB = b;
        else wordsB.words = b.words;
        wi = 0;
      } finally {
        S.settings = keep;
      }
    }
    return wordsB.words[wi++];
  };
  let cc = null;
  const carriers = () => cc || (cc = carrierCtx());
  const pp = srcs.indexOf("punct") >= 0 ? punctPatterns() : [];
  const sp = srcs.indexOf("symbols") >= 0 ? symbolPatterns() : [];
  const cp = srcs.indexOf("code") >= 0 ? codeLinePool() : [];
  const gen = {
    words() {
      let w = nextWord();
      if (plan.capRate && rnd() < plan.capRate) {
        const up = w[0].toUpperCase() + w.slice(1);
        if (typeableText(up)) w = up;
      }
      if (plan.diaRate && rnd() < plan.diaRate) w += plan.marks[rand(plan.marks.length)];
      return w;
    },
    numbers: () => bestOf(numberToken, 3),
    punct: () => bestOf(() => { const c = carriers(); return pp[rand(pp.length)](carrierWord(c), carrierWord(c)); }, 3),
    symbols: () => bestOf(() => { const c = carriers(); return sp[rand(sp.length)](carrierWord(c), carrierWord(c)); }, 3),
    code: () => pickCodeLine(cp),
    custom() {
      const ws = customWords();
      const w = ws[(S.customPos || 0) % ws.length];
      S.customPos = ((S.customPos || 0) + 1) % ws.length;
      return w;
    }
  };
  const tokens = [];
  const target = Math.round(N * 5.5);
  let chars = 0;
  while (chars < target && tokens.length < N * 4) {
    let pick = srcs[0];
    let best = Infinity;
    srcs.forEach(k => {
      const sc = (made[k] + SRC_AVG[k]) / plan.w[k] * (0.85 + 0.3 * rnd());
      if (sc < best) {
        best = sc;
        pick = k;
      }
    });
    const t = gen[pick]();
    if (!t) {
      made[pick] += SRC_AVG[pick];
      continue;
    }
    tokens.push({ t, src: pick });
    made[pick] += t.length;
    chars += t.length + 1;
  }
  return { tokens, words: tokens.map(x => x.t), focus: wordsB ? wordsB.focus : null, focusPair: wordsB ? wordsB.focusPair : null };
}

export {
  CLASS_ORDER, carrierCtx, carrierWord, classKeys, codeLinePool, compose, defaultMix, legacyMix, mixPlan,
  punctPatterns, symbolPatterns, typeableText
};
