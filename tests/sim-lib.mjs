import { S, base, fresh, noHooks, order, session, tracks } from "./helpers.mjs";

const { diffMap } = await import("../src/engine/difficulty.js");
const { neighborsOf } = await import("../src/engine/model.js");

export const PROFILES = {
  beginner: { layout: "en-qwerty", base: 800, diffExp: 0.6, err: 0.1, spread: 0.2, transpose: 0.15 },
  "hunt-and-peck": { layout: "en-qwerty", base: 650, diffExp: 1.1, err: 0.08, spread: 0.4, transpose: 0.15 },
  "fast-sloppy": { layout: "en-qwerty", base: 190, diffExp: 0.5, err: 0.07, spread: 0.15, transpose: 0.5 },
  "arabic-beginner": { layout: "ar-101", base: 850, diffExp: 0.6, err: 0.11, spread: 0.2, transpose: 0.1 },
  "pinky-weak": { layout: "en-qwerty", base: 330, diffExp: 1.3, err: 0.05, spread: 0.15, transpose: 0.2 }
};

const DAY = 86400000;
const LETTER_CAP = 1500;
const TRACK_CAP = 450;
const SITTING = 8;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function makeTypist(profile, seed) {
  const dm = diffMap(profile.layout);
  const reps = {};
  const ms0 = {};
  const e0 = {};
  const get = c => {
    if (ms0[c] === undefined) {
      const v = 1 + profile.spread * (hash(c + seed) * 2 - 1);
      ms0[c] = profile.base * Math.pow(dm[c] || 1.2, profile.diffExp) * v;
      e0[c] = profile.err * (0.7 + 0.6 * hash(seed + c + "e")) * Math.pow(dm[c] || 1.2, 0.5);
    }
  };
  return {
    reps,
    ms(c) {
      get(c);
      return Math.max(95, ms0[c] * Math.pow(1 + (reps[c] || 0), -0.25));
    },
    errP(c) {
      get(c);
      return Math.min(0.6, Math.max(0.004, e0[c] * Math.pow(1 + (reps[c] || 0), -0.3)));
    },
    lag(c) {
      return this.ms(c) * (1 + 4 * this.errP(c));
    }
  };
}

function weakestOf(ty, keys) {
  let best = null;
  let bv = -1;
  keys.forEach(c => {
    if (c === " ") return;
    const v = ty.lag(c);
    if (v > bv) {
      bv = v;
      best = c;
    }
  });
  return best;
}

function playLesson(ty, profile, lesson, clock, fatigue) {
  const tried = new Set();
  let guard = 0;
  while (S.lesson === lesson && !lesson.done && guard++ < 6000) {
    const i = lesson.idx;
    const expected = lesson.chars[i];
    const step = ty.ms(expected) * fatigue * (0.75 + 0.5 * base.rnd());
    clock.ts += step;
    if (!tried.has(i) && base.rnd() < ty.errP(expected)) {
      tried.add(i);
      let typed = "#";
      const next = lesson.chars[i + 1];
      if (next && next !== expected && base.rnd() < profile.transpose) typed = next;
      else {
        const nb = neighborsOf(expected);
        if (nb.length) typed = nb[Math.floor(base.rnd() * nb.length)];
        if (typed === expected) typed = "#";
      }
      session.handleChar(typed, clock.ts, noHooks);
      clock.ts += step * 1.5;
      continue;
    }
    tried.add(i);
    ty.reps[expected] = (ty.reps[expected] || 0) + 1;
    session.handleChar(expected, clock.ts, noHooks);
  }
}

export function simulate(profileName, variant, seed) {
  const profile = PROFILES[profileName];
  const real = Date.now;
  const clock = { ts: 1000, wall: 1.7e12 };
  Date.now = () => clock.wall;
  try {
    fresh(profile.layout, Object.assign({ lessonWords: 20, targetWpm: 35 }, variant.settings || {}));
    base.seedRng(seed);
    const ty = makeTypist(profile, String(seed));
    const out = { letters: null, focusHit: 0, weakShare: 0, weakLessons: 0, tracks: {}, buildMs: 0, builds: 0, buildTimes: [], forced: 0 };
    let n = 0;
    let inSitting = 0;
    const done = () => order.currentK() >= order.currentOrder().length;
    const step = () => {
      const t0 = performance.now();
      tracks.newLesson();
      out.buildTimes.push(performance.now() - t0);
      out.builds++;
      const lesson = S.lesson;
      const act = tracks.trackActive(tracks.learnTrack());
      const weak = weakestOf(ty, act);
      const fatigue = 1 + 0.08 * (inSitting / SITTING);
      playLesson(ty, profile, lesson, clock, fatigue);
      if (tracks.learnTrack() === "letters") {
        const body = lesson.chars.filter(c => c !== " ");
        out.weakLessons++;
        if (lesson.focus === weak) out.focusHit++;
        if (body.length) out.weakShare += body.filter(c => c === weak).length / body.length;
      }
      n++;
      inSitting++;
      if (inSitting >= SITTING) {
        inSitting = 0;
        clock.ts += 11 * 60000;
        clock.wall += DAY / 2;
      } else clock.wall += 4 * 60000;
    };
    while (!done() && n < LETTER_CAP) step();
    out.letters = done() ? n : null;
    const letterLessons = n;
    const list = variant.noTracks ? [] : tracks.trackList().filter(t => t !== "letters");
    list.forEach(tr => {
      S.settings.learnTracks.active = tr;
      let m = 0;
      const full = () => tracks.trackK(tr) >= tracks.trackKeys(tr).length;
      if (!tracks.trackKeys(tr).length) {
        out.tracks[tr] = 0;
        return;
      }
      while (!full() && m < TRACK_CAP) {
        step();
        m++;
      }
      out.tracks[tr] = full() ? m : null;
    });
    S.settings.learnTracks.active = "letters";
    out.focusHit = out.weakLessons ? out.focusHit / Math.min(out.weakLessons, letterLessons || 1) : 0;
    out.weakShare = out.weakLessons ? out.weakShare / out.weakLessons : 0;
    out.buildMs = out.buildTimes.length ? median(out.buildTimes) : 0;
    return out;
  } finally {
    Date.now = real;
  }
}

export function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
