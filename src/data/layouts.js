const GEOM = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]
];

const LEFT_HAND = new Set([
  "Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5",
  "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT",
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB"
]);

const RANK_CODES = [
  "KeyF", "KeyJ", "KeyD", "KeyK", "KeyS", "KeyL", "KeyA", "Semicolon", "KeyG", "KeyH", "Quote",
  "KeyR", "KeyU", "KeyE", "KeyI", "KeyW", "KeyO", "KeyQ", "KeyP", "KeyT", "KeyY",
  "BracketLeft", "BracketRight", "KeyV", "KeyM", "KeyC", "Comma", "KeyX", "Period", "KeyZ", "Slash",
  "KeyB", "KeyN", "Backquote"
];

function buildMap(rows) {
  const map = {};
  rows.forEach((pair, ri) => {
    const n = pair[0].split(" ");
    const s = pair[1].split(" ");
    GEOM[ri].forEach((code, i) => {
      map[code] = [n[i], s[i]];
    });
  });
  return map;
}

const NUM_N = "1 2 3 4 5 6 7 8 9 0";
const NUM_S = "! @ # $ % ^ & * ( )";

const LAYOUTS = {
  "en-qwerty": {
    id: "en-qwerty", lang: "en", name: "QWERTY",
    map: buildMap([
      ["` " + NUM_N + " - =", "~ " + NUM_S + " _ +"],
      ["q w e r t y u i o p [ ] \\", "Q W E R T Y U I O P { } |"],
      ["a s d f g h j k l ; '", "A S D F G H J K L : \""],
      ["z x c v b n m , . /", "Z X C V B N M < > ?"]
    ])
  },
  "en-dvorak": {
    id: "en-dvorak", lang: "en", name: "Dvorak",
    map: buildMap([
      ["` " + NUM_N + " [ ]", "~ " + NUM_S + " { }"],
      ["' , . p y f g c r l / = \\", "\" < > P Y F G C R L ? + |"],
      ["a o e u i d h t n s -", "A O E U I D H T N S _"],
      ["; q j k x b m w v z", ": Q J K X B M W V Z"]
    ])
  },
  "en-colemak": {
    id: "en-colemak", lang: "en", name: "Colemak",
    map: buildMap([
      ["` " + NUM_N + " - =", "~ " + NUM_S + " _ +"],
      ["q w f p g j l u y ; [ ] \\", "Q W F P G J L U Y : { } |"],
      ["a r s t d h n e i o '", "A R S T D H N E I O \""],
      ["z x c v b k m , . /", "Z X C V B K M < > ?"]
    ])
  },
  "ar-101": {
    id: "ar-101", lang: "ar", name: "Arabic 101 / عربي 101",
    map: buildMap([
      ["ذ " + NUM_N + " - =", "ّ " + NUM_S + " _ +"],
      ["ض ص ث ق ف غ ع ه خ ح ج د \\", "َ ً ُ ٌ لإ إ ‘ ÷ × ؛ < > |"],
      ["ش س ي ب ل ا ت ن م ك ط", "ِ ٍ ] [ لأ أ ـ ، / : \""],
      ["ئ ء ؤ ر لا ى ة و ز ظ", "~ ْ } { لآ آ ’ , . ؟"]
    ])
  }
};

const LAYOUT_BY_LANG = { en: ["en-qwerty", "en-dvorak", "en-colemak"], ar: ["ar-101"] };

const LETTERS = {
  en: new Set("abcdefghijklmnopqrstuvwxyz".split("")),
  ar: new Set("ابتثجحخدذرزسشصضطظعغفقكلمنهويةىءأإآؤئ".split(""))
};

const EXTRA_PUNCT = {
  en: [".", ",", "'", "-", ";", "?", "!"],
  ar: ["،", ".", "؟", "؛", "-"]
};

const AR_MARKS = ["\u064E", "\u064F", "\u0650", "\u0652"];

const DIGITS = "0123456789".split("");

for (const id in LAYOUTS) {
  const lay = LAYOUTS[id];
  lay.rev = {};
  for (const code in lay.map) {
    const m = lay.map[code];
    if (m[0].length === 1 && !(m[0] in lay.rev)) lay.rev[m[0]] = { code, shift: false };
    if (m[1].length === 1 && !(m[1] in lay.rev)) lay.rev[m[1]] = { code, shift: true };
  }
}

export { AR_MARKS, DIGITS, EXTRA_PUNCT, GEOM, LAYOUTS, LAYOUT_BY_LANG, LEFT_HAND, LETTERS, RANK_CODES };
