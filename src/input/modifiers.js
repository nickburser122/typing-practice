function altGraph(e) {
  return typeof e.getModifierState === "function" && !!e.getModifierState("AltGraph");
}

function isShortcut(e) {
  return !!e.metaKey || ((!!e.ctrlKey || !!e.altKey) && !altGraph(e));
}

function wordDelete(e) {
  return !e.metaKey && (!!e.ctrlKey || !!e.altKey);
}

export { altGraph, isShortcut, wordDelete };
