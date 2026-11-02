import { V1 } from "./sim-baseline.mjs";
import { PROFILES, median, simulate } from "./sim-lib.mjs";

const args = process.argv.slice(2);
const profiles = args.filter(a => PROFILES[a]);
const seeds = [11, 12, 13];
const rows = [];

for (const p of profiles.length ? profiles : Object.keys(PROFILES)) {
  const runs = seeds.map(s => simulate(p, { settings: {} }, s));
  const done = runs.filter(r => r.letters !== null);
  rows.push({
    profile: p,
    v1Strict: V1[p].strict === null ? "none" : V1[p].strict,
    v1Assist: V1[p].assist,
    v2: done.length ? median(done.map(r => r.letters)) : "none",
    finished: done.length + "/" + runs.length,
    focusHit: (runs.reduce((a, r) => a + r.focusHit, 0) / runs.length).toFixed(2),
    v1FocusHit: V1[p].focusHit,
    weakShare: (runs.reduce((a, r) => a + r.weakShare, 0) / runs.length).toFixed(3),
    v1WeakShare: V1[p].weakShare,
    buildMs: (runs.reduce((a, r) => a + r.buildMs, 0) / runs.length).toFixed(1),
    tracks: Object.entries(runs[0].tracks).map(([k, v]) => k.slice(0, 3) + ":" + (v === null ? "x" : v)).join(" ")
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}
console.table(rows);
