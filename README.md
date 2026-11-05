# Tarq

A bilingual (English / Arabic) typing trainer. The source is split into ES modules under `src/` and built into a single self-contained `index.html` with no network access, no runtime dependencies and a strict Content-Security-Policy. All data stays in the browser's `localStorage`.

## What it does

- The app never praises, scolds or nudges: no streaks, no reminders, no commentary on results. Numbers are shown as numbers.
- **Learn**: adaptive lessons built from per-key speed and accuracy statistics. Keys unlock in a smart order, and the next key waits until every active key is steady and recent lessons are accurate. When progress has stopped, the Keys page names the blocking key and offers "Unlock next key anyway" (after 30 lessons, 15 for data saved by the older assisted mode); nothing is shown on the practice screen. After every key is unlocked, lessons move to fluency: weak words, weak pairs and the keys that cost the most time.
- **Test**: time, words, quote and custom-text tests with word lists, punctuation, numbers, capitals and Arabic diacritics. Expert and master difficulty, stop-on-error (letter or word), confident mode, backspace into a previous wrong word, a two-press Esc safeguard, live speed and live accuracy.
- **Progress** (Keys → Progress): practice time, characters typed, a seven-day comparison, speed and accuracy trends with hover and keyboard inspection, a 52-week activity map and permanent personal bests. History is kept as daily aggregates, so it outlives the 300 lessons / 200 tests / 200 code rounds that are retained in full.
- **Keys**: keyboard heat map, key list and pair timings.
- **Practice**: free text, custom text, code snippets and a shortcuts trainer.
- **Zen mode**: only the text and the caret, in Learn, Practice, code and tests. A small header button, or Z before typing starts, enters it and Esc twice leaves it. The text is a three-line window: the next lesson's words continue the same flow and the finished text stays above, dimmed.
- **Pairs**: the Keys page ranks pairs by impact (how common, how slow, how often swapped) and shows a Swaps column. After a test, Practise these words builds a lesson from the missed and slowest words.
- **Comfort**: caret style (line, block, underline) and smooth caret, text width, hide errors while typing, an optional session length with a plain summary, and a Rules popover in tests (difficulty, stop on error, confident).
- English layouts QWERTY, Dvorak and Colemak; Arabic 101. Light and dark themes, right-to-left interface, Arabic-Indic numerals.
- Arabic on a Mac: macOS's standard Arabic layout puts the letters on the same physical keys as Arabic 101, so use the Arabic 101 layout with the Physical keys input mode. The number row and the shifted symbols on a Mac are not modelled separately (the app has no verified key table for them), so the on-screen hints for those keys follow Arabic 101.

## How lessons are chosen

One model describes every key. A key's speed estimate is a log-normal mean of its recent timings and its accuracy estimate a Beta posterior of its recent outcomes. Each sample is weighted by how recent it is, by `exp(-age / 21 days)`, and by 0.5 if it came from a test. A key counts as steady when the upper bound of its speed is under its gate (the speed ramp, scaled 0.9 to 1.35 by the key's difficulty) and its accuracy is within 3 points of the target. Each key's need is its speed gap, its accuracy gap and a small review term.

While a key blocks progress it is the lesson's focus key: 60% of the words contain it, a quarter contain a focus pair, and pseudo-words that must contain it fill in when real words run out. Typing the neighbouring letter instead of the expected one (a swap) is charged to the pair, not the key. Real words typed with an error, missed in a test, or typed clearly slower than the rest are remembered per layout (up to 300, with a decayed miss count, extra time per character and last-seen time) and brought back once nothing blocks progress. Clean letter triples are timed as well, and a triple that is slower than its last two letters alone adds to the need of words that contain it. Once nothing blocks progress a lesson is about 20% weak words, 10% review, 30% words with a focus pair or triple, 20% focus-key words and the rest chosen by need. Tracks (capitals, digits, numpad, punctuation, symbols, diacritics) use the same rules.

`npm run sim` prints a simulated-typist table comparing lessons to unlock all letters. `tests/sim.test.mjs` fails if a simulated typist stalls, is slower than the old engine's recorded results, or if lesson building leaves its time budget.

## Commands

```
npm install
npm run build        index.html
npm run build:dev    dev.html (adds the in-browser self-test: open dev.html?selftest)
npm test             headless engine tests (Node, no browser needed)
npm run sim          simulated-typist comparison table
npm run check        module boundary check
```

`npm run build` writes `index.html` (committed, opens straight from disk) and a copy in `public/` (git-ignored, the output folder Vercel serves; see `vercel.json`). It also lints the source and fails on network calls, native dropdowns and best-result highlight styling, and it runs the module boundary check.

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

Data model, version 5 (`localStorage` keys `tarq:settings`, `tarq:data`, `tarq:custom`, plus `tarq:lease`, `tarq:backup` and `tarq:backup-v4`):

- per layout: character statistics (timings and outcomes with parallel day stamps `td` and `od`, bit 0 marks a test sample), pair statistics (speed plus decayed swap counts `te` and `tc`), unlock position per track, the optional `raise` boost, and a `weak` word list and a `tri` table of timed letter triples;
- recent lessons (with their `tr` track and active time `ams`), tests and code rounds, `days` (per-layout daily aggregates), `pbs` (permanent personal bests keyed by test configuration), shortcut progress, and flags (`hw`, `early`);
- version 4 data and export files still load; before its first version 5 save the untouched version 4 settings and data are copied once to `tarq:backup-v4`;
- two open tabs coordinate with a write lease (`tarq:lease`); a tab saves only if storage still holds what it last saw, so the older tab can never overwrite the newer one's data; importing keeps the previous data in one `tarq:backup` slot with a Restore button in Settings → Data.

Everything read from storage or from an imported file passes through `sanitizeData` / `sanitizeSettings`. Settings that were removed (minimum samples, idle pause, review and extras rates, line height, strip and result switches, carrier, algorithm, assisted unlocking) are still read from old files and then ignored; the focus slider and word-length range map to the new Focus and Word length choices.

## Tests

- `tests/engine.test.mjs`: generators are compared with golden output recorded from the original single-file app, plus unlocking, test-mode maths, hostile data, import/export and settings migration.
- `tests/history.test.mjs`: aggregates, backfill, personal bests, caps and sanitising.
- `tests/modes.test.mjs`: quotes, custom text, difficulty, stop-on-error and backspace rules.
- `tests/sim.test.mjs`, `tests/sim-lib.mjs`, `tests/sim-baseline.mjs`: the typist simulation and the recorded results of the old engine.
- `tests/lease.test.mjs`, `tests/backup.test.mjs`, `tests/migration.test.mjs`: two-tab saving, import backup and version 4 to 5 migration.
- `tests/fatigue.test.mjs`, `tests/snapshot.test.mjs`, `tests/aging.test.mjs`, `tests/transposition.test.mjs`, `tests/weak.test.mjs`, `tests/trigram.test.mjs`, `tests/pairs.test.mjs`, `tests/sessionlen.test.mjs`, `tests/settings.test.mjs`, `tests/brand.test.mjs`, `tests/perf.test.mjs`: the individual engine, settings and performance features.
- `tests/lessons-golden.test.mjs` and `tests/fixtures/baseline.json`: recorded lesson text for fixed data and seeds; regenerate them only when lesson generation changes on purpose.
- `dev.html?selftest` runs the browser self-test, which also covers rendering.
