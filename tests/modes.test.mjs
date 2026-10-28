import test from "node:test";
import assert from "node:assert/strict";
import { S, base, fresh, layouts, settings, storage, testMode } from "./helpers.mjs";

const hist = await import("../src/core/history.js");
const quotes = await import("../src/data/quotes.js");
const LID = "en-qwerty";

function typeText(text, ts0, step) {
  let ts = ts0 || 1000;
  for (const ch of text) {
    testMode.testChar(ch, ts);
    ts += step || 160;
  }
  return ts;
}

function start(extra, words) {
  fresh(LID, extra);
  testMode.testNew();
  if (words) {
    S.test.words = words.slice();
    S.test.words0 = words.slice();
  }
  return S.test;
}

test("every quote is typeable on its layouts and every length bucket has enough quotes", () => {
  for (const lid of Object.keys(layouts.LAYOUTS)) {
    const L = layouts.LAYOUTS[lid];
    const [a, b] = quotes.QUOTE_BUCKETS[L.lang];
    const ok = quotes.QUOTES[L.lang].filter(q => q.split("").every(c => c === " " || L.rev[c]));
    assert.equal(ok.length, quotes.QUOTES[L.lang].length, lid);
    assert.ok(ok.filter(q => q.length < a).length >= 8, lid + " short");
    assert.ok(ok.filter(q => q.length >= a && q.length < b).length >= 8, lid + " medium");
    assert.ok(ok.filter(q => q.length >= b).length >= 4, lid + " long");
  }
  const all = quotes.QUOTES.en.concat(quotes.QUOTES.ar);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every(q => q === q.trim() && !/\s{2,}/.test(q)));
});

test("quote mode serves a quote of the chosen length and finishes on the last word", () => {
  for (const len of ["short", "medium", "long"]) {
    fresh(LID, { testMode: "quote", testQuote: len });
    base.seedRng(3);
    const [a, b] = quotes.QUOTE_BUCKETS.en;
    for (let i = 0; i < 6; i++) {
      testMode.testNew();
      const text = S.test.words.join(" ");
      assert.ok(quotes.QUOTES.en.includes(text), text);
      if (len === "short") assert.ok(text.length < a);
      if (len === "medium") assert.ok(text.length >= a && text.length < b);
      if (len === "long") assert.ok(text.length >= b);
      assert.equal(S.test.mode, "quote");
      assert.equal(S.test.list, "1000");
      assert.equal(S.test.amt, ["short", "medium", "long"].indexOf(len) + 1);
    }
  }
  fresh(LID, { testMode: "quote", testQuote: "short" });
  testMode.testNew();
  const text = S.test.words.join(" ");
  typeText(text);
  assert.equal(S.test.done, true);
  assert.equal(S.test.res.acc, 1);
  assert.equal(S.test.res.failed, "");
  const rec = S.data.tests[S.data.tests.length - 1];
  assert.equal(rec.mode, "quote");
  assert.equal(rec.amt, 1);
  assert.ok(S.data.pbs[hist.testPbKey(rec)].wpm > 0);
  assert.equal(hist.dayRows(LID)[0].t, 1);
});

test("quote mode does not repeat the same quote twice in a row", () => {
  fresh(LID, { testMode: "quote", testQuote: "short" });
  base.seedRng(11);
  let prev = "";
  for (let i = 0; i < 40; i++) {
    testMode.testNew();
    const text = S.test.words.join(" ");
    assert.notEqual(text, prev);
    prev = text;
  }
});

test("quote and custom tests ignore the word-list and punctuation options", () => {
  fresh(LID, { testMode: "quote", testPunct: true, testNum: true, testList: "200" });
  assert.equal(testMode.testExt(), 0);
  testMode.testNew();
  assert.equal(S.test.ext, 0);
  assert.equal(S.test.list, "1000");
  fresh(LID, { testMode: "words", testPunct: true });
  assert.equal(testMode.testExt(), 1);
});

test("custom text tests use the saved text, cap its length and are never saved as bests", () => {
  fresh(LID, { testMode: "custom" });
  storage.saveCustom("alpha beta gamma delta");
  testMode.testNew();
  assert.deepEqual(S.test.words, ["alpha", "beta", "gamma", "delta"]);
  assert.equal(S.test.amt, 4);
  typeText("alpha beta gamma delta");
  assert.equal(S.test.done, true);
  assert.equal(S.test.res.pbPrev, null);
  assert.equal(S.test.res.custom, true);
  assert.equal(S.data.tests.length, 0);
  assert.deepEqual(S.data.pbs, {});
  assert.equal(hist.dayRows(LID)[0].s, 1);
  storage.saveCustom(Array.from({ length: 900 }, () => "word").join(" "));
  testMode.testNew();
  assert.equal(S.test.words.length, 300);
  storage.clearCustom();
});

