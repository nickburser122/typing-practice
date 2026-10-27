# Tarq

A bilingual (English / Arabic) typing trainer. The source is split into ES modules under `src/` and built into a single self-contained `index.html` with no network access, no runtime dependencies and a strict Content-Security-Policy. All data stays in the browser's `localStorage`.

## What it does

- **Learn**: adaptive lessons built from per-key speed and accuracy statistics. Keys unlock in a smart order. Strict unlocking (the default) requires keys to be steady and recent lessons to be accurate; assist unlocking keeps the original, more forgiving behaviour. A stall hint appears when progress has stopped.
- **Test**: time, words, quote and custom-text tests with word lists, punctuation, numbers, capitals and Arabic diacritics. Expert and master difficulty, stop-on-error (letter or word), confident mode, backspace into a previous wrong word, a two-press Esc safeguard, live speed and live accuracy.
- **Progress** (Keys → Progress): streaks, practice time, a seven-day comparison, speed and accuracy trends with hover and keyboard inspection, a 52-week activity map and permanent personal bests. History is kept as daily aggregates, so it outlives the 300 lessons / 200 tests / 200 code rounds that are retained in full.
- **Keys**: keyboard heat map, key list and pair timings.
- **Practice**: free text, custom text, code snippets and a shortcuts trainer.
- English layouts QWERTY, Dvorak and Colemak; Arabic 101. Light and dark themes, right-to-left interface, Arabic-Indic numerals.

## Commands

```
npm install
npm run build        index.html
npm run build:dev    dev.html (adds the in-browser self-test: open dev.html?selftest)
npm test             headless engine tests (Node, no browser needed)
npm run check        module boundary check
```

`npm run build` also lints the source and fails on network calls, native dropdowns and best-result highlight styling, and it runs the module boundary check.

## Architecture

Layers, lowest first. A module may import only from a lower layer or its own.

| Layer | Folders |
| --- | --- |
| 0 | `data/`, `i18n/` |
| 1 | `core/` (state, settings, schema, storage, history) |
| 2 | `engine/` (statistics, skill model, lesson and test generators, sessions) |
| 3 | `input/`, `features/`, `ui/` |
| entry | `app.js`, `main.js`, `dev.js` |

`tools/check-boundaries.mjs` enforces this on every build and also bans browser globals below layer 3 (a short allow-list covers `window`, `navigator` and `localStorage` in `core/`). The engines therefore run headless in Node, which is what `tests/` does.

Data model (`localStorage` keys `tarq:settings`, `tarq:data`, `tarq:custom`): per-layout character and pair statistics, recent lessons, tests and code rounds, `days` (per-layout daily aggregates), `pbs` (permanent personal bests keyed by test configuration) and shortcut progress. Everything read from storage or from an imported file passes through `sanitizeData` / `sanitizeSettings`.

## Tests

- `tests/engine.test.mjs`: generators are compared with golden output recorded from the original single-file app, plus unlocking, test-mode maths, hostile data, import/export and settings migration.
- `tests/history.test.mjs`: aggregates, backfill, streaks, personal bests, caps and sanitising.
- `tests/modes.test.mjs`: quotes, custom text, difficulty, stop-on-error and backspace rules.
- `dev.html?selftest` runs the browser self-test, which also covers rendering.
