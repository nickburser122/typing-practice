globalThis.window = globalThis;

export const base = await import("../src/core/base.js");
export const state = await import("../src/core/state.js");
export const settings = await import("../src/core/settings.js");
export const storage = await import("../src/core/storage.js");
export const stats = await import("../src/engine/stats.js");
export const skill = await import("../src/engine/skill.js");
export const order = await import("../src/engine/order.js");
export const words = await import("../src/engine/words.js");
export const tracks = await import("../src/engine/tracks.js");
export const session = await import("../src/engine/session.js");
export const testMode = await import("../src/engine/test.js");
export const layouts = await import("../src/data/layouts.js");

const { S, refreshDerived } = state;

export function fresh(layout, extra) {
  S.noSave = true;
  S.settings = settings.sanitizeSettings(Object.assign({ layout, lessonWords: 25, targetWpm: 35 }, extra || {}));
  S.data = storage.sanitizeData(null);
  S.sess = null;
  S.recent = [];
  S.testOv = null;
  S.test = null;
  S.lesson = null;
  S.view = "practice";
  refreshDerived();
}

export const noHooks = { painted() {}, finished() { tracks.newLesson(); } };

export function typeLesson(msPerKey, errRate, lessons) {
  let ts = 1000;
  for (let n = 0; n < lessons; n++) {
    const lesson = S.lesson;
    let guard = 0;
    while (S.lesson === lesson && !lesson.done && guard++ < 5000) {
      const expected = lesson.chars[lesson.idx];
      const step = msPerKey * (0.7 + 0.6 * base.rnd());
      ts += step;
      if (base.rnd() < errRate) {
        session.handleChar("#", ts, noHooks);
        ts += step;
      } else session.handleChar(expected, ts, noHooks);
    }
  }
  return ts;
}

export { S };
