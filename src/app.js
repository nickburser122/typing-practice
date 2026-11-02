import { S, onLessonBuilt } from "./core/state.js";
import { loadAll, onConflict, onStorageEvent, releaseLease, saveNow } from "./core/storage.js";
import { newLesson } from "./engine/tracks.js";
import { applyKbFade, clearShift, trackShift } from "./input/keys.js";
import { U, applyChrome, clearFade, mountShell, quietNote, redoCaret, render } from "./ui/dom.js";
import { onKeyDown, setFocused } from "./ui/practice.js";

function boot() {
  onLessonBuilt(applyKbFade);
  loadAll();
  onConflict(() => quietNote("note.otherTab"));
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
  window.addEventListener("resize", redoCaret);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redoCaret);
  window.addEventListener("blur", () => {
    setFocused(false);
    U.shiftL = false;
    U.shiftR = false;
    saveNow();
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
  window.addEventListener("pagehide", () => {
    saveNow();
    releaseLease();
  });
  window.addEventListener("storage", ev => {
    const kind = onStorageEvent(ev.key, ev.newValue);
    if (kind !== "data" && kind !== "settings") return;
    if (kind === "settings") applyChrome();
    const typing = (S.view === "learn" || S.view === "practice") && S.lesson && !S.lesson.done && S.lesson.idx > 0;
    if (kind === "settings" && !typing && S.view === "learn") newLesson();
    if (!typing && !(S.view === "test" && S.test && S.test.running)) render();
    quietNote("note.otherTab");
  });
}

export { boot };
