# Aven

Training, food logging and progress in one mobile-first web app. **Aven is the working name.**
A new product — unrelated to Setline (which was not touched).

- Local-first: no account, no analytics, no paid services. Everything works offline once loaded.
- English and Danish (`src/lib/da.ts`), metric-first with lb/mi/in available, locale-aware dates, decimals and day boundary.
- Installable PWA (manifest + service worker). Updates never replace a running workout (see *Updates*).

## Run it

```bash
npm install
npm run dev          # app on :5173 (proxies /api → :8787)
npm run server       # optional lookup server on :8787 (Open Food Facts + USDA)
# or one process for everything:
npm run build && npm start   # serves dist/ and /api on :8787
npm test             # 45 unit/integration tests (nutrition maths, parsers, dates, records, navigation, lookup server)
./scripts/run-all.sh # typecheck + tests + build + all browser journeys (needs `npm run dev` and the mock server running)
```

Lookup server environment (all optional):

| var | purpose |
|---|---|
| `USDA_API_KEY` | free key from <https://api.data.gov/signup/>. Kept server-side only. Without it USDA is skipped and Open Food Facts still works. |
| `CONTACT` | contact e-mail placed in the `User-Agent` sent to Open Food Facts (their API asks for this). |
| `PORT` | default `8787` |
| `AVEN_MOCK_UPSTREAM=1` | **development only**: replaces both upstreams with a few invented products so the online-lookup UI can be exercised offline. |

Deploy: any Node host (or adapt `server/index.mjs` to an edge function). Serve `dist/` and `/api/*` from the same origin.

## What the app does

**Today** — today's planned workout (start / resume), nutrition ledger, one-tap repeats of recent foods, water, week strip, bodyweight, recent activity, missed-workout prompts, first-use guidance.
**Train** — plan (week, routines, schedule), exercise library (filters, instructions, muscle diagram, substitutions, custom exercises), history (sessions + cardio/recovery).
**Food** — day diary with configurable meals, previous/next day + calendar, totals, water, weekly strip.
**Progress** — consistency, weekly volume, bodyweight with trend, calories, records, per-exercise trends; every chart has a table view and labels *measured / calculated / estimate*.
**Dictation sphere** (centre of the tab bar) — one flying dotted sphere: tab bar → listening → processing → review → confirm.

### Workout logging
Start from a routine, repeat a previous session or start empty. Add / search / replace / reorder / remove exercises; supersets; warm-up vs working sets; weight×reps, bodyweight (+load), assisted, duration, distance; previous performance beside each set (tap to copy); optional RPE/RIR; per-exercise notes; configurable rest timers (survive reload; chime + vibration); pause/resume; active session is saved on every change and recovered after reload; finish summary with volume, records (with definitions) and planned-vs-done; saved sets stay editable; delete → undo everywhere.

### Food logging
Search (bundled ~180 foods + saved + online), barcode / QR scanning (native `BarcodeDetector` where present, otherwise a bundled WebAssembly ZXing reader — so it works on iPhone Safari and Firefox too — plus a typed-number fallback), custom foods (per 100 g/ml *or per serving*, portions, density, raw/cooked), quick calories/macros, recents, favourites, saved meals, copy meal/day, recipes (ingredients → totals, per serving, prepared weight), dictation with a review step, water with adjustable quick amounts, weekly summary. Detail sheet updates kcal/macros live while you change the amount or portion.

**Nutrition model** (`src/lib/nutrition.ts`): nutrients are stored per 100 g/ml; unknown ≠ zero (shown "—", and sums show "≥" when an entry lacked the value); ml↔g only with a known density (otherwise the unit is hidden, never assumed); portions are flagged *verified* or *typical*; every logged entry keeps a frozen snapshot, so editing a food or recipe **never rewrites history**; totals are summed unrounded and rounded once for display; log ids are idempotent so double-taps can't double-log.

## Food data sources — what was verified

| | Open Food Facts | USDA FoodData Central |
|---|---|---|
| Access | no key; must send a custom `User-Agent` | free api.data.gov key; `DEMO_KEY` is tiny |
| Limits (per current docs/search results) | ~100 req/min product reads, **~10 req/min search** per IP | 1,000 req/hour per key |
| Browser use | **no CORS headers** → needs a server | key must stay private → needs a server |
| Licence | ODbL (attribute; share-alike on the database) | CC0 |

