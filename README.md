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

## Put it on your phone

The build is static and path-independent, so any static host works. Easiest: **GitHub Pages** — repo *Settings → Pages → Source: GitHub Actions*, then every push to `main` (or the working branch) publishes to `https://<user>.github.io/<repo>/` via `.github/workflows/pages.yml` (it type-checks and runs the unit tests first). Vercel/Netlify: import the repo, build `npm run build`, output `dist`. Open the URL on the phone → iOS Safari *Share → Add to Home Screen*, Android Chrome *Install app*. HTTPS (which all of these give you) is required for the microphone and installing.

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
- Without keys, speech-to-text uses the browser's Web Speech API. On Chrome this is a **cloud** service; Safari/Firefox support varies. Where it is unavailable the composer opens in typing mode (your keyboard's own dictation key works too). Aven never stores audio. With a Groq key (below) it records and uses Whisper instead.

## Voice & AI (optional: Groq hears, Gemini understands)

Settings → **Voice & AI**. Everything works without keys; with them:

- **Groq Whisper** (`whisper-large-v3` accurate / `-turbo` fast, Danish/English/auto) transcribes your recording. Same recording stream as the sphere (still exactly one mic owner). Hardening copied from the Setline app's pipeline: audio is high-passed, trimmed to the speech, normalised and sent as 16 kHz mono WAV; silent clips are never sent; the prompt carries your favourite/recent food or exercise names; segment scores drop subtitle-style junk ("Tak fordi du så med"); the prompt itself is never accepted back as a transcript (echo defence, using an unlikely-number sample); Norwegian-sounding Danish is re-heard as Danish; one automatic retry on a network blip/timeout; on failure the **recording is kept** so "Retry transcription" doesn't need you to speak again.
- **Gemini** (REST, rolling `flash-lite`/`flash` models chosen from your key's own model list; falls back to the next model on busy/quota and remembers a daily quota until midnight Pacific) does four jobs: understand a messy dictated sentence into rows; estimate a food that isn't in any database ("Estimate with Gemini" — logged as a quick entry labelled **AI estimate** with its assumptions, never as an exact food); the **Coach** (streaming chat grounded in a short summary computed on your device: targets, 14-day nutrition averages with unlogged days left unknown, measured weight vs smoothed trend, recent sessions); and **Build a routine** (a preview you must confirm; only exercises that exist in your library are kept, unknown ones are listed as left out). Optional spoken Coach replies use Gemini TTS.
- **The model never writes data.** Its JSON is validated (units converted by code, absurd numbers rejected, one bad number drops that item); the normal resolver and review screen still run, so ambiguity ("which skyr?") is still yours to decide, and the review line says exactly who did what ("Heard by Groq · understood by Gemini"). Any Gemini failure falls back to the built-in parser and says so.
- **Keys**: typed into Settings and stored only in this browser (`aven.keys` in localStorage). They are not in the app data, exports or backups; "Delete everything" removes them. They are sent only to `api.groq.com` / `generativelanguage.googleapis.com`. This is a browser-held key, not a server secret — anyone with access to your unlocked browser profile could read it, so use free-tier keys you can revoke.
- Screens (stubbed services): [`docs/screens/ai-2-settings.png`](docs/screens/ai-2-settings.png), [`ai-4-review`](docs/screens/ai-4-review.png), [`ai-5-estimate`](docs/screens/ai-5-estimate.png), [`ai-7-groq-401`](docs/screens/ai-7-groq-401.png), [`ai-9-coach`](docs/screens/ai-9-coach.png), [`ai-10-routine`](docs/screens/ai-10-routine.png).
- **Privacy**: recordings go to Groq; dictated text, estimate descriptions and Coach messages (plus the on-device summary) go to Google. Free Gemini tiers may be used by Google to improve its products.

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
| `ai` — keys saved/tested and **not** present in app data, Groq recording → transcript → Gemini rows → resolver (ambiguity still the user's), AI-estimate row logged as labelled quick entry, Groq 401 / network failure explained with **retry from the same recording**, Gemini down → built-in parser and says so, Coach streaming answer, routine preview → explicit create (unknown exercise left out) — Groq and Gemini **stubbed at the network layer** | pass (stubbed) |
| `pwa` — production build, service worker active, reload **offline**, bundled foods work, offline state explained | pass |

**Not verified (needs a real phone / real network / your keys):** live Groq and Gemini responses (the `ai` journey stubs both — it proves wiring, validation and error handling, not transcription accuracy, Gemini answer quality, quota behaviour or TTS audio), recording on a real phone microphone (Chromium's fake audio device was used), live Open Food Facts and USDA responses, camera barcode scanning with a real camera, real speech-to-text, real microphone levels from a human voice, camera barcode scanning, iOS Safari safe-area/keyboard behaviour, haptics, installing to a home screen, scroll feel/momentum on touch hardware, 60 fps on low-end devices. Everything above ran in desktop Chromium emulating a phone.

## What is implemented / simulated / not built

- **Implemented and exercised:** everything in *What the app does* above.
- **Simulated / demo:** *Demo data* (Settings → Data, or onboarding) is invented, flagged `demo: true`, only loads into an empty app and is removable. `AVEN_MOCK_UPSTREAM` is dev-only.
- **Needs an integration you must supply:** a Groq key and a Gemini key (both free tiers, typed in Settings → Voice & AI; optional); `USDA_API_KEY` (free); a host for `server/` if you want online lookup in production.
- **Not built (on purpose, stated in-app):** cloud sync / accounts; photo-based food estimation; automatic AI changes to your data (the Coach advises; routines and estimates only appear after you confirm; progression suggestions remain transparent rules); background reminders when the app is closed (web apps need a push server — reminders fire only while Aven runs; in-app nudge otherwise); animated exercise demonstrations (there is an authored muscle diagram and step-by-step text instead).
- Exercise calories are **never** added to food targets.

## Newer features

- **Wrestling**: its own activity type — mat time (quick 30/45/60/90/120 min), rounds and intensity (Easy/Hard/Max), a note. Shown on Train (this week's mat minutes), as a wrestler mark on the week strips, in History, as a weekly mat-time chart in Progress, and in the Coach's summary as training load. Never added to calorie targets.
- **Beat last time**: completing a working set that beats the same set last session (more weight for the same reps, or more reps at the same weight; duration/distance likewise) gives a gold burst on the check and the gain floating up ("+2.5 kg", "+1 rep"). New records get a gold medallion on the summary.
- **Snap your plate** (Gemini key): photo → per-item estimates (name, grams, kcal, macros) → choose items and portion (×0.5–×2) → logged as quick entries labelled "AI estimate" with the assumptions. Image is downscaled to 1024 px before sending. Wiring tested with a stubbed Gemini; real recognition quality is unverified.
- **Home-screen shortcuts** (Android long-press on the installed icon): Log food, Dictate, Snap your plate, Log wrestling.

## Feel (latest pass)

- **Sheets behave like iOS**: the page behind steps back (scales to 92 %, rounds its corners, dims over black); swipe down from anywhere — when the list under your finger is at the top — and the sheet follows 1:1, then either closes carrying your swipe speed and easing out, or springs back. Stacked sheets step back too. The workout screen minimises the same way.
- **Workout open/close**: the background surface grows out of the Today card / pill as a shared-layout transform (GPU only); the content fades in on top and the exercise list mounts a few rows at a time after the animation.
- **Tab bar**: icons and the orb move with shared-layout springs, the oval glides with a slightly softer spring, labels blur in.
- **The orb is the microphone everywhere**: tab bar, voice composer, the Coach input and the workout's dictate button; it flies between them and stays glued once landed.
- **Coach**: replies blur in word by word as they stream (only new words animate), sent messages spring up from the input, a typing indicator shows while it thinks, and the orb listens/thinks/blooms with it.
- **Performance**: nothing animates behind an open popup any more (colour field, orb in the tab bar, pulsing dots pause), so the frosted layers stop re-blurring every frame; popups no longer animate a full-screen backdrop blur. Measured in software-rendered Chromium: idle with a popup open ~24 → ~58 fps, workout start ~24 → ~40 fps.
- **Smoothness pass** (same look, less work per frame):
  - Tab screens stay alive between visits (React `<Activity>`), so switching tabs no longer rebuilds a whole screen; ring/chart draw-ins and the staggered rise still replay on every visit, and every visit still starts at the top.
  - Page slides and sheet open/close/step-back animate `transform`/`opacity` through the native animation engine, so they run on the compositor and stay smooth while React works. The swipe-to-close momentum is unchanged.
  - The tab colour cross-fade runs only on the colour field and the tab bar (it used to restyle every element of the app for 1.1 s); the orb fades its own colours instead of polling CSS.
  - The live workout clock and rest timer re-render only their own text (not the whole workout four times a second); exercise and set rows are memoised.
  - The tab bar no longer re-renders/re-measures when a popup opens or every half second during a workout; buttons no longer each hold a GPU layer (~60 → ~35 layers per screen); "pause behind popups" no longer restyles the whole app; date/number formatters are cached.
  - On Android: keep Settings → Display → Motion smoothness on **Adaptive**. On iPhone, Safari caps web apps at 60 fps unless Settings → Apps → Safari → Advanced → Feature Flags → "Prefer Page Rendering Updates near 60fps" is off.

- **Fixes from phone recordings**:
  - Popups blur the page behind them again (16 px, saturated, fading in with the dim); the full-screen workout only dims, since it covers the page anyway.
  - The workout screen is now a *window*: only a clip rectangle animates out of the Today card / tab-bar pill (and back). It is opaque the whole way, so the page behind no longer ghosts through while it opens or closes, and nothing inside it scales or repaints per frame (no animated shadow, no stretched layers).
  - Its colour field is a single layer (three gradients) instead of three big layers + a mask + a blend, so opening it no longer shows a half-drawn rectangle for a few frames. Film grain is a pre-baked noise tile instead of an SVG filter.
  - Content fades out before the bottom edge of every screen, so nothing peeks out below the tab bar.
- **Everything moves as one** (sync pass): each popup has a single progress number (`engage.ts`) that already includes your finger. The popup's own position, the page behind it (scale and corners), the dim/blur over that page and the orb all read that same number in the same animation frame — so while you drag a sheet the page grows back under your finger, a flick carries the page, dim and orb out at the same speed, and opening is the same thing in reverse. The orb has no spring of its own any more: it sits in the tab bar blended towards the popup's slot by that progress (so it rides in with the popup and returns with it, and never lags or goes off-screen).

## Look and motion

**Dusk glass.** A slow-drifting colour field (three lights plus fine grain) sits behind everything; every surface is frosted glass over it (blur + saturation, hairline specular rim). Each area has its own light and accent that cross-fade when you change tab: Today peach/violet, Train ember, Food lime, Progress ice. Numerals are thin and wide-set (Geist, weight 220), names are italic serif (Instrument Serif); the day is one instrument of concentric rings (calories + protein/carbs/fat) that draw themselves in with a spring. Text is cut to what carries information: icon-first actions, no section captions, no helper paragraphs (warnings that protect data accuracy stay).

Motion grammar: springs everywhere (press = 520 ms overshoot release, 80 ms down); every screen's blocks rise in staggered, blurred → sharp; tab content slides with a blur out; the tab bar is a glass pill whose active tab opens up to show its name (shared-layout highlight); sheets arrive over a scrim whose blur ramps from 0 to 16 px, then their content rises in; a completed set sends a ring out from its check. Reduced motion (OS or Settings) stops the drifting light, the rise-in and the springs.

Three connected signatures share that grammar (springs: `SPRING` 420/38 for sheets, `SOFT` 300/32 for content):

1. **Workout surface → active workout → origin** — the Today card (or tab-bar pill) is a shared `layoutId`; the content is a separate layer that cross-fades, so text is never stretched. Drag down to minimise; it returns to the pill.
2. **Sphere → composer → review** — a single `SphereStage` flies between slots with its own spring (real-time, sub-stepped physics, so a dropped frame never slows it), shrinking into the review header. The surface moves as one liquid — five smooth travelling waves, bass driving the slow swells and highs the fine shimmer — with a soft inner light, a two-tone colour from the current area, and a small spring 'bloom' on every state change; its colour follows the active area's accent. States: idle, listening (real audio), processing (sweep), review (equator ring), confirmed (ripple), error/unavailable (dimmed).
3. **Reviewed values → destination** — confirmed rows settle into their meal with a brief highlight while the ring and totals count together; set rows settle into the workout; every save offers **Undo**.

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
