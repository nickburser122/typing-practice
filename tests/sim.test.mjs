import test from "node:test";
import assert from "node:assert/strict";
import { V1 } from "./sim-baseline.mjs";
import { PROFILES, simulate } from "./sim-lib.mjs";

const SEED = 11;
const STALL_LIMIT = 300;

function run(profile, tracks) {
  return simulate(profile, { noTracks: !tracks }, SEED);
}

const results = {};
for (const p of Object.keys(PROFILES)) results[p] = run(p, p === "pinky-weak");

for (const p of Object.keys(PROFILES)) {
  test("v2 finishes the letters for " + p + " without a stall and no slower than v1", () => {
    const r = results[p];
    assert.notEqual(r.letters, null);
    assert.ok(r.letters < STALL_LIMIT, p + " took " + r.letters);
    const v1 = [V1[p].strict, V1[p].assist].filter(v => v !== null);
    assert.ok(r.letters <= Math.min(...v1), p + " v2 " + r.letters + " v1 " + Math.min(...v1));
  });

  test("v2 gives the weakest key more of the text than v1 for " + p, () => {
    assert.ok(results[p].weakShare > V1[p].weakShare, p + " " + results[p].weakShare + " vs " + V1[p].weakShare);
  });

  test("lesson build time stays within budget for " + p, () => {
    assert.ok(results[p].buildMs < 8, p + " " + results[p].buildMs.toFixed(2));
  });
}

test("the numpad and symbols tracks finish for the pinky-weak typist", () => {
  const t = results["pinky-weak"].tracks;
  assert.notEqual(t.numpad, null);
  assert.notEqual(t.symbols, null);
});

test("the beginner never needs a forced unlock because nothing stalls", () => {
  assert.equal(results.beginner.forced, 0);
});