### How lookup works (no server required)

1. **Aven server** (`/api/food/*`, optional): merges Open Food Facts + USDA, caches, keeps the USDA key private.
2. **No server / static hosting**: the browser talks to **Open Food Facts directly** (search-a-licious, then `cgi/search.pl`; barcode via `api/v2/product`). The app detects a missing server (a static host answers `/api/*` with HTML) and stops asking for 10 minutes. A client-side budget keeps it under OFF's ~10 searches/min. USDA is server-only because it needs a key.
3. **Offline / blocked**: ~180 bundled foods, everything you've saved or logged, custom foods, quick entry. The UI says which layer you are on.

So a plain static deploy (e.g. any CDN) gets search + barcode through layer 2; running `npm start` with a `USDA_API_KEY` adds USDA and caching.
**Caveat:** layer 2 depends on Open Food Facts allowing cross-origin browser requests. I could not confirm that from this sandbox (one source said their API has no CORS; I couldn't test), so if direct calls are blocked in your browser the server layer is the fix. Test first with a real barcode on your phone.

**Honest status:** this sandbox's network blocks both hosts (and their doc pages), so these facts come from web-search summaries, **not** from reading the official pages, and **no live call was made**. The normalisers (`server/normalize.mjs`) are tested against fixtures written from the documented response shapes, not live captures. First real-world check to do: run the server with a real `USDA_API_KEY` from a normal network and search "skyr", "banana", a known EAN. The client degrades gracefully (bundled foods, saved foods, manual entry) when the server is missing or offline.

The ~180 bundled **reference foods** (`src/data/foods.ts`) are approximate typical values entered from general knowledge — labelled "Reference (approximate)" in the UI — not copied from a licensed table. Correct any of them via *Correct → my copy*.

## Dictation

- Food: "200 grams of skyr, one banana and 60 grams of oats" → editable rows. Ambiguity is **never guessed silently**: "skyr" (three products) and "oats" (dry vs porridge) must be chosen; unmatched foods offer a search or an online lookup; "one banana" resolves to a *typical* 118 g portion flagged `~ estimated`; spoken volumes for foods without density ask for grams. Choices you make are remembered (still shown, still editable).
- Workout: "bench press 80 kilos for 8, 8 and 6", "3 sets of 8 at 60 kg", "plank 60 seconds then run 5 km in 25 minutes". Exercise choice is reviewed; frequently-logged exercises win ties.
- **Microphone**: `src/lib/mic.ts` is the single owner — a second requester is refused, `release()` stops every track and closes the AudioContext, it releases on `visibilitychange`/`pagehide`. The sphere's listening motion is driven by the real analyser (level + 16 bands) and only while the stream is live; with no level available it says so ("Listening (no level meter)") instead of faking a voice.
- Speech-to-text uses the browser's Web Speech API. On Chrome this is a **cloud** service; Safari/Firefox support varies. Where it is unavailable the composer opens in typing mode (your keyboard's own dictation key works too). Aven never records or stores audio.

## Screens

Representative screens (dark, light, Danish) are in [`docs/screens/`](docs/screens/) and recordings of the workout and food journeys in [`docs/videos/`](docs/videos/) (Playwright captures of the headless-Chromium runs below — not a physical phone).

## Verification

Run in headless Chromium (Playwright, 390×844 @2×, dark + light), scripts in `scripts/`:

