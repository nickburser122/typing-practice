import { S, nf, t } from "../core/state.js";
import { resetSession, sessionDue, sessionSummary } from "../engine/sessionlen.js";
import { h, pct, render } from "./dom.js";

function sessionCard(next) {
  S.session.shown = true;
  const sm = sessionSummary();
  const row = (k, v) => h("div", { class: "ssrow" }, h("span", { class: "ssk" }, t(k)), h("span", { class: "ssv" }, v));
  return h("div", { class: "sessum", id: "sessum" },
    h("h2", null, t("ss.title")),
    row("ss.time", nf(Math.round(sm.ms / 60000)) + " " + t("ss.min")),
    row("ss.chars", nf(sm.chars)),
    row("ss.speed", nf(Math.round(sm.wpm)) + " " + t("ss.wpm")),
    row("ss.acc", pct(sm.acc)),
    h("button", { type: "button", class: "btn go", id: "sessgo", onclick: () => {
      resetSession();
      next();
      render();
    } }, t("ss.again")));
}

function endSessionIfDue(next) {
  if (!sessionDue()) return false;
  const stage = document.querySelector(".stage");
  if (!stage) return false;
  stage.textContent = "";
  stage.append(sessionCard(next));
  return true;
}

export { endSessionIfDue, sessionCard };
