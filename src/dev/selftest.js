import { VERSION, rnd, rngState, seedRng, setRngState } from "../core/base.js";
import { MIX_KEYS } from "../core/schema.js";
import { SCHEMA, SCHEMA_BY_ID, defaultSettings, sanitizeSettings } from "../core/settings.js";
import { dayKey, dayNum, numToKey } from "../core/history.js";
import { S, nf, refreshDerived, t, typeable } from "../core/state.js";
import {
  CUSTOM_CAP, KEY_C, MEM, PAIR_CAP, PAIR_KEEP, adoptData, adoptSettings, applyImport, buildExport,
  clearCustom, customBytes, customStore, customText, customWords, dataFootprint, eraseAll, hasCustom,
  prunePairs, sanitizeData, saveCustom, storeSet
} from "../core/storage.js";
import { CODE_IDS, CODE_SETS } from "../data/code-sets.js";
import { AR_MARKS, LAYOUTS } from "../data/layouts.js";
import { SC_DATA } from "../data/shortcuts.js";
import { QUOTES } from "../data/quotes.js";
import { WORDS } from "../data/words.js";
import { CASE_KEY, buildCodeLesson, codePool, codeSid, newCodeLesson } from "../engine/code.js";
import { diffMap } from "../engine/difficulty.js";
import { ensureLex } from "../engine/lexicon.js";
import {
  carrierCtx, classKeys, codeLinePool, compose, defaultMix, legacyMix, mixPlan, typeableText
} from "../engine/mix.js";
import { activeKeys, computeOrder, currentK, currentOrder } from "../engine/order.js";
import { handleChar, noteSession } from "../engine/session.js";
import { SKILL_K, keyModel, rampMs, skillOf, statusOf } from "../engine/skill.js";
import { charStat, layoutData, mergedStat } from "../engine/stats.js";
import {
  applyPlacement, consistency, genTestWords, testBackspace, testChar, testExt, testFinish, testNew
} from "../engine/test.js";
import {
  learnTrack, newLesson, setTrackK, trackActive, trackK, trackKeys, trackList
} from "../engine/tracks.js";
import { LEVEL_EXP, buildWords } from "../engine/words.js";
import {
  CODE_GROUPS, codeClockLeft, codeClockStart, codeLabel, codeRoundEnd, dropdown, renderCodeRes,
  stopCodeClock
} from "../features/code.js";
import {
  builtinPresets, chipKeys, codeMode, mixSig, newFreeLesson, normalizeMix, practiceMix, savePreset,
  setMixWeight
} from "../features/free.js";
import { SC_CATS, scItems, scMatch, scMode, scParse } from "../features/shortcuts.js";
import { extrasRow, finishSteps, startSteps } from "../features/steps.js";
import { T } from "../i18n/strings.js";
import { produceChars } from "../input/keys.js";
import { U, applyChrome, go, render } from "../ui/dom.js";
import { onKeyDown } from "../ui/practice.js";
import { applyFilter, setSetting, settingRow, syncRows } from "../ui/settings.js";
import { classOfChar, clsFilter, clsOptions, renderDetail, signedMs } from "../ui/stats.js";
import { historyCard, onTestKey, resultCard } from "../ui/test.js";
import { iso, renderTyper, whyInfo, whyRaw } from "../ui/typer.js";

