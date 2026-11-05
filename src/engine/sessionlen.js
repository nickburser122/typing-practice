import { S } from "../core/state.js";

function noteWork(ms, chars, errs) {
  const s = S.session;
  s.ms += Math.max(0, ms);
  s.chars += Math.max(0, chars);
  s.errs += Math.max(0, errs);
}

function sessionDue() {
  const m = S.settings.session;
  return m > 0 && !S.session.shown && S.session.ms >= m * 60000;
}

function sessionSummary() {
  const s = S.session;
  const min = s.ms / 60000;
  return { ms: s.ms, chars: s.chars, wpm: min > 0 ? s.chars / 5 / min : 0, acc: s.chars > 0 ? Math.max(0, 1 - s.errs / s.chars) : 1 };
}

function resetSession() {
  S.session = { ms: 0, chars: 0, errs: 0, shown: false };
}

export { noteWork, resetSession, sessionDue, sessionSummary };