test("an empty custom text gives an inert test instead of an error", () => {
  fresh(LID, { testMode: "custom" });
  storage.clearCustom();
  testMode.testNew();
  assert.equal(S.test.words.length, 0);
  testMode.testChar("a", 1000);
  testMode.testBackspace(false);
  assert.equal(S.test.running, false);
  assert.equal(S.test.strokes, 0);
  assert.equal(testMode.testNetNow(S.test), 0);
});

test("expert fails the test when a word is submitted with an error and saves nothing", () => {
  const T = start({ testDiff: "expert", testMode: "words", testWords: 10 }, ["alpha", "beta", "gamma"]);
  typeText("alpha ");
  assert.equal(T.done, false);
  typeText("bexa", 3000);
  testMode.testChar(" ", 3800);
  assert.equal(T.done, true);
  assert.equal(T.res.failed, "expert");
  assert.equal(T.res.isPb, false);
  assert.equal(S.data.tests.length, 0);
  assert.deepEqual(S.data.pbs, {});
  assert.deepEqual(S.data.days, {});
});

test("expert tolerates a corrected mistake inside a word", () => {
  const T = start({ testDiff: "expert", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("alx", 1000);
  testMode.testBackspace(false);
  typeText("pha beta", 2000);
  assert.equal(T.done, true);
  assert.equal(T.res.failed, "");
  assert.equal(S.data.tests.length, 1);
  assert.equal(S.data.tests[0].ext & 16, 16);
});

test("master fails on the first wrong key, including on the last word", () => {
  let T = start({ testDiff: "master", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("alp", 1000);
  testMode.testChar("z", 1600);
  assert.equal(T.done, true);
  assert.equal(T.res.failed, "master");
  assert.equal(T.bad, 1);
  assert.equal(S.data.tests.length, 0);
  T = start({ testDiff: "master", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("alpha bet", 1000);
  testMode.testChar("x", 3000);
  assert.equal(T.res.failed, "master");
  T = start({ testDiff: "master", testMode: "words", testWords: 10 }, ["alpha"]);
  typeText("alpha", 1000);
  assert.equal(T.res.failed, "");
});

test("master also fails on an extra character", () => {
  const T = start({ testDiff: "master", testMode: "words", testWords: 10 }, ["ab", "cd"]);
  typeText("abx", 1000);
  assert.equal(T.res.failed, "master");
});

test("stop-on-letter counts a wrong key but keeps the caret on the expected letter", () => {
  const T = start({ testStop: "letter", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("al", 1000);
  testMode.testChar("x", 1400);
  assert.equal(T.typed, "al");
  assert.equal(T.bad, 1);
  assert.equal(T.strokes, 3);
  testMode.testChar("p", 1700);
  assert.equal(T.typed, "alp");
  typeText("ha", 1800);
  testMode.testChar("q", 2200);
  assert.equal(T.typed, "alpha");
  assert.equal(T.bad, 2);
  typeText(" beta", 2400);
  assert.equal(T.done, true);
  assert.ok(Math.abs(T.res.acc - (T.strokes - 2) / T.strokes) < 1e-9);
  assert.equal(S.data.tests[0].ext & 64, 64);
});

test("stop-on-word ignores Space until the word is correct", () => {
  const T = start({ testStop: "word", testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("alpho", 1000);
  const strokes = T.strokes;
  testMode.testChar(" ", 1900);
  assert.equal(T.wi, 0);
  assert.equal(T.strokes, strokes);
  testMode.testBackspace(false);
  testMode.testChar("a", 2000);
  testMode.testChar(" ", 2100);
  assert.equal(T.wi, 1);
});

test("rules keep personal bests apart", () => {
  const key = ext => hist.testPbKey({ lid: LID, mode: "words", amt: 10, list: "1000", ext });
  start({ testMode: "words", testWords: 10 }, ["ab"]);
  typeText("ab", 1000, 100);
  const normal = Object.keys(S.data.pbs);
  assert.deepEqual(normal, [key(0)]);
  start({ testMode: "words", testWords: 10, testDiff: "expert", testStop: "letter" }, ["ab"]);
  typeText("ab", 1000, 100);
  assert.deepEqual(Object.keys(S.data.pbs), [key(16 + 64)]);
});

test("backspace can return to the previous word only while it has an error", () => {
  const T = start({ testMode: "words", testWords: 10 }, ["alpha", "beta", "gamma"]);
  typeText("alpha ", 1000);
  testMode.testBackspace(false);
  assert.equal(T.wi, 1);
  assert.equal(T.typed, "");
  typeText("bexa ", 2000);
  assert.equal(T.wi, 2);
  const raw = T.rawWords;
  const cc = T.ccWords;
  testMode.testBackspace(false);
  assert.equal(T.wi, 1);
  assert.equal(T.typed, "bexa");
  assert.equal(T.rawWords, raw - 5);
  assert.equal(T.ccWords, cc);
  testMode.testBackspace(false);
  testMode.testBackspace(false);
  typeText("ta gamma", 3000);
  assert.equal(T.done, true);
  assert.equal(T.res.chars.bad, 0);
});

test("control-backspace on an empty word clears the previous wrong word", () => {
  const T = start({ testMode: "words", testWords: 10 }, ["alpha", "beta"]);
  typeText("alphx ", 1000);
  testMode.testBackspace(true);
  assert.equal(T.wi, 0);
  assert.equal(T.typed, "");
});

test("confident mode blocks backspace across words too", () => {
  const T = start({ testMode: "words", testWords: 10, confident: true }, ["alpha", "beta"]);
  typeText("alphx ", 1000);
  testMode.testBackspace(false);
  assert.equal(T.wi, 1);
});

test("rewinding a word never breaks the finish of a words test", () => {
  const T = start({ testMode: "words", testWords: 10 }, ["ab", "cd"]);
  typeText("ax ", 1000);
  testMode.testBackspace(false);
  testMode.testBackspace(false);
  typeText("b cd", 2000);
  assert.equal(T.done, true);
  assert.equal(T.res.chars.bad, 0);
  assert.equal(T.wi, 1);
});

test("the placement test ignores the difficulty and stop rules", () => {
  fresh(LID, { testDiff: "master", testStop: "letter" });
  S.testOv = { mode: "words", amt: 10, list: "1000", punct: false, num: false, caps: false, dia: false };
  testMode.testNew();
  assert.equal(S.test.diff, "normal");
  assert.equal(S.test.stop, "off");
  assert.equal(testMode.testExt(), 0);
  S.testOv = null;
});

test("new test settings are validated and old saved settings load unchanged", () => {
  const s = settings.sanitizeSettings({ testMode: "quote", testQuote: "long", testDiff: "master", testStop: "word", liveAcc: true });
  assert.equal(s.testMode, "quote");
  assert.equal(s.testQuote, "long");
  assert.equal(s.testDiff, "master");
  assert.equal(s.testStop, "word");
  assert.equal(s.liveAcc, true);
  const bad = settings.sanitizeSettings({ testMode: "zen", testQuote: "huge", testDiff: "nope", testStop: 3, liveAcc: "yes" });
  assert.equal(bad.testMode, "time");
  assert.equal(bad.testQuote, "medium");
  assert.equal(bad.testDiff, "normal");
  assert.equal(bad.testStop, "off");
  assert.equal(bad.liveAcc, false);
  const old = settings.sanitizeSettings({ testMode: "words", testWords: 50 });
  assert.equal(old.testDiff, "normal");
  assert.equal(old.testStop, "off");
});

test("saved quote tests and rule bits survive a data round trip", () => {
  const d = storage.sanitizeData({
    tests: [
      { ts: 5, lid: LID, mode: "quote", amt: 2, list: "1000", ext: 16 + 64, wpm: 50, raw: 52, acc: 0.97, cons: 80 },
      { ts: 6, lid: LID, mode: "bogus", amt: 30, list: "1000", ext: 255, wpm: 50, raw: 52, acc: 0.97, cons: 80 }
    ]
  });
  assert.equal(d.tests[0].mode, "quote");
  assert.equal(d.tests[0].ext, 80);
  assert.equal(d.tests[1].mode, "time");
  assert.equal(d.tests[1].ext, 112 | 3 | 4);
  assert.ok(d.pbs["t|" + LID + "|quote|2|1000|80"]);
});

test("quotes and interface strings stay neutral: no advice, praise, nudges or exclamations", async () => {
  const { T } = await import("../src/i18n/strings.js");
  const banned = /wrong|awesome|perfect|keep it up|keep going|keep showing|almost|oops|take a (short )?(break|rest)|well done|great job|streak|don't give up|you can do|try again|practice today|trust the|stay calm/i;
  const quoteList = quotes.QUOTES.en.concat(quotes.QUOTES.ar);
  for (const q of quoteList) {
    assert.ok(!banned.test(q), q);
    assert.ok(!/[!?؟]/.test(q), q);
  }
  for (const q of quotes.QUOTES.en) assert.ok(!/\b(you|your|yours|yourself|should|must|never|always|let's|we)\b/i.test(q), q);
  for (const k of Object.keys(T)) {
    assert.ok(!banned.test(T[k][0]) && !banned.test(T[k][1]), k);
    if (k.indexOf("pg.") === 0 || k.indexOf("stall.") === 0 || k.indexOf("tt.") === 0 || k.indexOf("tr.fail") === 0) {
      assert.ok(!/!/.test(T[k][0]) && !/!/.test(T[k][1]), k);
    }
  }
  assert.equal(T["pg.today"], undefined);
  assert.equal(T["pg.streak"], undefined);
  assert.equal(T["stall.lowerWpm"], undefined);
  assert.ok(!/fail/i.test(T["tr.failExpert"][0] + T["tr.failMaster"][0] + T["tr.failNote"][0]));
});
