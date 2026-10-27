const VERSION = 4;
const SHARP = 2;
let rngState = 1;
function seedRng(n) {
  rngState = (n >>> 0) || 1;
}
function setRngState(n) {
  rngState = n;
}
function rnd() {
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
seedRng(window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Date.now());

export { SHARP, VERSION, rnd, rngState, seedRng, setRngState };