function runSelfTest() {
  const out = [];
  const add = (name, ok, info) => out.push({ name, ok: !!ok, info: info || "" });
  const keep = { settings: S.settings, data: S.data, lesson: S.lesson, sess: S.sess, recent: S.recent, noSave: S.noSave, test: S.test, testOv: S.testOv, rng: rngState };
  S.noSave = true;
  seedRng(20261022);
  const fresh = (lid, extra) => {
    S.settings = sanitizeSettings(Object.assign({ layout: lid, targetWpm: 30, lessonWords: 20 }, extra || {}));
    S.data = { v: VERSION, layouts: {}, lessons: [], tests: [], code: [], sc: {}, days: {}, pbs: {} };
    S.sess = null;
    S.recent = [];
    S.testOv = null;
    refreshDerived();
  };
  const gauss = () => {
    let u = 0;
    let v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  try {
    fresh("en-qwerty");
    const total = currentOrder().length;
    add("gate ramps with unlocked keys", rampMs(4) > rampMs(13) && rampMs(13) > rampMs(total) && Math.abs(rampMs(total) - 400) < 1, nf(rampMs(4)) + " > " + nf(rampMs(total)) + " ms");

    const mk = (n, ms, errEvery) => {
      const st = { n, a: n, e: 0, t: [], o: [], x: {} };
      for (let i = 0; i < n; i++) {
        st.t.push(ms * Math.exp(0.25 * gauss()));
        st.o.push(errEvery && i % errEvery === 0 ? 1 : 0);
      }
      return st;
    };
    const clean = skillOf("en-qwerty", "f", mk(40, 300, 0));
    const messy = skillOf("en-qwerty", "f", mk(40, 300, 4));
    add("accuracy bound passes clean keys, fails error-prone keys", clean.lower >= 0.95 && messy.lower < 0.95, clean.lower.toFixed(2) + " vs " + messy.lower.toFixed(2));
    add("speed bound sits above the estimate", clean.upper > clean.ms, nf(clean.ms) + " < " + nf(clean.upper) + " ms");

    ["en-qwerty", "ar-101", "en-dvorak", "en-colemak"].forEach(lid => {
      S.settings = sanitizeSettings({ layout: lid });
      const ord = computeOrder(lid, "smart");
      const lex = ensureLex(LAYOUTS[lid].lang);
      let at = 0;
      for (let k = 4; k <= 12; k++) {
        const set = new Set(ord.slice(0, k));
        if (lex.entries.filter(e => e.len >= 2 && e.len <= 9 && e.chars.every(c => set.has(c))).length >= 40) {
          at = k;
          break;
        }
      }
      add("real-word pool of 40 by key 8 (" + lid + ")", at > 0 && at <= 8, "reached at " + at + " keys");
    });

    ["en-qwerty", "ar-101"].forEach(lid => {
      fresh(lid);
      layoutData(lid).k = 8;
      let frac = 0;
      const real = new Set(ensureLex(LAYOUTS[lid].lang).entries.map(e => e.w));
      for (let i = 0; i < 6; i++) {
        newLesson();
        const ws = S.lesson.chars.join("").split(" ");
        frac += ws.filter(w => real.has(w)).length / ws.length;
      }
      add("lessons at 8 keys are real words (" + lid + ")", frac / 6 >= 0.9, Math.round((frac / 6) * 100) + "%");
    });

    fresh("en-qwerty");
    layoutData("en-qwerty").k = 12;
    const seen = [];
    let overlap = 0;
    for (let i = 0; i < 5; i++) {
      newLesson();
      const ws = S.lesson.chars.join("").split(" ");
      seen.slice(-3).forEach(prev => ws.forEach(w => { if (prev.indexOf(w) >= 0) overlap++; }));
      seen.push(ws);
    }
    add("no word repeats within three lessons", overlap === 0, overlap + " repeats");

    S.sess = null;
    [100, 100, 100, 130, 130].forEach((m, i) => noteSession(m, i < 3 ? 0.01 : 0.05));
    const fat = S.sess.fat;
    S.sess = null;
    [100, 100, 100, 102, 98].forEach(m => noteSession(m, 0.01));
    add("fatigue guard trips only when speed and errors both worsen", fat && !S.sess.fat);

    const old = sanitizeData({ v: 1, layouts: { "en-qwerty": { chars: { a: { n: 5, a: 5, e: 0, t: [300, 310], o: [0, 0], x: {} } }, pairs: {}, k: 6 } }, lessons: [] });
    add("older saved data still loads", old.layouts["en-qwerty"] && old.layouts["en-qwerty"].k === 6 && old.layouts["en-qwerty"].lk === 0);

    const sim = (lid, lessons) => {
      fresh(lid);
      newLesson();
      const a = {};
      const hooks = { painted() {}, finished() { newLesson(); } };
      let ts = 1000;
      let g = 1;
      let k0 = currentK();
      let last = 0;
      let gap = 0;
      let at10 = 0;
      for (let l = 1; l <= lessons; l++) {
        const chars = S.lesson.chars.slice();
        for (let i = 0; i < chars.length; i++) {
          const c = chars[i];
          if (a[c] === undefined) a[c] = Math.min(2.2, Math.exp(-0.5 + 0.5 * gauss()));
          g *= 1 - 0.00002;
          ts += 650 * g * (1 + a[c]) * Math.exp(0.25 * gauss());
          if (rnd() < Math.min(0.3, 0.01 + 0.06 * a[c])) {
            handleChar("\u0001", ts, hooks);
            ts += 500 + rnd() * 300;
          }
          handleChar(c, ts, hooks);
          a[c] *= 0.98;
        }
        ts += 3000;
        const k = currentK();
        if (k !== k0) {
          gap = Math.max(gap, l - last);
          last = l;
          k0 = k;
        }
        if (k >= 10 && !at10) at10 = l;
      }
      return { at10, gap, k: currentK() };
    };
    ["en-qwerty", "ar-101"].forEach(lid => {
      const r = sim(lid, 160);
      add("simulated beginner reaches 10 keys without stalling (" + lid + ")", r.at10 > 0 && r.at10 <= 160 && r.gap <= 40, "10 keys at lesson " + r.at10 + ", longest wait " + r.gap + " lessons");
    });

    const scData = sanitizeData({ sc: { "x|copy": { n: 1 }, "winfoo": { n: 1 }, "mac|copy": { n: 1 } } });
    add("shortcut keys are validated strictly", !scData.sc["x|copy"] && !scData.sc["winfoo"] && !!scData.sc["mac|copy"]);

    fresh("en-qwerty");
    const ordP = currentOrder();
    const LP = layoutData("en-qwerty");
    for (let i = 0; i < 10; i++) if (i !== 6) LP.chars[ordP[i]] = mk(40, 200, 0);
    LP.chars[ordP[10]] = mk(3, 200, 0);
    applyPlacement({ lid: "en-qwerty", res: {}, strokes: 5 });
    add("placement skips sparse keys and stops at the last key that passed", LP.k === 10 && LP.placed === true, "placed " + LP.k + " keys");

    fresh("en-qwerty");
    S.testOv = { mode: "words", amt: 10, list: "1000", punct: false, num: false, caps: false, dia: false };
    testNew(false);
    testFinish(2000);
    add("an empty placement test does not mark placement", layoutData("en-qwerty").placed === false && S.test.res.placed === currentK());
    S.testOv = null;

    fresh("en-qwerty", { testCaps: true, testDia: true, testPunct: true });
    const extEn = testExt();
    fresh("ar-101", { testCaps: true, testDia: true });
    const extAr = testExt();
    fresh("ar-101", { testCaps: true });
    const extAr0 = testExt();
    add("test history ignores options that do not apply to the language", extEn === 5 && extAr === 8 && extAr0 === 0, extEn + ", " + extAr + ", " + extAr0);

    const mig = sanitizeData({ tests: [{ lid: "ar-101", ext: 15 }, { lid: "en-qwerty", ext: 15 }] });
    add("older test options migrate to the applicable bits", mig.tests[0].ext === 11 && mig.tests[1].ext === 7);

    const big = {};
    for (let i = 0; i < PAIR_CAP + 400; i++) big[String.fromCharCode(0x100 + (i % 60), 0x200 + Math.floor(i / 60))] = { n: i, m: 300 };
    const loaded = sanitizeData({ layouts: { "en-qwerty": { pairs: big } } });
    const pruned = { pairs: Object.assign({}, big) };
    prunePairs(pruned);
    add("one pair cap applies on load and on save", Object.keys(loaded.layouts["en-qwerty"].pairs).length === PAIR_CAP && Object.keys(pruned.pairs).length === PAIR_KEEP);

    fresh("ar-101", { testDia: true });
    const gw = genTestWords(400, { prev: "", left: 5, cap: true });
    add("Arabic diacritics come from one shared set", AR_MARKS.every(typeable) && gw.some(w => AR_MARKS.indexOf(w[w.length - 1]) >= 0));

    add("consistency never returns NaN", consistency([]) === 0 && consistency([NaN, 5]) === 0 && isFinite(consistency([100, 110, 90])));

    add("shortcut parser maps digits and symbols to key codes", scParse("Ctrl+4").code === "Digit4" && scParse("Ctrl+/").code === "Slash" && scParse("Ctrl+]").code === "BracketRight" && scParse("Ctrl+[").code === "BracketLeft" && scParse("Ctrl+`").code === "Backquote" && scParse("Ctrl+-").code === "Minus" && scParse("Ctrl+=").code === "Equal" && scParse("Ctrl+\\").code === "Backslash");

    fresh("en-qwerty");
    const adoptedOk = adoptData(JSON.stringify({ layouts: { "en-qwerty": { k: 9 } } }));
    const adoptedBad = adoptData("{broken");
    add("data written by another tab is adopted safely", adoptedOk && !adoptedBad && layoutData("en-qwerty").k === 9);

    const erasedOk = adoptData(null);
    add("data erased in another tab is cleared here", erasedOk && layoutData("en-qwerty").k !== 9 && S.data.lessons.length === 0);

    fresh("en-qwerty");
    const themedOk = adoptSettings(JSON.stringify({ theme: "dark" }));
    const themedBad = adoptSettings("{broken");
    add("settings written by another tab are adopted safely", themedOk && !themedBad && S.settings.theme === "dark");

    fresh("en-qwerty");
    testNew();
    testChar(" ", 1000);
    const idleRun = S.test.running;
    testChar("x", 2000);
    add("the test clock starts on the first letter, not on a space", !idleRun && S.test.running && S.test.start === 2000);

    let keyGuard = true;
    try {
      onKeyDown({});
    } catch (err) {
      keyGuard = false;
    }
    add("a key event without a key is ignored", keyGuard);

    fresh("en-qwerty");
    newLesson();
    const midLesson = S.lesson;
    midLesson.idx = 3;
    setSetting("lessonWords", 30);
    const kept = S.lesson === midLesson;
    midLesson.idx = 0;
    setSetting("lessonWords", 25);
    add("settings changed mid-lesson wait for the next lesson", kept && S.lesson !== midLesson);

    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const cspText = cspMeta ? cspMeta.getAttribute("content") : "";
    add("a content security policy blocks network requests", cspText.indexOf("connect-src 'none'") >= 0 && cspText.indexOf("default-src 'none'") >= 0);

    const chordRe = /^(Key[A-Z]|Digit\d|Arrow(Left|Right|Up|Down)|Backspace|Delete|Home|End|Escape|Tab|Space|Period|Comma|Slash|Backslash|BracketLeft|BracketRight|Backquote|Minus|Equal|Semicolon|Enter|PageUp|PageDown|F\d+)$/;
    const badChord = [];
    SC_DATA.forEach(d => [d[3], d[4]].forEach(cs => (cs || []).forEach(c => { if (!chordRe.test(scParse(c).code)) badChord.push(c); })));
    add("every shortcut resolves to a real key code", !badChord.length, badChord.join(", "));
    add("shortcut ids fit the saved-data key format and are unique", SC_DATA.every(d => /^[a-z]{2,12}$/.test(d[0])) && new Set(SC_DATA.map(d => d[0])).size === SC_DATA.length);
    add("the code editor group has shortcuts on both systems", scItems("win", "editor").length >= 8 && scItems("mac", "editor").length >= 8 && sanitizeSettings({ scCat: "editor" }).scCat === "editor");
    add("every app group has shortcuts on both systems", SC_CATS.every(c => scItems("win", c).length >= 4 && scItems("mac", c).length >= 4) && SC_CATS.every(c => sanitizeSettings({ scCat: c }).scCat === c));
    add("shortcut practice is never multiple choice", ["win", "mac"].every(o => scItems(o, "all").every(i => i.mode === "press" || i.mode === "recall")) && !document.querySelector(".scopt"));
    add("reserved shortcuts are recalled and capturable ones are pressed", scMode("win", ["Win+D"]) === "recall" && scMode("win", ["Ctrl+W"]) === "recall" && scMode("mac", ["Cmd+Q"]) === "recall" && scMode("win", ["Ctrl+C"]) === "press" && scMode("win", ["F2"]) === "press");
    add("the shortcut view setting accepts only practice or cheat", sanitizeSettings({ scView: "cheat" }).scView === "cheat" && sanitizeSettings({ scView: "quiz" }).scView === "practice");
    const evt = (code, o) => Object.assign({ code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }, o);
    add("editor shortcuts match the keys they describe", scMatch(evt("Slash", { ctrlKey: true }), ["Ctrl+/"]) && scMatch(evt("ArrowDown", { shiftKey: true, altKey: true }), ["Shift+Alt+Down"]) && !scMatch(evt("Slash"), ["Ctrl+/"]));

    fresh("en-qwerty", { targetWpm: 150 });
    add("a 150 wpm target keeps the speed gate sensible", S.settings.targetWpm === 150 && Math.abs(S.derived.targetMs - 80) < 0.01 && rampMs(4) > rampMs(total) && Math.abs(rampMs(total) - 80) < 1 && isFinite(rampMs(4)), nf(rampMs(4)) + " > " + nf(rampMs(total)) + " ms");
    add("speed targets above the old maximum are accepted", sanitizeSettings({ targetWpm: 140 }).targetWpm === 140 && sanitizeSettings({ targetWpm: 400 }).targetWpm === 150);

    fresh("en-qwerty");
    S.data.lessons.push({ ts: 1, lid: "en-qwerty", wpm: 20, acc: 1, n: 10 }, { ts: 2, lid: "en-qwerty", wpm: 21, acc: 1, n: 10 });
    S.data.saved = 12345;
    const fp = dataFootprint();
    add("the privacy summary reports counts and the last save", fp.lessons === 2 && fp.tests === 0 && fp.saved === 12345 && isFinite(fp.bytes) && fp.bytes >= 0);
    add("the last save time survives loading", sanitizeData({ saved: 777 }).saved === 777 && sanitizeData({ saved: "x" }).saved === 0);

    fresh("en-qwerty", { fontSize: 50 });
    layoutData("en-qwerty").k = 9;
    eraseAll();
    add("erasing everything restores defaults", S.data.lessons.length === 0 && !S.data.layouts["en-qwerty"] && S.settings.fontSize === defaultSettings().fontSize);

    const codeLines = [].concat.apply([], CODE_IDS.map(i => CODE_SETS[i]));
    const wanted = ["py", "r", "js", "ts", "cpp", "rust", "go", "commit", "git", "sql", "sh"];
    add("code mode covers many languages and everyday developer text", wanted.every(k => CODE_SETS[k] && CODE_SETS[k].length >= 4) && CODE_IDS.length >= 20, CODE_IDS.length + " sets, " + codeLines.length + " lines");
    add("every code line can be typed on every English layout", ["en-qwerty", "en-dvorak", "en-colemak"].every(l => codeLines.every(x => x.length <= 90 && x.split("").every(c => c === " " || LAYOUTS[l].rev[c]))));
    add("code lines are unique", new Set(codeLines).size === codeLines.length);
    add("every code set has a readable name", CODE_IDS.every(i => typeof codeLabel(i) === "string" && codeLabel(i).length > 0));

    fresh("en-qwerty");
    S.codeRes = null;
    S.codeRecent = [];
    newCodeLesson();
    const codeLesson = S.lesson;
    const quiet = { painted() {}, finished() {} };
    let cts = 1000;
    codeLesson.chars.slice().forEach(c => { cts += 180; handleChar(c, cts, quiet); });
    add("code practice never writes into letter progress", !S.data.layouts["en-qwerty"] && Object.keys(S.data.layouts["en-qwerty:code"].chars).length > 5 && S.data.lessons.length === 0 && !!S.codeRes);

    const reload = sanitizeData(JSON.parse(JSON.stringify(S.data)));
    add("code stats survive saving and loading", Object.keys(reload.layouts["en-qwerty:code"].chars).length === Object.keys(S.data.layouts["en-qwerty:code"].chars).length);


    fresh("ar-101");
    S.codeRecent = [];
    newCodeLesson();
    const keepView = S.view;
    S.view = "code";
    const typedQ = produceChars({ code: "KeyQ", key: "ض", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, getModifierState() { return false; } });
    S.view = keepView;
    const keepTyper = U.typer;
    const keepSpans = U.spans;
    U.typer = document.createElement("div");
    renderTyper();
    const ltr = U.typer.getAttribute("dir") === "ltr" && U.typer.getAttribute("lang") === "en";
    U.typer = keepTyper;
    U.spans = keepSpans;
    add("Arabic users practise code on the English layout, left to right", codeSid() === "en-qwerty:code" && typedQ === "q" && ltr && S.lesson.chars.every(c => c === " " || LAYOUTS["en-qwerty"].rev[c]));

    fresh("en-qwerty");
    const tildeShare = () => {
      let hit = 0;
      let all = 0;
      for (let i = 0; i < 150; i++) {
        S.codeRecent = [];
        buildCodeLesson().forEach(x => { all++; if (x.indexOf("~") >= 0) hit++; });
      }
      return hit / all;
    };
    const before = tildeShare();
    layoutData("en-qwerty:code").chars["~"] = mk(40, 1600, 2);
    const after = tildeShare();
    add("lines with your slowest symbols appear more often", after > 0 && after >= before * 1.4, nf(before * 100) + "% to " + nf(after * 100) + "%");

    fresh("en-qwerty", { codeSet: "commit" });
    S.codeRecent = [];
    add("a chosen text set is respected", buildCodeLesson().every(x => CODE_SETS.commit.indexOf(x) >= 0));
    S.codeRecent = [];

    fresh("en-qwerty");
    const LW = layoutData("en-qwerty");
    const dmW = diffMap("en-qwerty");
    const flat = (n, ms) => ({ n, a: n, e: 0, t: new Array(n).fill(ms), o: new Array(n).fill(0), x: {} });
    ["a", "s", "d", "f", "j", "k", "l", "e", "t", "r"].forEach(c => { LW.chars[c] = flat(30, 300 * dmW[c] / 1.15 * (c === "e" ? 2.5 : 1)); });
    S.lesson = { focus: "e", focusPair: null, chars: [], idx: 0 };
    const whySlow = whyInfo();
    S.lesson = { focus: "q", focusPair: null, chars: [], idx: 0 };
    const whyNew = whyInfo();
    S.lesson = { focus: "a", focusPair: null, chars: [], idx: 0 };
    const whySteady = whyInfo();
    const focusText = c => t("why.focus").replace("{k}", iso(c));
    add("the lesson line names the focus plainly and keeps the numbers behind a tap", !!whySlow && whySlow.text === focusText("e") && /\d/.test(whySlow.detail) && whySlow.detail.indexOf("samples") >= 0, whySlow && whySlow.text);
    add("the lesson line reads the same for new and settled keys", !!whyNew && whyNew.text === focusText("q") && !!whySteady && whySteady.text === focusText("a") && whyNew.detail !== whySteady.detail);

    LW.pairs["tr"] = { n: 12, m: 1400 };
    S.lesson = { focus: "e", focusPair: "tr", chars: [], idx: 0 };
    const whyPair = whyInfo();
    add("the lesson line names a slow pair in typing order", !!whyPair && whyPair.text.indexOf(iso("r") + " after " + iso("t")) >= 0, whyPair && whyPair.text);

    const whyKeys = Object.keys(T).filter(k => k.indexOf("why.") === 0);
    add("the lesson line is written in both languages", whyKeys.length >= 5 && whyKeys.every(k => T[k][0].length > 0 && /[\u0600-\u06FF]/.test(T[k][1])));
    add("the lesson line never grades", whyKeys.every(k => !/fail|wrong|bad|poor|mistake|slow|fast|rest|break|new|better|worse|good|great/i.test(T[k][0])));
    S.lesson = { focus: "e", focusPair: null, chars: [], idx: 0, code: true };
    add("code lessons have no letter explanation", whyInfo() === null);

    S.settings.ui = "ar";
    S.lesson = { focus: "q", focusPair: null, chars: [], idx: 0 };
    const whyAr = whyInfo();
    S.settings.ui = "en";
    const whyEn = whyInfo();
    add("the lesson line follows the interface language", /[\u0600-\u06FF]/.test(whyAr.text) && !/[\u0600-\u06FF]/.test(whyEn.text));

    add("the app never suggests a break", typeof breakText === "undefined" && !T["note.break"]);
    add("no message anywhere suggests rest or comments on speed", Object.keys(T).every(k => !/take a (short )?(break|rest)|have a rest|good moment|slow down|speed up|well done|great job|nice work|keep it up|congrat/i.test(T[k][0])));
    add("shortcut strings stay neutral in both languages", Object.keys(T).filter(k => k.indexOf("sc.") === 0).every(k => !/wrong|awesome|perfect|keep it up|almost|oops|take a (short )?(break|rest)|well done|great job|أحسنت|ممتاز|رائع|خطأ فادح|حاول مرة أخرى/i.test(T[k][0] + " " + T[k][1])));
    S.sess = null;

    const ddPicked = [];
    const ddOpts = [{ v: "a", l: "Alpha", g: "One" }, { v: "b", l: "Beta", g: "One" }, { v: "c", l: "Gamma", g: "Two" }];
    const ddHost = document.createElement("div");
    document.body.appendChild(ddHost);
    const dd = dropdown(ddOpts, "a", v => ddPicked.push(v), "Test");
    ddHost.appendChild(dd);
    const ddBtn = dd.querySelector(".dd");
    const ddList = dd.querySelector(".ddl");
    let leaked = 0;
    const spy = () => { leaked++; };
    window.addEventListener("keydown", spy);
    const key = (el, k) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    const closedFirst = ddList.hidden && ddBtn.getAttribute("aria-expanded") === "false";
    ddBtn.click();
    const openedOk = !ddList.hidden && ddBtn.getAttribute("aria-expanded") === "true" && ddList.querySelectorAll(".ddg").length === 2;
    key(ddList, "ArrowDown");
    key(ddList, "g");
    const typeahead = ddList.getAttribute("aria-activedescendant") === dd.querySelectorAll(".ddo")[2].id;
    key(ddList, "Enter");
    const pickedOk = ddPicked[0] === "c" && ddList.hidden && ddBtn.textContent.indexOf("Gamma") >= 0 && dd.querySelectorAll(".ddo")[2].getAttribute("aria-selected") === "true";
    ddBtn.click();
    key(ddList, "Escape");
    const escOk = ddList.hidden && ddPicked.length === 1;
    ddBtn.click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const outsideOk = ddList.hidden;
    window.removeEventListener("keydown", spy);
    ddHost.remove();
    add("the dropdown opens, selects, searches by letter and closes with Escape or a click outside", closedFirst && openedOk && typeahead && pickedOk && escOk && outsideOk);
    const ddIso = dropdown([{ v: "x", l: "C++" }], "x", () => {}, "Iso");
    add("dropdown labels are isolated so mixed-direction text keeps its order", ddIso.querySelector(".dd bdi") !== null && ddIso.querySelector(".ddo bdi") !== null);
    add("keys used inside the dropdown never reach the typing surface", leaked === 0, leaked + " leaked");

    const grouped = [].concat.apply([], Object.keys(CODE_GROUPS).map(g => CODE_GROUPS[g]));
    add("every text set belongs to exactly one dropdown group", grouped.length === CODE_IDS.length && new Set(grouped).size === grouped.length && CODE_IDS.every(i => grouped.indexOf(i) >= 0));

    const trivial = ["lang", "layout", "ui", "theme"];
    const needHelp = SCHEMA.filter(r => !r.hidden && trivial.indexOf(r.id) < 0);
    add("every meaningful setting has a help line in both languages", needHelp.every(r => r.help && T["s." + r.id + ".h"] && T["s." + r.id + ".h"][0].length > 0 && /[\u0600-\u06FF]/.test(T["s." + r.id + ".h"][1])), needHelp.filter(r => !r.help).map(r => r.id).join(", "));
    add("conditional settings explain why they are unavailable", SCHEMA.filter(r => r.when).every(r => T["s." + r.id + ".off"] && /[\u0600-\u06FF]/.test(T["s." + r.id + ".off"][1])));

    const keepRows = U.rows;
    U.rows = [];
    fresh("ar-101");
    const capsRow = settingRow(SCHEMA_BY_ID.caps);
    document.body.appendChild(capsRow);
    syncRows();
    const offAr = capsRow.classList.contains("off") && !capsRow.hidden && capsRow.querySelector("button.sw").disabled && !capsRow.querySelector(".why-off").hidden;
    S.settings.layout = "en-qwerty";
    syncRows();
    const onEn = !capsRow.classList.contains("off") && !capsRow.querySelector("button.sw").disabled && capsRow.querySelector(".why-off").hidden;
    capsRow.remove();
    add("a setting that does not apply stays visible, greyed out, with its reason", offAr && onEn);

    U.rows = [];
    fresh("en-qwerty", { targetWpm: 50 });
    const wpmRow = settingRow(SCHEMA_BY_ID.targetWpm);
    document.body.appendChild(wpmRow);
    syncRows();
    const dotOn = wpmRow.classList.contains("chg");
    S.settings.targetWpm = SCHEMA_BY_ID.targetWpm.def;
    syncRows();
    const dotOff = !wpmRow.classList.contains("chg");
    wpmRow.remove();
    add("a changed setting is marked and unmarked when restored", dotOn && dotOff);

    U.rows = [];
    fresh("ar-101");
    const fontRow = settingRow(SCHEMA_BY_ID.font);
    const pv = fontRow.querySelector(".pv");
    fresh("en-qwerty", { ui: "ar" });
    const pvEn = settingRow(SCHEMA_BY_ID.font).querySelector(".pv");
    add("the font row previews text in the practice language and direction", !!pv && pv.getAttribute("dir") === "rtl" && pv.getAttribute("lang") === "ar" && /[\u0600-\u06FF]/.test(pv.textContent));
    add("the font preview is not blank when the interface is Arabic", pvEn.textContent.length > 10 && pvEn.getAttribute("dir") === "ltr");
    U.rows = keepRows;

    const keepRows2 = U.rows;
    U.rows = [];
    fresh("ar-101");
    const exAr = extrasRow();
    document.body.appendChild(exAr);
    syncRows();
    const chipAr = id => exAr.querySelector('button[data-id="' + id + '"]');
    const arState = exAr.querySelectorAll(".chips button").length === 4 && chipAr("caps").disabled && !chipAr("dia").disabled && !exAr.querySelector(".why-off").hidden && exAr.querySelector(".why-off").textContent === t("s.caps.off");
    chipAr("caps").click();
    const arClick = S.settings.caps === false || S.settings.caps === SCHEMA_BY_ID.caps.def;
    exAr.remove();
    U.rows = [];
    fresh("en-qwerty");
    const exEn = extrasRow();
    document.body.appendChild(exEn);
    syncRows();
    const enState = exEn.querySelectorAll(".chips button").length === 4 && exEn.querySelector('button[data-id="dia"]').disabled && !exEn.querySelector('button[data-id="caps"]').disabled && exEn.querySelector(".why-off").textContent === t("s.dia.off");
    exEn.querySelector('button[data-id="digits"]').click();
    const digitsOn = exEn.querySelector('button[data-id="digits"]').getAttribute("aria-pressed") === "true" && S.settings.digits === true;
    exEn.remove();
    U.rows = keepRows2;
    add("the lesson options show every choice and grey out the one that does not apply", arState && arClick && enState && digitsOn);

    fresh("en-qwerty", { codeTimer: "banana" });
    const timerDefault = S.settings.codeTimer === "after";
    const timerOk = ["off", "after", "15", "30", "60"].every(v => sanitizeSettings({ codeTimer: v }).codeTimer === v);
    add("the code timer setting accepts its choices and rejects anything else", timerDefault && timerOk);


    fresh("en-qwerty", { codeTimer: "after" });
    stopCodeClock();
    add("no countdown starts unless a duration is chosen", codeClockStart(0) === false && S.codeClock === null);

    fresh("en-qwerty", { codeTimer: "30" });
    stopCodeClock();
    S.codeRes = null;
    newCodeLesson();
    const roundLesson = S.lesson;
    let rts = 1000;
    roundLesson.chars.slice(0, 20).forEach(c => { rts += 180; handleChar(c, rts, quiet); });
    const started = codeClockStart(1000);
    const again = codeClockStart(2000);
    const leftMid = codeClockLeft(11000);
    const leftEnd = codeClockLeft(40000);
    codeRoundEnd(1000 + 30000);
    add("a countdown counts down, ends the round, reports it and starts fresh", started && !again && leftMid === 20 && leftEnd === 0 && S.codeClock === null && !!S.codeRes && S.codeRes.dur === 30 && S.lesson !== roundLesson && S.lesson.idx === 0);
    add("a countdown round never touches letter progress", !S.data.layouts["en-qwerty"] && S.data.lessons.length === 0);

    fresh("en-qwerty", { codeTimer: "30" });
    codeClockStart(0);
    stopCodeClock();
    add("stopping the countdown clears it", S.codeClock === null && codeClockLeft(5000) === 0);

    const sampleRes = { wpm: 30, raw: 31, acc: 0.97, cons: 80, dur: 6.3, series: [{ s: 1, wpm: 20, raw: 20, err: 0 }, { s: 2, wpm: 30, raw: 30, err: 0 }], chars: { ok: 20, bad: 1, extra: 0, miss: 0 }, slow: [{ c: "(", n: 3, m: 300, e: 0, a: 3 }], miss: [{ c: ")", n: 3, m: 200, e: 1, a: 3 }], pbPrev: 28, isPb: false };
    const keepRes4 = U.res;
    U.res = document.createElement("div");
    S.codeRes = sampleRes;
    fresh("en-qwerty", { codeTimer: "off" });
    renderCodeRes();
    const offText = U.res.textContent;
    fresh("en-qwerty", { codeTimer: "after" });
    renderCodeRes();
    const afterText = U.res.textContent;
    const cardCode = U.res.querySelector(".rcard");
    const cardWords = resultCard(sampleRes, "en", null, true);
    fresh("en-qwerty", { result: false });
    renderCodeRes();
    const hiddenOff = U.res.textContent === "";
    U.res = keepRes4;
    add("code results are the Words result card with the same statistics", !!cardCode && cardCode.outerHTML === cardWords.outerHTML && [t("tr.raw"), t("tr.cons"), t("tr.slow"), t("tr.miss"), t("tr.acc")].every(x => afterText.indexOf(x) >= 0));
    add("code results show the time unless the timer is off, and follow the result setting", afterText.indexOf(t("tr.time")) >= 0 && offText.indexOf(t("tr.time")) < 0 && hiddenOff);

    const pbCard = resultCard(Object.assign({}, sampleRes, { isPb: true }), "en", null, true);
    const pbEl = pbCard.querySelector(".pb");
    add("a new best is one muted line, styled like every other", !!pbEl && pbEl.textContent === t("tr.pbNew") && pbEl.className === "pb");

    fresh("en-qwerty");
    S.codeRes = null;
    S.codeRecent = [];
    newCodeLesson();
    const recLesson = S.lesson;
    let rt = 1000;
    recLesson.chars.slice().forEach(c => { rt += 150; handleChar(c, rt, quiet); });
    const cleanRes = S.codeRes;
    add("a code lesson records the same measures as a Words test", S.data.code.length === 1 && isFinite(cleanRes.cons) && cleanRes.series.length > 0 && cleanRes.chars.ok === recLesson.chars.length && cleanRes.chars.bad === 0 && cleanRes.acc === 1 && Math.abs(cleanRes.raw - cleanRes.wpm) < 1e-9 && cleanRes.slow.length > 0 && cleanRes.miss.length === 0 && cleanRes.pbPrev === null && cleanRes.isPb === false);

    newCodeLesson();
    const mistLesson = S.lesson;
    let mt = 50000;
    handleChar("\u00a7", mt, quiet);
    mistLesson.chars.slice().forEach(c => { mt += 150; handleChar(c, mt, quiet); });
    const mist = S.codeRes;
    add("a wrong key is counted once as a stroke, and appears under missed keys", mist.chars.bad === 1 && mist.acc < 1 && mist.miss.length === 1 && mist.pbPrev > 0 && mist.isPb === false && S.data.code.length === 2);

    newCodeLesson();
    const fastLesson = S.lesson;
    let ft = 90000;
    fastLesson.chars.slice().forEach(c => { ft += 100; handleChar(c, ft, quiet); });
    add("a faster lesson than any before is flagged as a new best", S.codeRes.isPb === true && S.data.code.length === 3);

    const codeSan = sanitizeData({ code: [{ lid: "en-qwerty", set: "py", wpm: 40, raw: 41, acc: 0.9, cons: 70 }, { lid: "zz", set: "nope", wpm: -5 }, null, "x"] });
    const bigCode = sanitizeData({ code: Array.from({ length: 250 }, (_, i) => ({ lid: "en-qwerty", set: "mix", wpm: i })) });
    add("saved code history is validated, repaired and capped", codeSan.code.length === 2 && codeSan.code[0].set === "py" && codeSan.code[1].lid === "en-qwerty" && codeSan.code[1].set === "mix" && codeSan.code[1].wpm === 0 && bigCode.code.length === 200 && sanitizeData(null).code.length === 0);

    const histCard = historyCard([{ wpm: 30 }, { wpm: 50 }, { wpm: 40 }], "Title");
    add("the history card reports the best and the median", historyCard([], "Title") === null && histCard.textContent.indexOf(nf(50)) >= 0 && histCard.textContent.indexOf(nf(40)) >= 0);

    const loud = /great|good job|well done|nice|excellent|improv|faster|better|worse|bad|poor|fail|wrong|mistake|normal|keep going|watch|rest|break|slow/i;
    add("code mode never comments on performance", Object.keys(T).filter(k => k.indexOf("code.") === 0).every(k => !loud.test(T[k][0])));

    fresh("en-qwerty");
    S.testOv = { mode: "words", amt: 10, list: "1000", punct: false, num: false, caps: false, dia: false };
    testNew(false);
    const cfTest = S.test;
    cfTest.running = true;
    cfTest.typed = "ab";
    testBackspace(false);
    const plainOne = cfTest.typed;
    testBackspace(true);
    const plainAll = cfTest.typed;
    S.settings.confident = true;
    cfTest.typed = "ab";
    testBackspace(false);
    const keptOne = cfTest.typed;
    testBackspace(true);
    const keptAll = cfTest.typed;
    S.testOv = null;
    add("confident mode makes every key final in Words tests", sanitizeSettings({}).confident === false && sanitizeSettings({ confident: true }).confident === true && plainOne === "a" && plainAll === "" && keptOne === "ab" && keptAll === "ab");

    const keepView3 = S.view;
    const keepBack3 = S.back;
    const keepLesson3 = S.lesson;
    go("code");
    go("settings");
    const backAfterSettings = S.back;
    go("keys");
    const backAfterKeys = S.back;
    const esc = target => (target || window).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    esc();
    const returned = S.view === "code";
    go("settings");
    const filterBox = document.createElement("input");
    filterBox.value = "font";
    document.body.appendChild(filterBox);
    let cleared = false;
    filterBox.addEventListener("input", () => { cleared = filterBox.value === ""; });
    esc(filterBox);
    const keptOpen = S.view === "settings" && filterBox.value === "" && cleared;
    esc(filterBox);
    const leftAfter = S.view === "code";
    filterBox.remove();
    go("practice");
    go("keys");
    esc();
    const fromStats = S.view === "practice";
    go("settings");
    S.back = undefined;
    esc();
    const fallback = S.view === "practice";
    S.view = keepView3;
    S.back = keepBack3;
    S.lesson = keepLesson3;
    render();
    add("Esc leaves Settings and Statistics for the view you came from", backAfterSettings === "code" && backAfterKeys === "code" && returned && fromStats && fallback);
    add("Esc clears a search first and leaves on the next press", keptOpen && leftAfter);

    fresh("en-qwerty");
    const KM = layoutData("en-qwerty");
    const dmK = diffMap("en-qwerty");
    ["a", "s", "d", "f", "j", "k", "l", "e", "t", "r"].forEach(c => { KM.chars[c] = flat(30, 300 * dmK[c] / 1.15); });
    const base0 = keyModel("en-qwerty", "o", undefined);
    const gapMs = 600;
    const withN = n => keyModel("en-qwerty", "e", flat(n, base0.expected * 0 + keyModel("en-qwerty", "e", undefined).expected + gapMs));
    const m0 = keyModel("en-qwerty", "e", undefined);
    const m3 = withN(3);
    const m10 = withN(10);
    const m40 = withN(40);
    add("with no timings the correction is zero and the weight is zero", Math.abs(base0.correction) < 1e-6 && base0.weight === 0 && base0.ne === 0 && Math.abs(m0.correction) < 1e-6 && m0.weight === 0);
    add("a key's correction grows with its samples without passing the measured gap", m3.correction > 0 && m3.correction < m10.correction && m10.correction < m40.correction && m40.correction < gapMs && m40.correction > 0.5 * gapMs && m3.correction < 0.5 * gapMs && m3.weight < m10.weight && m10.weight < m40.weight && Math.abs(m10.weight - m10.ne / (m10.ne + SKILL_K)) < 1e-12, nf(m3.correction) + " < " + nf(m10.correction) + " < " + nf(m40.correction) + " of " + gapMs);
    const fasterKey = keyModel("en-qwerty", "e", flat(30, keyModel("en-qwerty", "e", undefined).expected - 80));
    add("a key faster than expected gets a negative correction", fasterKey.correction < 0 && signedMs(fasterKey.correction).charAt(0) === "\u2212" && signedMs(40).charAt(0) === "+" && signedMs(0) === "+0");
    S.lesson = { focus: "e", focusPair: null, chars: [], idx: 0 };
    add("the lesson line and the key panel share one expectation", Math.abs(whyRaw(S.lesson).usual - keyModel("en-qwerty", "e", charStat("en-qwerty", "e", false)).expected) < 1e-9);
    const detail = renderDetail("e");
    const detailText = detail.textContent;
    add("the key panel shows expected speed, your correction and the weight of your timings", [t("d.exp"), t("d.corr"), t("d.wt")].every(x => detailText.indexOf(x) >= 0));
    const detailNew = renderDetail("q").textContent;
    add("the key panel shows no correction for a key without timings", [t("d.exp"), t("d.corr"), t("d.wt")].every(x => detailNew.indexOf(x) < 0));
    add("the new key-panel labels exist in both languages", ["d.exp", "d.corr", "d.wt"].every(k => T[k][0].length > 0 && /[\u0600-\u06FF]/.test(T[k][1])) && !/slow|fast|harder|easier|better|worse|good|bad|great|poor|weak/i.test(["d.exp", "d.corr", "d.wt"].map(k => T[k][0]).join(" ")));

    add("every code-mode label is written in both languages", Object.keys(T).filter(k => k.indexOf("code.") === 0).every(k => T[k][0].length > 0 && /[\u0600-\u06FF]/.test(T[k][1])));
    const nameLines = CODE_SETS.names;
    add("the naming styles set covers camelCase, PascalCase, snake_case, SCREAMING_SNAKE and kebab-case", nameLines.some(x => /\b[a-z]+[A-Z][a-zA-Z]*\b/.test(x)) && nameLines.some(x => /\b[A-Z][a-z]+[A-Z][a-z]+/.test(x)) && nameLines.some(x => /\b[a-z]+_[a-z]+/.test(x)) && nameLines.some(x => /\b[A-Z]+_[A-Z]+/.test(x)) && nameLines.some(x => /\b[a-z]+-[a-z]+/.test(x)) && nameLines.length >= 10);

    fresh("en-qwerty");
    S.codeRecent = [];
    newCodeLesson();
    const caseLesson = S.lesson;
    const word = "getUserName".split("");
    caseLesson.chars = word;
    caseLesson.flag = new Uint8Array(word.length);
    caseLesson.mark = new Uint8Array(word.length);
    caseLesson.errTs = new Float64Array(word.length);
    let cst = 1000;
    word.forEach(c => { cst += 150; handleChar(c, cst, quiet); });
    const cstat = S.data.layouts["en-qwerty:code"].chars[CASE_KEY];
    const cpair = S.data.layouts["en-qwerty:code"].pairs["t" + CASE_KEY];
    add("each lowercase-to-capital step is recorded with its timing and its pair", !!cstat && cstat.a === 2 && cstat.n === 2 && cstat.o.length === 2 && cstat.o.every(v => v === 0) && !!cpair && cpair.n >= 1);

    newCodeLesson();
    const slipLesson = S.lesson;
    const slipWord = "setUserId".split("");
    slipLesson.chars = slipWord;
    slipLesson.flag = new Uint8Array(slipWord.length);
    slipLesson.mark = new Uint8Array(slipWord.length);
    slipLesson.errTs = new Float64Array(slipWord.length);
    let sst = 5000;
    handleChar("s", sst += 150, quiet);
    handleChar("e", sst += 150, quiet);
    handleChar("t", sst += 150, quiet);
    handleChar("u", sst += 150, quiet);
    slipWord.slice(3).forEach(c => handleChar(c, sst += 150, quiet));
    const sstat = S.data.layouts["en-qwerty:code"].chars[CASE_KEY];
    add("a capital typed in lowercase is counted against the step, once", sstat.e === 1 && sstat.a === 4 && sstat.o.filter(v => v === 1).length === 1);

    newCodeLesson();
    const edgeLesson = S.lesson;
    const edge = "A_B-cD".split("");
    edgeLesson.chars = edge;
    edgeLesson.flag = new Uint8Array(edge.length);
    edgeLesson.mark = new Uint8Array(edge.length);
    edgeLesson.errTs = new Float64Array(edge.length);
    const beforeA = S.data.layouts["en-qwerty:code"].chars[CASE_KEY].a;
    let est2 = 9000;
    edge.forEach(c => handleChar(c, est2 += 150, quiet));
    add("only a capital that follows a lowercase letter counts as a case step", S.data.layouts["en-qwerty:code"].chars[CASE_KEY].a === beforeA + 1);

    fresh("en-qwerty");
    S.lesson = { chars: ["a", "B"], idx: 0, flag: new Uint8Array(2), mark: new Uint8Array(2), errTs: new Float64Array(2), start: 0, prevTs: null, errs: 0, focus: null, focusPair: null, done: false };
    handleChar("a", 1000, quiet);
    handleChar("B", 1150, quiet);
    add("letter lessons do not record case steps", !S.data.layouts["en-qwerty"].chars[CASE_KEY]);

    const roundTrip = sanitizeData(JSON.parse(JSON.stringify((() => { fresh("en-qwerty"); layoutData("en-qwerty:code").chars[CASE_KEY] = flat(12, 300); return S.data; })())));
    add("case step stats survive saving and loading", !!roundTrip.layouts["en-qwerty:code"].chars[CASE_KEY] && roundTrip.layouts["en-qwerty:code"].chars[CASE_KEY].t.length === 12);

    fresh("en-qwerty", { codeSet: "names" });
    const camelShare = () => {
      let hit = 0;
      let all = 0;
      for (let i = 0; i < 150; i++) {
        S.codeRecent = [];
        buildCodeLesson().forEach(x => { all++; if (/[a-z][A-Z]/.test(x)) hit++; });
      }
      return hit / all;
    };
    fresh("en-qwerty");
    const camelBefore = camelShare();
    layoutData("en-qwerty:code").chars[CASE_KEY] = mk(40, 1600, 2);
    const camelAfter = camelShare();
    add("lines with more capital steps appear more often when that step is your slowest", camelAfter >= camelBefore * 1.15, nf(camelBefore * 100) + "% to " + nf(camelAfter * 100) + "%");

    const keepShift = [U.shiftL, U.shiftR];
    const fakeKey = (code, shiftKey, caps) => ({ code, key: "", shiftKey, ctrlKey: false, altKey: false, metaKey: false, getModifierState: n => n === "CapsLock" && !!caps });
    const press = (code, l, r, shiftKey) => { U.shiftL = l; U.shiftR = r; return produceChars(fakeKey(code, shiftKey !== false)); };
    fresh("en-qwerty", { strictShift: true });
    const sLeftKeyLeftShift = press("KeyA", true, false);
    const sLeftKeyRightShift = press("KeyA", false, true);
    const sRightKeyRightShift = press("KeyJ", false, true);
    const sRightKeyLeftShift = press("KeyJ", true, false);
    const sUnknown = press("KeyA", false, false);
    const sBoth = press("KeyA", true, true);
    const sSymbol = press("Digit9", false, true);
    const sLower = press("KeyA", true, false, false);
    U.shiftL = false;
    U.shiftR = false;
    const sCaps = produceChars(fakeKey("KeyA", false, true));
    fresh("en-qwerty", { strictShift: false });
    const looseWrong = press("KeyA", true, false);
    add("strict Shift rejects a capital typed with the same-hand Shift", sLeftKeyLeftShift === "\u21E7" && sRightKeyRightShift === "\u21E7" && sLeftKeyRightShift === "A" && sRightKeyLeftShift === "J", [sLeftKeyLeftShift, sLeftKeyRightShift, sRightKeyRightShift, sRightKeyLeftShift].join(" "));
    add("strict Shift leaves everything else alone", sUnknown === "A" && sBoth === "A" && sSymbol === "\u21E7" && sLower === "a" && sCaps === "A" && looseWrong === "A");
    fresh("en-qwerty", { strictShift: true, inputMode: "system" });
    U.shiftL = true;
    U.shiftR = false;
    const sysKey = produceChars(Object.assign(fakeKey("KeyA", true), { key: "A" }));
    add("strict Shift also applies in typed-character mode", sysKey === "\u21E7");
    U.shiftL = keepShift[0];
    U.shiftR = keepShift[1];

    const shiftEvt = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: "Shift", bubbles: true }));
    U.shiftL = false;
    U.shiftR = false;
    shiftEvt("keydown", "ShiftLeft");
    const heldL = U.shiftL === true && !U.shiftR;
    shiftEvt("keydown", "ShiftRight");
    const heldBoth = U.shiftL === true && U.shiftR === true;
    shiftEvt("keyup", "ShiftLeft");
    const releasedL = U.shiftL === false && U.shiftR === true;
    window.dispatchEvent(new Event("blur"));
    const clearedOnBlur = U.shiftL === false && U.shiftR === false;
    add("the app knows which Shift keys are down and forgets them when the window loses focus", heldL && heldBoth && releasedL && clearedOnBlur);
    U.shiftL = keepShift[0];
    U.shiftR = keepShift[1];

    const keepRows3 = U.rows;
    U.rows = [];
    fresh("en-qwerty");
    const ssRow = settingRow(SCHEMA_BY_ID.shiftPolicy);
    document.body.appendChild(ssRow);
    syncRows();
    const ssOn = !ssRow.classList.contains("off") && SCHEMA_BY_ID.shiftPolicy.def === "off";
    S.settings.inputMode = "system";
    syncRows();
    const ssSystem = !ssRow.classList.contains("off");
    S.settings.inputMode = "layout";
    S.settings.layout = "ar-101";
    syncRows();
    const ssArabic = !ssRow.classList.contains("off");
    ssRow.remove();
    U.rows = keepRows3;
    add("the Shift rule is available in every layout and input mode", ssOn && ssSystem && ssArabic);
    const v3Fixture = () => {
      const letters = "fjdksla;ghrueiwo".split("");
      const chars = {};
      letters.forEach((c, i) => {
        chars[c] = { n: 60 + i, a: 60 + i, e: i % 5, t: [210 + i * 9, 240, 225, 260, 232, 218, 251, 244], o: [0, 0, 1, 0, 0, 0, 0, 0], x: i % 3 === 0 ? { d: 1 } : {}, ls: 1700000000000 + i };
      });
      const codeChars = {};
      "{}()[]=_;:<>/".split("").forEach((c, i) => {
        codeChars[c] = { n: 25 + i, a: 25 + i, e: i % 4, t: [320 + i * 11, 350, 340, 365, 330], o: [0, 1, 0, 0, 0], x: {}, ls: 1700000100000 + i };
      });
      const pairs = { fj: { n: 12, m: 240 }, jf: { n: 10, m: 252 }, dk: { n: 9, m: 261 } };
      return {
        v: 3,
        saved: 1700000200000,
        layouts: {
          "en-qwerty": { chars, pairs, k: 13, rec: [30, 31, 29, 33], lk: 4, tot: 912, rescue: 0, bk: null, raise: null, placed: true },
          "en-qwerty:code": { chars: codeChars, pairs: {}, k: null, rec: [], lk: 0, tot: 140, rescue: 0, bk: null, raise: null, placed: false }
        },
        lessons: [1, 2, 3, 4, 5, 6].map(i => ({ ts: 1700000000000 + i * 1000, lid: "en-qwerty", wpm: 24 + i, acc: 0.93 + i / 200, n: 120 })),
        tests: [{ ts: 1700000300000, lid: "en-qwerty", mode: "time", amt: 30, list: "1000", ext: 0, wpm: 41, raw: 44, acc: 0.95, cons: 82 }, { ts: 1700000400000, lid: "en-qwerty", mode: "words", amt: 25, list: "200", ext: 0, wpm: 38, raw: 40, acc: 0.96, cons: 85 }],
        code: [{ ts: 1700000500000, lid: "en-qwerty", set: "mix", wpm: 28, raw: 30, acc: 0.94, cons: 70 }],
        sc: { "win|copy": { b: 2, n: 14, e: 1, ms: [610, 540, 590] }, "mac|paste": { b: 1, n: 6, e: 0, ms: [700, 650] } }
      };
    };
    const fx = sanitizeData(JSON.parse(JSON.stringify(v3Fixture())));
    const fxChars = Object.keys(v3Fixture().layouts["en-qwerty"].chars);
    add("a v3 profile fixture loads whole and survives a save round trip", fxChars.every(c => fx.layouts["en-qwerty"].chars[c] && fx.layouts["en-qwerty"].chars[c].n >= 60) && Object.keys(fx.layouts["en-qwerty:code"].chars).length === 13 && fx.layouts["en-qwerty"].k === 13 && fx.lessons.length === 6 && fx.tests.length === 2 && fx.code.length === 1 && Object.keys(fx.sc).length === 2 && JSON.stringify(sanitizeData(JSON.parse(JSON.stringify(fx)))) === JSON.stringify(fx), fxChars.length + " letters, " + Object.keys(fx.layouts["en-qwerty:code"].chars).length + " code keys");
    fresh("en-qwerty", { caps: true, digits: true, punct: true, extraRate: 40 });
    const lessonText = seed => {
      seedRng(seed);
      S.recent = [];
      newLesson();
      return S.lesson.chars.join("");
    };
    const seedA = lessonText(11);
    const seedB = lessonText(11);
    const seedC = lessonText(12);
    add("a seeded generator repeats exactly and differs between seeds", seedA === seedB && seedA !== seedC && seedA.length > 20, seedA.length + " chars");
    const genTimes = [];
    const genStart = performance.now();
    for (let i = 0; i < 200; i++) {
      seedRng(1000 + i);
      S.recent = [];
      const g0 = performance.now();
      newLesson();
      genTimes.push(performance.now() - g0);
    }
    const genTotal = performance.now() - genStart;
    genTimes.sort((a, b) => a - b);
    const genMedian = genTimes[100];
    const genMax = genTimes[199];
    add("lesson generation stays within budget", genTimes[197] < 30 && genMax < 100 && genTotal < 3000, "median " + genMedian.toFixed(2) + " ms, max " + genMax.toFixed(2) + " ms, 200 lessons " + genTotal.toFixed(0) + " ms");
    seedRng(5);
    S.recent = [];
    newLesson();
    const keyLesson = S.lesson;
    const keyHooks = { painted() {}, finished() {} };
    const keyTimes = [];
    let kts = 0;
    for (let i = 0; i < 10000; i++) {
      if (!S.lesson || S.lesson.done || S.lesson.idx >= S.lesson.chars.length - 1) {
        S.recent = [];
        newLesson();
      }
      const ch = S.lesson.chars[S.lesson.idx];
      kts += 180;
      const k0 = performance.now();
      handleChar(ch, kts, keyHooks);
      keyTimes.push(performance.now() - k0);
    }
    keyTimes.sort((a, b) => a - b);
    add("10,000 keystrokes stay within one millisecond of the original median", keyTimes[5000] < 1.3 && keyTimes[9900] < 5 && keyLesson.chars.length > 0, "median " + keyTimes[5000].toFixed(3) + " ms, p99 " + keyTimes[9900].toFixed(3) + " ms over 10000 keys");

    {
    const v3 = v3Fixture();
    const mig = sanitizeData(JSON.parse(JSON.stringify(v3)));
    const migL = mig.layouts["en-qwerty"];
    const migC = mig.layouts["en-qwerty:code"];
    const sameStat = (a, b) => a && b && a.n === b.n && a.a === b.a && a.e === b.e && JSON.stringify(a.t) === JSON.stringify(b.t) && JSON.stringify(a.o) === JSON.stringify(b.o);
    add("v3 data migrates to v4 and keeps every key stat, lesson, test, code run and shortcut", mig.v === 4 && Object.keys(v3.layouts["en-qwerty"].chars).every(c => sameStat(migL.chars[c], v3.layouts["en-qwerty"].chars[c])) && Object.keys(v3.layouts["en-qwerty:code"].chars).every(c => sameStat(migC.chars[c], v3.layouts["en-qwerty:code"].chars[c])) && mig.lessons.length === 6 && mig.tests.length === 2 && mig.code.length === 1 && Object.keys(mig.sc).length === 2 && mig.onboard === "done");
    add("the letters track holds the old unlock count and stays in step with it", migL.tracks.letters.k === 13 && migL.k === 13 && (() => { migL.k = 7; return migL.tracks.letters.k === 7; })() && JSON.parse(JSON.stringify(mig)).layouts["en-qwerty"].tracks.letters.k === 7);
    add("a v4 profile round-trips through export and import unchanged", JSON.stringify(sanitizeData(JSON.parse(JSON.stringify(mig)))) === JSON.stringify(mig));
    add("an empty profile starts as new and a used one as done", sanitizeData({}).onboard === "new" && sanitizeData({ onboard: "skipped" }).onboard === "skipped" && sanitizeData({ onboard: "x", lessons: [{ ts: 1, lid: "en-qwerty", wpm: 20, acc: 0.9, n: 50 }] }).onboard === "done");
    const impOk = applyImport(JSON.stringify({ app: "tarq", version: 3, settings: { layout: "en-qwerty", strictShift: true }, data: v3 }));
    add("a v3 export imports into v4 and strict Shift maps to the new policy", impOk && S.settings.shiftPolicy === "strict" && S.settings.mix === null && S.data.v === 4 && S.data.layouts["en-qwerty"].tracks.letters.k === 13);
    const bad = sanitizeSettings({ mix: { letters: { on: true, weight: 999 }, code: { on: "yes" } }, learnTracks: { active: "x", review: 99 }, shiftPolicy: "zzz", capsPolicy: 3, kbFade: "on" });
    add("new v4 settings are clamped and sanitised", bad.mix.letters.weight === 100 && bad.mix.code.on === false && bad.learnTracks.active === "letters" && sanitizeSettings({ reviewRate: 99 }).reviewRate === 30 && sanitizeSettings({ digitSource: "q" }).digitSource === "either" && bad.shiftPolicy === "off" && bad.capsPolicy === "allow" && bad.kbFade === false && sanitizeSettings({ mix: { letters: { on: false } } }).mix === null);
    const steady = (lid, k) => {
      layoutData(lid).k = k;
      currentOrder().slice(0, k).forEach(c => { layoutData(lid).chars[c] = flat(40, 120); });
    };
    fresh("en-qwerty");
    S.data = sanitizeData(JSON.parse(JSON.stringify(v3)));
    const codeBefore = JSON.parse(JSON.stringify(S.data.layouts["en-qwerty:code"].chars));
    const mainBefore = JSON.stringify(S.data.layouts["en-qwerty"].chars);
    const tracksBefore = JSON.stringify(S.data.layouts["en-qwerty"].tracks);
    S.codeRes = null;
    S.codeRecent = [];
    S.settings.codeSet = "mix";
    newCodeLesson();
    const q2 = { painted() {}, finished() {} };
    let t2 = 5000;
    S.lesson.chars.slice().forEach(c => { t2 += 190; handleChar(c, t2, q2); });
    const codeAfter = S.data.layouts["en-qwerty:code"].chars;
    add("code typing adds to the code bucket and leaves letter stats and unlock progress alone", Object.keys(codeBefore).every(c => codeAfter[c] && codeAfter[c].n >= codeBefore[c].n) && Object.keys(codeAfter).some(c => !codeBefore[c] || codeAfter[c].n > codeBefore[c].n) && JSON.stringify(S.data.layouts["en-qwerty"].chars) === mainBefore && JSON.stringify(S.data.layouts["en-qwerty"].tracks) === tracksBefore && !!S.codeRes);
    const merged = mergedStat("en-qwerty", "{");
    const mainBrace = S.data.layouts["en-qwerty"].chars["{"] ? S.data.layouts["en-qwerty"].chars["{"].n : 0;
    add("key views merge the code bucket with the main stats at read time", merged.n === mainBrace + codeAfter["{"].n && merged.t.length <= 40 && mergedStat("en-qwerty", "zz") === undefined && merged.n > v3.layouts["en-qwerty:code"].chars["{"].n);

    const lettersRe = /\p{L}/u;
    const mxo = (names, weights) => {
      const m = defaultMix();
      m.letters.on = false;
      names.forEach((n, i) => { m[n] = { on: true, weight: weights ? weights[i] : 50 }; });
      return m;
    };
    const runBatch = (lid, mixObj, seed, n) => {
      fresh(lid, { mix: mixObj, lessonWords: 14 });
      if (LAYOUTS[lid].lang === "en") steady(lid, 12);
      seedRng(seed);
      S.mixLedger = null;
      const out = [];
      const t0 = performance.now();
      let worst = 0;
      let over = 0;
      for (let i = 0; i < n; i++) {
        S.recent = [];
        const g0 = performance.now();
        out.push(compose(S.settings.mix, S.settings.lessonWords));
        const dt = performance.now() - g0;
        worst = Math.max(worst, dt);
        if (dt > 30) over++;
      }
      return { lessons: out, ms: performance.now() - t0, worst, over };
    };
    const flatTokens = r => [].concat.apply([], r.lessons.map(l => l.tokens));
    const allTypeable = r => flatTokens(r).every(x => typeableText(x.t) && x.t.length > 0);
    const rn = runBatch("en-qwerty", mxo(["digits"]), 21, 40);
    add("numbers only produces digits and number patterns with no letters", allTypeable(rn) && flatTokens(rn).every(x => x.src === "numbers" && !lettersRe.test(x.t)) && flatTokens(rn).some(x => /[:/.%-]/.test(x.t)) && flatTokens(rn).some(x => /^\d+$/.test(x.t)));
    const rc = runBatch("en-qwerty", mxo(["capitals"]), 22, 40);
    add("capitals only produces capitalised words", allTypeable(rc) && flatTokens(rc).every(x => x.src === "words" && x.t[0] === x.t[0].toUpperCase() && x.t[0] !== x.t[0].toLowerCase()));
    const rp = runBatch("en-qwerty", mxo(["punct"]), 23, 60);
    const carrierSet = carrierCtx().set;
    add("punctuation only builds carriers from steady keys alone", allTypeable(rp) && flatTokens(rp).every(x => x.src === "punct" && x.t.split("").every(c => !/[a-z]/.test(c) || carrierSet.has(c))) && flatTokens(rp).some(x => /[.,?!;:"()'/-]/.test(x.t)) && carrierSet.size === 12);
    const rs = runBatch("en-qwerty", mxo(["symbols"]), 24, 40);
    add("symbols only produces typeable coding symbols", allTypeable(rs) && flatTokens(rs).every(x => x.src === "symbols" && /[^a-z\s]/.test(x.t)));
    const rk = runBatch("en-qwerty", mxo(["code"]), 25, 40);
    const poolSet = new Set(codeLinePool());
    add("code only inserts whole lines and never splits one", allTypeable(rk) && flatTokens(rk).every(x => x.src === "code" && poolSet.has(x.t)));
    const rl = runBatch("en-qwerty", mxo(["letters"]), 26, 40);
    add("letters only matches plain word lessons", allTypeable(rl) && flatTokens(rl).every(x => x.src === "words" && /^[a-z]+$/.test(x.t)));
    const names = ["letters", "capitals", "digits", "punct", "symbols", "code"];
    let shareOk = true;
    let worstShare = 0;
    let wholeOk = true;
    let budgetOk = true;
    let typeOk = true;
    let slow = 0;
    for (let i = 0; i < 5; i++) {
      seedRng(300 + i);
      const picked = names.filter(() => rnd() < 0.55);
      if (picked.length < 2) picked.push(names[i], names[(i + 3) % 6]);
      const uniq = Array.from(new Set(picked));
      const weights = uniq.map(() => 15 + Math.round(rnd() * 70));
      const mixObj = mxo(uniq, weights);
      let r = runBatch("en-qwerty", mixObj, 400 + i, 200);
      if (r.ms > 3000 || r.over > 2 || r.worst > 100) r = runBatch("en-qwerty", mixObj, 400 + i, 200);
      const plan = mixPlan(mixObj);
      const tot = Object.keys(plan.w).reduce((a, k) => a + plan.w[k], 0);
      const got = {};
      let all = 0;
      flatTokens(r).forEach(x => { got[x.src] = (got[x.src] || 0) + x.t.length; all += x.t.length; });
      Object.keys(plan.w).forEach(k => {
        const d = Math.abs((got[k] || 0) / all - plan.w[k] / tot);
        worstShare = Math.max(worstShare, d);
        if (d > 0.05) shareOk = false;
      });
      if (!allTypeable(r)) typeOk = false;
      if (!flatTokens(r).filter(x => x.src === "code").every(x => poolSet.has(x.t))) wholeOk = false;
      if (r.ms > 3000 || r.over > 2 || r.worst > 100) budgetOk = false;
      slow = Math.max(slow, r.ms);
    }
    add("five seeded mixes keep character shares within five points of their weights", shareOk, "worst gap " + (worstShare * 100).toFixed(1) + " points");
    add("seeded mixes only use typeable characters and keep code lines whole", typeOk && wholeOk);
    add("a 200-lesson mixed batch stays within the generation budget", budgetOk, "slowest batch " + slow.toFixed(0) + " ms");
    const ra = runBatch("ar-101", mxo(["letters", "dia", "digits", "punct"]), 31, 40);
    add("an Arabic mix stays typeable and left-to-right code falls back to words", allTypeable(ra) && flatTokens(ra).length > 100 && mixPlan(mxo(["code"])).w.words === 1 && mixPlan(mxo(["code"])).w.code === 0, flatTokens(ra).filter(x => x.src !== "words").length + " non-word tokens");
    fresh("en-qwerty", { caps: true, digits: true, punct: true, extraRate: 30 });
    const lm = legacyMix(S.settings);
    seedRng(9);
    S.recent = [];
    newLesson();
    const viaLesson = S.lesson.chars.join("");
    seedRng(9);
    S.recent = [];
    add("old extras settings map onto a mix and leave lesson text unchanged until a mix is set", S.settings.mix === null && lm.letters.on && lm.capitals.on && lm.digits.on && lm.punct.on && !lm.dia.on && !lm.symbols.on && !lm.code.on && viaLesson === buildWords().words.join(" "));
    fresh("en-qwerty");
    layoutData("en-qwerty").k = 5;
    add("class key orders follow the plan", classKeys("digits").join("") === "4756382910" && classKeys("numpad").slice(0, 3).join("") === "546" && classKeys("symbols").length === 22 && classKeys("punct").indexOf("?") > 0 && classKeys("capitals").join("") === currentOrder().slice(0, 5).join("").toUpperCase() && fresh("ar-101") === undefined && classKeys("capitals").length === 0);
    fresh("en-qwerty");
    layoutData("en-qwerty").k = 5;
    S.settings.mix = mxo(["letters", "digits"], [60, 40]);
    seedRng(77);
    S.mixLedger = null;
    S.recent = [];
    newFreeLesson();
    add("a lesson built from a mix is typed through the normal engine", S.lesson.chars.length > 40 && S.lesson.chars.every(c => c === " " || typeable(c)) && /\d/.test(S.lesson.chars.join("")) && S.lesson.flag.length === S.lesson.chars.length);
    }
;

    {
    const keepV = S.view;
    const keepB = S.back;
    const keepL = S.lesson;
    const keepU = U.tabbed;
    const mxo = (names, weights) => {
      const m = defaultMix();
      m.letters.on = false;
      names.forEach((n, i) => { m[n] = { on: true, weight: weights ? weights[i] : 50 }; });
      return m;
    };
    const bannedRe = /wrong|awesome|perfect|keep it up|almost|oops|take a (short )?(break|rest)|well done|great job|\u0623\u062D\u0633\u0646\u062A|\u0645\u0645\u062A\u0627\u0632|\u0631\u0627\u0626\u0639|\u062E\u0637\u0623 \u0641\u0627\u062F\u062D|\u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649/i;
    add("every interface string stays neutral in both languages", Object.keys(T).every(k => !bannedRe.test(T[k][0]) && !bannedRe.test(T[k][1])) && T["fp.last"][0].length > 0);
    fresh("en-qwerty");
    go("free");
    const navTexts = Array.from(document.querySelectorAll("nav button")).map(b => b.textContent);
    add("navigation is Learn, Practice, Test, Shortcuts with no Code tab", navTexts.join("|") === "Learn|Practice|Test|Shortcuts", navTexts.join("|"));
    const chipEls = () => Array.from(document.querySelectorAll(".chips [data-chip]"));
    add("Practice shows one pressed-state chip per source with letters on", chipEls().map(b => b.getAttribute("data-chip")).join(",") === "letters,capitals,digits,punct,symbols,code" && chipEls().filter(b => b.getAttribute("aria-pressed") === "true").length === 1 && chipEls()[0].getAttribute("aria-pressed") === "true" && chipEls().every(b => b.tagName === "BUTTON" && b.getAttribute("type") === "button"));
    chipEls()[2].click();
    add("a chip toggles on and the mix weights sum to 100", chipEls()[2].getAttribute("aria-pressed") === "true" && S.settings.mix.digits.on && MIX_KEYS.reduce((a, k) => a + (S.settings.mix[k].on ? S.settings.mix[k].weight : 0), 0) === 100);
    document.querySelector("[data-chip=letters]").click();
    add("turning off the other chip leaves numbers only with no letters in the lesson", S.settings.mix.letters.on === false && S.lesson.free === true && !/\p{L}/u.test(S.lesson.chars.join("")) && S.lesson.chars.length > 20);
    document.querySelector("[data-chip=digits]").click();
    add("the last chip cannot be turned off and a quiet note says so", document.querySelector("[data-chip=digits]").getAttribute("aria-pressed") === "true" && S.settings.mix.digits.on && document.getElementById("fpnote").textContent === T["fp.last"][0]);
    S.settings.mix = mxo(["letters", "digits", "punct"], [50, 30, 20]);
    S.mixOpen = true;
    go("free");
    const sliders = () => Array.from(document.querySelectorAll(".mixrow input[type=range]"));
    const s0 = sliders()[0];
    s0.value = 70;
    s0.dispatchEvent(new Event("input", { bubbles: true }));
    const sumNow = MIX_KEYS.reduce((a, k) => a + (S.settings.mix[k].on ? S.settings.mix[k].weight : 0), 0);
    add("weight sliders move the others proportionally and always sum to 100", sliders().length === 3 && S.settings.mix.letters.weight === 70 && sumNow === 100 && sliders().reduce((a, el) => a + Number(el.value), 0) === 100);
    let mixSumsOk = true;
    seedRng(61);
    for (let i = 0; i < 300; i++) {
      const m = defaultMix();
      MIX_KEYS.forEach(k => { m[k] = { on: rnd() < 0.5, weight: 1 + Math.floor(rnd() * 99) }; });
      if (!MIX_KEYS.some(k => m[k].on)) m.code.on = true;
      const n = normalizeMix(m);
      const on = MIX_KEYS.filter(k => n[k].on);
      const after = setMixWeight(n, on[0], 1 + Math.floor(rnd() * 99));
      if (on.reduce((a, k) => a + n[k].weight, 0) !== 100 || on.reduce((a, k) => a + after[k].weight, 0) !== 100 || on.some(k => after[k].weight < 1)) mixSumsOk = false;
    }
    add("mix normalising and reweighting always give 100 over random mixes", mixSumsOk);
    fresh("en-qwerty");
    layoutData("en-qwerty").k = 6;
    currentOrder().slice(0, 6).forEach(c => { layoutData("en-qwerty").chars[c] = flat(40, 140); });
    S.settings.mix = mxo(["letters", "digits"], [60, 40]);
    go("free");
    const tracksSnap = JSON.stringify(S.data.layouts["en-qwerty"].tracks);
    const kSnap = layoutData("en-qwerty").k;
    const nBefore = Object.keys(S.data.layouts["en-qwerty"].chars).reduce((a, c) => a + S.data.layouts["en-qwerty"].chars[c].n, 0);
    let ft = 9000;
    let finishedLessons = 0;
    const fh = { painted() {}, finished() { finishedLessons++; newFreeLesson(); } };
    for (let i = 0; i < 6; i++) {
      S.lesson.chars.slice().forEach(c => { ft += 160; handleChar(c, ft, fh); });
    }
    const nAfter = Object.keys(S.data.layouts["en-qwerty"].chars).reduce((a, c) => a + S.data.layouts["en-qwerty"].chars[c].n, 0);
    add("Practice feeds key stats but never unlocks keys or adds Learn history", finishedLessons === 6 && JSON.stringify(S.data.layouts["en-qwerty"].tracks) === tracksSnap && layoutData("en-qwerty").k === kSnap && S.data.lessons.length === 0 && !S.data.layouts["en-qwerty"].tot && nAfter > nBefore, nBefore + " to " + nAfter + " samples");
    S.settings.mix = mxo(["digits"]);
    newLesson();
    add("Learn lessons ignore the Practice mix", !S.lesson.free && /[a-z]/.test(S.lesson.chars.join("")));
    S.settings.mix = mxo(["code"]);
    go("free");
    add("Code on its own uses the code lesson with its language picker and clock", codeMode() && S.lesson.code === true && !!document.querySelector(".cfg .ddw") && !!document.getElementById("codeclock") && !document.querySelector(".kb"));
    S.settings.mix = mxo(["letters", "code"], [60, 40]);
    S.mixLedger = null;
    seedRng(88);
    go("free");
    let anyCode = false;
    for (let i = 0; i < 40 && !anyCode; i++) {
      newFreeLesson();
      anyCode = codePool().some(line => S.lesson.chars.join("").indexOf(line) >= 0);
    }
    add("Code mixed with other sources inserts whole lines into a Practice lesson", !codeMode() && S.lesson.free === true && anyCode && !!document.querySelector(".kb"));
    fresh("en-qwerty");
    S.settings.mix = mxo(["letters", "capitals"], [50, 50]);
    go("free");
    const pv = document.getElementById("fpreview");
    const pvText = pv.querySelector("bdi").textContent;
    add("a preview line shows the start of the next text under the chips", pv && pvText.length >= 20 && pvText.length <= 41 && S.lesson.chars.join("").indexOf(pvText.replace("\u2026", "")) === 0);
    const bi = builtinPresets();
    add("four neutral presets ship with the app", bi.map(p => p.id).join(",") === "text,numbers,prose,code" && mixSig(bi[1].mix) === "digits:100" && bi[2].mix.letters.on && bi[2].mix.capitals.on && bi[2].mix.punct.on && !bi[2].mix.digits.on, bi.map(p => p.id + ":" + mixSig(p.mix)).join(" ; "));
    document.querySelectorAll(".presets .seg button")[1].click();
    add("choosing a preset applies its mix", mixSig(practiceMix()) === "digits:100", mixSig(practiceMix()) + " buttons " + document.querySelectorAll(".presets .seg button").length);
    S.settings.presets = [];
    let savedOk = true;
    for (let i = 0; i < 8; i++) savedOk = savedOk && (i < 6 ? savePreset("Mix " + i) : !savePreset("Mix " + i));
    const longName = savePreset("x".repeat(40));
    const roundP = sanitizeSettings(JSON.parse(JSON.stringify(S.settings))).presets;
    add("up to six named mixes can be saved and survive saving and loading", savedOk && !longName && S.settings.presets.length === 6 && roundP.length === 6 && roundP[0].name === "Mix 0" && JSON.stringify(roundP[2].mix) === JSON.stringify(S.settings.presets[2].mix) && sanitizeSettings({ presets: [{ name: "", mix: {} }, { name: "ok", mix: { letters: { on: true, weight: 5 } } }] }).presets.length === 1);
    S.settings.presets = [];
    fresh("en-qwerty");
    S.settings.mix = mxo(["letters", "digits"], [60, 40]);
    go("free");
    const before = S.lesson.idx;
    U.tabbed = true;
    const chip = document.querySelector("[data-chip=symbols]");
    chip.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));
    chip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    fresh("ar-101");
    S.settings.mix = mxo(["digits"]);
    go("free");
    const arWords = Array.from(document.querySelectorAll("#typer .w"));
    add("ASCII-only words such as numbers stay left-to-right inside the Arabic typer", arWords.length > 2 && arWords.every(w => !!w.querySelector("bdi[dir=ltr]")) && U.spans.every(sp => sp.parentNode.nodeName === "BDI" || sp.textContent.trim() === ""));
    fresh("en-qwerty");
    S.settings.mix = mxo(["letters", "digits"], [60, 40]);
    go("free");
    add("keys pressed on a chip never reach the typer", S.lesson.idx === before && S.lesson.errs === 0);
    U.tabbed = false;
    S.settings.ui = "ar";
    fresh("ar-101", { ui: "ar" });
    go("free");
    const arNav = Array.from(document.querySelectorAll("nav button")).map(b => b.textContent).join("|");
    const arChips = chipEls().map(b => b.getAttribute("data-chip")).join(",");
    add("Arabic Practice is right-to-left with diacritics and no capitals chip", document.documentElement.getAttribute("dir") === "rtl" && arNav === "تعلّم|تمرين|اختبار|اختصارات" && arChips === "letters,digits,punct,symbols,code,dia" && document.getElementById("typer").getAttribute("dir") === "rtl", arNav + " / " + arChips);
    fresh("en-qwerty");
    S.view = keepV;
    S.back = keepB;
    S.lesson = keepL;
    U.tabbed = keepU;
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const flat3 = (n, ms) => flat(n, ms);
    const prep = (lid, over) => {
      fresh(lid, over);
      S.view = "practice";
    };
    const lessonWordsOf = () => S.lesson.chars.join("").split(" ");
    prep("en-qwerty");
    const L0 = layoutData("en-qwerty");
    add("every track has its own key order and start count", trackList().join(",") === "letters,capitals,digits,numpad,punct,symbols" && trackKeys("digits").join("") === "4756382910" && trackKeys("numpad").slice(0, 3).join("") === "546" && trackK("digits") === 2 && trackK("numpad") === 3 && trackK("punct") === 2 && trackK("letters") === currentK());
    setTrackK("digits", 4);
    setTrackK("letters", 6);
    add("track unlock counts are stored per track and the letters track still drives layout.k", L0.tracks.digits.k === 4 && L0.k === 6 && L0.tracks.letters.k === 6 && trackActive("digits").join("") === "4756" && trackActive("letters").length === 6);
    prep("en-qwerty");
    setSetting("learnTracks", { active: "digits" });
    newLesson();
    add("any track can be started at any time with no lock and a neutral note", learnTrack() === "digits" && S.lesson.track === "digits" && lessonWordsOf().every(w => /^[47]+$/.test(w)) && lessonWordsOf().length > 10);
    prep("en-qwerty");
    layoutData("en-qwerty").k = 8;
    setSetting("learnTracks", { active: "capitals" });
    newLesson();
    const capKeys = trackActive("capitals");
    add("the capitals track builds Shift words from the current letters", capKeys.length === 2 && lessonWordsOf().some(w => capKeys.indexOf(w[0]) >= 0) && lessonWordsOf().every(w => w.slice(1).split("").every(c => c === c.toLowerCase()) && w.split("").every(c => activeKeys().indexOf(c.toLowerCase()) >= 0)));
    prep("en-qwerty");
    layoutData("en-qwerty").k = 8;
    setSetting("learnTracks", { active: "punct" });
    newLesson();
    const pAct = new Set(trackActive("punct"));
    const pChars = S.lesson.chars.filter(c => c !== " " && !/\p{L}/u.test(c));
    add("the punctuation track uses only unlocked marks around letter carriers", pChars.length > 3 && pChars.every(c => pAct.has(c)) && S.lesson.chars.filter(c => /\p{L}/u.test(c)).every(c => activeKeys().indexOf(c) >= 0));
    prep("en-qwerty");
    layoutData("en-qwerty").k = 8;
    setSetting("learnTracks", { active: "symbols" });
    newLesson();
    const sAct = new Set(trackActive("symbols"));
    const sChars = S.lesson.chars.filter(c => c !== " " && !/\p{L}/u.test(c));
    add("the symbols track uses only unlocked symbols", sChars.length > 3 && sChars.every(c => sAct.has(c)));
    prep("ar-101");
    layoutData("ar-101").k = 8;
    setSetting("learnTracks", { active: "dia" });
    newLesson();
    const dAct = new Set(trackActive("dia"));
    const dChars = S.lesson.chars.filter(c => c !== " " && !/\p{L}/u.test(c));
    add("the diacritics track adds only unlocked marks in Arabic", trackList().indexOf("capitals") < 0 && trackList().indexOf("dia") >= 0 && (dAct.size === 0 || (dChars.length > 3 && dChars.every(c => dAct.has(c)))), "marks typeable: " + trackKeys("dia").length);
    prep("en-qwerty");
    layoutData("en-qwerty").k = 8;
    setSetting("learnTracks", { active: "digits" });
    newLesson();
    const lettersK = layoutData("en-qwerty").k;
    trackActive("digits").forEach(c => { layoutData("en-qwerty").chars[c] = flat3(40, 120); });
    for (let i = 0; i < 3; i++) S.data.lessons.push({ ts: 1, lid: "en-qwerty", wpm: 50, acc: 1, n: 50 });
    let tt = 4000;
    const th = { painted() {}, finished() {} };
    S.lesson.chars.slice().forEach(c => { tt += 150; handleChar(c, tt, th); });
    add("a Learn track lesson unlocks only its own next key once all its keys are steady", layoutData("en-qwerty").tracks.digits.k === 3 && layoutData("en-qwerty").k === lettersK && layoutData("en-qwerty").tracks.capitals.k === null && layoutData("en-qwerty").tracks.punct.k === null);
    prep("en-qwerty", { progression: "manual" });
    setSetting("learnTracks", { active: "digits" });
    newLesson();
    trackActive("digits").forEach(c => { layoutData("en-qwerty").chars[c] = flat3(40, 120); });
    S.lesson.chars.slice().forEach(c => { tt += 150; handleChar(c, tt, th); });
    add("manual progression keeps a track where it is", layoutData("en-qwerty").tracks.digits.k === null);
    prep("en-qwerty");
    layoutData("en-qwerty").k = 8;
    setTrackK("digits", 3);
    trackActive("digits").forEach(c => { layoutData("en-qwerty").chars[c] = flat3(40, 120); });
    setSetting("reviewRate", 30);
    seedRng(41);
    let revDigit = 0;
    let revTot = 0;
    let revLeak = true;
    for (let i = 0; i < 40; i++) {
      newLesson();
      lessonWordsOf().forEach(w => {
        revTot++;
        if (/^[0-9]+$/.test(w)) revDigit++;
        if (/[0-9]/.test(w) && !w.split("").every(c => trackActive("digits").indexOf(c) >= 0)) revLeak = false;
      });
    }
    const revShare = revDigit / revTot;
    setSetting("reviewRate", 0);
    let revNone = 0;
    for (let i = 0; i < 20; i++) {
      newLesson();
      lessonWordsOf().forEach(w => { if (/[0-9]/.test(w)) revNone++; });
    }
    setSetting("reviewRate", 30);
    setSetting("caps", true);
    let revLegacy = 0;
    seedRng(42);
    for (let i = 0; i < 20; i++) {
      newLesson();
      lessonWordsOf().forEach(w => { if (/^[0-9]+$/.test(w)) revLegacy++; });
    }
    setSetting("caps", false);
    setSetting("learnTracks", { active: "digits" });
    seedRng(43);
    let ownTrack = 0;
    for (let i = 0; i < 10; i++) {
      newLesson();
      lessonWordsOf().forEach(w => { if (!/^[0-9]+$/.test(w)) ownTrack++; });
    }
    add("settled keys from other tracks return in lessons at the review rate", revShare > 0.15 && revShare < 0.45 && revLeak && revNone === 0, "share " + (revShare * 100).toFixed(0) + "% at 30");
    add("review is off with a zero rate, with old extras on, and inside its own track", revNone === 0 && revLegacy === 0 && ownTrack === 0, "legacy " + revLegacy + ", own track " + ownTrack);
    prep("en-qwerty");
    setSetting("learnTracks", { active: "digits" });
    const evt = (code, key) => ({ code, key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, getModifierState() { return false; } });
    newLesson();
    S.settings.digitSource = "either";
    const eitherOk = produceChars(evt("Numpad5", "5")) === "5" && produceChars(evt("Digit5", "5")) === "5";
    S.settings.digitSource = "row";
    const rowOk = produceChars(evt("Numpad5", "5")) === "" && produceChars(evt("Digit5", "5")) === "5";
    S.settings.digitSource = "numpad";
    const padOk = produceChars(evt("Numpad5", "5")) === "5" && produceChars(evt("Digit5", "5")) === "";
    setSetting("learnTracks", { active: "numpad" });
    newLesson();
    S.settings.digitSource = "either";
    const padTrack = produceChars(evt("Numpad4", "4")) === "4" && produceChars(evt("Digit4", "4")) === "" && produceChars(evt("KeyA", "a")) === "a";
    setSetting("learnTracks", { active: "letters" });
    newLesson();
    const plainOk = produceChars(evt("Numpad5", "5")) === "5" && produceChars(evt("Digit5", "5")) === "5";
    S.view = "free";
    const freeOk = produceChars(evt("Numpad5", "5")) === "5";
    S.view = "practice";
    add("the number source setting decides which keys count in the Numbers track", eitherOk && rowOk && padOk, [eitherOk, rowOk, padOk].join());
    add("the keypad track accepts keypad digits only and other views keep both", padTrack && plainOk && freeOk);
    prep("en-qwerty");
    layoutData("en-qwerty").k = 5;
    setSetting("learnTracks", { active: "digits" });
    render();
    const radios = Array.from(document.querySelectorAll(".tracks [role=radio]"));
    const stripKeys = Array.from(document.querySelectorAll("#strip .chip")).filter(c => !c.classList.contains("nx")).map(c => c.textContent);
    add("the Learn page shows a track switcher and the strip follows the active track", radios.map(b => b.textContent).join("|") === "Letters|Capitals|Numbers|Keypad|Punctuation|Symbols" && radios.filter(b => b.getAttribute("aria-checked") === "true").length === 1 && radios[2].getAttribute("aria-checked") === "true" && stripKeys.join("") === "47" && document.getElementById("trnote").textContent === T["lt.uses.digits.either"][0]);
    radios[1].click();
    add("choosing a track switches the lesson and the strip", learnTrack() === "capitals" && S.lesson.track === "capitals" && document.querySelectorAll("#strip .chip").length >= 2 && document.getElementById("trnote").textContent === T["lt.uses.capitals"][0]);
    setSetting("learnTracks", { active: "letters" });
    prep("en-qwerty");
    let genOk = true;
    let genWorst = 0;
    let genOver = 0;
    ["letters", "capitals", "digits", "numpad", "punct", "symbols"].forEach(tr => {
      layoutData("en-qwerty").k = 10;
      setSetting("learnTracks", { active: tr });
      for (let i = 0; i < 30; i++) {
        const g0 = performance.now();
        newLesson();
        const gdt = performance.now() - g0;
        genWorst = Math.max(genWorst, gdt);
        if (gdt > 30) genOver++;
        if (!S.lesson.chars.length || S.lesson.chars.some(c => c !== " " && !typeable(c))) genOk = false;
      }
    });
    add("every track generates typeable lessons within the generation budget", genOk && genOver <= 2 && genWorst < 100, "slowest " + genWorst.toFixed(1) + " ms");
    fresh("en-qwerty");
    S.view = keepV;
    S.lesson = keepL;
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepShift4 = [U.shiftL, U.shiftR];
    const ev = (code, o) => Object.assign({ code, key: "", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, getModifierState: n => n === "CapsLock" && !!(o && o.caps) }, o || {});
    const sh = (l, r) => { U.shiftL = l; U.shiftR = r; };
    fresh("en-qwerty", { shiftPolicy: "strict" });
    sh(true, false);
    const a1 = produceChars(ev("KeyA", { shiftKey: true }));
    sh(false, true);
    const a2 = produceChars(ev("KeyA", { shiftKey: true }));
    sh(true, false);
    const a3 = produceChars(ev("KeyJ", { shiftKey: true }));
    sh(true, true);
    const a4 = produceChars(ev("KeyA", { shiftKey: true }));
    sh(true, false);
    const a5 = produceChars(ev("Digit9", { shiftKey: true }));
    sh(false, true);
    const a6 = produceChars(ev("Digit9", { shiftKey: true }));
    add("strict Shift judges every shifted character by the hand of its key", a1 === "\u21E7" && a2 === "A" && a3 === "J" && a4 === "A" && a5 === "(" && a6 === "\u21E7", [a1, a2, a3, a4, a5, a6].join(" "));
    fresh("en-qwerty", { shiftPolicy: "hint" });
    sh(true, false);
    const h1 = produceChars(ev("KeyA", { shiftKey: true }));
    const h1n = U.shiftNote;
    sh(false, true);
    const h2 = produceChars(ev("KeyA", { shiftKey: true }));
    const h2n = U.shiftNote;
    const h3 = produceChars(ev("KeyA", {}));
    add("hint mode always accepts the character and only notes which hand was used", h1 === "A" && h1n === "same" && h2 === "A" && h2n === "ok" && h3 === "a" && U.shiftNote === null);
    fresh("ar-101", { shiftPolicy: "strict" });
    const arShifted = LAYOUTS["ar-101"].map.KeyA;
    sh(true, false);
    const ar1 = produceChars(ev("KeyA", { shiftKey: true }));
    sh(false, true);
    const ar2 = produceChars(ev("KeyA", { shiftKey: true }));
    add("the Arabic shift layer follows the same hand rule", arShifted[1] !== arShifted[0] && ar1 === "\u21E7" && ar2 === arShifted[1]);
    fresh("en-qwerty", { shiftPolicy: "strict", inputMode: "system" });
    sh(true, false);
    const sy1 = produceChars(ev("KeyA", { shiftKey: true, key: "A" }));
    sh(false, true);
    const sy2 = produceChars(ev("KeyA", { shiftKey: true, key: "A" }));
    const sy3 = produceChars(ev("KeyA", { key: "a" }));
    add("the Shift rule works when typed characters come from the system", sy1 === "\u21E7" && sy2 === "A" && sy3 === "a");
    fresh("en-qwerty", { shiftPolicy: "strict", onError: "stop" });
    newLesson();
    S.lesson.chars[0] = "A";
    S.lesson.chars[1] = "b";
    const q4 = { painted() {}, finished() {} };
    handleChar("\u21E7", 100, q4);
    const stA = charStat("en-qwerty", "A", false);
    add("a same-hand capital is a miss on that character and stores the Shift token", S.lesson.idx === 0 && stA.e === 1 && stA.x["\u21E7"] === 1 && S.lesson.flag[0] === 1);
    fresh("en-qwerty", { shiftPolicy: "strict", onError: "advance" });
    newLesson();
    S.lesson.chars[0] = "A";
    handleChar("\u21E7", 100, q4);
    add("the same miss respects the advance setting", S.lesson.idx === 1 && S.lesson.mark[0] === 2);
    sh(false, false);
    const keyEvt = (type, code, o) => window.dispatchEvent(new KeyboardEvent(type, Object.assign({ code, key: code, bubbles: true }, o || {})));
    keyEvt("keydown", "ShiftLeft");
    keyEvt("keyup", "ShiftLeft");
    keyEvt("keydown", "ShiftLeft", { repeat: true });
    const repeatIgnored = U.shiftL === false;
    keyEvt("keydown", "ShiftRight");
    window.dispatchEvent(new Event("pagehide"));
    const pageCleared = U.shiftR === false;
    keyEvt("keydown", "ShiftLeft");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
    const hiddenCleared = U.shiftL === false;
    add("Shift state ignores auto-repeat and clears on page hide and tab hide", repeatIgnored && pageCleared && hiddenCleared);
    fresh("en-qwerty", { shiftPolicy: "hint" });
    S.view = "practice";
    render();
    newLesson();
    S.lesson.chars[0] = "A";
    const shBefore = layoutData("en-qwerty").sh.same;
    sh(true, false);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "A", shiftKey: true, bubbles: true, cancelable: true }));
    add("hint mode records the side used and outlines that Shift on the keyboard", layoutData("en-qwerty").sh.same === shBefore + 1 && U.kb.shifts[0].classList.contains("used") && !U.kb.shifts[1].classList.contains("used") && S.lesson.errs === 0);
    sh(false, false);
    fresh("en-qwerty", { capsPolicy: "strict" });
    const c1 = produceChars(ev("KeyA", { caps: true }));
    const c2 = produceChars(ev("KeyA", { caps: true, shiftKey: true }));
    fresh("en-qwerty", { capsPolicy: "allow" });
    const c3 = produceChars(ev("KeyA", { caps: true }));
    add("a capital typed with Caps Lock is a miss only under the strict rule", c1 === "\u21EA" && c2 === "a" && c3 === "A");
    fresh("en-qwerty", { capsPolicy: "allow" });
    keyEvt("keydown", "CapsLock", { modifierCapsLock: true });
    const noteOn = document.getElementById("capsnote") && !document.getElementById("capsnote").hidden && document.getElementById("capsnote").textContent === T["note.caps"][0];
    keyEvt("keyup", "CapsLock", { modifierCapsLock: false });
    const noteOff = document.getElementById("capsnote").hidden;
    fresh("en-qwerty", { capsPolicy: "strict" });
    keyEvt("keydown", "CapsLock", { modifierCapsLock: true });
    const noteStrict = document.getElementById("capsnote").hidden;
    keyEvt("keyup", "CapsLock", { modifierCapsLock: false });
    add("a quiet Caps Lock note shows while it is on and the rule is not strict", noteOn && noteOff && noteStrict);
    fresh("en-qwerty", { onError: "advance", backspace: "allow" });
    S.view = "practice";
    render();
    newLesson();
    handleChar("#", 100, q4);
    const idxAfterMiss = S.lesson.idx;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backspace", key: "Backspace", bubbles: true, cancelable: true }));
    const undone = S.lesson.idx === idxAfterMiss - 1 && S.lesson.mark[idxAfterMiss - 1] === 0;
    handleChar("#", 200, q4);
    S.settings.backspace = "off";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backspace", key: "Backspace", bubbles: true, cancelable: true }));
    add("Backspace undoes a skipped mistake only when allowed", idxAfterMiss === 1 && undone && S.lesson.idx === 1);
    fresh("en-qwerty", { kbFade: true });
    layoutData("en-qwerty").k = 6;
    ["f", "j"].forEach(c => { layoutData("en-qwerty").chars[c] = flat(40, 120); });
    S.view = "practice";
    render();
    newLesson();
    const fadeOn = U.kb.keys.KeyF.classList.contains("kfade") && U.kb.keys.KeyJ.classList.contains("kfade") && !U.kb.keys.KeyA.classList.contains("kfade");
    S.settings.kbFade = false;
    newLesson();
    add("settled keys fade on the keyboard only when the setting is on", fadeOn && !U.kb.keys.KeyF.classList.contains("kfade"));
    fresh("en-qwerty", { fingerZones: true });
    S.view = "practice";
    render();
    const zoneOk = U.kb.root.classList.contains("fz") && ["KeyA:p", "KeyS:r", "KeyD:m", "KeyF:i", "KeyJ:i", "KeyL:r", "Semicolon:p", "Digit1:p", "KeyT:i"].every(x => U.kb.keys[x.split(":")[0]].getAttribute("data-f") === x.split(":")[1]);
    S.settings.fingerZones = false;
    render();
    add("finger zones tint each key by its finger and switch off", zoneOk && !U.kb.root.classList.contains("fz"));
    fresh("en-qwerty");
    const ruleIds = SCHEMA.filter(r => r.sec === "rules").map(r => r.id).join(",");
    add("Settings has an Accuracy rules group with all five rules and help lines", ruleIds === "shiftPolicy,capsPolicy,backspace,kbFade,fingerZones" && SCHEMA.filter(r => r.sec === "rules").every(r => T["s." + r.id + ".h"] && T["s." + r.id]) && sanitizeSettings({ strictShift: true }).shiftPolicy === "strict" && sanitizeSettings({ shiftPolicy: "zzz", capsPolicy: "x", backspace: "q" }).capsPolicy === "allow");
    U.shiftL = keepShift4[0];
    U.shiftR = keepShift4[1];
    S.view = keepV;
    S.lesson = keepL;
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepSteps = S.steps;
    const keepDelay = U.stepDelay;
    U.stepDelay = 0;
    const press = (code, key) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: key || code, bubbles: true, cancelable: true }));
    const stepIdx = () => S.steps ? S.steps.i : -1;
    const bannedRe5 = /wrong|awesome|perfect|keep it up|almost|oops/i;
    fresh("en-qwerty");
    S.data.onboard = "new";
    S.view = "practice";
    render();
    const choices = Array.from(document.querySelectorAll(".place button"));
    add("first launch offers three equal neutral choices", choices.map(b => b.textContent).join("|") === "New to touch typing|Start lessons from the first keys|I already touch type" && choices.every(b => b.className === "btn") && !choices.some(b => bannedRe5.test(b.textContent)));
    choices[1].click();
    add("starting from the first keys sets two keys and ends onboarding", S.settings.startKeys === 2 && S.settings.order === "position" && currentK() === 2 && activeKeys().join("") === "fj" && S.data.onboard === "done" && layoutData("en-qwerty").placed === true && !document.querySelector(".place"));
    fresh("en-qwerty");
    S.data.onboard = "new";
    S.view = "practice";
    render();
    document.querySelectorAll(".place button")[2].click();
    add("claiming touch typing runs the existing placement test", S.view === "test" && S.data.onboard === "done");
    fresh("en-qwerty");
    S.data.onboard = "new";
    S.view = "practice";
    render();
    const before5 = JSON.stringify(S.data.layouts);
    document.querySelectorAll(".place button")[0].click();
    add("choosing New to touch typing opens First steps and records the state", S.view === "steps" && stepIdx() === 0 && S.data.onboard === "steps" && sanitizeData(JSON.parse(JSON.stringify(S.data))).onboard === "steps");
    const kbHints = ["KeyF", "KeyJ"].every(c => U.kb.keys[c].classList.contains("hint")) && U.kb.root.classList.contains("fz") && U.kb.keys.KeyF.classList.contains("bump");
    press("KeyF", "f");
    const afterF = stepIdx();
    press("KeyJ", "j");
    add("home position advances once the two bump keys have been pressed", kbHints && afterF === 0 && stepIdx() === 1);
    const homeLines = [];
    ["KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon"].forEach((c, k) => {
      press(c, "x");
      if (k < 7) homeLines.push(document.getElementById("stepline").textContent);
    });
    add("the finger map names the finger and hand and advances after the home row", stepIdx() === 2 && homeLines[0] === "Little finger \u2014 left hand" && homeLines[3] === "Index finger \u2014 left hand" && homeLines[6] === "Ring finger \u2014 right hand");
    press("KeyQ", "q");
    const wrongIgnored = S.steps.n === 0;
    ["KeyF", "KeyR", "KeyF", "KeyJ", "KeyU", "KeyJ", "KeyD", "KeyE", "KeyD", "KeyK", "KeyI", "KeyK", "KeyS", "KeyW", "KeyS", "KeyL", "KeyO", "KeyL"].forEach(c => press(c, "x"));
    add("reaches only move on with the lit key and advance after the last one", wrongIgnored && stepIdx() === 3);
    press("Space", " ");
    press("ShiftLeft", "Shift");
    const midShift = stepIdx() === 3 && U.kb.space.classList.contains("got") && U.kb.shifts[1].classList.contains("hint");
    press("ShiftRight", "Shift");
    add("Space and Shift need the space bar and both Shift keys", midShift && stepIdx() === 4);
    const afterSteps = JSON.stringify(S.data.layouts);
    add("First steps writes no key samples and no lessons", afterSteps === before5 && S.data.lessons.length === 0 && Object.keys(layoutData("en-qwerty").chars).length === 0);
    const paceBtns = Array.from(document.querySelectorAll(".stepcard [role=radio]"));
    paceBtns[0].click();
    add("the starting pace only sets the target speed", S.settings.targetWpm === 15 && document.querySelectorAll(".posture li").length === 3);
    Array.from(document.querySelectorAll(".stepactions button")).find(b => b.className === "btn go").click();
    add("finishing lands in Learn letters with two keys and live speed hidden", S.view === "practice" && S.data.onboard === "done" && S.settings.startKeys === 2 && activeKeys().join("") === "fj" && S.settings.liveWpm === false && learnTrack() === "letters" && currentK() === 2 && layoutData("en-qwerty").placed === true);
    fresh("en-qwerty");
    S.data.onboard = "new";
    startSteps();
    let skipOk = true;
    for (let i = 0; i < 4; i++) {
      const sk = Array.from(document.querySelectorAll(".stepactions button")).find(b => b.textContent === "Skip this step");
      if (!sk) skipOk = false;
      else sk.click();
    }
    add("every step except the last can be skipped and the last has no skip", skipOk && stepIdx() === 4 && !Array.from(document.querySelectorAll(".stepactions button")).some(b => b.textContent === "Skip this step"));
    Array.from(document.querySelectorAll(".stepactions button")).find(b => b.className === "btn go").click();
    add("skipping steps still ends onboarding without errors", S.view === "practice" && (S.data.onboard === "skipped" || S.data.onboard === "done"));
    fresh("en-qwerty");
    S.data.onboard = "new";
    startSteps();
    Array.from(document.querySelectorAll(".stepactions button")).find(b => b.textContent === "Skip First steps").click();
    add("Skip First steps leaves at once and is remembered", S.view === "practice" && S.data.onboard === "skipped" && S.steps === null);
    fresh("en-qwerty");
    layoutData("en-qwerty").placed = true;
    layoutData("en-qwerty").k = 9;
    S.data.onboard = "done";
    S.settings.liveWpm = true;
    const startsBefore = S.settings.startKeys;
    S.view = "settings";
    render();
    const reopen = Array.from(document.querySelectorAll(".srow .btn")).find(b => b.textContent === "Open First steps");
    reopen.click();
    add("First steps can be reopened from Settings without changing progress", S.view === "steps" && S.data.onboard === "done" && !!document.querySelector(".stepcard"));
    ["Skip this step", "Skip this step", "Skip this step", "Skip this step"].forEach(() => Array.from(document.querySelectorAll(".stepactions button")).find(b => b.textContent === "Skip this step").click());
    Array.from(document.querySelectorAll(".stepactions button")).find(b => b.className === "btn go").click();
    add("finishing a reopened walk leaves keys, speed display and onboarding alone", layoutData("en-qwerty").k === 9 && S.settings.liveWpm === true && S.settings.startKeys === startsBefore && S.data.onboard === "done" && S.view === "practice");
    const fsKeys = Object.keys(T).filter(k => k.indexOf("fs.") === 0 || k.indexOf("s.steps") === 0);
    add("every First steps string exists in both languages and stays neutral", fsKeys.length > 30 && fsKeys.every(k => T[k][0] && T[k][1] && !bannedRe5.test(T[k][0])));
    S.settings.ui = "ar";
    fresh("ar-101", { ui: "ar" });
    S.data.onboard = "new";
    startSteps();
    add("First steps renders right-to-left in Arabic with its strings", document.documentElement.getAttribute("dir") === "rtl" && document.querySelector(".stepcard h2").textContent === T["fs.s1.t"][1] && document.querySelector(".stepcard").closest("[dir]") !== null);
    fresh("en-qwerty");
    S.steps = keepSteps;
    U.stepDelay = keepDelay;
    S.view = keepV;
    S.lesson = keepL;
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    fresh("en-qwerty");
    S.view = "keys";
    render();
    const how = document.querySelector("details.how p");
    add("the measurement explainer covers tracks, Shift rules, code stats and untimed First steps in both languages", how && how.textContent === T["how.body"][0] && ["track", "Shift", "First steps", "never unlock", "code bucket"].every(w => T["how.body"][0].indexOf(w) >= 0) && T["how.body"][1].indexOf("Shift") > 0 && T["how.body"][1].length > 900 && !/almost|perfect|wrong/i.test(T["how.body"][0]));
    S.view = "settings";
    render();
    const find = id => document.querySelector(id === "__steps" ? "[data-sid=__steps]" : "[data-sid=" + id + "]");
    const probes = [["reviewRate", "revisit", "\u0645\u0631\u0627\u062C\u0639\u0629"], ["digitSource", "numpad", "\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645"], ["shiftPolicy", "opposite", "\u0645\u0642\u0627\u0628\u0644\u0629"], ["capsPolicy", "caps lock", "\u0642\u0641\u0644"], ["backspace", "undo", "\u062A\u0631\u0627\u062C\u0639"], ["kbFade", "no-look", "\u062F\u0648\u0646 \u0646\u0638\u0631"], ["fingerZones", "tint", "\u062A\u0644\u0648\u064A\u0646"], ["__steps", "beginner", "\u0645\u0628\u062A\u062F\u0626"]];
    const misses = [];
    probes.forEach(p => {
      [p[1], p[2]].forEach(q => {
        applyFilter(q);
        const row = find(p[0]);
        if (!row || row.hidden) misses.push(p[0] + ":" + q);
      });
    });
    applyFilter("beginner");
    const othersHidden = find("theme") && find("theme").hidden && !find("__steps").hidden;
    applyFilter("");
    add("Settings search finds every new setting by English and Arabic keywords", misses.length === 0 && othersHidden, misses.join(",") || "all 16 probes hit");
    add("every new setting keyword entry has both languages", ["reviewRate", "digitSource", "shiftPolicy", "capsPolicy", "backspace", "kbFade", "fingerZones", "steps"].every(id => T["k." + id] && T["k." + id][0].length > 8 && T["k." + id][1].length > 8));
    const full = sanitizeSettings({ layout: "en-qwerty", targetWpm: 25, mix: { letters: { on: true, weight: 60 }, digits: { on: true, weight: 40 } }, presets: [{ name: "Mine", mix: { code: { on: true, weight: 100 } } }], learnTracks: { active: "digits" }, reviewRate: 20, digitSource: "numpad", shiftPolicy: "hint", capsPolicy: "strict", backspace: "off", kbFade: true, fingerZones: true });
    const data = sanitizeData(JSON.parse(JSON.stringify(v3Fixture())));
    data.layouts["en-qwerty"].tracks.digits.k = 5;
    data.layouts["en-qwerty"].tracks.punct.k = 3;
    data.layouts["en-qwerty"].sh = { ok: 12, same: 4 };
    data.onboard = "steps";
    S.settings = full;
    S.data = data;
    const exported = JSON.stringify(buildExport(true));
    S.settings = sanitizeSettings({});
    S.data = sanitizeData({});
    const okImp = applyImport(exported);
    const L6 = S.data.layouts["en-qwerty"];
    add("a v4 export carries every new field and imports back unchanged", okImp && JSON.stringify(S.settings) === JSON.stringify(full) && JSON.stringify(S.data) === JSON.stringify(data) && S.settings.mix.digits.weight === 40 && S.settings.presets[0].name === "Mine" && S.settings.learnTracks.active === "digits" && S.settings.shiftPolicy === "hint" && S.settings.kbFade === true && S.settings.fingerZones === true && L6.tracks.digits.k === 5 && L6.tracks.punct.k === 3 && L6.sh.same === 4 && L6.k === 13 && S.data.onboard === "steps" && JSON.parse(exported).version === 4);
    const settingsOnly = JSON.stringify(buildExport(false));
    const keepSnap = JSON.stringify(S.data);
    const okOnly = applyImport(settingsOnly);
    add("a settings-only export leaves the data untouched on import", okOnly && JSON.stringify(S.data) === keepSnap && !("data" in JSON.parse(settingsOnly)));
    add("an export from a newer version is refused and changes nothing", applyImport(JSON.stringify({ app: "tarq", version: 5, settings: {}, data: {} })) === false && JSON.stringify(S.data) === keepSnap && applyImport("{}") === false && applyImport("nope") === false);
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    const keepCustom = customStore.text;
    const mxc = (names, weights) => {
      const m = defaultMix();
      m.letters.on = false;
      names.forEach((n, i) => { m[n] = { on: true, weight: weights ? weights[i] : 50 }; });
      return m;
    };
    fresh("en-qwerty");
    clearCustom();
    const r1 = saveCustom("ab\u0001c d\u0007e");
    add("saving custom text strips control characters and reports its size", customText() === "abc de" && r1.bytes === 6 && !r1.truncated);
    const big = saveCustom("x".repeat(CUSTOM_CAP + 500));
    add("custom text is capped by bytes and says when it was cut", big.truncated && big.bytes === CUSTOM_CAP && customBytes(customText()) === CUSTOM_CAP);
    const multi = saveCustom("\u00E9".repeat(CUSTOM_CAP));
    add("the cap counts bytes, not characters, for multi-byte text", multi.truncated && multi.bytes <= CUSTOM_CAP && customBytes(customText()) === multi.bytes && customText().length === CUSTOM_CAP / 2);
    saveCustom("Hello, w\u00F6rld! \u4F60\u597D abc");
    add("only characters typeable on the layout are used", customWords().join(" ") === "Hello, wrld! abc" && customWords().every(w => typeableText(w)));
    fresh("ar-101");
    saveCustom("Hello \u0645\u0631\u062D\u0628\u0627 123");
    add("the same text is filtered again for another layout", customWords().length >= 1 && customWords().every(w => typeableText(w)) && customWords().every(w => !/[A-Za-z]/.test(w)));
    saveCustom("Hello only latin");
    add("text with nothing typeable gives no source", !hasCustom() && chipKeys().indexOf("custom") < 0 && mixPlan(mxc(["custom"])).w.words === 1);
    fresh("en-qwerty");
    saveCustom("one two three four five");
    S.settings.mix = mxc(["custom"]);
    S.mixLedger = null;
    seedRng(5);
    const c1 = compose(S.settings.mix, 5).tokens;
    const c2 = compose(S.settings.mix, 5).tokens;
    add("a custom-only mix reads the text in order and wraps around", c1.every(x => x.src === "custom") && c1.slice(0, 5).map(x => x.t).join(" ") === "one two three four five" && c1[5].t === "one" && c2.length > 3);
    S.settings.mix = mxc(["letters", "custom"], [70, 30]);
    S.mixLedger = null;
    saveCustom("alpha beta gamma delta epsilon zeta eta theta");
    seedRng(9);
    let cTot = 0;
    let cCustom = 0;
    for (let i = 0; i < 200; i++) {
      S.recent = [];
      compose(S.settings.mix, 14).tokens.forEach(x => {
        cTot += x.t.length;
        if (x.src === "custom") cCustom += x.t.length;
      });
    }
    add("custom text takes its share of characters like any other source", Math.abs(cCustom / cTot - 0.3) <= 0.05, (cCustom / cTot * 100).toFixed(1) + "% at 30");
    fresh("en-qwerty");
    clearCustom();
    S.view = "free";
    render();
    const chipsNone = Array.from(document.querySelectorAll(".chips [data-chip]")).map(b => b.getAttribute("data-chip")).join(",");
    S.mixOpen = true;
    render();
    const ta = document.querySelector(".ctext");
    ta.value = "tea for two and two for tea";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const liveBytes = document.getElementById("cbytes").textContent;
    document.getElementById("csave").click();
    const chipsSome = Array.from(document.querySelectorAll(".chips [data-chip]")).map(b => b.getAttribute("data-chip")).join(",");
    add("the custom chip appears once text is saved and the editor shows bytes against the cap", chipsNone === "letters,capitals,digits,punct,symbols,code" && chipsSome === "letters,capitals,digits,punct,symbols,code,custom" && liveBytes === "27 / 50000 bytes" && document.getElementById("cmsg").textContent === T["fp.custom.saved"][0] && document.querySelector(".ctext").value === "tea for two and two for tea");
    document.querySelector("[data-chip=custom]").click();
    document.querySelector("[data-chip=letters]").click();
    const lessonText = S.lesson.chars.join("");
    add("practising with the custom chip alone types the saved words", S.lesson.free === true && lessonText.split(" ").length > 8 && lessonText.split(" ").every(w => ["tea", "for", "two", "and"].indexOf(w) >= 0));
    const idx0 = S.lesson.idx;
    ta.focus();
    document.querySelector(".ctext").dispatchEvent(new KeyboardEvent("keydown", { key: "t", code: "KeyT", bubbles: true, cancelable: true }));
    add("typing in the custom text box never reaches the typer", S.lesson.idx === idx0);
    document.getElementById("cclear").click();
    add("clearing removes the chip and the text", !hasCustom() && document.querySelectorAll("[data-chip=custom]").length === 0 && practiceMix().letters.on && !practiceMix().custom.on);
    saveCustom("secret words here");
    const exp7 = JSON.stringify(buildExport(true));
    add("custom text is left out of exports", exp7.indexOf("secret") < 0);
    customStore.text = null;
    storeSet(KEY_C, "stored text");
    const reloaded = customText() === "stored text";
    customStore.text = "";
    try {
      window.localStorage.removeItem(KEY_C);
    } catch (err) {
      delete MEM[KEY_C];
    }
    add("custom text is read back from local storage", reloaded);
    saveCustom("twelve bytes");
    S.view = "settings";
    render();
    const usageText = Array.from(document.querySelectorAll(".srow")).map(r => r.textContent).find(x => x.indexOf(T["d.usage"][0]) === 0) || "";
    add("the privacy summary shows the custom text size against its cap", usageText.indexOf("Custom text: 12 / 50000 bytes") > 0, usageText.slice(0, 120));
    eraseAll();
    add("erasing everything also erases the custom text", customText() === "" && !hasCustom());
    fresh("en-qwerty");
    add("each character belongs to one key type", classOfChar("a") === "letters" && classOfChar("A") === "capitals" && classOfChar("7") === "digits" && classOfChar(".") === "punct" && classOfChar("-") === "punct" && classOfChar("{") === "symbols" && classOfChar("\u064E") === "dia" && classOfChar("\u0628") === "letters");
    layoutData("en-qwerty").chars.f = flat(40, 140);
    layoutData("en-qwerty").chars["5"] = flat(40, 160);
    layoutData("en-qwerty").chars.F = flat(40, 200);
    S.keysUI.cls = "digits";
    S.keysUI.tab = "kb";
    S.view = "keys";
    render();
    const keyEl = c => document.querySelector(".kb [data-code=" + c + "]");
    const dimLetters = keyEl("KeyF").classList.contains("dim") && keyEl("KeyJ").classList.contains("dim") && !keyEl("Digit5").classList.contains("dim") && !keyEl("Digit1").classList.contains("dim");
    S.keysUI.tab = "list";
    render();
    const listChars = Array.from(document.querySelectorAll("table tbody tr.row")).map(r => r.firstChild.textContent.trim());
    S.keysUI.cls = "capitals";
    render();
    const listCaps = Array.from(document.querySelectorAll("table tbody tr.row")).map(r => r.firstChild.textContent.trim());
    S.keysUI.cls = "all";
    render();
    const filterBox = document.querySelector("[aria-label='Key type']");
    add("the Keys view can be filtered by key type on the keyboard and in the list", dimLetters && listChars.indexOf("5") >= 0 && listChars.indexOf("f") < 0 && listCaps.join("") === "F" && !!filterBox && filterBox.querySelectorAll("[role=radio]").length === 7 && filterBox.querySelector("[aria-checked=true]").textContent === "All keys");
    S.keysUI.cls = "capitals";
    S.settings.layout = "ar-101";
    S.settings.lang = "ar";
    add("a key type that does not exist in the layout falls back to all keys", clsFilter() === "all");
    S.keysUI.cls = "all";
    S.keysUI.tab = "kb";
    clearCustom();
    customStore.text = keepCustom;
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepData = S.data;
    const keepSet = S.settings;
    const keepTab = S.keysUI.tab;
    fresh("en-qwerty");
    S.keysUI.tab = "progress";
    S.view = "keys";
    render();
    const emptyOk = !!document.querySelector(".empty") && !document.querySelector("svg.trend");
    const base = dayNum(dayKey(Date.now()));
    const days = {};
    for (let i = 40; i >= 0; i -= 3) days[numToKey(base - i)] = { s: 2, ms: 120000, k: 600, w: 70 + (40 - i), a: 1.9, b: 45 + (40 - i) / 4, l: 2, t: 0, c: 0 };
    S.data = sanitizeData({ days: { "en-qwerty": days }, pbs: { "l|en-qwerty": { wpm: 60, acc: 0.97, ts: Date.now() } } });
    render();
    const charts = document.querySelectorAll("svg.trend").length;
    const cells = document.querySelectorAll("rect.hc").length;
    const tiles = document.querySelectorAll(".pg-tiles .stat").length;
    const pbRows = document.querySelectorAll(".pbrow").length;
    add("the Progress tab shows a friendly empty state before any practice", emptyOk);
    add("the Progress tab draws speed and accuracy trends, the activity map, tiles and personal bests", charts === 2 && cells > 300 && tiles === 4 && pbRows === 1, charts + "/" + cells + "/" + tiles + "/" + pbRows);
    S.keysUI.range = "30";
    render();
    const circles = document.querySelectorAll("svg.trend circle.dot").length;
    S.keysUI.range = "90";
    S.settings.ui = "ar";
    S.settings.numerals = "arabic";
    render();
    const arText = document.querySelector(".pg-tiles").textContent;
    add("the 30-day range shows only days inside that window", circles === 20, String(circles));
    add("the Progress tab follows the interface language and numeral setting", /[٠-٩]/.test(arText) && !/[0-9]/.test(arText), arText);
    S.settings = keepSet;
    S.data = keepData;
    S.keysUI.tab = keepTab;
    S.view = keepV;
    render();
    }
