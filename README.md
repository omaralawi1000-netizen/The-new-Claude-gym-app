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
- **The model never writes data directly.** Its JSON is validated (units converted by code, absurd numbers rejected, one bad number drops that item); the normal resolver and review screen still run, so ambiguity ("which skyr?") is still yours to decide, and the review line says exactly who did what ("Heard by Groq · understood by Gemini"). Any Gemini failure falls back to the built-in parser and says so.
- **Keys**: typed into Settings and stored only in this browser (`aven.keys` in localStorage). They are not in the app data, exports or backups; "Delete everything" removes them. They are sent only to `api.groq.com` / `generativelanguage.googleapis.com`. This is a browser-held key, not a server secret — anyone with access to your unlocked browser profile could read it, so use free-tier keys you can revoke.
- Screens (stubbed services): [`docs/screens/ai-2-settings.png`](docs/screens/ai-2-settings.png), [`ai-4-review`](docs/screens/ai-4-review.png), [`ai-5-estimate`](docs/screens/ai-5-estimate.png), [`ai-7-groq-401`](docs/screens/ai-7-groq-401.png), [`ai-9-coach`](docs/screens/ai-9-coach.png), [`ai-10-routine`](docs/screens/ai-10-routine.png).
- **Privacy**: recordings go to Groq; dictated text, estimate descriptions and Coach messages (plus the on-device summary) go to Google. Free Gemini tiers may be used by Google to improve its products.

## The Coach acts (one place for talking to the app)

There are no separate food / workout voice modes any more. The orb opens its own full-screen sphere (it listens straight away and stops by itself when you pause); the Coach chat does the same from its mic. Both use one shared brain (`src/lib/agentTurn.ts` → `decide`) and the same actions and Undo cards (`src/ui/agentUi.tsx`). Say or type it once, anywhere:
"log a banana", "200 g skyr and two eggs for breakfast", "bench press 100 kilos for 8, 8 and 6", "drank half a litre", "weigh-in 82.4", "30 minutes wrestling, hard", "start Pull day", "switch to light mode", "open progress", "undo that".

- **How it works**: Gemini gets your sentence, the app's guide (every screen, setting and rule — so "how do I change the theme?" is simply answered) and a compact live summary computed on the device (settings, today's meals/water, a running workout, routines, targets, recent training). It answers with a reply and a short list of actions. The model never writes data itself: each action is validated (`src/lib/agent.ts` → `validateAgent`), then run by the same code the screens use (food matching/quantity rules, exercise matching, settings patching).
- **Safety**: everything reversible is applied at once and shown as a card with **Undo**; spoken quick logs close the Coach and leave an Undo toast. Finishing a workout always needs a tap. Nothing deletes data. Unknown foods become a clearly labelled **AI estimate**; ambiguous names the Coach can't settle are shown on the card, not guessed silently.
- **Without a Gemini key** (or if Gemini is down) a built-in reader still logs simple sentences (food, sets, water, weight); chat and settings changes need the key. Without a Groq key the mic falls back as before.
- The Coach hears you with Groq Whisper: it listens, stops by itself when you finish speaking (or tap the orb), transcribes, then acts.
- Tested with stubbed Gemini/Groq (`tests/agent.test.ts`, `scripts/journey-ai.mjs`). Real-model quality and real-microphone behaviour are unverified until you try it.

### The orb listens to your voice

