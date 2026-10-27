import { S, onLessonBuilt } from "./core/state.js";
import { KEY_D, KEY_S, adoptData, adoptSettings, loadAll, saveNow } from "./core/storage.js";
import { newLesson } from "./engine/tracks.js";
import { applyKbFade, clearShift, trackShift } from "./input/keys.js";
import { U, applyChrome, clearFade, mountShell, quietNote, render } from "./ui/dom.js";
import { onKeyDown, setFocused } from "./ui/practice.js";

function boot() {
  onLessonBuilt(applyKbFade);
  loadAll();
  mountShell();
  applyChrome();
  newLesson();
  S.focused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  render();
  window.addEventListener("keydown", trackShift, true);
  window.addEventListener("keyup", trackShift, true);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointermove", clearFade);
  window.addEventListener("pointerdown", () => { U.tabbed = false; clearFade(); });
  window.addEventListener("blur", () => {
    setFocused(false);
    U.shiftL = false;
    U.shiftR = false;
  });
  window.addEventListener("focus", () => setFocused(true));
  document.addEventListener("pointerdown", () => { if (!S.focused) setFocused(true); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearShift();
      saveNow();
    }
  });
  window.addEventListener("pagehide", clearShift);
  window.addEventListener("pagehide", saveNow);
  window.addEventListener("storage", ev => {
    if ((ev.key !== KEY_D && ev.key !== KEY_S) || S.noSave) return;
    if (!(ev.key === KEY_D ? adoptData(ev.newValue) : adoptSettings(ev.newValue))) return;
    if (ev.key === KEY_S) applyChrome();
    const typing = (S.view === "practice" || S.view === "free") && S.lesson && !S.lesson.done && S.lesson.idx > 0;
    if (ev.key === KEY_S && !typing && S.view === "practice") newLesson();
    if (!typing && !(S.view === "test" && S.test && S.test.running)) render();
    quietNote("note.otherTab");
  });
}

export { boot };