;

    {
    const keepV = S.view;
    const keepData = S.data;
    const keepSet = S.settings;
    const keepTest = S.test;
    fresh("en-qwerty", { testMode: "quote", testQuote: "short", testDiff: "expert" });
    S.view = "test";
    S.test = null;
    render();
    const modeBtns = Array.from(document.querySelectorAll(".cfg .seg")).map(g => g.querySelectorAll("button").length);
    const labelled = !!document.querySelector(".cfg [aria-label='" + t("tt.diffLabel") + "']") && !!document.querySelector(".cfg [aria-label='" + t("tt.stopLabel") + "']");
    add("the Test view offers time, words, quote and custom modes with difficulty and stop rules", modeBtns.indexOf(4) >= 0 && labelled && !document.querySelector(".cfg [aria-pressed]"), modeBtns.join(","));
    const shownWords = Array.from(document.querySelectorAll(".ttyper .tw")).map(w => w.textContent.trim()).join(" ");
    add("quote mode shows one whole quote", shownWords === S.test.words.join(" ") && QUOTES.en.indexOf(shownWords) >= 0, shownWords);
    const esc = () => onTestKey({ key: "Escape", preventDefault() {}, stopPropagation() {}, timeStamp: 0 });
    testChar("D", 1000);
    testChar("o", 1100);
    const firstWords = S.test.words.join(" ");
    esc();
    const stillRunning = S.test.strokes === 2 && S.test.words.join(" ") === firstWords && S.test.running;
    esc();
    add("Escape needs a second press before it throws away a running test", stillRunning && S.test.strokes === 0 && !S.test.running);
    esc();
    add("Escape restarts an idle test at once", S.test.strokes === 0);
    S.settings.testMode = "custom";
    S.settings.testDiff = "normal";
    clearCustom();
    S.test = null;
    render();
    add("an empty custom text shows a way to add text instead of a test", !!document.querySelector(".tempty") && !document.querySelector(".ttyper"));
    S.settings = keepSet;
    S.data = keepData;
    S.test = keepTest;
    S.view = keepV;
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    const meanRank = (level, mixed) => {
      fresh("en-qwerty", { wordLevel: level, text: "real", lessonWords: 30 });
      layoutData("en-qwerty").k = 16;
      const ranks = [];
      seedRng(77);
      for (let i = 0; i < 60; i++) {
        S.recent = [];
        if (mixed) {
          const m = defaultMix();
          S.settings.mix = m;
          S.mixLedger = null;
          newFreeLesson();
        } else newLesson();
        S.lesson.chars.join("").split(" ").forEach(w => {
          const r = WORDS.en.indexOf(w);
          if (r >= 0) ranks.push(r);
        });
      }
      return ranks.reduce((a, x) => a + x, 0) / ranks.length;
    };
    const rc = meanRank("common");
    const rb = meanRank("balanced");
    const rw = meanRank("wide");
    add("word difficulty moves the mix of common and rare words in Learn", rc < rb * 0.7 && rw > rb * 1.25, "mean word rank: common " + rc.toFixed(0) + ", balanced " + rb.toFixed(0) + ", wide " + rw.toFixed(0));
    const pc = meanRank("common", true);
    const pw = meanRank("wide", true);
    add("the same setting shapes the words in Practice", pc < pw * 0.7, "mean word rank: common " + pc.toFixed(0) + ", wide " + pw.toFixed(0));
    add("balanced is the default and keeps the original weighting", sanitizeSettings({}).wordLevel === "balanced" && sanitizeSettings({ wordLevel: "zzz" }).wordLevel === "balanced" && LEVEL_EXP.balanced === 1.25 && SCHEMA_BY_ID.wordLevel.def === "balanced");
    fresh("en-qwerty", { text: "real" });
    seedRng(31);
    S.recent = [];
    newLesson();
    const defaultText = S.lesson.chars.join("");
    S.settings.wordLevel = "balanced";
    seedRng(31);
    S.recent = [];
    newLesson();
    add("an explicit Balanced matches the untouched default word for word", S.lesson.chars.join("") === defaultText);
    fresh("en-qwerty", { wordLevel: "common" });
    const rtrip = sanitizeSettings(JSON.parse(JSON.stringify(S.settings)));
    add("the difficulty choice survives saving and export", rtrip.wordLevel === "common");
    fresh("en-qwerty");
    S.view = "settings";
    render();
    const row = document.querySelector("[data-sid=wordLevel]");
    const radios = row ? Array.from(row.querySelectorAll("[role=radio]")) : [];
    add("Settings shows Word difficulty among the always-visible basics with three options and Balanced selected", !!row && !row.closest("details") && radios.map(b => b.textContent).join("|") === "Common|Balanced|Wide" && radios.filter(b => b.getAttribute("aria-checked") === "true")[0].textContent === "Balanced" && !!T["s.wordLevel.h"][1]);
    applyFilter("rare");
    const foundEn = !document.querySelector("[data-sid=wordLevel]").hidden;
    applyFilter("\u0646\u0627\u062F\u0631\u0629");
    const foundAr = !document.querySelector("[data-sid=wordLevel]").hidden;
    applyFilter("");
    add("Settings search finds Word difficulty in both languages", foundEn && foundAr);
    radios[0].click();
    add("choosing Common applies at once and regenerates the lesson", S.settings.wordLevel === "common" && S.lesson && S.lesson.chars.length > 20);
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    fresh("en-qwerty");
    S.view = "keys";
    render();
    const none = !document.getElementById("shiftsum");
    layoutData("en-qwerty").sh = { ok: 12, same: 4 };
    render();
    const sumEn = document.getElementById("shiftsum") && document.getElementById("shiftsum").textContent;
    S.settings.ui = "ar";
    render();
    const sumAr = document.getElementById("shiftsum") && document.getElementById("shiftsum").textContent;
    S.settings.ui = "en";
    add("the Keys view summarises Shift presses by hand only when there are some", none && sumEn === "Shift presses: 12 on the opposite hand, 4 on the same hand" && sumAr.indexOf("12") >= 0 && sumAr.indexOf("4") >= 0 && sumAr.indexOf("{") < 0);
    fresh("en-qwerty");
    layoutData("en-qwerty").chars["5"] = flat(40, 160);
    layoutData("en-qwerty").chars.F = flat(40, 200);
    S.keysUI.tab = "kb";
    S.keysUI.sel = "s";
    S.keysUI.cls = "digits";
    S.view = "keys";
    render();
    const selDigit = classOfChar(S.keysUI.sel) === "digits" && S.keysUI.sel === "5";
    S.keysUI.cls = "capitals";
    render();
    const selCap = S.keysUI.sel === "F";
    S.keysUI.cls = "all";
    render();
    const keptOnAll = S.keysUI.sel === "F";
    add("the key detail panel follows the key-type filter", selDigit && selCap && keptOnAll);
    S.keysUI.sel = "s";
    fresh("en-qwerty");
    S.data.onboard = "new";
    S.view = "practice";
    render();
    const note = document.querySelector(".place .msg");
    add("the first-launch note names the choice it explains", note && note.textContent === "\u201CI already touch type\u201D runs a 60-second sample to set your starting keys." && T["pl.note"][1].indexOf("\u00AB") === 0);
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    fresh("en-qwerty");
    S.view = "practice";
    render();
    const pressedBtns = () => document.querySelectorAll(".cfg [aria-pressed]").length;
    const hiddenByDefault = pressedBtns() === 0 && !document.getElementById("legacynote") && document.querySelectorAll(".tracks [role=radio]").length === 6;
    fresh("en-qwerty", { caps: true, extraRate: 30 });
    S.view = "practice";
    render();
    const shownWhenOn = pressedBtns() === 3 && document.getElementById("legacynote").textContent === T["lt.legacy"][0] && document.querySelector(".cfg [aria-pressed=true]").textContent === "Capital letters";
    document.querySelector(".cfg [aria-pressed=true]").click();
    const goneWhenOff = pressedBtns() === 0 && !document.getElementById("legacynote") && S.settings.caps === false;
    add("old Learn extras stay out of the way unless one is already on", hiddenByDefault && shownWhenOn && goneWhenOff);
    S.view = "settings";
    render();
    const capBtn = document.querySelector(".srow .chips button[data-id=caps]");
    capBtn.click();
    const turnedOn = S.settings.caps === true;
    document.querySelector(".srow .chips button[data-id=caps]").click();
    add("the old extras can still be switched on in Settings", !!capBtn && turnedOn && S.settings.caps === false);
    add("unused strings are gone", !T["tt.list"] && !T["tr.cfg"] && !T["l.total"] && !T["d.close"]);
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepL = S.lesson;
    const keepData = S.data;
    const keepSet = S.settings;
    const keepTest = S.test;
    const qq = { painted() {}, finished() {} };
    fresh("en-qwerty", { testMode: "words", testWords: 10 });
    layoutData("en-qwerty").k = 6;
    setTrackK("digits", 4);
    setTrackK("punct", 3);
    const trackSnap = JSON.stringify(layoutData("en-qwerty").tracks);
    const lessonsBefore = S.data.lessons.length;
    const testsBefore = S.data.tests.length;
    testNew(false);
    let tts = 20000;
    S.test.words.slice(0, 10).forEach(w => w.split("").concat([" "]).forEach(c => { tts += 140; testChar(c, tts); }));
    add("a finished Test adds a result and key stats but never moves any unlock count", S.test.done === true && S.data.tests.length === testsBefore + 1 && JSON.stringify(layoutData("en-qwerty").tracks) === trackSnap && S.data.lessons.length === lessonsBefore && Object.keys(layoutData("en-qwerty").chars).length > 3);
    fresh("en-qwerty");
    layoutData("en-qwerty").k = 8;
    ["f", "j", "d", "k"].forEach(c => { layoutData("en-qwerty").chars[c] = flat(40, 140); });
    const slowBefore = JSON.stringify(["f", "j", "d", "k"].map(c => layoutData("en-qwerty").chars[c]));
    S.codeRes = null;
    S.codeRecent = [];
    S.settings.codeSet = "mix";
    newCodeLesson();
    let cts = 90000;
    S.lesson.chars.slice().forEach(c => { cts += 900; handleChar(c, cts, qq); });
    const codeB = layoutData("en-qwerty:code").chars;
    add("slow typing in code never changes how a letter counts as settled", JSON.stringify(["f", "j", "d", "k"].map(c => layoutData("en-qwerty").chars[c])) === slowBefore && Object.keys(codeB).length > 5 && ["f", "j", "d", "k"].every(c => statusOf(layoutData("en-qwerty").chars[c], c) === "steady"));
    fresh("en-qwerty");
    layoutData("en-qwerty").k = 8;
    S.settings.mix = (() => { const m = defaultMix(); m.letters.on = true; m.letters.weight = 60; m.code = { on: true, weight: 40 }; return m; })();
    S.mixLedger = null;
    seedRng(12);
    let mixedOk = false;
    let codeChars = 0;
    let otherChars = 0;
    let mainA = 0;
    let codeA = 0;
    for (let tries = 0; tries < 60 && !mixedOk; tries++) {
      newFreeLesson();
      if (S.lesson.cm && S.lesson.cm.some(x => x === 1)) mixedOk = true;
    }
    if (mixedOk) {
      const sumA = lid => Object.keys(layoutData(lid).chars).reduce((a, c) => a + layoutData(lid).chars[c].a, 0);
      const a0 = sumA("en-qwerty");
      const c0 = sumA("en-qwerty:code");
      S.lesson.cm.forEach(x => { if (x) codeChars++; else otherChars++; });
      let mts = 120000;
      S.lesson.chars.slice().forEach(c => { mts += 200; handleChar(c, mts, qq); });
      mainA = sumA("en-qwerty") - a0;
      codeA = sumA("en-qwerty:code") - c0;
    }
    add("code lines inside a mixed Practice lesson are recorded in the code bucket, the rest in the main stats", mixedOk && codeChars > 10 && codeA === codeChars && mainA === otherChars, mainA + " main, " + codeA + " code");
    fresh("en-qwerty");
    const cb = layoutData("en-qwerty:code").chars;
    cb["{"] = flat(40, 300);
    layoutData("en-qwerty").chars.a = flat(40, 150);
    S.keysUI.cls = "code";
    S.keysUI.layer = 1;
    S.keysUI.tab = "kb";
    S.view = "keys";
    render();
    const braceKey = document.querySelector(".kb [data-code=BracketLeft]");
    const aKey = document.querySelector(".kb [data-code=KeyA]");
    const braceHas = braceKey && !braceKey.classList.contains("u") && !braceKey.classList.contains("dim");
    S.keysUI.layer = 0;
    S.keysUI.tab = "list";
    render();
    const codeRows = Array.from(document.querySelectorAll("table tbody tr.row")).map(r => r.firstChild.textContent.trim());
    S.keysUI.cls = "all";
    S.keysUI.layer = 0;
    S.keysUI.tab = "kb";
    add("the Keys view can show only what was typed in code", braceHas && aKey.classList.contains("u") && codeRows.join("") === "{" && clsOptions().indexOf("code") === clsOptions().length - 1);
    fresh("en-qwerty");
    S.data.onboard = "new";
    startSteps();
    const stepKeys = ["KeyF", "KeyJ"];
    stepKeys.forEach(c => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.slice(3).toLowerCase(), bubbles: true, cancelable: true })));
    U.stepDelay = 0;
    Array.from(document.querySelectorAll(".stepactions button")).find(b => b.textContent === "Skip this step").click();
    const saved = sanitizeData(JSON.parse(JSON.stringify(S.data)));
    S.steps = null;
    S.data = saved;
    S.view = "practice";
    render();
    const resumeBtn = document.querySelector(".place button");
    add("leaving First steps part way is remembered and offered as Continue", S.data.onboard === "steps" && S.data.onboardStep === 2 && resumeBtn.textContent === "Continue First steps" && T["fs.resume"][1].length > 5 && sanitizeData({ onboardStep: 99 }).onboardStep === 4 && sanitizeData({ onboardStep: "x" }).onboardStep === 0);
    resumeBtn.click();
    add("Continue opens the step where you left off and finishing clears it", S.view === "steps" && S.steps.i === 2 && document.querySelector(".stepcard h2").textContent === "Reach");
    finishSteps("done");
    add("finishing First steps resets the saved step", S.data.onboardStep === 0 && S.data.onboard === "done");
    S.test = keepTest;
    S.settings = keepSet;
    S.data = keepData;
    S.view = keepV;
    S.lesson = keepL;
    fresh("en-qwerty");
    render();
    }