While you speak the orb is driven by the real microphone only (zero when the mic isn't live): a noise-gated, time-smoothed level (fast attack so a syllable lands the same frame it starts, slower release like a bell) swells the whole body and its inner light; the 16 frequency bands form an equaliser over the sphere's latitudes (bass low, highs high) that turns with it; each new syllable gives the body a small kick and sends a ripple out; the ring around the orb in the Coach pulses with the same level. Measured only in a browser with a fake microphone (the numbers react and decay as designed) — how it *feels* on your phone is for you to judge.

### Food database

About 550 bundled reference foods (about 330 are a Danish table: bakery, dairy and cheeses, cold cuts, home cooking, fish, canteen/fast food, drinks, sports nutrition) plus live Open Food Facts search, your own foods and recipes. Reference values are approximate typical numbers (labelled so in the app), not Frida/USDA records; the Frida (DTU) table could not be downloaded from the build sandbox, so it is not bundled. Search understands æ/ø/å and the "aa" spelling dictation produces (koldskål/koldskaal).

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

## Status bar in the app's colour, a livelier orb flight, Settings motion back

- **Status bar**: a web app can't make it see-through (it is one flat theme-colour), so it now takes the colour of the top of the page: a deep tint of the current area's light (`--bar`, 15 % of the area's first light into the background in dark, 9 % in light). The page fades from that same colour into its glow, so the bar reads as the top of the app instead of a black strip. It blends with the glow when you switch tabs and darkens with the dim when a pop-up opens; the page steps back onto that colour, so there's no seam under the bar (`ui/statusBar.ts`).
- **Orb flight**: it lifts towards you on the way (swells up to 12 % mid-flight and settles as it lands) and its dots spin up with a soft ripple as it sets off. Fixed: closing the orb screen, it could land a little above the dock (where the dock had been mid-slide) and then jump; the dock is now re-measured until it has settled after any pop-up.
- **Settings**: moving between pages has the original choreography again (each row settles in turn). Opening Settings gets just a hint — the rows drift up a few pixels and settle as the sheet lands.
- Fixed: the `rise-soft` animation (Coach suggestions, in-sheet pages) had gone missing in the last pass.

## The orb flies with its pop-up; cleaner bar and Settings

- **Orb**: no more fading. Going into a pop-up that has an orb (the Coach, the live workout, the orb screen) it flies from the dock to its place on the pop-up's own spring — they start together and land together — and back the same way. The flight is handed to the browser like the sheet itself (`mirrorOrb` in `ui/Sphere.tsx`), so it is drawn at the full refresh rate in step with the sheet; a finger on the sheet hands it back to the script version. It heads for where its slot comes to rest (it used to chase the moving slot and lag behind it, across the Finish button).
- **Closing the workout**: the window travels 64 px past the bottom edge, so its top edge and shadow no longer hang just under the tab bar while the spring settles.
- **No frosted band under the tab bar** — the bar's own glass is the only blur down there.
- **Settings**: opening it, the rows arrive with the sheet (nothing settles in); moving between pages, whole blocks settle in briefly (a list is one block).
- Fix: a page inside a sheet could replay its "step aside" animation on mount when an effect ran twice.

## Tidier food search, an orb that doesn't trail, no jump at page switches

- **Food search**: the seven sideways-scrolling chips are one 3 × 2 grid with nothing off-screen — Scan, Photo, Quick add, then New food, Recipes, Saved meals. "Dictate" is gone from here (the orb in the dock does it).
- **Page switches** start 50 ms after the tap. Building the new screen takes a frame or two on a phone; animations that began during that work were already part-way through when the first frame showed, so both pages jumped (the occasional flicker at the top).

## Lag pass: Settings, pop-ups, page switches

Measured on a production build at 4× CPU throttle (software GPU, so read the numbers as relative): Settings opening 26.5 → ~21 ms a frame, a Settings page push 26.7 → ~20–23, tab switches ~22 → ~18 with slow frames (>25 ms) down from 15 of ~80 to 2 of ~95.
- **Page switch:** the leaving screen is no longer blurred (a 10 px filter on a whole screen every frame was the single biggest cost); it slides and fades out as before.
- **Colour field:** the fade towards the top was a mask on every field and the grain an `overlay` blend — both make the browser draw each field into its own offscreen surface every frame anything moves. The fade is now one gradient of the page colour over all fields, the grain a plain blend (same look).
- **Inside sheets** buttons, chips, switches and cards no longer blur again what is already blurred glass.

## Colours, a customisable Today, a Coach that notices

- **Five colour palettes** (Settings → Appearance → Colours): Ember (the original), Aurora (teal and violet), Mono (greys with one white accent), Sunset (pink and orange), Forest (greens and lime). Each re-lights all four areas; the glow cross-fades as before. Stored as `settings.palette`, applied as `data-palette` on the page (`styles.css`).
- **Settings → Today** switches parts of Today off: quick-add buttons, water, recent foods, the week, the weight trend. Switching water off also removes the water card on the Food screen. Also reachable from "Customize Today" at the bottom of Today. Stored as `settings.widgets`; old backups get everything on.
- **Weight trend card** on Today: today's weight counting up, the last 30 weigh-ins drawn as a line (it draws itself in once, the dot arrives last), change over those weigh-ins and the smoothed weekly rate. Before the first weigh-in it is one quiet prompt.
- **The Coach's three suggestions are things it sees**, not generic examples: a planned workout, a missed one, days since you trained, nothing logged yet (offers your most recent food again), protein or kcal left late in the day, no water (only if water tracking is on), an overdue weigh-in. Each is a short observation and sends a real message when tapped. Built from your own data in `useCoachTips` (`ui/agentUi.tsx`).

## Pop-up pass: pages instead of piles

- **A pop-up only stacks on a pop-up when it's its own thing.** A full-height sheet opened from another one (a food from the search, a substitute from an exercise, the exercise list from a routine, a recipe from the recipe list, Settings from the Coach) now opens as the **next page inside the same sheet**: it glides in from the right while the current page steps aside, and Back (the arrow, or the phone's back) reverses it. One pane of glass, one dim, the page behind doesn't step back again — so going five exercises deep through substitutions costs the same as one. Swiping down closes the whole sheet, pages and all.
- **Choreographed like Settings:** the page you leave steps aside and is gone in 140 ms, so there's never a double image (the phone showed "New routine Add exercises" for a few frames). Then the next page glides in on Apple's spring, its title drifts in from the side it comes from, and its blocks and first rows settle one after another. Back plays it in reverse. Settings uses the same timing.
- **Still stacked, on purpose:** the barcode scanner and photo over the food search, day pickers, confirms, and anything over the live workout.
- **Menus hand over:** "Copy meal to…" and "Notes" in a meal's ⋯ menu replace the menu instead of opening on top of it.
- **No more dissolving:** a sheet with another sheet stacked over it drops its frost (to save the phone's GPU) but now becomes solid glass, instead of turning see-through so the page showed through it.
- **Settings pages** no longer show two titles at once ("Settings & locale"): the page you leave fades out quickly and the next glides in a beat later.
- Small fixes: "1 set" (not "1 sets") in routines; shorter Voice & AI intro.
- How: `state/ui.ts` marks an overlay as a `page` when both it and the sheet below it are full-height task sheets (`PAGE_HOSTS` / `PAGE_TYPES`); `ui/Sheet.tsx` renders such an overlay inside the sheet below it (`PageSheet`, a portal), and that sheet's own content sits in a `.sheet-pane` that steps aside. All page motion is browser-run (Web Animations), so it draws at 120 Hz.

## Declutter pass

- **One way to talk**: the duplicate buttons are gone — the mic on Today, "Dictate" on Food, "Say what you ate" for new users and "Build a routine" in the Coach. The orb does voice; the sparkle on Today opens the Coach; routines are built by just asking (the assistant creates them with Undo).
- **Empty Food day** is one calm card: the four meals as rows, each with its +. A day with food keeps the meal cards.
- **Progress**: no more "calculated / measured / estimate" badges (the weight-trend rate gets a "~" instead), the time ranges are one segmented control, and a fresh install shows one "Nothing to chart yet" instead of five empty charts.
- **Coach**: one short line instead of a paragraph, three suggestion chips (one food, one training, one question — made from your own data), Send is an arrow inside the text field that appears when there is something to send (it becomes Stop while it works), and the "AI can be wrong" note shows once, on the first open.
- **Words removed** because they were obvious or repeated: "Saved automatically", the privacy line under the orb screen, several notes in food details ("— means no value…", "ml hidden because no density"), custom-food forms, schedule changes, workout summary, the exercise picker, the photo estimate, and the longer helper lines in Settings and Voice & AI (the full explanation still lives in Settings → Privacy).

## One pane of glass

- **Pop-ups**: the pop-up is the only frosted glass. The page behind no longer blurs — it steps back (smaller, lower) and dims, staying sharp, so it reads as a card pushed behind the pop-up instead of a smudge, as on iOS. One blur per frame instead of two while a pop-up slides.
- **Glass by height**: short pop-ups (menus, small forms) are thinner, more colourful glass; full-height ones (Settings, Coach, food details) keep the denser frost so long text reads easily.
- **Scroll edge**: content that scrolls under the dock goes under a frosted band that fades out upwards (a "progressive" blur), so the dock reads cleanly. It switches its blur off while a pop-up covers it. There is deliberately no blur band under the status bar.

## Typing in sight

- **You can always see what you type**: when a field gets focus the nearest scrolling box slides (smoothly, once the keyboard has landed) until the field sits in the room above the keyboard — before, a form taller than that room (Wrestling, New routine, Edit food…) left the field behind the Save bar or the keyboard. Works in every sheet.
- **The orb screen's "Type instead"** had no keyboard handling at all: the box and the Send button were under the keyboard. The screen now rides above the keyboard, the orb steps up and shrinks while you type, and the box scrolls into view.
- **Sheet frost stays on** (the frost-after-landing experiment made pop-ups look flat while they moved, so it was reverted): the sheet keeps its backdrop blur the whole time. Stacked sheets still drop it.
- Honest limit: this is aimed at the pop-up lag you see on the S26; the headless test browser cannot show phone GPU load, so it is verified for look and behaviour, not for frame rate.

## The orb knows the whole app

The orb and the Coach can now do by voice or text what you can do by hand — each change a card with Undo, and every value checked by the app before it is applied (the model only proposes):
- **Food**: move a food or a whole meal to another meal or day ("move the chicken from dinner to lunch"), copy a meal/day, **replace** one food with another (same meal, same day, same amount unless you say otherwise), correct amount / meal / calories per 100 g, remove a food, a meal or a whole day, create your own food (and log it in the same breath), favourite a food, save a meal, water, weight, day notes. Any day ("yesterday", or a date).
- **Training**: correct or delete a set — in the running workout or a finished one ("make the last bench set 85"), add / remove / swap exercises in the running workout, build a routine from scratch, edit one (rename, add, remove, change sets and reps, swap an exercise), delete one, put a routine on a weekday or make it a rest day, delete a past workout or activity, discard the running workout (one tap to confirm), finish it (one tap).
- **Talk about it**: it can see today's and the last six days' food (with amounts and label values), the running workout with numbered sets, the last six workouts in full, your best sets on the most-trained lifts, routines, the weekly plan, saved meals and your own foods, recent weigh-ins — so "how did Tuesday go?", "is my bench going up?", "what should I change in Push day?" are answered from your numbers. It can answer and change something in the same turn.
- Up to twelve actions per turn ("remove the cola, add a banana to lunch and make bench 85").
- The examples under the orb and in the Coach are made from your own data ("Move Oats to Lunch", "Put Pull day on Friday"), and the orb screen cycles through them.
- Result cards got an icon per kind, and long lines wrap instead of being cut off.
- Not done without a tap: finishing or discarding a workout. Not possible by voice: deleting all data, changing keys, backups.

## Recordings pass (4 Oct, evening)

Fixes for what the phone recordings showed:
- **Workout + keyboard**: while you type a weight or reps, the rest timer leaves the bottom (it sat on top of the sets being edited once the keyboard was up) and keeps counting in the header ("· Rest 1:23"). It comes back when the keyboard goes.
- **Number fields** no longer select their text on tap — on Android that popped the Cut / Copy / Translate bar over the form. The caret goes after the number and the first digit you type replaces it; a second tap edits where you tapped.
- **Pop-ups never open with the keyboard**: the routine editor, Edit food, weight, activity duration and new-exercise forms had their own auto-focus, which came back once sheet contents started arriving a frame late. Removed, and sheets drop any focus their contents bring.
- **Sheet content arrives with the sheet**: the rows no longer fade up one by one after it (that read as the pop-up still loading). The Coach's intro text no longer types itself out every time it opens.
- **Stacked sheets** (exercise → substitute → substitute…): a sheet with another on top drops its own frost and its dim's blur. Each kept a full-screen blur alive and three stacked ran the phone out of GPU memory — the black tiles in the recording.
- **The orb rides with its sheet**: in the Coach it used to fly to where its slot would end up and wait there over an empty sheet; now it waits in the dock until the composer comes up to it and rides up with it.
- **The Coach / orb can correct the log**: "that skyr is 75 kcal per 100 g", "it was 200 g, not 100", "move the eggs to breakfast", "remove the cola" now change or remove that logged food (and, for a food of your own, its label), each as a card with Undo. It sees today's and yesterday's items with their amounts and label values to know which one you mean.
- Not fixable from the page: on Samsung Internet the screen goes black below the content for a moment while the keyboard slides in (the browser resizes the window before the keyboard is drawn).

## Polish pass (food, library, pop-ups)

- **Food screen**: each meal is its own glass card — name, kcal and protein, a thin bar showing the meal's protein / carbs / fat split, and a round **+** to add. Foods are clean rows inside the card (amount, macro dots, kcal). The rows are see-through now (the "black boxes" were an opaque row background); swipe left reveals a red delete strip clipped to exactly the uncovered space. Empty meals are a compact card that says "nothing logged". Water is a card with a progress bar instead of a fill that cut through the label; the week strip is one card with taller bars and the day labels underneath.
- **Accent colour bug**: the "Today" chip, selected weekday and other accent text used one fixed colour app-wide (orange) instead of the screen's colour (lime on Food). They now follow the screen — the active dock icon too.
- **Pop-ups at full refresh**: every sheet now only slides (the zoom-from-a-card and morphing detail sheets were the laggy ones — they measured layout and animated a clip on the main thread). One soft blur behind sheets instead of two stacked full-screen blurs. The orb screen's frost and content fade are also handed to the browser, so they run at the screen's full rate like the sheets.
- **Glow**: the old colour field now fades out as the new one fades in (it used to vanish at the end, which showed as a second colour change).
- **Sheets**: content scrolling up under a sheet's title (Settings) fades out softly instead of being cut by a hard edge; at rest nothing is faded.
- **Exercise library**: 185 exercises (was 64), with a new **Smith machine** equipment type — Incline / flat / decline Smith press, Smith squat, split squat, RDL, hip thrust, row, shrug, shoulder press, calf raise — plus machines (pec deck, pendulum and belt squat, hip abduction/adduction, seated/lying leg curl…), cable variations, free-weight variations, kettlebell, bodyweight, conditioning and wrestling-style drills (sprawls, rope climb). Every one has how-to steps and a Danish name, and search also matches other names ("hex bar deadlift", "butterfly", "smith incline bench").
- **Danish food list**: ~105 more reference foods (about 600 in total): Danish cakes and bakery (brunsviger, drømmekage, kringle, romkugle, pebernødder…), pålæg salads, everyday dishes (karbonader, pariserbøf, æggekage, stuvet hvidkål…), takeaway (dürüm, kebab pizza…), seasonal produce, drinks (saftevand, gløgg…) and sports nutrition. Values are approximate per 100 g / 100 ml like the rest of the reference table.
- **Pop-up lag, round 2**: while a pop-up is open the drifting colour field is paused and the frosted cards on the page behind lose their blur (they recede and are dimmed anyway; measured, the page looks the same without it) — less for the GPU to redraw every frame of the slide. A full-height sheet now puts its contents in the page two frames after its slide has started instead of before the first frame, so the slide begins on the tap. Long exercise lists (the picker, the library) draw their first rows at once and the rest in small batches. The orb stopped re-measuring the page every frame of a pop-up opening. Honest limit: in the headless test browser these changes show up as less main-thread work and an earlier first frame, but the GPU numbers there did not change, so what it feels like on the S26 is still unconfirmed.
- Verified in headless Chromium (14/14 suite + unit tests). That does not measure how it feels on the S26 Ultra; the compositor-side changes are the ones that should show there.

## Newer features

- **Wrestling**: its own activity type — mat time (quick 30/45/60/90/120 min), rounds and intensity (Easy/Hard/Max), a note. Shown on Train (this week's mat minutes), as a wrestler mark on the week strips, in History, as a weekly mat-time chart in Progress, and in the Coach's summary as training load. Never added to calorie targets.
- **Beat last time**: completing a working set that beats the same set last session (more weight for the same reps, or more reps at the same weight; duration/distance likewise) gives a gold burst on the check and the gain floating up ("+2.5 kg", "+1 rep"). New records get a gold medallion on the summary.
- **Snap your plate** (Gemini key): photo → per-item estimates (name, grams, kcal, macros) → choose items and portion (×0.5–×2) → logged as quick entries labelled "AI estimate" with the assumptions. Image is downscaled to 1024 px before sending. Wiring tested with a stubbed Gemini; real recognition quality is unverified.
- **Home-screen shortcuts** (Android long-press on the installed icon): Log food, Dictate, Snap your plate, Log wrestling.

## Back to basics pass

- **Screens swap exactly as in the first version**: the new one slides in 36 px from the side it sits on and fades up, the old one slides out the other way, fading and softly blurring (0.38 s). Then the cards rise in one after another (18 px, 60 ms apart). The same rise runs when Train's Plan / Library / History or a Food day is swapped (`.subpage`). The colour glow still cross-fades underneath. (An earlier crossfade-only and a slide-only version were rejected.)
- **The live workout is an iOS sheet**: the whole window rises from the bottom edge of the screen to the top on the same spring as every other sheet, the page behind steps back and dims, and it sinks back down on close or drag. Only a transform moves — no fades, frost, clip or stretch.

## Simple pass

- (Superseded by the back-to-basics pass) the workout rose from the resume bar (or the Today card) while the page behind steps back and dims. It starts as a see-through slab and firms up as it rises, its content fading in a beat later; closing runs it backwards and it melts into the bar. Nothing on it is blurred, clipped or stretched any more (the frosted layer was what showed as a grey box over Today while closing).
- **Keyboard on tap**: popups open without the keyboard; tap a field and the keyboard comes up with the popup rising exactly to it (tall popups shrink to fit above it). No auto-focus and no timers.
- **Screens swap like the first version, refined**: the new screen glides in 40 px from the side it sits on (by tab order) on Apple's spring, fading in ahead of the movement, while the old one drifts the other way, fading and softening; the colour glow still cross-fades underneath. Train's Plan / Library / History and Food's days glide in from their side too (`ui/Subpage.tsx`).

## Glow pass

- **Tab switching, one type**: the glow changes — the colour field cross-fades into the next area's colours in 0.8 s, as two layers fading over each other (the browser blends them; nothing is repainted per frame) — while the screens swap with depth: the old one fades out quickly and sinks back a little, the new one fades in and settles from a touch larger. Opacity and transform only.
- **No pause before the workout moves**: closing used to wait for the app to re-render the page behind, the tab bar and the resume bar before anything moved (a visible beat after the tap on a phone). Now the close animation starts on the very frame you let go, and the app is told the workout closed only after that frame. Opening (and every popup) starts its browser-run animation before the first paint, so setup work can no longer freeze it. Two layout animations that re-measured the page on every re-render (resume bar, Today's workout card) are gone, and the resting position of the bar/card is computed without forcing layout.
- (Superseded by the simple pass) the keyboard now comes up when you tap a field.

## Seamless pass

- (Superseded by the glow pass) each tab's screen carried its own colour field and spread out of the tapped tab.
- **Fewer dropped frames when switching**: the colour field no longer cross-fades its colours (that repainted the whole screen every frame for 1.1 s), and nothing transitions the area colour variables any more — transitioning a colour variable restyled everything under it on every frame (~45 ms of style work per switch, measured). Main-thread work across 8 tab switches went from ~2.8 s to ~1.2 s in the test browser.
- **Keyboard**: popups ride the keyboard with a transform (not their `bottom`, which re-laid them out every frame), on a quicker spring that keeps up with Android's keyboard. Closing drops the keyboard at once, so it goes down with the popup instead of after it.
- **Live workout** lands exactly on the resume bar or Today card: their resting position is measured with the page-behind's step-back, the tab bar's slide and the bar's own shrink taken off. The frost melts away over the last stretch of the close, handing over to the real bar or card.
- Not fixable from the app: Samsung's keyboard shows its own black panel for a moment before its keys appear.

## Reveal pass

- **Tab switching** (`ui/pageMotion.ts`): the new screen spills out of the tab you tapped like a drop of the dock's glass — a circle growing from that tab to the far corners, the screen inside settling from 94 %, and a ring of light riding the edge — while the screen you leave sinks back and fades underneath. Clip-path, transform and opacity only, browser-run.
- **Train's Plan / Library / History** glide in from the side their tab sits on.
- **Live workout**: it now grows from and shrinks back into the *exact* rectangle of the resume bar or the Today card (it used to keep reaching to the bottom of the screen, which left an empty frosted slab over Today while closing). Built from two nested boxes — one placing the bottom edge, one the top edge — so it is transforms only, with all four corners round; the frost fades in its last few percent so it hands over to the bar or card underneath.

## Apple Music pass

- **Behind every popup** (`ui/Veil.tsx`): the dim and a soft blur follow the popup's own progress frame for frame — they deepen as it rises and fade as you pull it down (before, the dim reached full strength at 60 % and felt early). The blur grows gradually: two blur layers of fixed strength fade in one after the other, each with its own opacity.
- **Orb screen**: its frost now builds up the same way (a light blur, then a deep one). The snap came from fading the whole screen: browsers switch a frosted layer's blur off while a parent of it is fading, then switch it on at the end.
- **Live workout opens like Apple Music's player**: a frosted panel grows out of the resume bar (or the workout card on Today) — rising and widening to fill the screen, its frost turning into the window's solid colour as it lands, with a touch of bounce — and shrinks back into it when you close it or drag it down. Rounded corners on every edge. Transform and opacity only, browser-run with high refresh rate on.
- **Tab switching** is a calm crossfade: the old screen fades out quickly, the new one fades up rising the last 10 px. No sideways slide, scaling or card-by-card stagger.
- Pop-ups that grow out of a card hand over to the real card at the end instead of leaving an empty grey box on it.

## Dock and orb pass

- **The dock moves like the first version, on the compositor**: the tab you pick opens up and shows its name, the other icons and the orb make room, and a drop of glass flows over to it, stretching on the way (front edge on a quicker spring, back edge on a calmer one) and gathering back into a capsule. The layout changes at once and every piece is slid from where it was drawn (FLIP) as browser animations of `transform`/`opacity` only (`ui/lens.ts`, `useDock` in `ui/TabBar.tsx`), so it runs at the screen's full refresh rate. The orb glides with the dock the same way (`orbGlide`).
- **The orb draws on its own thread** (with High refresh rate on): the drawing moved into a worker with an OffscreenCanvas (`ui/sphere.worker.ts`, renderer in `ui/sphereRender.ts`), which has its own frame clock instead of the page's script frames. The idle spin is now drawn every frame (it was ~30 fps). If the browser can't do it, it falls back to drawing on the page. The frame-rate readout's second line shows the orb's real drawing rate and where it is drawn.
- **Page switches**: no full-screen blur any more (it made every switch pass through a smudged, darker frame). The new screen glides 28 px in from its side on Apple's spring while the old one steps back and fades quickly; its blocks rise in one after another.
- **Settings**: pages push like iOS (glide in, rows settle in one by one, no blur); segmented controls use the same liquid drop as the dock; switches spring across on the compositor.
- **Live workout header** sits straight on the window's colour (the solid band under the grabber is gone), and the window's corners go square once it fills the screen.

## High refresh rate pass

- **High refresh rate** (Settings → Appearance, on by default): Samsung Internet and some Chrome builds run script animation at 60 fps even on a 120 Hz screen, but animations the browser runs itself (transform/opacity) are drawn at the full rate. Every popup spring is now also handed to the browser as a Web Animation on the exact same curve (`springCurve` in `ui/motion.ts` simulates the spring into a CSS `linear()` easing): the sheet, its dim and the page stepping back behind it, the live workout card, and the tab page slide. The script spring still runs underneath (it drives the orb), and a finger or a second popup hands control straight back to it. Turn it off if anything looks wrong.
- **Tab bar**: iOS-style — equal tabs, icon over name, and one drop of glass that glides to the tab you pick (Apple spring, 0.55 s, compositor-run), stretching a little along its path and settling back into a capsule. Tapping again mid-flight carries on from where it is.
- **No more "clear bar that suddenly frosts"**: the tab bar hides by sliding only, and the resume bar fades its own layers. Fading a parent of a frosted surface switches the blur off until the fade ends — that was the flicker.
- **Orb under popups**: in a popup the orb now sits just above that popup, so a menu opened over the live workout covers it.
- **Live workout is full screen** (no sliver of the page above it, which read as a blur band at the top); the page behind is no longer drawn while it is up.
- Springs a hair quicker: popups 0.45 s in / 0.38 s out, content 0.36 s.

## Feel (earlier pass)

- **Sheets behave like iOS**: the page behind steps back (scales to 92 %, rounds its corners, dims over black); swipe down from anywhere — when the list under your finger is at the top — and the sheet follows 1:1, then either closes carrying your swipe speed and easing out, or springs back. Stacked sheets step back too. The workout screen minimises the same way.
- **Workout open/close**: the background surface grows out of the Today card / pill as a shared-layout transform (GPU only); the content fades in on top and the exercise list mounts a few rows at a time after the animation.
- **Tab bar**: icons and the orb move with shared-layout springs, the oval glides with a slightly softer spring, labels blur in.
- **The orb is the microphone everywhere**: tab bar, voice composer, the Coach input and the workout's dictate button; it flies between them and stays glued once landed.
- **Coach**: replies blur in word by word as they stream (only new words animate), sent messages spring up from the input, a typing indicator shows while it thinks, and the orb listens/thinks/blooms with it.
- **Performance**: nothing animates behind an open popup any more (colour field, orb in the tab bar, pulsing dots pause), so the frosted layers stop re-blurring every frame; popups no longer animate a full-screen backdrop blur. Measured in software-rendered Chromium: idle with a popup open ~24 → ~58 fps, workout start ~24 → ~40 fps.
- **Smoothness pass** (same look, less work per frame):
  - (Reverted in the nav-bar pass below: tab screens are mounted per visit again, exactly like the original, so a tab change measures only what is on screen.)
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
- **First-version dock and popup frost, restored**: the tab bar is the original again (the active tab's width springs open, its name slides in, the oval glides over with a small give — CSS-driven, no per-frame React work), and the page behind a popup is blurred with a radius that ramps from 0 to 16 px together with the dim — straight from the popup's progress, so it also eases off under your finger as you drag. Sheets use the original 48 px frost.
- **Workout open/close, choreographed**: everything is tied to the window's own progress. The window crossfades with the card it grows out of (so it reads as the card itself opening), the content rises and fades up while the window is mostly open (and the reverse on the way back), the dim follows, and the exercise list is built after the window has landed so no opening frame has to render it. The spring is critically damped: one smooth motion, no wobble.
- **Nav bar back to the original, popup blur fix**: tab switching is the original again (the leaving screen slides out blurred while the new one slides in; only the visible screen is in the layout tree), the idle app has no extra layers (the stage only gets layer hints while a popup is up), the scroller mask is gone (a plain veil below the bar hides peeking text instead). The blur behind a popup now has a fixed radius; only its strength fades, and only once the popup is well on its way out, so a swipe that springs back no longer flickers it away and back.
- **Keyboard in step, Coach, written replies**: the keyboard's height is a spring-smoothed number (`ui/keyboard.ts`); sheets lift and shrink to fit with it instead of jumping when it opens or closes. In the Coach, each new word inks in (blurred and lifted, glowing in the accent, then settling), words arriving together cascade, a writing cursor pulses at the end of a streaming reply, lines of light sweep while it thinks, and a sent message springs up out of the input with a line of light passing over it and a glowing rim that fades.
- **Keyboard (fix after the phone recordings)**: the recordings showed a black strip between a sheet and the keyboard and the sheet jumping, because Android Chrome resized the page for the keyboard (`interactive-widget=resizes-content`) and the page lagged the keyboard. The page is now **never resized**: the keyboard overlays it (`interactive-widget=overlays-content` + `navigator.virtualKeyboard.overlaysContent`), the app reads the keyboard's height from `virtualKeyboard.geometrychange` (iOS: visual viewport) and springs the sheets along with it. `scripts/journey-keyboard.mjs` proves this with a *simulated* keyboard only; whether the real Gboard animation lines up is unverified.
- **Parked orb at ~30 fps**: while the orb rests in the tab bar (idle, nothing moving) it redraws at ~30 fps instead of every frame — its motion is a slow turn, so it looks the same and the page gets the frames back. Flying, listening and thinking still draw every frame.
- **Workout window**: its content is pinned to the window's top edge while it grows from the card (instead of showing a slice of the finished layout through a small window).
- **Lag pass (measured, production build, CPU slowed 4× to stand in for a phone)**: the live workout idled at ~24 ms a frame (≈40 fps), scrolling had 57 hitches in 130 frames, and Train/Progress idled at ~27 ms. Causes, in order: (1) the page *behind* the full-screen workout was still drawn every frame — now it fades to opacity 0 once the workout fully covers it (`trackCover`/`stageCover`; opacity, not visibility, so it is back in the first frame of a close or drag); compositor drawing while scrolling fell from 1713 to 268 ms; (2) every card and button was frosted (`backdrop-filter`) over a drifting colour field, so the GPU re-blurred them all every frame — inside the workout and on the tab screens, cards now have no frost (they sit over the soft field only; side-by-side screenshots in dark and light look the same) while the tab bar, sheets, popups, toasts and the rest timer keep real frost; the workout's colour field holds still; (3) the Today screen re-rendered every second during a workout for its clock — now only the clock line ticks; (4) set rows measured their layout on every tick/keystroke — now only when rows actually move (`layoutDependency`); (5) the idle orb redraws at ~30 fps (its position still updates every frame). After: idle and scrolling 16.7 ms a frame (60 fps) on the workout and every tab; set taps 29 → 18 ms; typing 30 → 19 ms. Opening the workout is ~22 ms a frame at 4× throttle — better, not perfect. How it feels on the S26 is for you to judge.
- **Apple pass**: every spring is now Apple's own definition (SwiftUI `Spring(duration:bounce:)`: stiffness = (2π/d)², damping = 4π(1−b)/d): sheets and cards 0.5 s no bounce (.smooth), leaving 0.42 s, content 0.4 s, taps .snappy (0.3 s, 0.15), celebrations .bouncy (0.5 s, 0.3) — `ui/motion.ts`. The **live workout** now opens like Apple Music's player: a full-height card rises from the bottom while the page behind steps back (smaller, rounded, dimmed) and stays visible as a sliver at the top; drag down anywhere to put it away (only transforms move). Replaces the clip window that grew out of the card. The frame-rate readout in the Samsung Browser recordings showed "60 Hz · 60 fps · 0 late": that browser delivers 60 frames a second on the 120 Hz screen and the app is not missing any of them — the cap is the browser's, not the app's.
- **Calm pass (from the Samsung Browser recordings)**:
  - *Tab switching is the first version again* (`AnimatePresence`, 36 px slide, fade, soft blur on the leaving page). The kept-alive tab stage hid the leaving page for one frame, which restarted its rise-in from invisible — the page vanished instead of sliding out. Removed. Tapping the current tab still scrolls it to the top.
  - *Popups as on iOS*: the popup is the frosted glass (blur on the sheet), the page behind only dims (darker than before); no full-screen blur.
  - *Calmer motion*: sheets arrive in ~410 ms (was ~210), critically damped (no bounce); leaving ~360 ms; the live workout window ~440 ms (was ~250); the orb screen and the food morph use the same calm curves.
  - *Live workout*: the first two exercises are there from the first frame of the opening and the rest follow one by one; the buttons under the list appear only once the list is complete (no more "Add exercise / Finish" at the top that then jumps down). The list gets room for the keyboard, and the rest timer rides above it.
  - *Resume bar*: on the tabs where the running-workout bar shows, the page and the toasts make room for it (it covered "Add food / Dictate").
  - *Orb microphone*: a tap while the microphone is still starting cancels that start cleanly; it used to end in "Didn't catch anything" followed by a false "microphone in use". "Done speaking" waits until it is really listening.
  - *Orb touch*: pressed, the orb gathers in (shrinks, its light pulls to the centre, the surface shivers); released, it bursts — dots thrown out in an uneven liquid wave, a spin-up, a band of light running through it, two rings — and gathers back into a sphere on its way up (`orbPress` / `orbTap` in `ui/Sphere.tsx`; tab bar, orb screen, workout).
- **Frame rate readout** (Settings → Appearance): a small counter in the top-left showing the refresh rate your phone and browser really deliver (from the median gap between frames), frames per second, late frames and the worst gap. 120 Hz with 0 late is the best case; a steady 60 Hz with 0 late means the browser/phone is capping the rate, not the app being slow; late frames mean the app missed its deadline. Added after the screen recordings showed 4 of 5 at 120 fps (median gap 8.4 ms) and the latest at exactly 60 — so the app *can* run at 120 on this phone, and the readout tells which browser / mode does. Off by default, nothing runs when off.
- **Feel pass 2 (popups, tabs, motion language, gym)**:
  - *Popups*: every sheet already has its own frosted scrim, so the sheet's second 48 px blur was dropped (denser fill instead); content blocks rise in without an animated blur; animations that ended on `filter: blur(0)` (screens, sheets, Coach messages, Settings panes, the tab pages) now drop the filter when they finish instead of leaving a filtered layer on every block. Measured at 4× CPU: opening the Coach 41 → 25 ms a frame, sending a message 46 → 31, Settings 25 → 20, food search 36 → 26. The big orb draws at 2× instead of 3× (same look, less than half the pixels).
  - *Tabs*: (kept-alive tabs were tried here and reverted in the calm pass — see above.) Charts draw in with CSS (bars grow, lines draw) instead of per-frame script. The orb no longer measures its slot every frame — only while something can have moved it (scroll, resize, keyboard, DOM/style change, tab/popup change, a finger, a popup's progress).
  - *Motion language*: `ui/motion.ts` — tap, smooth, surface (+exit), window, bouncy, gentle, keyboard. CSS `--ease-spring` / `--ease-smooth` are real spring curves sampled into `linear()` (fallback: the old cubic-bezier), so CSS presses and script springs feel the same.
  - *Zoom*: routines (Train, Today) and exercises (Library, Progress, the workout, the summary) open by growing out of the card you tapped and shrink back into it — the same clip-window technique as the live workout (`Sheet` `from`, `zoomFrom()`).
  - *Cause → effect*: when the orb logs something and steps aside, a light flies from the orb into the calorie ring (or the Food / Train tab) and the target pulses (`ui/fly.ts`).
  - *Theme switch*: the new theme spreads out as a circle from where you tapped (View Transitions; instant where unsupported or with reduced motion).
  - *Screen stays on during a workout* (Screen Wake Lock), released when paused or finished; re-taken when you come back to the app. Tested in Chromium with the permission granted; on the phone Chrome grants it to a visible page.

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