| Journey | Result |
|---|---|
| `journey-workout` — start from Today, tap/type sets, Enter-to-complete, rest timer, minimise → pill → resume, **reload mid-workout and recover**, finish, summary (volume/PR arithmetic checked by hand), history, saved values | pass |
| `journey-food` — search, portion → live kcal (200 g skyr = 126), add, edit to 300 g (189), delete → **undo restores**, dictation → review (resolve ambiguity) → log (643 kcal exact) | pass |
| `journey-food2` — online results, source labels, verified serving (93 kcal), barcode entry, not-found → custom food, previous day independent, copy meal to tomorrow | pass (upstream **stubbed**) |
| `journey-train` — delete session → undo, missed workout → reschedule (history untouched), add/superset/replace (substitutes)/reorder, pause freezes clock, dictated sets exact, custom exercise | pass |
| `journey-misc` — onboarding → starter plan filtered by equipment, recipe (232 kcal/serving) → edit recipe → logged entry unchanged, water undo, lb↔kg, export → import in a fresh profile → undo, invalid file rejected | pass |
| `lookup` — static-host simulation (`/api` → HTML): search and barcode fall back to direct Open Food Facts calls (**stubbed responses**); bundled WASM reader decodes a generated EAN-13 (native detector removed); QR payload → product number | pass |
| `interrupt` — rapid minimise/resume ×6, reversed and full drag-to-minimise, rapid sheet open/close, in **both** full and reduced motion; never >1 workout dialog, history not over-popped, mic released | pass |
| `robust` — mic single-owner/refusal/release (Chromium **fake audio device**), triple-tap save = 1 entry, rapid open/close of composer leaves mic released | pass |
| `pwa` — production build, service worker active, reload **offline**, bundled foods work, offline state explained | pass |

**Not verified (needs a real phone / real network):** live Open Food Facts and USDA responses, camera barcode scanning with a real camera, real speech-to-text, real microphone levels from a human voice, camera barcode scanning, iOS Safari safe-area/keyboard behaviour, haptics, installing to a home screen, scroll feel/momentum on touch hardware, 60 fps on low-end devices. Everything above ran in desktop Chromium emulating a phone.

## What is implemented / simulated / not built

- **Implemented and exercised:** everything in *What the app does* above.
- **Simulated / demo:** *Demo data* (Settings → Data, or onboarding) is invented, flagged `demo: true`, only loads into an empty app and is removable. `AVEN_MOCK_UPSTREAM` is dev-only.
- **Needs an integration you must supply:** `USDA_API_KEY` (free); a host for `server/` if you want online lookup in production.
- **Not built (on purpose, stated in-app):** cloud sync / accounts; photo-based food estimation; AI coaching (progression suggestions are transparent rules from your own last session: all sets at the top of the range → add load); background reminders when the app is closed (web apps need a push server — reminders fire only while Aven runs; in-app nudge otherwise); animated exercise demonstrations (there is an authored muscle diagram and step-by-step text instead).
- Exercise calories are **never** added to food targets.

## Motion system

Three connected signatures share one grammar (springs: `SPRING` 420/38 for sheets, `SOFT` 300/32 for content, `SNAP` for small controls; press = scale .965 in 140 ms; every entrance is interruptible and closes with the same spring):

1. **Workout surface → active workout → origin** — the Today hero (or tab-bar pill) plate is a shared `layoutId`; the content is a separate layer that cross-fades, so text is never stretched. Drag down to minimise; it returns to the pill.
2. **Sphere → composer → review** — a single `SphereStage` flies between slots with its own spring (follows a moving sheet), shrinking into the review header; states: idle, listening (real audio), processing (sweep), review (equator ring), confirmed (ripple), error/unavailable (dimmed).
3. **Reviewed values → destination** — confirmed rows settle into their meal with a brief highlight while the ledger counts all totals together; set rows settle into the workout; every save offers **Undo**.

Reduced motion: follows the OS, overridable in Settings; springs/slides/sphere rotation are removed, nothing essential depends on them.

## Project layout

```
src/lib        pure logic: nutrition, parsers, stats, dates, units, mic, speech, i18n
src/state      zustand store (+ versioned localStorage persistence), UI & voice stores
src/ui         sphere, sheets, toasts, tab bar, charts, icons, kit
src/screens    Today / Train / Food / Progress + overlays (food/*, workout/*)
server/        zero-dependency lookup server + normalisers (+ dev mock)
tests/         vitest
scripts/       Playwright journeys, icon generator, i18n checker
```

### Updates
`vite-plugin-pwa` runs in *prompt* mode: a new build waits until you press **Update**, and the banner is suppressed while a workout is active. State is flushed to storage first, and the active workout / unsaved entries live in `localStorage`, so a reload loses nothing.

### Known trade-offs
- Persistence is `localStorage` (+ IndexedDB for photos) for simplicity; very heavy multi-year use may eventually want IndexedDB for the main data.
- Bundle is ~225 kB gzip (one chunk); screens could be lazy-loaded.
- Danish exercise/food names exist for the bundled data; custom and online items keep their own names.
