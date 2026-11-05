import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { S, base, fresh, stats, tracks } from "./helpers.mjs";

const LID = "en-qwerty";
const LETTERS = "abcdefghijklmnopqrstuvwxyz ".split("");
const EXPECTED = [
  "d838661e034cf830",
  "38ddb1da25d44481",
  "caa271f43ea24923",
  "6c463ac6b34af427",
  "c18c0a9ac949b393",
  "39795ccc10f88acd",
  "cee497ff29e8524b",
  "5aa081c46fe20e3c",
  "90b5dadc658b2b71",
  "f13de836b6ac2822",
  "1a21be23463759e9",
  "3f9e2ac63c10fe53"
];

const NOW = 1700000000000;

function lessonsFor(k, seed) {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    return lessonsAt(k, seed);
  } finally {
    Date.now = realNow;
  }
}

function lessonsAt(k, seed) {
  fresh(LID, { text: seed === 3 ? "auto" : "real", wordLevel: seed === 2 ? "wide" : "balanced" });
  base.seedRng(seed * 100 + k);
  stats.layoutData(LID).k = k;
  LETTERS.forEach(c => {
    const s = stats.charStat(LID, c, true);
    s.n = 40;
    s.a = 40;
    s.e = 2;
    s.t = Array.from({ length: 30 }, () => 150 + base.rnd() * 350);
    s.o = Array.from({ length: 30 }, () => (base.rnd() < 0.07 ? 1 : 0));
    s.ls = Date.now() - 86400000 * (1 + Math.floor(base.rnd() * 20));
  });
  const L = stats.layoutData(LID);
  const top = "etaoinshrdl".split("");
  top.forEach((a, i) => top.forEach((b, j) => {
    if (i !== j && (i + j) % 3 === 0) L.pairs[a + b] = { m: 200 + ((i * 37 + j * 11) % 300), n: 12 };
  }));
  const out = [];
  for (let i = 0; i < 4; i++) {
    tracks.newLesson();
    out.push(S.lesson.chars.join(""));
  }
  return crypto.createHash("sha1").update(out.join("|")).digest("hex").slice(0, 16);
}

test("lesson text for fixed data and seeds does not change", () => {
  const got = [];
  for (const k of [3, 8, 15, 26]) {
    for (const seed of [1, 2, 3]) got.push(lessonsFor(k, seed));
  }
  assert.deepEqual(got, EXPECTED);
});