;

    {
    const keepV = S.view;
    const keepSet = S.settings;
    fresh("en-qwerty");
    render();
    const h1s = document.querySelectorAll("h1");
    const wm = h1s[0] && h1s[0].textContent;
    S.settings.ui = "ar";
    render();
    const h1ar = document.querySelectorAll("h1");
    S.settings.ui = "en";
    render();
    const hs = h1s[0] ? getComputedStyle(document.querySelector("h1")) : null;
    add("the page has one level-one heading, the wordmark, in both languages and it looks the same as before", h1s.length === 1 && wm.indexOf("Tarq") >= 0 && h1ar.length === 1 && hs && hs.fontWeight === getComputedStyle(document.querySelector("header")).fontWeight && hs.marginTop === "0px");
    S.settings = keepSet;
    S.view = keepV;
    fresh("en-qwerty");
    render();
    }
;
  } catch (err) {
    add("self-test ran without errors", false, String(err && err.message ? err.message : err));
  }
  S.settings = keep.settings;
  S.data = keep.data;
  S.lesson = keep.lesson;
  S.sess = keep.sess;
  S.recent = keep.recent;
  setRngState(keep.rng);
  S.noSave = keep.noSave;
  S.test = keep.test;
  S.testOv = keep.testOv;
  refreshDerived();
  applyChrome();
  return out;
}

function showSelfTest() {
  const res = runSelfTest();
  const box = document.createElement("pre");
  box.id = "selftest";
  box.setAttribute("dir", "ltr");
  box.style.cssText = "position:fixed;inset:auto 16px 16px 16px;max-height:60vh;overflow:auto;margin:0;padding:16px;background:#111;color:#eee;border-radius:12px;font:12px/1.5 ui-monospace,Menlo,monospace;z-index:99";
  box.textContent = res.map(r => (r.ok ? "pass  " : "FAIL  ") + r.name + (r.info ? "  (" + r.info + ")" : "")).join("\n") + "\n\n" + res.filter(r => r.ok).length + "/" + res.length + " passed";
  document.body.append(box);
  window.__selftest = res;
}

export { showSelfTest };
