# Aven

Training, food logging and progress in one mobile-first web app. **Aven is the working name.**
A new product — unrelated to Setline (which was not touched).

- Local-first: no account, no analytics, nothing paid is required (an optional OpenAI key for GPT-6.1 Sol is the one paid option). Everything works offline once loaded.
- English and Danish (`src/lib/da.ts`), metric-first with lb/mi/in available, locale-aware dates, decimals and day boundary.
- Installable PWA (manifest + service worker). Updates never replace a running workout (see *Updates*).

## Run it

```bash
npm install
npm run dev          # app on :5173 (proxies /api → :8787)
npm run server       # optional lookup server on :8787 (Open Food Facts + USDA)
# or one process for everything:
npm run build && npm start   # serves dist/ and /api on :8787
npm test             # 144 unit/integration tests (nutrition maths, parsers, dates, records, navigation, AI clients, lookup server)
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

0. **Danish products, packed** (v0.1.32): `scripts/build-dk-foods.mjs` streams Open Food Facts' full CSV dump and keeps every product sold in Denmark that has calories (~3,700 of ~19,000; the rest have no nutrition data) into `src/data/off/off-dk.json` (~350 KB, ~130 KB gzipped). The app downloads it the first time food is searched, keeps it in the service-worker cache (works offline) and searches it on the phone in a few ms. Re-run the script from a machine with internet to refresh it.
1. **Aven server** (`/api/food/*`, optional): merges Open Food Facts + USDA, caches, keeps the USDA key private.
2. **No server / static hosting**: the browser talks to **Open Food Facts directly** (`cgi/search.pl`, Denmark first, then the whole world; barcode via `api/v2/product`). The app detects a missing server (a static host answers `/api/*` with HTML) and stops asking for 10 minutes. A client-side budget keeps it under OFF's ~10 searches/min. USDA is server-only because it needs a key.
3. **Offline / blocked**: ~180 bundled foods, everything you've saved or logged, custom foods, quick entry. The UI says which layer you are on.

So a plain static deploy (e.g. any CDN) gets search + barcode through layer 2; running `npm start` with a `USDA_API_KEY` adds USDA and caching.
**Tested live on 12 Oct 2026 (v0.1.32, from GitHub's servers, sending the live site as Origin):** `search.openfoodfacts.org` (search-a-licious) refuses other websites (no CORS header, preflight answers 400), so a browser on the live site can never read it, and its `brands` field is a list, which crashed the old normaliser anyway. `cgi/search.pl` does allow browsers (`Access-Control-Allow-Origin: *`) but often answers 503 "Page temporarily unavailable" (its 503 page has no CORS header, so the browser just sees a network error), and it only matches whole words: "vaniljeskyr" or "0% fedt" find nothing while the pack says "Skyr Vanilje". Hence layer 0 and the query clean-up in `searchQuery` (`src/lib/foodText.ts`): flavour split off skyr/yoghurt, fat percentages and filler words dropped, and brands matched one letter loosely (Whisper writes "cheesy" for Cheasy).
**Older caveat:** layer 2 depends on Open Food Facts allowing cross-origin browser requests. I could not confirm that from this sandbox (one source said their API has no CORS; I couldn't test), so if direct calls are blocked in your browser the server layer is the fix. Test first with a real barcode on your phone.

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

## The Coach pins what it notices; pop-ups sized to what's in them

**The Coach's pin** (top of Today). The Coach now notices things on its own and pins them at the top of Today. It shows as one quiet line; tap it and it opens into the list.

Each item has:
- a reason, in one line with the number behind it;
- one thing to do about it (ask the Coach, reschedule, log, back up, switch a card on);
- **Not now**, which brings it back tomorrow;
- **✕**, which hides that same situation for good.

What it checks on the phone (no AI, no key, instant, private):
- a missed workout (offers to reschedule it);
- a leg-heavy workout on, or the day before, a planned wrestling day;
- a lift that has stalled;
- a muscle getting under ~3 sets a week while most get 8 or more;
- protein under 80% of target for several days;
- weight dropping faster than ~1% a week;
- nothing logged by 14:00 on a day you'd usually have logged;
- a weigh-in that is overdue;
- 8+ hard weeks without a lighter one;
- no backup in two weeks (not shown for demo data);
- a Today card switched off that you'd use.

Today's planned workout isn't pinned: the workout card right below it already offers it.

**With a Gemini key**, once a day (a few seconds after opening), the Coach also reads the same picture of your data it uses in chat and adds at most two observations of its own, each with a button that asks it to act. That's one request a day, on Gemini's free tier; never for demo data. Switch the pin off in Settings → Today.

It shows while the app is open. A web app can't wake itself up to send notifications when it's closed without a paid push server.

**Pop-up sizes** (`ui/Sheet.tsx`, `size` prop). Each pop-up now has one of four sizes, chosen by what's in it:

| Size | Looks like | Used for |
|---|---|---|
| **Full** | Up to just under the status bar | Coach, Add food, Exercises, Scan barcode: conversation, search, camera |
| **Large** | The stacked-card height | Settings, Schedule, routines, recipes, details, summaries |
| **Medium** | As tall as its contents | Short forms (weight, measurements, copy, reschedule, notes) |
| **Small** | Floats as a card with a gap all round, rounded on every corner | Pick a day, the food Options menu, Finish/Discard workout, Exercise options |

A small pop-up leaves the page (and any pop-up below it) where it is, under a lighter dim.

**Checks:**
- `tests/nudges.test.ts`: the rules, plus Not now / ✕.
- `scripts/journey-today.mjs`: the pin on demo data.
- `scripts/journey-ai.mjs`: a mocked Gemini insight, asked once a day, whose button opens the Coach with its question.

## A fuller Today screen you can arrange

Below the workout card, Today now has cards that each answer a question:
- **Up next.** Your next planned workout (today's until it's done), with the first four lifts and the weight × reps to aim for, plus what changed: "+2.5 kg" or "+1 rep". It is the same progression the workout fills in when it starts, so you know what to beat before you get there.
- **Week.** The seven dots as before, plus one line: "2 of 3 workouts · 4-week streak · 1 wrestling session".
- **Muscles this week.** Hard sets per muscle so far this week (main muscle 1, helper muscles ½; the same count the Coach uses), as a bar each against the usual "about 10 sets a week" guideline. A muscle that reaches 10 lights up. One quiet line names the muscles not trained yet.
- **Recent records.** Your newest personal bests from the last 30 days, one per exercise, with how much better and when. A best-set-volume record shows as the set (21.5 kg × 14), not as a total that reads like a weight. Tap one to open that workout.
- **Weight trend.** As before.

**Customize Today** (the chip at the bottom, or Settings → Today) lists these cards in their order:
- Drag a card's grip to move it, or switch it off; switched-off cards are simply gone.
- The quick-add buttons, water and recent foods under the ring stay as switches.
- The order is saved with your data, so it is in backups too.
- Checked by `scripts/journey-today.mjs` (in `run-all.sh`): default order, contents, switching off, reordering, and the order surviving a reload.

## Stacked pop-ups, sent words, read-aloud sync (6 Oct recordings)

- **A pop-up behind another keeps its frost.** It used to turn solid until the top one closed. Now it stays the same glass, set back under the top sheet's dim. Only when two or more sheets are stacked on it does it go solid. That limit is a GPU-memory guard: three full-screen blurs once gave the phone black tiles.
- **What you said shrinks into its bubble.** On the orb screen your words still write in large. Then the whole message shrinks into the sent bubble as one block, like a sent iMessage, and the bubble's glass gathers round the words as they land.
  - The bubble keeps the big text's line breaks, so nothing reflows or crosses mid-flight.
  - Each word is measured against its twin in the bubble, flown there on Apple's smooth spring, and swapped for it only once it sits exactly on top.
  - The motion is browser-run (the compositor), so it draws at the full refresh rate.
  - The big text now uses the bubble's typeface, so only the size changes on the way down.
- **Read aloud lights up the word being said.** Three changes:
  - Words now get time by syllables, not letters.
  - Every clear breath in the audio re-pins the timing, not just full stops.
  - The light follows what is coming out of the speaker (the audio output timestamp) instead of what was handed to it. That handover is what lit words early, more so over Bluetooth.
  - **With a Groq key,** Whisper listens to each piece once (word timestamps, prompted with the exact words) and its times replace the estimate. This applies even while the piece is already playing. It costs one small Whisper request per piece the first time you play it; replays reuse the result.
  - Measured on a stand-in voice with known word times (`scripts/sync-check.mjs`):
    - before: worst word 155 ms off
    - estimate alone now: 74 ms
    - with Whisper: about 40–55 ms

    Real speech varies more than the stand-in, and the phone's own output delay can only be checked on the phone.
- **The orb glows with its own voice.** While a reply is read aloud, its light (never its shape) follows the voice's level, the same way it follows yours when you speak. There is no haptic buzz for this.
- **New checks:**
  - `scripts/morph.mjs`:
    - The stacked-sheet frost: two sheets keep their blur, three drop it.
    - The bubble flight: every word lands within 1 px of its twin, with no frame jumps.
  - `scripts/sync-check.mjs`: the read-aloud timing.
  - Both are in `run-all.sh`.

## Workout screen: second polish pass

- **Rest controls live in the bar.** Tapping the bar while resting slides −15 / +15 / Skip in beside the time, between it and the orb. They used to float as a pill above the bar, over the sets. They close after 4 s.
- **The bar steps away under other screens.** It hides behind the exercise list or an exercise's page; before, it showed through their glass. It stays for the orb screen and the Coach, because the orb flies out of the bar's slot and back.
- **The exercise menu's rest time** is the same slim stepper as the routine editor: 15 s steps, 0:15–10:00. It replaces six chips that wrapped onto a second line.
- **The header's set count rolls** up when you tick a set and down when you untick one, like the steppers.

## Coach: plans, the set you're on, and thinking only when it helps

- **Wrestling in the plan.** Settings live in Schedule → **Wrestling days**: seven day toggles, stored as `schedule.activities`.
  - Planned wrestling shows on the Train and Today week strips. A wrestling icon marks a day with no gym; a small accent dot marks a gym day with wrestling too.
  - The Coach sees the plan and keeps heavy legs away from the day before.
- **New Coach actions** (orb or Coach):
  - `plan_activity`: "put wrestling on Tuesday", "I wrestle Tuesdays and Thursdays".
  - `move_workout`: "move Push to Thursday" changes the weekly plan; "this week only" or "tomorrow" makes a one-off move.
  - All of them come back as cards with Undo.
- **The set you're on.** During a workout the Coach is told the CURRENT SET.
  - "Only 9 reps" or "67 kilos, same reps" fills and ticks that set (`log_current_set`), keeping anything you didn't say as planned, and starts the rest as a tap would.
  - "The last one was actually 7" fixes the set you just finished.
- **GPT-6.1 Sol thinks per message** (`effortFor` in `lib/agentTurn.ts`):
  - Chat, logging and quick questions answer at low effort, in a second or two.
  - Planning, analysis and advice get the effort set in Settings, never more.
- **Polish:**
  - A sheet that opens over another one: the one behind steps back on the top sheet's own progress, frame for frame. It follows your finger, and its glass fades to solid instead of swapping.
  - The orb screen's top starts in the status bar's exact colour (`--bar-shown`), so there's no seam under the bar.
  - What you say on the orb screen writes in large, word by word, then shrinks into its sent bubble before the answer writes in. Message springs are calmer.
  - Routine editor: the line under an exercise swaps in turn instead of overlapping. The per-row rise is gone, after a phone recording showed the list dropping out for single frames.

## Google Drive backup (optional, free)

Settings → Data & backup → **Google Drive backup** keeps one file, `Aven backup.json`, in your own Google Drive.

**When it backs up:**
- After every workout, when you tap Done on the summary.
- A little after your edits, while Google's one-hour pass is still valid.
- With a one-tap reminder when the last backup is three or more days old.

**Restore:** "Restore" (or "Restore from Drive" on a new phone) reads the file back through the same "Replace my data?" step as a file import.

**How it works (`src/lib/drive.ts`):**
- It uses Google's own sign-in in the browser (Google Identity Services, token flow) with the `drive.file` scope. Aven can only see and change the file it made, nothing else in your Drive.
- There is no server. A web app gets an access pass for one hour at a time and no lasting one. That's why the automatic backup rides on a tap: Done after a workout, or the reminder. Google's window may flash for a moment.
- The pass stays in memory only: never stored, logged or backed up.
- Drive keeps earlier versions of the file for 30 days, under the file's "Manage versions".

**Guards:**
- An empty app never overwrites the Drive backup, so a new phone connects and then restores.
- Demo data never goes to Drive.
- "Delete everything" forgets Drive on the phone, but the file stays in Drive.

**One-time setup (about 10 minutes, free):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (e.g. "Aven").
2. Under **APIs & Services → Library**, find **Google Drive API** and click **Enable**.
3. Open **Google Auth Platform** (the OAuth consent screen) and click **Get started**:
   - App name: Aven.
   - Audience: **External**.
   - Fill in your email where asked.
   - Then under **Audience → Test users**, add your own Gmail address.
4. Under **Clients → Create client**, choose **Web application**:
   - Under **Authorized JavaScript origins**, add your app's origin only, with no path: `https://<user>.github.io`.
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
5. In Aven, go to Settings → Data & backup, paste the Client ID, and tap **Connect Google Drive**. Pick your Google account and allow access.

The Client ID is not a secret: Google shows it to anyone who uses the sign-in. It is still typed into the app and kept on the phone, never in the repo. Test it headless with `node scripts/journey-drive.mjs` (Google is stubbed).

Backups now also carry **every** data field, built from the data shape itself (`src/lib/backup.ts`). The old hand-written list had left out the Coach's memory and your per-exercise weight jumps.

## Whole-app polish pass (screen-by-screen audit)

Every tab, sheet, Settings page, the workout and its summary were screenshotted at the S26 Ultra's size (384×832), in dark and light (`scripts/audit-tour.mjs`). Fixed:

- **Light mode:**
  - Accent text now uses a deep version of the area's colour: `oklch(… 0.55 c h)`, with a `color-mix` fallback.
  - Before, Food's lime was close to invisible on the pale glass: the "Today" pill, the meal + buttons and the active tab's icon.
- **Disabled main buttons:**
  - They show a faint wash of their colour with a quiet label, solid and calm: Add, Save, Select exercises, Save and test.
  - Before, they were 40 % see-through copies of the real button, which looked muddy over the glass.
- **Rest bar:** the fill now slides in from the left with a soft leading edge. Before, it started as a hard red sliver at the bar's edge.
- **Settings:**
  - Default rest is the same slim stepper as everywhere else: 15 s steps, shown as 1:30, with the row reading "Rest 1:30". Before, six chips wrapped onto a second line.
  - "New day starts at" is one segmented row.
  - The high-refresh and frame-rate switches sit in rows like every other switch.
  - Targets reads "2,500 kcal".
- **Numbers that read right:**
  - Session lengths: "55 min" and "1 h 3 min" instead of "55:00" in History, the session page and Today's done card.
  - Routines: "5 exercises · ~25 min" instead of "5 · ~25 min".
  - English percentages: "26%" and "−90%" (Danish keeps "26 %").
  - The weight trend reads "−0.3 kg/wk", the same as on Today.
  - A plank's previous set reads "66s" over the SECONDS column, not "1:06".
  - Extra records read "+2 more" instead of a bare "+2" badge.
- **Small fixes:**
  - "94.5 kg" no longer breaks onto two lines on an exercise's records.
  - Long placeholders end in "…".
  - An empty day's Copy and Clear are dimmed, and its options say "Nothing logged" or "1 entry".
  - Typical serving sizes no longer show a double "~".
- **Data safety:**
  - The app now asks the browser to keep its storage once there is real data (`navigator.storage.persist()`, `lib/persist.ts`). Chrome answers silently and normally grants it to an installed app. Without it, a phone low on space may clear a site's data on its own, and everything here lives only on the phone.
  - Data & backup shows when you last downloaded a backup. If the browser hasn't promised to keep the data, it says so.
  - The empty "Demo data" card is gone once you have your own data.
- **Test tooling:**
  - `AVEN_GPU=1` makes the test browser draw backdrop blur the way a phone does.
  - Its default software path leaves what is behind a sheet sharp, which looked like see-through text that phones never show.

## Glass and edges

- **Pop-ups are more see-through.** Sheets use their own frost, `--sheet-glass`: 46 % in dark and 58 % in light, with a 44 px blur and more saturation. The page's colour glows through, but nothing behind is sharp enough to read.
- **Soft edges instead of hard cuts:**
  - In the live workout, rows that scroll up under the header fade out over 36 px. Before, they were cut in a line under the progress bar.
  - At the bottom, rows melt away behind the workout bar.
  - The tab pages do the same behind the dock: a short mask fade, like a chat app's composer, so the page's own light shows through.
- **The orb screen's status bar matches the screen.** The bar now darkens with the orb screen's frost. Before, it kept the area's purple over a near-black screen.

## A Coach that remembers: memory, per-muscle training, a camera, a weekly review

**Memory (`MemoryNote` in the app's data, so it's in backups).**
- **What it saves:** lasting things you tell the Coach, such as "no separate leg day, wrestling covers legs", "left shoulder hurts on overhead press", or your goals, schedule and gym. Each one is saved with a `remember` action and shows up as a "Remembered" card with Undo.
- **How it's used:** every request carries a numbered MEMORY block. The model can `forget` a note by its number or by its words. A rewording updates the old note instead of adding a twin. The limit is 40 notes.
- **Rules it follows:**
  - Never repeat advice the user has declined.
  - Raise a deliberate choice at most once.
  - Ask, don't assume: when advice depends on something the data can't show (such as no leg sessions), ask one question and remember the answer.
- **Where you see it:** Settings → Coach memory lists every note, and you can reword (tap), add or remove (with Undo) any of them. A note tied to an exercise appears beside that exercise in the live workout, with a Swap button.
- **The chat stays:** the conversation is kept on the phone (last 60 messages) until "New chat". Older messages are dated for the model, so "today" in an old message isn't read as today.

**Per-muscle training (`setsPerMuscle`).**
- **Weekly sets:** the Coach sees hard sets per muscle for the last 7 days and the 4-week average. The main muscle counts 1 set and the others ½.
- **Wrestling:** described as hard lower-body, hip, grip and conditioning work, along with the days you usually wrestle. The Coach is told never to call your legs untrained when you wrestle, and to plan around wrestling days.
- **Stalled lifts (`stalledLifts`):** a lift with no new estimated best in its last 3 sessions (over 10+ days) is listed for the Coach.

**Camera in the Coach.**
- **Sending:** pick a photo (camera or gallery), then ask about it or just send it. It goes to GPT-6.1 Sol as an `input_image` or to Gemini as `inline_data`.
- **What it does with it:**
  - a nutrition label becomes `create_food` with the exact per-100 g values
  - a machine becomes `show_exercise`, a card with "How to do it" and "Add to workout"
  - a program screenshot becomes `create_routine`
- **Privacy:** photos are never stored. A reopened chat shows "Photo" in their place.

**What to eat.** "What should I eat?" returns 2–3 `suggest_food` cards built from your most frequent foods of the last 30 days, each with approximate totals. One tap logs that option, with Undo.

**Weekly review.** It shows on the last day of the week from midday and on the first day of the next. It covers workouts (plus wrestling), protein per day against your target, the weight trend (estimate), new records and one stalled lift. "Plan next week with the Coach" opens the Coach with that question. Everything is computed on the phone; nothing is sent until you tap.

**Sol spending meter.**
- **How it counts:** from the `usage` OpenAI returns with every answer, at list price ($2 / $0.10 cached / $10 per million tokens, about 6.5 kr per dollar). It's shown in Settings → Voice & AI as an estimate.
- **Monthly limit:** default 100 kr. Once reached, Sol rests and Gemini answers until the month turns, and the reply says why.

**Tests.**
- `tests/coach.test.ts` covers memory, per-muscle counting, stalls, the weekly review, suggestions, the spend maths, and photos reaching both APIs.
- `scripts/journey-coach.mjs` walks through it all in the browser with Gemini stubbed.

## Polish pass: routine editor, fades, a sturdier serif, GPT-6.1 Sol

**Routine editor.** Each exercise is now one tidy card.
- **Closed:** a grip, the name and the plan in one line, and a chevron.
- **Open:** the plan line gives way to the muscles it trains, and the settings appear as a short list: the name on the left and a slim stepper capsule ("− 3 +") on the right. Every number lines up, and reps are one range ("− 8 + – − 12 +").
- **Motion:** the rows rise in one after another. Numbers roll up or down the way they changed.
- **Reorder by dragging the grip:** the card lifts (slightly bigger, deeper shadow) and the others slide aside with a soft tick. The list scrolls by itself near the edges, and on release every card glides into place (`src/ui/dragSort.ts`, transforms only). The sheet ignores that finger (`data-no-swipe`).
- **Speed:** each card is memoised, so a tap on + redraws one card, not the whole editor.
- `Collapse` now starts growing on the very first frame where the browser has `@starting-style`. Before, it waited two frames before opening, which is visible in a filmstrip.

**Soft edges.** Sheets fade content out at the bottom (above the Save button) as well as the top, using scroll-driven masks, so nothing is cut by a hard line. The rule above the footer is gone. Sideways chip rows (Today's routines and recent foods) fade at their edges and snap.

**Type.** Titles moved from Instrument Serif (condensed, thin at sheet sizes) to **Newsreader** (variable, with optical sizes, so big words get finer cuts). Geist stays for everything else.

**Read-aloud only on ▶.** The "read answers aloud automatically" switch is gone. Answers are still prefetched, so ▶ starts at once, but nothing speaks unless you tap it.

**GPT-6.1 Sol (optional, paid).**
- **Key:** Settings → Voice & AI → OpenAI key. It is stored like the other keys: only in this browser, never in data, exports or backups.
- **Where Sol answers:** with a key, Sol answers the orb, the Coach, food estimates and plate photos (`src/lib/openai.ts`, Responses API, strict JSON schema converted from the Gemini one, `store: false`).
- **Thinking:** Medium for the orb and High for the Coach by default; both can be changed.
- **Fallback:** if Sol can't answer (offline, out of credit, busy, bad answer), Gemini answers and a quiet line under the reply says why (`src/lib/brain.ts`). "Brain: Gemini" turns Sol off without removing the key.
- **Caching:** the app's instructions now come before the live data, so repeated requests share a cached prefix, which OpenAI bills at a fraction of the price.
- **Unchanged:** Gemini still reads answers aloud, and Groq still transcribes.
- **Tests:** `tests/openai.test.ts` (schema, errors, streaming, fallback, and strict answers full of `null`s read exactly like missing fields) and `scripts/journey-sol.mjs`. Both run against stubbed servers, so the first real call happens on the phone.
- **Cost guard:** set a monthly spend limit on platform.openai.com.

## Smoothness pass: the workout opens at once, a workout bar, a rest end you can't miss

Measured first (production build, CPU slowed 4×, demo data), then fixed:
- **Opening the workout**: the tap took 189 ms before anything moved. About half was the animation library re-measuring the whole page, because every exercise and set row carried a `layout` animation. Those are gone: rows grow and fold with a CSS grid-row transition (`Collapse` in `ui/kit.tsx`), and reordering uses a one-off FLIP (`ui/flip.ts`). The tap now draws only the window and its header; the first exercises arrive on the next frames while the slide (on the compositor) is already moving. Reading `window.innerHeight` during render forced a style pass each time, so the height is cached (`ui/viewport.ts`), which also helps every sheet. **Worst opening frame: 191–230 → ~100 ms.**
- **Resume**: the workout stays mounted after the first opening (`WorkoutHost` in `screens/Overlays.tsx`). Minimising slides it away and parks it off-screen with a `translate`, which restyles one element instead of ~800. **Resume: ~150 → 65–72 ms.**
- **Ticking a set**: the page behind the workout (Today, Train…) re-rendered on every tick. Tab screens now pause while the workout covers them and catch up when you're resting (`useScreenStore`). The app no longer re-renders the current screen whenever a pop-up opens. Each tick used to rewrite all of the app's data; the running workout is now saved on its own at once, with the full save following when the phone is idle (`aven.v1.active`, `state/store.ts`). The progress bar scales instead of animating its width.
- **The orb**: it used to sit in the dock while the workout rose, then jump ~1,200 px in one frame to a button at the end of the list. It now lives in the **workout bar** from the first frame and glides there with the window. Sampled every frame: no jumps on open, minimise, resume or scroll.

**The workout bar** (`WorkoutBar` in `screens/workout/Active.tsx`) is the workout's own dock, where the tab bar sits, with the orb at its right end. It shows:
- **Next**: what's next ("Next · Set 2 · 55 kg × 8 / Lat Pulldown"); tap it to scroll to that set.
- **Resting**: the bar fills as the time passes; tap it for −15 / +15 / Skip.
- **Rest over**: it turns green ("Go · Lat Pulldown") and stays green until you tick the set.

The floating rest card that covered your sets is gone.

**The end of a rest** (`screens/workout/rest.ts`, mounted in App, so it also works while the workout is minimised):
- three ticks in the last three seconds, then a firm buzz and three short tones (one shared audio output, unlocked by your taps)
- the resume pill says "Rest over · Go"
- when Aven isn't on screen, a notification says what's next
- permission is asked once, gently, the first time a rest starts; toggle in Settings → Training

**Alignment**:
- **Routine editor**: settings are a two-column grid of compact steppers (Working sets · Warm-up / Min reps · Max reps / Rest as 3:00). The rep range no longer runs off the card, and opening an exercise no longer stalls or blanks the list.
- **Set rows**: columns can't grow past the card.
- **Macro totals**: the "≥" in front of totals is now a small dot, explained under More.
- **`scripts/align.mjs`**: visits the tabs and main sheets at 360 and 390 px, in English and Danish, and fails on clipped text or anything spilling out of its card or off the screen. A planted overflow is caught.

**Earbuds**:
- **Settings → Voice & AI → Microphone**: "Phone" is the default and records with the phone's own mic when earbuds are connected (`mic.ts`). Recording from the earbuds switches them into call mode and hears worse.
- This is unconfirmed on a real phone.
- **Galaxy Buds**: their own "Voice detect" setting also lowers music when you talk; turn it off in Galaxy Wearable.

**Stutter recorder** (Settings → About): five minutes of long frames with the screen and the last tap, then **Copy report** to paste back. It records only timings and names. Headless tests can't feel your phone; this lets the next fix aim at what you actually felt.

## Workout screen polish (11 Oct 2026)

- **Opening**: the orb re-measured the whole page on every exercise that appeared in the list, one forced layout after another while the window was sliding up. Changes inside the workout's list (and scrolling it) no longer count, since nothing in it can move the orb (`ui/Sphere.tsx`). Forced-layout time in the opening, measured with the CPU slowed 4×: ~320 ms → ~90 ms.
- **No sideways movement**: the list now has `overflow-x: hidden`, `touch-action: pan-y`, and snaps back if anything scrolls it sideways (`scrollIntoView` can). The likely cause was the "set done" ring and gold burst, which scale past the right edge for a moment and made room to slide into.
- **Rest bar is one colour**: it is a solid surface now (no frost), so the set rows no longer show through and there is no lighter patch behind the orb. Only the fill changes its colour.
- **Rest timer animation** (`RestFill` in `screens/workout/Active.tsx`): the fill is one linear animation run by the browser (smooth at 120 Hz) instead of being re-aimed four times a second; it restarts only when the rest changes (±15, pause, resume). Skip slides it back. At the end it fades to green. In the last three seconds the time swells a touch on each second, in step with the ticks. Reduced motion: no swell.

## The Coach knows today (12 Oct 2026, v0.1.16)

- **"How's today?" gets a real answer.** Every Coach and orb request now starts its DATA with TODAY AT A GLANCE (`buildTodayContext` in `lib/coachContext.ts`): the weekday and time of day, the user's name, today's workout (running, done, or planned with the targets the app itself will fill in, from `suggestProgression`, plus what was lifted last time), wrestling today or tomorrow, days since the last workout, missed workouts, calories and protein eaten against target with what is left, water and the last weigh-in. Rule 9 of `AGENT_SYSTEM` says how to answer "how's today?" (lead with what matters now, 3–5 lines, real numbers) and "how am I doing?" (the last 2–4 weeks, one thing to change).
- **Same numbers everywhere.** The targets come from the same progression as the Today card and the workout, so the Coach never suggests a different weight than the app fills in.
- **"How's today?" is the first Coach suggestion** once there is any data; "How is my week going?" always keeps the last place.
- Tests: `tests/coach.test.ts` ("how's today").

## One top fade everywhere (12 Oct 2026, v0.1.4)

- **Same soft edge on every scrolling page.** Content that scrolls up now melts away under the top edge over about 54 px, eased (it starts slowly, so there is no visible line). Before, the tab pages, the live workout and sheets each had their own length (44, 36, 44 px, straight ramp) and the Orb's talk list and onboarding had none.
- **How:** one registered property `--ft` and one scroll-driven animation `ft-in` (`styles.css`), used by `.screen`, `.wk-list` and the new `.fade-top` class (Orb talk list, onboarding). It is a mask on the scroller that the browser runs itself: no blur, nothing redrawn per frame, nothing faded at rest. Measured with 4x CPU throttling in a phone-size Chromium: scrolling a tab page costs the same frame times with and without the fade.
- Sheets keep their own fade (same look, 44 px) so the sheet work in progress is not touched; they can move to `--ft` later.
- **v0.1.6, tall sheets had no fade at all.** Add food and the other tall sheets fade their content in as they open (`.sheet-pane.late > *`); that `animation` shorthand replaced the list's scroll-driven fade. The list now runs both animations (`styles.css`, next to `.sheet-body`). Found by reading each scroller's fade value after scrolling it, not only whether it has a mask.

## Read aloud, a matching Coach, linked macros, workouts → routines

- **Play on every answer** (orb screen and Coach), like Claude's: tap ▸ and the Gemini voice reads it; each word lights up in the accent as it is said, the ones said settle back, the ones to come wait a shade lighter; ■ stops. It starts fast because a finished answer's audio is fetched in the background (`prefetch`, cached by text), and a long answer is split into a short first sentence plus bigger pieces fetched together and queued back to back on the audio clock (`lib/tts.ts`). The lit word follows the real audio: the clip's quiet stretches are found and each phrase is pinned to the pause nearest its full stop or comma, so the timing re-syncs instead of drifting (`wordTimes`, `speechSpan`). The screen and the reader share one tokeniser (`richLines`), so word N on screen is word N in the audio. "Read answers aloud automatically" (Settings → Voice & AI) now covers both screens. Tiny replies ("Undone.") get no button.
- **Orb screen**: no "Speak naturally…" hint while listening; the green "Done" only when something was logged or changed (a plain answer just settles); answers no longer say "open the Coach" — a **Continue in Coach** button under the answer carries the conversation over (`props.seed`). Gemini still thinks before answering.
- **The Coach matches the orb**: your messages as the small sent bubble, answers as calm text that streams in as Gemini writes it (into the same message, so nothing re-animates), three soft typing dots instead of grey bars, a play button under each answer. Less clutter: the empty state is just the suggestions, the AI note is one line shown once, "Stop speaking" is gone (the play button stops).
- **Macros lead** (Settings → Targets): change protein, carbs or fat and the calories follow (4/4/9); change the calories and all three scale with it, keeping their shares (typed digit by digit, they scale from where they were when you started typing). A bar shows where the calories come from. With only calories set, **Suggest macros** fills protein 2 g/kg of your latest weigh-in (30 % without one; a protein target you set stays), fat 25 %, carbs the rest (`kcalOf`, `scaleMacros`, `suggestMacros` in `lib/nutrition.ts`). Today shows each macro "/ target".
- **Any past workout → routine**: History → a workout → **Save as routine**. Same exercises and order, as many sets as you did, the rep range from what you did (8, 8, 6 → 6–8). From a routine's workout you choose **Update [routine]** or **Save as new** (a clashing name becomes "Push 2"). Undo in the toast; the routine opens so you can schedule it (`saveWorkoutAsRoutine` in `screens/workout/actions.ts`, also used by the summary).
- **Smaller things**: Today's "Done for today" card shows what got better (records, % volume vs the same workout last time) and takes over from the planned routine once it's done; Train's calendar and + are labelled **Schedule** / **New routine**; the Schedule sheet says in one line what each repeating mode does; rest days in the week strips are a quiet dot, not an empty box; a best-volume record reads as the set (21.5 kg × 14), not 301 kg.

## Talking to the orb: calm screen, quicker stop, streamed short answers

- **No live words while you speak** (they were tried: quick Groq looks every ~1.2 s arrived late and a one-second clip was often misheard — "Bunch." — which read as broken). While you talk, the orb answers your voice; when you stop, what you said rises into a small sent bubble.
- **It stops 0.9 s after your last word** (it waited 1.4 s; the Coach's mic too).
- **One calm thinking moment**: no "Transcribing…" step and no grey placeholder bars — the orb thinks, and the answer starts appearing as soon as Gemini writes its first words (the agent's answer is streamed with the reply first — `aiAgentStream`, `partialReply` in `lib/gemini.ts`; a request the API won't stream falls back to the plain call).
- **Short spoken answers**: on the orb screen the assistant is told to answer in 1–2 short sentences, no lists (it is spoken to mid-workout); it points to the Coach when a question needs more. The Coach chat keeps longer answers. The answer is 17.5 px easy text, each new word settling in with a soft blur lifting; the label under the orb stays empty while an answer is up (the Say more button already says it).
- **Sent like a message**: your words rise into a small, quiet bubble on the right on a calm spring with a hint of bounce (iMessage-style); the action cards follow on the same spring. Long answers keep their newest words in view unless you scroll up.
- **Hearing accented English**: left on Auto, Whisper sometimes hears neither Danish nor English (accented English taken for Dutch). That used to be heard again as Danish only — misheard English became Danish nonsense. Now it is heard again as both, side by side, and the clearer one (Whisper's own confidence) is kept (`heard()` in `lib/groq.ts`). If you always speak one language, set it in Settings → Voice & AI → Language to skip the guessing. Bluetooth earbud mics drop to a low-quality call mode; the phone's own mic hears better.

## The orb, final look

- **Beads of light, not flat dots** (`ui/sphereRender.ts`, dark mode): every lit bead on the near side glows softly into the space around it, its core is crisp, and the brightest — where the light comes from, top left — have a white-hot heart. The far side stays small and quiet, so the orb reads as deep glass with light inside.
- **A glass shell**: a fine bright edge exactly on its outline and a soft reflection at the top left. Light only; it never changes the shape.
- **Alive at rest**: every bead twinkles gently on its own slow beat and the inner light breathes.
- **Done**: the green wave climbs only the near side (no stray green dots behind it) and two green rings leave the orb. Tap rings are now a soft glow under a fine line.
- **Arrival**: the spiral climbs at an even pace and the whole orb lights up the moment it reaches the top, together with the heartbeat's last thump; the spiral and the landing tick start as the orb visibly settles (they used to wait for the spring's invisible last 4 %).
- Same cost to draw as before (measured ~1.1 ms per frame for the big orb). Light mode skips the bead glow, which would only haze it.

## Polish: orb depth, records, routine cards

- **Orb keeps its depth while you speak**: voice light lights the near side fully and the far side only a little, and bright highlights are sparkles on the near side. It used to blow out to an even white, front and back alike.
- **Recent records** (Progress): one row per exercise, showing its most meaningful record from the latest session (heaviest set, then estimated 1RM, reps, hold, distance, volume last), with "+n" for the others. It used to list Back Squat three times in a row.
- **Routine cards** (Train): muscle chips stay on one line — two chips and "+n" — instead of wrapping under the buttons.

## One orb, everywhere; its beads move with your voice

- **One look at every size** (`ui/sphereRender.ts`): the orb is always the same 400 evenly spaced beads — in the dock, the Coach's mic, the workout and the orb screen — only scaled. It used to be a sparse, patchy sample of a 1100-dot lattice when small and a dense, glaring one when big, so it looked like different objects.
- **The beads move when you speak**, along the surface (the outline stays a perfect sphere): each row of beads sways sideways with its own band of your voice, like an equaliser wrapped round a ball, and every syllable's ring of light pushes the beads it passes through, so a wave of motion crosses the orb towards you. The light now only follows the motion (it used to wash the orb out to white).

## The orb's moments (light and haptics, never a change of shape)

- **Pull it up**: flick the dock's orb upwards (or tap it). As it lands on the orb screen, three spiral arms of light wind up the sphere from the bottom to the top, and when they reach the top the whole sphere lights up once. The phone plays a heartbeat that quickens as the spiral climbs and ends in a soft thump (`IGNITE_BUZZ` in `ui/Sphere.tsx`).
- **Speaking**: every syllable sends a ring of light across the sphere towards you, starting a little off centre each time, with a tiny tick (at most one every 160 ms). The light-equaliser and inner glow still follow your voice.
- **Thinking**: two comets of light circle the sphere on a tilted orbit, trailing fading tails.
- Haptics follow Settings → Training → Haptic feedback; reduced motion turns the light effects off.

## Seamless pass: the orb never changes shape

- **Rigid sphere** (`ui/sphereRender.ts`): the orb's outline is always a perfect sphere. Your voice, a tap, thinking and "done" now show as light running over the dots (travelling light waves, an equaliser of light by latitude, a flash band, a bloom) — no more lumpy, liquid blob while it listens, no breathing, no swelling, no burst. A press sinks the whole sphere in by ~5 % and springs back; a tap adds a flash, a spin and two thin rings.
- **No texture pop**: the number of dots follows the size the orb is *seen* at, not the canvas bucket it is drawn in, and dots fade in or out gradually. Before, the orb switched from a dense to a sparse dot pattern ~0.3 s after landing in the dock.
- **No mid-flight swell**: flights only move and resize the orb.
- **Orb screen → Coach**: the orb goes straight from the big orb to the Coach's mic on the Coach sheet's own spring. It used to fly home to the dock with the closing orb screen, wait there, then jump to the mic. A pop-up that hands the orb over no longer pulls it back on its way out (`handoff` in `ui/Sphere.tsx`, slots know their pop-up through `OverlayMeta`).
- **No flash between them**: the orb screen's frost holds until the Coach sheet is mostly up, so the Today page no longer flashes through in between.

## The orb rides its button; soft top edge

- **Orb into the live workout**: it waits in the dock, is lifted out as the window's slot reaches it, then rides with the slot exactly — opening, closing and under your finger (drag the window halfway and it stays on its button instead of drifting off towards the dock). It moves across and grows within the first stretch above the dock; the hand-over is a soft minimum, so its speed never jumps. Same path in the browser-run version (`carry()` in `ui/Sphere.tsx`). The Coach's mic (level with the dock) still glides across.
- **Haptics**: a light tick as the orb is lifted out of the dock, a firmer one as it settles into place, and one as it drops back in (Settings → Training → Haptic feedback). Vibration is only attempted after the first tap (browsers refuse it before that).
- **Status bar edge**: scrolled content dissolves into the top of the page over 44 px instead of being cut off under the status bar — a fade only, and only once the page has moved (scroll-driven).

## Progression for sets taken to failure

`suggestProgression` (`src/lib/workout.ts`), weight × reps only. Each working set is compared with the same set last session (extra sets today use last session's final set). Set 1 at the top of the rep range last time → the exercise's increment on every set, reps back to the bottom; otherwise the same weight per set and last reps + 1 (capped at the top). Sessions with fewer than half the planned sets done are skipped (`plannedSets` is recorded when a workout is finished; older sessions count as complete). If set 1 hasn't beaten the session before in 3 sessions at the same weight, the reason line says it has stalled. Increment per exercise in exercise details ("Weight jump"; default = Settings → Training → smallest weight jump, 2.5 kg; dumbbells 2 kg); the leg double step is gone. New workouts (and added, replaced or extra sets) are filled with the targets as real values, so ticking a set logs them unchanged; a set you've already edited is never overwritten. One reason line per exercise: add weight, add reps, hold (set 1 fell below the range), stalled, or first time.

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

## Orb positioning and stutter

The orb's position used to be measured after Motion wrote each frame's styles, including during long measurement windows
opened by its own decorative style changes. Those reads forced pending style/layout work onto the page thread.
`ui/Sphere.tsx` now measures changed anchors in Motion's read phase and applies ancestor transform changes afterwards.
Native animation timing keeps it aligned with compositor-driven sheets; CSS animations with their own keyframe easing
are sampled in the read phase. Scroll, content, size, keyboard and font/image changes still invalidate the anchors.
The geometry, rendering and existing springs of the dotted sphere are unchanged.

`scripts/orb-motion.mjs` checks idle geometry-read counts, frame-by-frame dock alignment, tab switches, keyboard movement
and interrupted Coach flights with high-refresh mode both on and off. It is included in `scripts/run-all.sh`.
Cloud timing comparisons can show reduced measurement work; actual 120 Hz output and touch feel need the phone.

The text-flight check (`scripts/morph.mjs`) captures screenshots in a separate flight before measuring motion.
Screenshot readback can stall cloud rendering during the short flight; the frame-count, landing and jump limits remain unchanged.

## Rest bar back to frosted glass (11 Oct 2026, later)

- Omar wanted see-through glass on the rest bar after all. It is a light tint with a 34 px blur behind it (`.wk-bar.glass`), one even colour: the fill lives in its own clip layer, so there is no lighter plate behind the orb. Set rows underneath melt into haze.
- The fill's front edge is soft (a mask), not a hard line. The bar's two lines of text rise in softly (520 ms) when it changes from next → rest → go. Reduced motion: no rise.
- Rule going forward: floating surfaces (bars, sheets, popups, toasts) are frosted glass; cards inside the live workout stay unblurred on purpose (cost on a phone).

## Rest bar glass you can actually see (11 Oct 2026, evening)

- Omar still saw a solid bar. Two causes: the set list faded to 12% before it reached the bar, so the frost had only the dark background behind it; and a 34 px blur on a 58 px bar averaged dark-on-dark rows into one flat colour. Now the list stays solid until below the bar, and the bar uses an 8 px blur with a lighter tint (`.wk-bar.glass`). Rows pass under it as soft shapes; a ticked (orange) set glows through. Numbers still can't be read through it.
- Updates reach the phone: an update that is ready in the first 10 s after the app opens is put in straight away, even with a workout running (it is saved first and comes back). Before, the update banner was hidden during a workout, so a build shipped mid-workout could stay out. After that window the "Update" banner works as before (`src/pwa.ts`).
- Settings → About shows the real version (from package.json), so Omar can see which build his phone runs.

## Floating sheet buttons and lighter keyboard (12 Oct 2026, v0.1.5)

- **Bottom buttons float.** v0.1.3 put a frost behind the Add/Save buttons, but the list still ended above them, so it was cut off in a straight line and the button area read as its own panel (Omar's Quick add screenshot). Now the buttons are laid over the end of the list (`SheetFoot` in `ui/Sheet.tsx` measures them into `--foot-h`); the list scrolls all the way down underneath and melts into a soft blur, gone by the top of the button. No tint, no card, no edge.
- Why a melt (a mask on the list) and not only a frost: a blur inside a sheet only sees the sheet's own content, which is see-through glass, so the sharp rows always showed through the blurred copy. Fading the rows while the frost blurs what is left makes them dissolve instead. Rows must be gone before the button, because the button is glass too.
- Focused fields scroll into view above the floating buttons, not behind them (`watchFocus`).
- **Keyboard lag in sheets.** Only the top sheet rides the keyboard now. The sheet behind it (e.g. "Add to Dinner" with its long list under Quick add) used to be moved and re-fitted on every frame of the keyboard; it is covered and its top edge does not move either way, so it looks the same. Tall sheets also no longer change their glass mid-ride (squeezed above the keyboard they counted as "short"). Measured with a simulated keyboard (`scripts/perf-keyboard.mjs`): style work while the keyboard opens halved, and with GPU-style rendering the slowest frames dropped from ~270 to ~170 ms in the (very slow) software renderer. How it feels on the S26 is for Omar to judge.
- `scripts/sheet-foot.mjs` takes the screenshots (Quick add with a 360 px keyboard, scrolled, a tall form, the Coach).

## Clean-up (12 Oct 2026, v0.1.7)
Removed code nothing used (20 helper functions and one unused AI schema), 13 throwaway debug/screenshot scripts, a stray
screenshot, an unused font package and two unused CSS helpers. Rewrote `CLAUDE.md` as one short rule set (blur + 120 fps,
slow motion, shipping steps) and added `npm run verify`. Sheets, keyboard, orb, rest timer and workout screen were left
alone on purpose (other threads were changing them).

## Keyboard slides over sheets; buttons are floating glass pills (12 Oct 2026, v0.1.8)

- Omar's reference was the Claude app: the page stays still, the keyboard slides over it, and only the Save button rides up on the keyboard. Sheets now work that way. A sheet never changes size for the keyboard any more: it rises only as far as it can without its top passing the status-bar gap (a full-height sheet doesn't rise at all), the rest goes under the keyboard, the bottom buttons ride on top of it (a transform), and the list gets the covered part as extra room once, before the keyboard moves (`--kb-room`, `onKeyboardGoal` in `ui/keyboard.ts`). Before, sheets shrank to fit on every keyboard frame (8–9 layouts per ride, a re-drawn 44 px glass each frame); now one layout per ride. `scripts/journey-keyboard.mjs` checks it.
- Bottom buttons are just the button: no frost band, tint or fade behind them (v0.1.5's melt is gone). The list scrolls underneath and stays visible around them. The main action is solid colour; other buttons, and a main action that isn't available yet, are frosted glass pills with their own small blur.
- For that blur to show the content under it, the sheet's own 44 px glass moved from the sheet element to a layer under its content (`.sheet::before`). A blur on the sheet element itself made the sheet a closed world for blurs inside it: they only saw its see-through content, so rows under a button stayed sharp. Same single blur, same cost; `scripts/morph.mjs` reads the glass from `::before` now.

## Speed pass, step 1 (12 Oct 2026, v0.1.9)

- Measured every everyday moment with `scripts/perf-app.mjs` (production build, CPU slowed 4×; prints late frames, worst
  frame and main-thread time per moment). The tab screens were late on about a third of their frames even standing still.
- Cause 1: the colour field's film grain was blended over the whole screen with `mix-blend-mode: overlay`, so the browser
  re-blended a full-screen layer on every frame. The colour field is its own transparent group, so overlay looked the same
  as a plain layer: screenshots of all four tabs, dark and light, differ by at most 2 of 255 levels. Now a plain layer.
- Cause 2: the progressive blur under the dock was three stacked blurs, each re-blurring the one below. The faint 3 px top
  layer is gone and the 9 px layer fades in from the top instead (screenshots: same look; max difference 15/255 on a few
  pixels). The dock's own frost and the 20 px layer are unchanged.
- Result at 4× slow-down, late frames: Today standing still 28 → 2, scrolling Today 56 → 2, Train 102 → 10, Food 66 → 5,
  Progress 210 → 17, Today with a workout running 78 → 4. The live workout was already clean and stays clean.

## One glass pill, keyboard on one curve (12 Oct 2026, v0.1.10)

- Every sheet's bottom button is now the same frosted glass pill on every screen (it was solid area colour in some places and glass in others). Ready or not is told by the label: bright or faint.
- Keyboard: the sheet used to follow the keyboard 1:1 and stop dead when its top reached the gap while the keyboard kept going. Now the sheet and its buttons move on one straight line against the keyboard's height, set once per keyboard change from where they are (so letters → numbers never jumps).
- Omar's recording showed the page peeking through between a sheet and the keyboard while they moved (the phone reports the keyboard once and animates it on its own, so the two are never in perfect step). The sheet's glass now reaches on below its bottom edge (`.sheet:not(.sz-small)::before`, off screen at rest), so that gap is glass.

## Speed pass, step 2 (12 Oct 2026, v0.1.11)

- Tab switches: the status bar's colour blend (0.8 s, `ui/statusBar.ts`) wrote `--bar` / `--bar-shown` on `<html>` every
  frame. A variable on `<html>` is inherited by every element, so the whole app was restyled on each of those frames: 60 %
  of the style work and most of the long frames of a switch. The tint is now written only on the elements that use it
  (`data-bar`: the colour field, the orb screen's top band; the app shell only while a popup is up), and the two variables
  are registered as non-inherited. Same colours (checked: status bar, the field's top fade, the popup backdrop, the orb
  screen's top band).
- Result at 4× slow-down: style work per tab switch ~600 → ~300 ms; closing the workout 570 → 280 ms.
- Workout clock: checked against minimise, a frozen (background) page and finishing; it is computed from timestamps
  everywhere (live clock, pill, Today card, summary, history) and stayed correct. No change.

## Speed pass, step 3: standing still costs less (12 Oct 2026, v0.1.35)

- Measured (`scripts/perf-redraws.mjs`): standing still on any tab, the screen was redrawn on every single frame, and on
  Today the page was also re-rendered on the main thread every frame. Three causes:
  - the colour field's three lights drift continuously, so every frame differed by a fraction of a pixel;
  - the Coach pin's breathing glow and the live pulse dot animated `box-shadow`, which only the main thread can draw.
- The drift is now the same slow ease-in-out, advanced in steps about 12 times a second (a step is under half a pixel).
  The pin glow is two fixed glows cross-fading (opacity, eased, 20 steps a second, each under 6 %); the pulse ring is a
  growing, fading disc. Screenshots at fixed times match the old ones.
- Result (3 s standing still, 60 Hz test browser): Train / Progress / Food 180 → 36 redraws; Today 180 → ~70 redraws
  and 180 → 0 main-thread re-renders. On the phone's 120 Hz screen that is about 36 redraws a second instead of 120.
- The orb is left as it is: it is deliberately drawn every frame (its slow turn stuttered at 30 fps).
- Left: the first frame of a tab switch or the workout opening is one long task (building the new screen); that needs
  lazier screens, a bigger change.

## Speed pass, step 4: light taps for the Coach and "Say more" (13 Oct 2026, v0.1.38)

- From Omar's phone report: the only frames over 50 ms were opening the Coach (104 and 91 ms, 88 ms of it the tap's own
  script) and "Say more" on the orb screen (89 ms, no script).
- Coach: the tap built the whole saved chat at once (up to 60 messages, every word its own element for the read-aloud
  highlight) and laid it out. Now it builds only the newest 6 (more if they don't fill the screen), scrolled to the bottom
  as before; the older ones are added above two at a time when the phone is idle, starting once the sheet has risen, and
  what you look at stays exactly where it is. Measured (`scripts/perf-taps.mjs`, 60 messages, 4× slow-down): tap script
  ~500 → ~100 ms, tap to first frame ~610 → ~170 ms.
- "Say more": its own script is small (~15 ms at 4×). The cost is on the graphics side as the orb grows back from 96 to
  250 px: its canvas was made anew at every 24 px step (6 new buffers in half a second). It now keeps the big size for the
  whole grow (and shrink), as flights already do: one resize. Looks the same.

## Speed pass, step 5: tapping through the tabs quickly (13 Oct 2026, v0.1.40)

- Omar: the laggiest moment was tapping the dock tabs fast. Measured (`scripts/perf-tabspam.mjs`: real touches every
  150 ms in three orders, 4× slow-down): each tap built its whole new screen inside the tap itself, so the next tap waited
  for it; tap to screen 216–640 ms, the worst frame 383 ms.
- The dock now answers the tap at once and the page follows as soon as its screen is built (`useDeferredValue` on the
  tab in App.tsx). That build runs in the background and is dropped if another tab is tapped first. Colours, status bar
  and screen still change together, with the same slide and cross-fade. Result: the tap itself 85–300 → 13–53 ms; tap
  to screen on average ~350 → ~175 ms, worst 640 → 280 ms; worst frame 383 → 133 ms.
- The tab screens' colour fields now share one grain layer instead of one each. During fast switching three or four
  fields cross-fade at once, and each grain was another full-screen layer. At rest it is the same grain over the same
  field (checked: identical brightness and texture).
- What is left: overlapping switches are heavy for the graphics chip by design. Every tap starts its own 0.8 s colour
  cross-fade and 0.38 s slide, so four quick taps stack about 100 layers. Cutting that would change how a fast switch
  looks, so it is Omar's call.

## Feel pass, step 1: every button presses like a native one (12 Oct 2026, v0.1.12)

- One press for the whole app (`ui/press.ts`), in place of CSS `:active`. `:active` missed quick taps (the finger was up
  before its 80 ms dip showed) and flashed on a finger that was starting a scroll. Now a resting finger shows the press
  after 55 ms (a scroll cancels it inside that window, or as soon as the finger drifts 10 px), a quick tap still gets a
  full dip held for at least 120 ms, and the way back is the calm spring every `.press` already had.
- The depth is sized to the control: about 3 px of give on a wide button, ~6 % on a small icon, so both read as the same
  gentle push. Only `data-pressed` and `--press` are written, on the control itself (no page-wide restyle).
- The icon buttons that had no press (sheet close / back, delete and edit icons, the toast's Undo) now have it. The Finish
  button, set numbers and set ticks spring back instead of snapping (their own transitions had dropped `transform`).
  The dock's tabs keep the plain CSS press, because the dock measures them the moment a tab is picked.
- Haptics: Settings → Haptic feedback now turns off every vibration (most taps ignored it). Switches tick when turned on and
  segmented controls tick when the choice changes. Vibrations for a ticked set (a double one when it beats last time), the rest timer's last seconds
  and its end were already there and stay as they were.

## Polish pass: fewer vibrations, no press flash on scroll (12 Oct 2026, v0.1.13)

- Vibrations only where something happens: a set ticked, a rest ending, food or a workout saved, a switch or a choice
  changed, a drag-to-reorder, the orb screen's arrival heartbeat. Gone: plain navigation (tabs, the workout pill, Resume,
  day arrows, opening a meal or a session, the Coach pin, "Keep training", ±15 s on the rest timer, the workout bar), the
  ticks when the orb flies with the workout or the Coach, the second buzz when a logged item's light lands, and the tick on
  every syllable while you talk to the orb (it buzzed several times a second).
- Press (ui/press.ts): a resting finger now shows the press after 100 ms (Android's own tap timeout) instead of 55 ms, and a
  drift of 6 px cancels it, so starting a scroll on a button no longer flashes it. A press that turns into a scroll eases
  back in 240 ms without the spring's bounce. Quick taps still dip fully.
- Switches and the onboarding weekday buttons pressed and snapped back (an inline transition replaced the press's spring);
  they now spring back like every other control.

## Feel pass, step 2: sheets you can catch (12 Oct 2026, v0.1.14; swipe-to-tick removed in v0.1.15)

- **Sheets**: pulling a sheet up now stretches like rubber (harder the further you pull, never past ~28 px) instead of a
  flat 18 %. Let go short of closing and it settles on the calm spring with your finger's speed. Catch it while it
  settles and it stops under your finger and follows from there (it used to fight the finger).
- Only transform and opacity move; no layout per frame.

## Swipe-to-tick removed (12 Oct 2026, v0.1.15)

- Omar never asked for it: at the gym one tap with sweaty hands beats a swipe, which can also be mistaken for a scroll.
  Tapping the box is again the only way to tick a set. The sheet changes from v0.1.14 stay.

## Focus view, step 1: one exercise per page (12 Oct 2026, v0.1.17)

- A new button in the workout header switches between the list and **Focus**: one exercise fills the screen (a stage for
  the movement on top, the muscle picture until the moving figures exist; then the exercise's own card, so the sets tick
  exactly as in the list). Dots under the header show the exercises, filled when done; tap one to go there. The choice
  is remembered on the phone (`aven.wkView`).
- Pages follow the finger 1:1 and resist past the first and last one (iOS rubber band). On release they settle on a spring
  (`PAGE`, Apple's 0.5 s) that starts at the finger's speed, at most one page per swipe; a touch mid-glide catches the page.
  The settle is a Web Animation on the track's transform (`springCurve` → `linear()`), so the compositor draws it at full
  refresh rate (`ui/pager.ts`). Vertical scrolling inside a page stays the browser's own (`touch-action: pan-y`).
- Ticking the last set of the exercise you're on waits 0.9 s, so the tick is seen, then glides to the next exercise with
  sets left on a slower spring (`PAGE_AUTO`, 0.62 s). In a superset it glides to the partner whose turn it is. The bar's
  "next set" glides to that exercise's page and flashes the row.
- Cost kept low: only the page you're on and its neighbours are built (others are a light stand-in), and neighbours are
  built only once nothing is moving; the dot pill moves without a re-render mid-swipe; no new blur; the list stays mounted
  but stops being drawn once faded, so switching back keeps your place. Speed check (`perf-app.mjs`, 4× CPU): list moments
  unchanged; scrolling a page has no late frames.
- Gotcha: a touch is held by the element it started on, so taking it over for the track fires `lostpointercapture` on that
  element; it bubbles, and only the track's own counts as the end of a swipe.
- Plan and figure research: steps 2 to 5 in `docs/polish-plan.md`.

## Focus view: a short flick turns the page (12 Oct 2026, v0.1.18)

- Omar had to swipe almost the whole width. The release rule projected the page by the finger's speed × 0.14 s and rounded,
  so a 70 px flick at 900 px/s still fell short of half a page. Now it works like iOS: a flick of 260 px/s or more turns
  the page whatever its length; otherwise a drag past a quarter of the width turns it; less springs back. One page at most.
- The speed at release uses every coalesced finger position of the last 100 ms, and is zero if the finger stopped 80 ms
  before lifting (a held drag never "flicks"). Vertical scrolls and taps are untouched (an 8 px, mostly-sideways start
  still decides it is a swipe).

## Premium pass, step 1: a tidier focus view (12 Oct 2026, v0.1.19)

- **The bar stops repeating the page.** In focus view, when the next set is on the exercise you're looking at, that row is
  already highlighted there, so the bar now says **Up next** and names the exercise after this one (its superset partner
  first, else the next one in the list that still has sets), with its planned weight × reps or its number of sets. A tap
  glides to it. Looking at another exercise, or resting, the bar is as before (next set, rest, go).
- Which page Focus shows lives in a tiny store of its own (`useFocusPage` in `screens/workout/Focus.tsx`): only the bar
  listens, so turning a page re-renders nothing else.
- **A smaller stage**: the figure area is at most 184 px tall (was 230), so the sets sit higher on the screen.

## Premium pass, step 2: the orb comes alive (12 Oct 2026, v0.1.20)

Light only: the orb's outline never changes.
- **A still glow on its screen** (`.voice-glow`, `screens/Voice.tsx`): a soft pool of the area's accent behind the orb, so
  it no longer floats alone on the frost. One radial gradient on its own layer, no blur; only its fade-in animates
  (opacity, once, as the orb lands). It grows and shrinks with the orb's button.
- **It breathes while you rest**: during a rest between sets its inner light breathes deeper and sits a little higher, on
  the same slow ~6 s beat it always has (so it never jumps), easing in and out over about a second (`rest` in
  `OrbInputs`, `ui/sphereRender.ts`).
- **One heartbeat per set**: ticking a set (by tap, by the orb or by the Coach) makes the light swell once and a single
  ring of the success colour leave it, with no spin or flash (that's a tap's). It listens to the store (`orbBeat` in
  `ui/Sphere.tsx`), skips sets you dictated (they get the orb's own "done" light) and never replays a beat it missed while
  it wasn't drawn.

## Premium pass, step 3: the card travels between list and focus (12 Oct 2026, v0.1.21)

- Switching views, the exercise you're on is one object (iOS's shared element, `screens/workout/morph.ts`): it glides from
  its place in the list to its place on the focus page while the rest of the list fades and the dots and stage rise in, and
  back. Going back from another exercise, the list scrolls (unseen) so that card waits about where it was on the page.
- Measured once at the tap and once when the other view is laid out; the glide is one browser-run transform on the sheets'
  spring (`SURFACE`), so it costs nothing per frame. The card is never faded, so it never dips mid-switch.
- The list no longer shrinks as it fades out (a shrinking list bent the card's path); it only fades.
- Reduced motion, or a card that isn't on screen to start from: the plain crossfade, as before.

## Premium pass, step 4: numbers roll (12 Oct 2026, v0.1.22)

- One `Roll` (`ui/Roll.tsx`), like iOS's numeric text: only the digits that changed move, the old one sliding out and the
  new one in from the side it came from (up when the number grew, down when it shrank), on the calm `SMOOTH` spring.
  Transform and opacity only, browser-run; digits line up from the right.
- Where: the workout header's sets and volume, the rest countdown in the bar (its last three seconds still swell on each
  tick), the "all sets done" line, and every `Count` (calories, macros, water, weight, the summary's volume). `Count` used
  to count through every value in between, rewriting the text and laying the line out again on every frame.
- The running workout clock doesn't roll (a clock that moves every second would never be still).

## Premium pass, step 5: a calmer empty workout (12 Oct 2026, v0.1.23)

- An empty session is one centred moment in the free space between the header and the bar: a soft accent mark (a dumbbell
  in a glow), "Empty session", the line about the orb, then Add exercise and Discard. It used to sit at the top over an
  empty half screen. Pure layout (flex, auto margins); nothing new animates.

## Premium pass, step 6: haptics as one system (12 Oct 2026, v0.1.24)

- One vocabulary (`HAPTICS` / `haptic(name)` in `state/ui.ts`) instead of numbers scattered through the app, so each feel
  means the same thing everywhere: `select` (a choice changed), `light` (a small thing done), `saved` (something kept),
  `set` / `gain` (a set ticked / one that beats last time), `confirm` (start or end a workout, confirm the Coach),
  `success` (the orb or Coach did it), `listen` / `send` (the orb starts listening when you tap it / takes what you said,
  by a tap or by falling quiet), `finish` / `record` (the workout saved / saved with a new personal record), `warn`,
  the rest timer's `countdown` and `restOver`, and the orb's `arrive` heartbeat.
- New: the orb's listen and send feels (tapping it to stop used to feel like tapping it to start), and the record feel
  when a finished workout holds a new personal record. Small unifications: logging food is always `saved` (it was 10, 12,
  14 or 16 ms depending on the screen), starting a workout is always `confirm`.
- Still not felt, on purpose (v0.1.13): navigation, opening things, the orb flying, talking, ±15 s.

## Premium pass, step 7: moving figures, the first three (12 Oct 2026, v0.1.25)

- Omar chose Aven's own figures (free, no paid library). `screens/workout/Figure.tsx`: a calm side-view figure built from
  rounded limbs nested at their joints, so a pose is five angles (torso, upper arm, forearm, thigh, shin) and a rep is each
  joint turning between two poses. Every limb turns with a browser-run rotate animation (compositor, 120 fps, nothing per
  frame on the page). One rep is 2.8 s: the lift, a beat at the top, a slower way down.
- The muscles are drawn on the limbs; the exercise's main muscle glows in the area's accent, the others it works softer.
  The far arm and leg sit a little behind in shade, for depth without blur.
- First three for Omar's OK: bench-type presses (lying, bar from chest to straight arms), barbell-type rows (hinged,
  bar to the ribs), curls (standing, dumbbell to the shoulder). `figureFor(ex)` picks one; every other exercise keeps the
  muscle map until the rest are drawn. Only the page you're looking at moves; the others hold still and cost nothing.
  Reduced motion: the figure stands in its start pose.

## Premium pass, step 7b: the figures redrawn, and room to show them (12 Oct 2026, v0.1.27)

- Omar asked whether the first figures were really good; filmed honestly, they weren't (small grey tube mannequins, dark on
  dark, no hands or feet, only the arms moving). Redrawn in `Figure.tsx`: each limb is now a small static SVG, a soft
  taper with a little muscle shape, plus hands, feet, neck and head. It is lit like a rounded form, bright down a limb's
  middle and falling off to its edges, with a faint rim so it stands off the dark. Opaque, so overlaps never show darker.
  The worked muscles glow (main one brightest, with a soft halo), and the others only hint at their shape.
- Same engine and cost: each joint still turns on one compositor rotate animation, and the drawings never change. Arms
  and legs now hang inside the torso, so the near leg sits in front of the body and the near arm in front of the leg.
- The figure fits itself in its box from its own poses: it stands on the floor, the bench sits under a lying body, and a
  soft shadow lands where it meets the ground. Row and curl now move the body a little too (the back lifts as it rows,
  and the body leans back at the top of a curl).
- Focus view: the stage grows into the room the card leaves, and the figure scales to fill it. It measures once things
  settle and eases there on the slow curve, so adding a set never re-scales every frame. Pages now end just above the
  bar, so the empty gap under the card is gone.

## Colour pass: one bright thing at a time (12 Oct 2026, v0.1.28)

- The orange (each area's accent) is kept for the one thing to do now. Finish stays a quiet glass button until every set
  is ticked, then lights up and glows (as before). On Train, only the routine you're in (or today's) has the bright play
  button; the others are glass with the colour in the icon.
- "Rest over" now glows in the area's own colour instead of green (green over the orange fill read as olive, and clashed
  with every theme). The bar stays see-through frost: a soft accent tint, the ring pulse, and "Rest over" in the accent
  with "Go · exercise" in plain white. The minimised workout pill says it in the accent too.
- The light stripe on the rest-over bar (Omar's recording): the colour layer that fades in now has its own compositor
  layer, so the fade no longer re-paints the fill in pieces (likely cause; check on the phone).

## Look pass: one family, one title style, a slimmer food search (12 Oct 2026, v0.1.30)

- **One colour family (Ember, the default).** Every tab is now a shade of the same warm family, so the app reads as one
  thing: Today coral with plum and amber, Train ember and magenta, Food apricot (was lime and teal), Progress rose (was
  blue). The other palettes (Aurora, Mono, Sunset, Forest) were already families of their own and are unchanged.
- **One title style.** Names are upright serif everywhere: routines, meals, the Food date, Today's workout card. They
  used to mix upright and slanted.
- **Food search:** the six big tiles (Scan, Photo, Quick add, New food, Recipes, Saved meals) became one slim row of
  pills that scrolls sideways, so your recent foods start higher.
- **Focus view button:** a card with page dots under it. The old one looked like a phone on vibrate.

## The orb's light, and the Coach's workout length (12 Oct 2026, v0.1.31)

- **The orb gives off light instead of fog.** The glow behind the orb on its screen was a wide, faint pool of the accent;
  on the dark background it read as brown haze over the top half. Now there is a close halo at the orb's edge and a soft
  oval of light just under it, as if it hovers over glass (`.voice-glow`). Omar was shown three options (halo, pool
  below, breathing ring) and leaned to the pool; the halo plus pool was chosen. Same cost: two gradients on one still
  layer, no blur, only the fade-in animates.
- **The Coach knows how long you really trained.** It counted a finished workout's length from start to end, paused
  time included; it now uses the same time as every screen (`elapsedMs`).

## Titles back to how they were (12 Oct 2026, v0.1.34)

- Omar didn't like v0.1.30's all-upright titles, so the title style is back exactly as in v0.1.29: slanted serif for
  routine names, meals, the Food date, Today's workout card, Wrestling/Cardio and the empty-workout title; upright
  elsewhere. Everything else from v0.1.30 stays (colours, food tool pills, focus icon).

## Coach: messages glide, answers write themselves in (12 Oct 2026, v0.1.36)

- **Sending is one move, like iMessage.** What you typed (or said into the Coach's mic) lifts out of the field and glides
  up into its bubble, while the conversation moves up on the same spring to make room. The field's "Ask the Coach" comes
  back once the words have left it. How: a copy of the bubble flies above everything (the list clips its own contents)
  from the text's place in the field to the bubble's, its glass gathering round the words, and hands over to the real
  bubble where it lands; the conversation is scrolled to its end at once and played back up from where it was. Web
  Animations on transform/opacity only. Suggestion chips keep their small rise.
- **Answers write themselves in like on the orb screen**: word by word, each lifting out of a soft blur (`.calm .w`), with
  the orb screen's timing. The Coach had its own quicker, fainter version.
- Opening the Coach was filmed frame by frame and is already one move (the sheet arrives with its conversation and its
  field together), so it is unchanged.

## Figures only where they are right (12 Oct 2026, v0.1.37)

- A moving figure now shows only on exercises whose movement and equipment it truly matches: dumbbell and hammer curls,
  the flat barbell and close-grip bench press, the barbell and Pendlay row. Before, every curl showed the standing
  dumbbell curl (a preacher or rope curl too) and every press the flat barbell bench. Everything else shows the muscle
  picture until it has a figure of its own (Omar chose to keep drawing Aven's own, for every exercise).

## Warm colours that hold together (13 Oct 2026, v0.1.39)

Omar said the colours felt "kind of off". Three Ember colours came from outside its warm family, and Mono had no colour at all:
- **Food** is apricot (`#ffa05a`) instead of amber. A faint amber tint on the dark glass read as muddy olive, most visibly on the meal "+" buttons.
- **Progress** is a dusty rose (`#ee7280`) instead of candy pink, so its charts match the other tabs.
- **Carbs** are plum on Ember (`#b07cff`, light theme `#7a45d0`) instead of blue: the macro dots, rings and meal bars stay warm. The rule uses `html:root[data-palette]`, because the dark theme's `:root[data-theme='dark']` sets the macro colours at the same strength and comes later.
- **Mono** keeps its grey light but has one clear colour, Aven's coral, for the next thing to do (play button, Finish, ticks) and the worked muscles. Before, everything was white on grey and nothing stood out. Its settings swatch shows the coral dot.

Mono's macro colours were meant to be greys, but that rule has never won against the dark theme's, so Mono has always shown coloured macros. Left as is: nobody has asked for grey macros.

## The Look page: see a look before you pick it (13 Oct 2026, v0.1.41)

Settings additions, chosen by the coordinator from the customization shortlist (Omar delegated the pick):
- **Colours as small screens.** Each look in Settings → Appearance is a tiny still Today screen in its own light: the field, the calorie ring, a workout card with its play button, and the dock. The cards follow Theme and Background glow, so what you see is what you get. Picking one still applies at once.
- **Background glow: Full / Soft / Off** (`settings.glow`, set as `data-glow` on the page). Soft lowers the colour field's strength (`--aurora-a` 0.28). Off removes the field layers entirely (`display: none`), so nothing drifts behind the app and the GPU has less to draw. Missing means Full.
- **Workout opens in: Last used / List / Focus** (Settings → Training, `settings.workoutView`). Last used is the old behaviour and the default: the view you left is remembered on this phone. List or Focus always opens that view; switching inside a workout still works.

## Alive, step 1: a set lands, an exercise settles (13 Oct 2026, v0.1.45)

Omar asked for the app to feel more alive where it wows him. The tick already filled, drew its check, rang and rolled the
totals; two moments were missing.
- **A set ticked**: a soft ellipse of the accent light ripples out from the check across the row (0.9 s) and leaves the row's
  done tint behind. Clipped to the row and painted under its numbers; transform and opacity only.
- **An exercise's last set ticked**: one slow band of warm light passes over the card (1.25 s), beside the badge that pops in
  by the name. Only when it becomes complete while you watch, never when drawn complete or when a set is unticked.
- Cost: a full-card glow layer (opacity over the card) cost visible frames on the 4× CPU bench, so it was dropped; the band
  is laid over the card (outside its frosted glass) and only it moves. Main-thread time is unchanged.

## Alive, step 2: a new best (13 Oct 2026, v0.1.46)

When a ticked set beats everything before it for that exercise (`newBest` in lib/workout.ts: heavier than ever, or more
reps than ever at this weight or heavier; for holds and distance, longer or further), the row gets the bigger moment:
- a soft gold band of light sweeps the row from the check to the set number (1.4 s), instead of the tick's ripple;
- a gold "New best" tag rises in over the Prev column (what you beat), holds about 2 s, and fades back to the old number;
- the record haptic plays (the same feel as saving a workout with a record).
The first time an exercise is ever logged is a baseline, not a best; a best already ticked earlier in the same workout is
not celebrated twice; a new best replaces the smaller gold "beat last time" pop. Tests: tests/newbest.test.ts. Enter on
the reps field now plays the tick's animation too (it used to tick silently).

## Alive, step 3: the finish screen (13 Oct 2026, v0.1.47)

The workout summary now has a rhythm: the four numbers (time, volume, sets, exercises) land one after another, 0.32 s
apart, and each counts up from zero as it lands (`CountUp` in Summary.tsx writes its own text, so no re-render per frame).
Then one line, in the existing italic title style, says what the session meant (`sessionHeadline` in lib/workout.ts, tested
in tests/headline.test.ts): a record first ("Strongest Bench Press yet", "Most reps yet on…", "Longest… yet"), else the
biggest session of this routine (needs two before it), else "{x} more than last {name}", else "Workout {n} this month" /
"First workout this month". The record medal, its label and the record rows now wait for that line. Reduced motion shows
the final numbers at once.

## Alive, step 4: the workout's living light (13 Oct 2026, v0.1.48)

During a workout the window's top light breathes very slowly (one breath ~11 s) and turns warmer over the first hour
(`Breath` in Active.tsx sets `--warm` once a minute; a warmer gradient fades in under it). Cost rules it follows: only
opacity changes, in 80 tiny steps each way (~14 a second, each under half a percent of brightness) instead of every frame
(idle trace: DrawFrame 3 → ~25 per 3 s; nothing on the main thread); it sits in the top half, far from the frosted bar,
so the bar never re-blurs; it holds still while the workout is paused, minimised, or covered by another screen. It lives
inside the colour field, so Settings → Background glow Off removes it and Soft dims it; reduced motion stops it.

## Coach answers flow in like iOS (13 Oct 2026, v0.1.50)

Omar's recording (v0.1.43+) showed answers arriving in blurry clumps as the network delivered them, the list stepping
and restarting its glide on every clump, the newest line dipping under the bar, a blinking red cursor, and the play button
popping in at the end and shoving the list. Now:
- Words are shown at a steady pace decoupled from the network (`useWordReveal` in ui/agentUi.tsx, pure parts in
  lib/reveal.ts, tested in tests/reveal.test.ts): the pace follows what is waiting (backlog / 0.9 s, 6–70 words/s, eased),
  so it keeps up with the stream without running dry between clumps; once everything has arrived it finishes at ≥24 words/s.
  A bold phrase is bold from its first word and a "- " is a bullet from its first word, so nothing restyles mid-answer.
- Each word fades up (opacity + 0.3em rise, the same 760 ms curve); the animated blur is gone (it was also the orb
  screen's word animation, which gets the same change). No cursor.
- The list follows on one continuous critically damped spring (`translate` on `.coach-thread`, ~0.5 s, starts from rest):
  a new line adds to the motion instead of restarting it; a finger on the list mid-glide hands the rest to the scroll.
  Filmed at 4x CPU throttle: list jolts > 4 px per frame 13 → 0; newest word never under the bar (was up to 7 px under).
- The play button's row is held open from the first word, and the button (and the quiet note) fade in there.
- `Words` is memoised, so only the growing piece re-renders per word.

## No flicker as a page lands (13 Oct 2026, v0.1.51)

Omar saw one flicker at the end of every Settings page, tab switch and pop-up. His 120 fps recordings show it exactly: a
whole card (Progress) or a block of messages (Coach) vanishes for ONE frame right as the motion ends. Cause: while a block
animates, Chrome draws it on its own GPU layer; when the animation ends (fill "backwards", or Motion cancelling its
animation) that layer is thrown away and the block is redrawn into the page — and on the phone that redraw lands a frame
late. Measured with a layer probe (Chrome's LayerTree): 200 such hand-backs of on-screen elements over 4 tab switches,
4 Settings pages and a pop-up; now 5 (a scroller changing mid-slide, the tapped gear under the dim). The motion is unchanged.
- Entrance animations (cards rising in, Settings rows, in-sheet pages, sheet fade-in, chart bars, the weight trend) fill
  `both` and have no end keyframe, so the finished animation — and its layer — stays, and its end is the element's own style
  (presses, springs and Motion still work on top; a finished animation WITH an end keyframe would override them, the old
  "pages froze" bug). In-sheet pages get `.page-risen` after 1.2 s instead of losing `.page-rise`.
- Things moved by script keep one layer for good (`will-change`): tab pages, Settings pages and title, sheet panes and pages,
  sheet header buttons, the dock's tabs, icons, labels and orb slot, the colour field, and the page (`.stage`).
- The page behind a pop-up no longer switches a rounded clip on and off (that rebuilt the whole page's layer as a pop-up
  opened and again as it finished closing): its corners are four small pieces in the shell's colour, scaled 0 → 1
  (`.stage-corner`, `useStageDepth`). Same 28 px corners.
Checked against the live build: same idle redraws, frame times within run-to-run noise, screenshots match, presses work.
Not covered: the Coach's word-by-word reply animation (owned by the Coach thread).

## The orb screen's answers flow in too (13 Oct 2026, v0.1.52)

The orb screen's answer now uses the Coach's steady reveal (`OrbReply` in Voice.tsx over `useWordReveal`): words come in
one after another at a calm pace whatever the network does, and play / Continue in Coach / the cards / the typing field
wait for the last word, so nothing under the answer is pushed down while it writes. The screen follows each new line.
No word on the orb screen animates a blur any more: your spoken words write in with opacity and a small rise
(`saidWrite`), and the live text and the exchange leave with a fade and rise (their exit blur is gone). The unused red
writing cursor's style is deleted.

## Focus view: no empty card while paging, and a calmer workout bar (13 Oct 2026, v0.1.55)

- **Empty card:** a page that was not built yet showed only its title (a stand-in). Pages were built one step ahead after a
  pause and *dropped again* when you moved on, so a quick flick, or a swipe soon after opening, landed on the stand-in.
  Now (`Focus.tsx`) pages are built in the background, nearest first, one at a time and only while nothing is moving, and
  once built they stay. If a finger brings an unbuilt page in anyway, it is built at once. Measured at 4x CPU throttle,
  10 quick swipes right after opening: stand-in on screen in 36 of 117 frames before, 0 of 109 after.
- **Workout bar** (`WorkoutBar`, `.wk-bar*`): the frosted glass is now its own layer (`.wk-bar-surface`) beside the words,
  the fill and the orb button, not the element they sit inside. Rest over reads "Rest over · Set 2" (small) over
  "Lat Pulldown  55 kg × 8" (big). The fill is one flat accent tint with a soft leading edge (the gradient read muddy).
  The orb has a soft accent bloom behind it. "Rest over" swells a ring once and settles to a faint one: opacity only.
  The darker square around the orb was seen on the phone only; it could not be reproduced headless, so the layer split is
  the fix to check on the phone.
## No more animated blur on Onboarding and Food (13 Oct 2026, v0.1.54)

The Onboarding step change and the Food page's date title animated a blur as they changed. Both now move with opacity and
the same small slide only, on the same timing (0.22 s and 0.34 s), per the rule that blur never animates.

## Soft focus, done the cheap way (13 Oct 2026, v0.1.57)

Omar wanted the blur-in back (13 Oct), polished and the same everywhere, without breaking "never animate the blur". Text
that writes itself in now arrives out of soft focus: over the sharp text sits a still, soft copy of it (`.soft::after`, a
text-shadow glow of the glyphs with no fill, painted once), which fades in and away while the sharp text fades up
(`softGlow` / `softSharp` in styles.css). Only opacity (and each word's small rise) animates; nothing is re-blurred per
frame (traced at 4x CPU: raster time within ~8% of no blur at all). It takes each element's delay and length, so the
calm timing is unchanged. Used by Coach and orb answers (`Words`), your spoken words on the orb screen (`.sw`), the Food
date title and the Onboarding titles (`SoftText`). Photo logging's soft photo is a still blurred copy cross-faded in.

## Small fixes: one row per product, "In this workout", Danish (13 Oct 2026, v0.1.58)

Food search no longer lists the same product twice (online rows that would read exactly like one already shown, same
name, brand, kcal and unit, are left out; "Cheasy vaniljeskyr" showed Cheasy Skyr Vanilje twice). The exercise page
says "In this workout" in place of "Add to current workout" when the exercise is already in the running workout. The
last five missing Danish strings are in (voice styles and "Tap a voice to hear it.").
## Polish pass, step A: food logging without rough edges (13 Oct 2026, v0.1.59)

Found with a new audit (`scripts/audit-polish.mjs` + `scripts/pop-probe.mjs`): it walks the app at 4x CPU slowdown and
lists everything that pops in, vanishes, jumps or changes a number without rolling; `scripts/film-act.mjs` films one
action frame by frame to confirm it.
- **Food search**: as you type, the list filters like iOS search. Rows that still match stay where they land and new ones
  fade in. Before, rows glided to their new places while the old ones faded out, so for a few frames their texts slid
  through each other. "Searching Open Food Facts and USDA…" fades in and out instead of popping.
- **Deleting a logged food**: the sheet keeps showing the entry while it slides away (it switched to the "add food" layout
  for a moment on its way out).
- **Food totals roll**: protein, carbs and fat under the ring, and the week's average, roll to their new values like the
  calories do.

## Polish pass, step B: pages that hand over, a page that sat 24 px left (13 Oct 2026, v0.1.60)

- **Train's Plan / Library / History and Food's days**: the part being left now fades out where it stands while the new one
  rises in (`Subpage`). It used to vanish at once, leaving a moment of empty background. Opacity only.
- **Train and Food sat 24 px to the left** after their first visit (cards cut at the left edge, a wider gap on the right):
  while the new page slid in, something scrolled the page holder sideways and it stayed scrolled. The holder now clips
  (`overflow: clip`), which can't be scrolled at all.
- **Today's water count rolls** to its new value, and its button keeps its width, so the buttons next to it no longer shift.
- **Workout header**: the rest time that joins the clock while you type fades in instead of popping.

## Polish pass, step C: an exercise unfolds into the workout (13 Oct 2026, v0.1.61)

- In the workout list, an exercise that joins after the list is built (added from the picker, or brought back with Undo
  after removing it) now unfolds into place and the exercises below make room smoothly, the same way a removed one already
  folded away. It used to appear at full size in one frame and push everything below down at once. The exercises built
  while the workout opens are unchanged.
- Known, left as is: when you move an exercise up or down, the two cards glide past each other and their text overlaps
  for a few frames (the cards are see-through).

## Soft focus that looks like a real focus pull (13 Oct 2026, v0.1.62)

On the phone the v0.1.57 blur-in "looked very fake" (Omar, 13 Oct, two recordings). Frame by frame, each new word arrived
as a bright, bold smudge (the glow was two text-shadows at 85%, about twice the light of the text) and then sat as a sharp
word with a halo round it until 82% of its time. Now each word passes through two still copies, a wide blur
(`.soft::before`, .42em) and a slight one (`.soft::after`, .16em), and then the sharp text (`softFar` / `softNear` /
`softSharp`). The curves come from a real blur that eases off while the word's light eases in, and were checked frame by
frame against `filter: blur` of the same word: a text-shadow carries the same light as the text, so each copy looks like
the word blurred, never bolder; the hand-overs carry a little extra (power .75) so the word never dims between steps. The
blur is gone at 60% of the word's time and nothing glows round a sharp word. Still opacity only; smoothness at 4x CPU
unchanged. Same everywhere text writes in (Coach and orb answers, spoken words, Food date, Onboarding titles).

## Detail pass 1: wording and inputs (13 Oct 2026, v0.1.64)

- Singular wording: "1 uge i træk" (it said "1 uger"), and "1 item / entry / set / answer / record / thing" in toasts, buttons and
  lists that used the plural for one (English and Danish).
- Timed and distance exercises (Plank, runs) no longer offer "+ Warm-up"; a warm-up set made no sense there.
- Number fields (`NumInput`): one decimal separator only ("1.2.3" is now "1.23"), at most 2 decimals, at most 6 digits. A typo
  like 99999999 kcal can no longer break the totals and rings.

## Polish pass, round 2: moving an exercise, the first food of the day (13 Oct 2026, v0.1.63)

- Moving an exercise up or down (••• menu): the card you moved now passes over the one it swaps with on a solid backing
  with a soft lift (`.flip-lead`, set by `flip.ts`'s `lead`), so their texts no longer show through each other's glass.
  The backing fades as the card lands. Found on the way: since v0.1.61 every card below the two also slid by the height
  difference, because a moved row met `@starting-style` again; `Collapse` now keeps `appear` only for its first growth.
- The first food of a day: "Nothing logged yet" used to turn into the meal cards at once, hidden under the closing add
  sheet. Now it waits until the sheet has gone, the empty card fades out, the meals rise in and the water and week cards
  below glide to their new place. Removing the last food goes back the same way. Another day still shows at once.

## Detail pass 2: charts and signed numbers (13 Oct 2026, v0.1.65)

- "Sessions per week" counts whole sessions, so its axis now only shows whole numbers. A new user (target 1 a week) saw
  "1 · 1 · 0" because the middle tick was 0.5; `BarChart` has a `whole` flag for count charts.
- A change that rounds to nothing reads "0", not "−0 kg" or "+0 kg/wk" (`fmtSigned` in `lib/units.ts`, used by Progress,
  Today's week review and the measurements list).

## Coach: the conversation stays above the typing bar (13 Oct 2026, v0.1.66)

Omar's 08:37 recordings: whenever the keyboard came or went, the list jumped, the bar sat over the last lines, and after
sending, the dots and the answer wrote themselves in *under* the bar.

- **Cause**: the list's "follow the end" flag was cleared by any scroll, including the list's own. Sending from the keyboard
  dropped it, the list moved down with it, that read as "you scrolled up", and the list stopped following.
- **Now** (`Coach.tsx`): `pinned` changes only by your finger (touch or wheel, until its fling ends). Pinned, the list rests
  at `endTop()`: its last line just above the bar, wherever the keyboard is (the sheet's `--kb-room` minus the part the
  keyboard has covered so far). It rides the keyboard 1:1 both ways, and growth still glides on the same spring. The sheet's
  own smooth scroll-back is skipped for this list (`data-kb-own` in `Sheet.tsx`), so two scrolls never fight.
- **Sending from the keyboard**: the send button no longer takes the focus. The message flies up while the keyboard stays,
  and the keyboard leaves just before it lands (the list rides down with it). Same end state as before, one thing at a time.
  The keyboard's action key reads Send.
- **Typing dots** come a beat after the message has risen (they used to appear under the bar while the list made room) and
  grow out of their corner; when the first word comes they melt away over it instead of being swapped out.
- The flying message's glass gathers sooner (no bare text mid-flight). Recording shows "Listening…" (it was cut off).
- Checked with a simulated keyboard at 4× CPU (`kb-probe`): the last line stays 28 px above the bar in every frame of
  open/close; before, after a send it sat up to 520 px under it. Main-thread time while the keyboard moves is unchanged.

## Coach: a calm "New chat", answers that read like a page (13 Oct 2026, v0.1.67)

- **New chat**: the old conversation used to flash back for a frame after fading out (the fade was let go before the
  messages left the page; now it is let go in a layout effect once they are gone). The suggestions then rise in one after
  another (they used to pop in together), the "AI can be wrong" note fades in after them, and the "New chat" button fades
  out instead of blinking away (it fades back with the first message).
- **Reading**: paragraphs and bullet points come from classes now (`.rich-p`, `.rich-li`) instead of inline margins. In the
  Coach a paragraph break is 12 px, a list sits 10 px apart from the sentence before and after it. The orb screen keeps 8/4.
- **Play button**: under each Coach answer it is a quiet glyph, lined up with the text, instead of a filled circle (a column
  of circles down the chat read as noise). It keeps its 32 px tap area and gets its colour and ring while it reads aloud.

## Polish pass, round 2: Settings pages, onboarding buttons, Progress numbers (13 Oct 2026, v0.1.68)

- Settings: going into a page (Targets, Training, Look…) used to make the close × vanish in one frame and the Back arrow
  grow from nothing, which pushed the title sideways every frame. Now × fades out, Back fades in where it will sit, and
  only the titles move (on their own transforms). Going back, "Settings" is no longer cut off at the left edge while it
  slides in (`.sheet-head .display.trunc` clips a little past its box).
- Onboarding: the Back button used to appear in one frame on the second step (squeezing Continue at once) and Skip to
  vanish on the last one. Now Back and Skip fade, and Continue / Start glides to its new width (Motion layout on wrappers,
  transforms only, so the buttons' own press still works).
- Progress: changing the range (4 weeks, 12 weeks…) now rolls the numbers that change with it: weight change and trend
  rate, average calories, days logged, protein and its % of target.
- Audited with `scripts/audit-polish2.mjs` (onboarding step by step, Progress, every Settings page, the Look page's
  toggles, finish and summary; dark and light). The workout sheet's own findings went to the thread that now owns it.

## Workout sheet, no flicker and no pops (13 Oct 2026, v0.1.69)

Omar: the workout pop-up has "a lot of bugs and a lot of flickers". `scripts/audit-workout.mjs` drives every action of the
live workout (tick, rest, ±15, skip, sets, menus, move, remove, undo, picker, Focus, minimise from each tab, reload, finish)
at 4× CPU with touches and lists per action what popped, jumped and which on-screen layers were dropped (the v0.1.51
flicker fingerprint). `--film a,b` films chosen actions, `--light` for the light theme. Drops went from ~500 to ~140.
- The same rule as v0.1.51, applied to the sheet: its entrance animations fill `both` (bar words, the list fading back from
  Focus, the finish sheet's numbers, an exercise arriving, the check's pop); the progress bar, the dot pill and the rest
  buttons keep their layer; a rolled digit holds its end (the rest timer rolled a digit every second and dropped it).
- The window's top rim (`.wk-sheet::after`) is only a strip at the top now: it covered the whole window, so anything
  animating under it gave it a layer and took it away again, once a second during a rest.
- The bar's words cross-fade as one unit (`SwapText`): the old words used to vanish at once, the bar stood empty a frame.
- `useNow` gives the real time on the first frame after it switches on: a rest started at "1:35" and rolled down to 1:30,
  and the clock showed a stale time for a moment when the workout reopened.
- Finish and Discard: the window slides down like any closing, drawn from the workout as it was (`WkFrozen`, WorkoutHost),
  instead of vanishing with its sheet in one frame. Its own saved copy is kept out of "last time" while it leaves.
- Remove an exercise in Focus: a still copy of its page fades while the next page rises in (it was swapped in one frame).
- v0.1.70: the Focus pager keeps its layer (it got one for each page turn and lost it as the page landed, a flicker over
  the page), and so does the Focus view itself; the dots and stage hold the end of their rise until the next switch.
  Drops over the audit run ~140 → ~116. Tried and left out: building Focus ahead, hidden, to cut the short pause before it
  moves at 4× CPU (no clear gain in films or `perf-app.mjs`, and every tick re-drew the hidden pages). `scripts/film-workout.mjs`
  films the sheet's main moves (start, tick, to/from Focus, page turns, minimise, resume).
- v0.1.71, from Omar's recording (typing a weight in Focus: "this looks very bad"):
  - The window's header slid up under the top edge while the keyboard was up, and jumped back when the window closed. The
    bar stepping out of the way (a transform) made the window 88 px taller than itself, `overflow: hidden` left it
    scrollable by the browser, and Chrome scrolled it to show the field. `.wk-sheet` is `overflow: clip` now (it can't be
    scrolled at all), and `watchFocus` glides the field into the room above the keyboard (the list or Focus's page scrolls).
  - The bar no longer drops out of sight before a pop-up or the keyboard rises: it stays, and the sheet or keyboard covers
    it in one motion, as a tab bar on iOS. The header shows a running rest while the keyboard (not merely a focused field) is up.
  - An empty field's "—" hides while you type in it (with the cursor it read as a "+").
  - Lighter: the orb no longer re-measures the page for changes inside the workout window (only the bar's box can move its
    slot); Focus's figures are measured together, then scaled (each one used to lay the page out again); the rest sound is
    made ahead, when the phone is idle, not by the first tick. `scripts/perf-workout.mjs` measures the window's moments at 4×.
- v0.1.77, from Omar's two recordings and two screenshots ("the keyboard scrolls too slow… it flickers a lot"):
  - Typing: the field you tap rides up WITH the keyboard (`rideFocus`, keyboard.ts): the list's scroll follows the
    keyboard's own eased height (`kb`) frame by frame, starts and stops with it, and goes only as far as needed (the field
    ends ~84 px above the keyboard, so the next row shows). It used to move twice: a `scrollIntoView` 0.28 s after the tap,
    then a second smooth scroll once the keyboard had settled. With the keyboard already up (the next field) it slides on
    the keyboard's spring. A finger on the list takes over.
  - Rest over: the orb sat in a square of a different shade (Chrome on the phone draws the orb's square canvas area
    differently over the lit fill). The fill now fades out before the orb in "Rest over" too, as during the rest, and the
    fade is a background gradient, not a mask. The words stop 8 px earlier, clear of the orb's glow.
  - Opening and closing, the orb no longer hovers over the window's sets. It stays in the dock, drawn under the window,
    so the window's edge covers it like the rest of the page; then (unseen) it moves to the bar and comes up with it.
    Closing is the reverse. (`tuck`, `tucks`, `tuckedUnder` in Sphere.tsx; only the workout's window, the one sliding popup.)
  - Blank patches while minimising (header words and rows gone for a few frames, a dark wedge on the page): the phone's
    graphics memory and drawing ran short. Inside the window the colour field no longer has a layer of its own (it never
    moves there): ~11 % less tile memory with the window open. The bigger cause is outside it: the status-bar tint written
    on `.fields` every frame redraws the full-screen grain layer each frame (72-96 tiles per minimise, 16 when frozen),
    handed to the page-behind work.
- v0.1.83, from an independent check of the v0.1.77 proof:
  - Rest over: the bar's round end by the orb is the same colour as the rest. The moving fill fades out before the orb
    (that fade read as a dark crescent beside it); in "Rest over" one even tint (`.wk-bar-clip::before`) takes over.
  - A long exercise name ends in a clean "…" (`Fit`), never "Press, …".
  - Minimising: the orb waits in the dock UNDER the window, so the window's edge uncovers it with the rest of the dock (it
    used to appear all at once, on top, as the edge passed). The orb's tuck checks no longer read `window.innerHeight`
    (a forced style pass on every frame of the slide; `viewportH` instead).
  - The orb's glow behind it has a layer of its own for good: each fade made one and dropped it at the end (10 of the
    workout audit's layer drops).
  - Tap to motion: Chrome doesn't paint a page at opacity 0, so minimising had to paint the whole page behind before the
    window's first frame. A finger on Minimise now draws it again, unseen (`warmStage`): at 4x CPU the first frame came
    ~90 ms after the tap, now 50-70. Opening no longer re-renders the whole window a second time inside the tap (the
    "shown" state is a yielding render): 95-150 ms → 75-130.
  - Keyboard: proven at 120 fps (virtual time, 1/120 s steps, the keyboard drawn from the app's own curve, which matches
    Android's 285 ms IME curve within 3 %): the tapped field moves every frame with the keyboard, start to end.
- v0.1.84, from Omar's "the orb doesn't have seamless animations on some pop-ups": every orb move was checked frame by
  frame against v0.1.72 (Settings, Coach, voice, rest start/panel/end, picker, workout open/minimise/resume). One had
  broken: the Coach. The v0.1.77 tuck (orb waits under a rising window) was meant for the live workout only, but it ran
  for the Coach too; the Coach's sheet rests lower, so the orb left the dock ~120 px early and popped (up to 573 px in one
  frame) instead of gliding to the mic. The tuck is now for the workout window only (`tucks` in Sphere.tsx).
- v0.1.85, same report: the live workout's orb glides again too. Opening and minimising, the v0.1.77 tuck hid it under the
  window and brought it back at the other end (it vanished, then popped up in the dock or the bar). Gone: the orb glides
  along the bottom between the bar and the dock, on top, as in v0.1.72 (its browser-run path checked keyframe by keyframe:
  identical to v0.1.72's).
- v0.1.86, "a mismatch under it": the orb now lands exactly on its place everywhere (checked on all 16 orb moves).
  - In the workout's bar it sat 3.5 px high, off-centre on its button, and hopped up by that much as each opening
    ended (the browser-run flight lands exactly; the script's soft hand-over from the dock then held it high). Since the
    page behind sinks back from its middle (v0.1.76), the dock sits lower, which is what made the hand-over count. The
    hand-over now lets go as the orb arrives (`carry`).
  - In the dock it sat 2 px left of the middle of its place (the place is 68 x 64; the orb went to its left edge). It is
    centred now, in every place that isn't square.
- v0.1.91, smoother minimise and resume (measured at 4x CPU, 3 runs each, before → after):
  - Minimising: main-thread long tasks 420 → 285 ms in total, script and layout 439 → 351 ms. Resuming: script and layout
    404 → 342 ms. The orb re-measured its whole path on every frame the page behind sank back or came forward
    (`.stage-content` was missing from the orb's list of moving surfaces).
  - The bar's name (`Fit`) no longer lays the window out itself: it reads its room right after the browser's own layout
    and measures the shorter tries off the page (it forced one full layout per try, about 100 ms at 4x as the window opened).
  - The rest-over sound is made once the whole list has arrived, not while it is still arriving.
- v0.1.93, "the window opens a beat late" (resume, at 4x CPU, 4 runs each, main → this):
  - Long tasks while it opens: two every time (60-130 ms each) → none. Finger down → first moving frame: ~143 → ~122 ms
    (1x: about 30 ms, a couple of frames at 120 Hz, of which the finger's own press is part).
  - It starts moving in the tap itself: the minimised window (kept, parked off-screen) registers itself
    (`ui/workoutOpen.ts`); a tap on the resume bar or button sets its slide going on the compositor first, and only after
    that frame is the app told (re-rendering the page behind, the dock and the window), as closing already did.
  - The "calm" flag (pauses the colour field behind any pop-up) is written on the shell directly, not as React state: each
    pop-up opening re-rendered the whole app twice for it, once inside the tap and once two frames into the motion.
  - The calm rule names the one thing on a page that still blurs (`.screen .seg`) instead of `.screen *`: switching it
    restyled every element of the page (~900, 55 ms at 4x), two frames into EVERY pop-up's motion.
- v0.1.94, Start moves on the tap like Resume (first Start of the day, at 4x CPU, 3 runs each, before → after):
  - Finger down → first moving frame: 257-342 → 127-137 ms (Resume is 97-150). The 160-230 ms task that built the window
    inside the tap is gone; what is left (the list's first exercises) runs while the window is already moving on the
    compositor.
  - How: once the app has settled (a couple of seconds in, no touch for 1.5 s, then the next idle moment), the
    window is built ahead and parked off-screen exactly as a minimised one, holding an empty stand-in (`WK_GHOST`). Start
    sets its slide going first; the workout is made and the app told after that frame, and the started workout takes the
    same window over (its list comes in as on any first opening). After a workout ends it is built again the same way.
  - Cost: launch unchanged (Start on screen ~1.2-1.4 s at 4x either way, same long tasks); the build itself is 50-130 ms
    at 4x, in pieces, ~2.5 s after launch; +0.3 MB JS heap, +52 elements. Also covers reopening the app mid-workout: the
    first Resume no longer builds the window either.

## Android app: the rest as a live countdown, new icon, calmer opening (13 Oct 2026, v0.1.72)
Omar's phone showed the website's plain notice ("Back at 10:02", the site's address) instead of the app's countdown.
- Why: Chrome gives a site's notifications to an installed web app (his old home-screen icon) before the Android app,
  even when the page runs inside the Android app. So the app never saw them.
- Fix: with the Android app on the phone (`src/lib/androidApp.ts`; noted once the site is opened inside it), the rest
  goes out from a tiny second service worker at `/The-new-Claude-gym-app-rest/`, published on the user site
  (`omaralawi1000-netizen.github.io`; source in `android/site/`). That's outside the old web app's scope, so Chrome
  always hands it to the Android app. The words travel in the notification's tag (never shown) and the end time in its
  timestamp. Without the app, everything is as before.
- The app draws its own notification (`RestNotifications.java`):
  - the exercise in the header;
  - the time left in big numbers (30 sp folded, 44 sp unfolded), ticking each second;
  - "Set 2 of 3 · 60 kg × 8" and an ember bar draining;
  - +30 s / Skip;
  - at the end, one "Time for set 2" alert with sound and buzz, gone when you're back in Aven.
- How it keeps ticking: a short foreground service (special use), started through an exact alarm when Android won't
  let it start directly. It redraws only while the screen is on.
- Android 16 Live Updates: requested. When Android promotes it, its standard layout is used, because that's the only one
  it promotes. Everywhere else our own layout is used, since the standard one shows the title at normal size.
- Proven on the emulator through real Chrome: website → app countdown (light, dark, lock screen) → alert → cleared.
  `android/ci/emulator-check.sh`; the emulator runs with `-gpu swangle_indirect`, because SwiftShader died once Chrome
  drew the app.
- Icon (`scripts/gen-android-icon.mjs`):
  - the orb as even rings of dots, so the outline is a true circle and every dot reads at home-screen size;
  - plus a monochrome layer, so with themed icons it turns the phone's colours like his other apps.
- Opening:
  - the launch window is opaque ink, so Android opens the icon into it (no flat grey card);
  - on Android 12+, the same 100 dp orb is shown there as on Chrome's hand-off screen, so it stays put from the tap to
    the page.

## The whole page steps back as one card (13 Oct 2026, v0.1.73)
Omar's screenshot: as a pop-up opened, only the lower part of the page seemed to step back; the top (date, Coach and
Settings buttons) and the status bar sat in a band that didn't move, with no rounded corners, and the background flashed
at the edges.
- Cause: the page stepped back onto the status bar's own tint, the same colour the top of the page fades from, so the top
  of the card and its corners vanished into what was behind it.
- Now it steps back onto black, as on iOS, in light and dark: the shell turns black, the status bar goes black with it,
  and the black corner pieces (now 41 px, reading as 38 px on the 0.92 card: the pop-ups' own curve) show the rounded
  top. While the page has barely moved (the first and last quarter) the shell keeps the tint and the corners fade in with
  the black (`toBlack` in `ui/statusBar.ts`), so the hairline round a page that is almost home never flashes black.
- Same motion and timing; only the colours behind changed. Reduced motion: the bar only dims, as before.
  `scripts/film-depth.mjs [--light]` films the page stepping back for Settings, Coach, a food sheet and the workout.
- v0.1.74, from Omar's recording of v0.1.73 and a zoomed check:
  - The corners are round from the first frame (they fade in with the black instead of growing from nothing).
  - A faint square outline showed round each corner (on his phone too): the corners sat inside the page, whose clip cut
    them off exactly at its edge, and the page's half-covered edge pixels showed through theirs. They are now a layer
    beside the page (`.stage-edge`) on the same transform, reaching 3 px past its edge. The browser-run version of the
    step back (mirrorStage) moves it on the same spring and stops it with the page.
  - A faint light rim along the top of the card (as on the sheets), so in dark mode the rounded card reads against black.
- v0.1.75: Omar: "now that top layer is not seamless" — back to the v0.1.72 step-back exactly (page onto the status bar's
  tint, corners growing in, status bar dims). v0.1.73/74 reverted with no other changes; next: only the page's content
  sinks back, the background stays still.
- v0.1.76: behind a pop-up only the page's content sinks back (screen and dock together, `.stage-content`, to 95 % from the
  middle, under the dim). The background stays full-bleed and still, so there's no card edge, corner or colour behind to
  see, and the status bar is as before. The page used to step back as a whole card (v0.1.72 onto the status bar's tint,
  v0.1.73/74 onto black); Omar: "the top layer is not seamless … make it seem like it's moving backwards by moving all the
  icons at the same time". The corner pieces are gone.

## No grain repaint while a pop-up moves; the status bar dims in step (13 Oct 2026, v0.1.81)
- The status bar's tint used to be written as `--bar` on `.fields` on every frame of a pop-up, and `.fields` holds the
  full-screen grain, so the whole grain was repainted each frame (blank patches on the phone while a sheet moved). The
  tint now has its own small layer (`.fields-top`). Raster tiles while opening Settings ~175 → ~120, minimising the
  workout ~230 → ~138 (`scripts/paint-count.mjs`); layer drops unchanged (11).
- The status bar reached its full dim at 60 % of a pop-up's progress while the dim over the page grows all the way to
  100 %, so for most of the opening the bar was darker than the page under it: a band across the top. It now dims on
  the same 0 → 1 as the page.

## A pop-up over a pop-up: a small step back (13 Oct 2026)
- A pop-up opened from a pop-up (Food → Scan, Photo or Quick add, any sheet over a sheet): the one below steps back a
  little, to 96.5 % from its top edge, which rises 8 px, and dims. It goes by exactly the number its dim goes by (how
  much of the new sheet is in view), so the two start on the same frame and, on close, finish together the moment the
  new sheet has left the screen. The page behind the first pop-up keeps its recede (v0.1.76) and doesn't move again.
  The live workout is a full page and stays put under the exercise list (only the dim).
- How it got here. Omar first chose "the first pop-up doesn't move backwards … that's more minimal" (still and dim), then
  on seeing it: "I like that depth. I think it just needs a little refinement." Rounds 1 to 8 stacked them like iOS
  cards (shrank 7 %, peeked 10 px; branch backup/stacking-r7-before-no-stepback); live before this it shrank 6 % and rose
  15 px; both read as the card jumping back. The first take of this one landed while half the new sheet was still up (on
  a close it snapped back in four frames while the dim took thirteen) and rose only 4 px, which read as the border drawn
  twice. Its rise isn't rounded to whole pixels while it is scaled (a scaled card is a touch soft anyway; rounding made it
  hold and then tick half a pixel as it landed); it starts and ends on whole pixels, so at rest it is sharp.
- Every sheet's dim (over the page or over a sheet below) and the page's recede go by how much of the sheet is in view,
  so on close they are gone the moment it has left the screen (they lingered 4 frames over the page, about 15 over a
  sheet, while it finished its unseen last 40 px). A tall sheet opened over another takes the full height and covers it
  whole. The scanner's "Starting camera…" fades out before its picture fades in.
- Sheets move in whole screen pixels (`snapPx`; the browser-run version gets a keyframe per frame instead of an easing):
  one drawn between two screen pixels is a touch soft, so a glide that crept its last 0.1 px came into focus a few frames
  after it looked still. They come to rest within 0.05 px, a screen pixel at a time, not with a last little hop (sheets
  only: the shared spring and the workout's own opening keep their end, which a finer one gave a 14-frame soft creep).
- The status bar takes the second dim too.
- The scanner's picture fades in once its first frame is on screen (it went black "Starting camera…", then an empty grey
  box, then the picture), and it waits for its video if the camera answers before the sheet's contents are in (it said
  "Couldn't start the camera").
- Films are now made with a steady camera (`scripts/film-steady.mjs`): Chrome draws each frame only when asked, exactly
  1/60 s of the app's time after the last, and it is pictured once fully drawn. The old screencast films dropped frames
  whenever this machine was slow to draw the glass, which read as jumps and stalls the app doesn't have.
  `scripts/film-depth.mjs` uses it, films the app at its size under the status bar and logs the bar's colour per frame,
  and closes pop-ups with their close button (Escape is a keyboard, and left a keyboard focus ring in the films).
  It films at the phone's 3.5 pixels per CSS px, and the app's clock (and the workout timer's) moves 1/60 s per frame.
  Each step starts from a still screen; a button that is out of view is scrolled to on camera, as a person would, easing
  in and out (Chrome's smooth scroll stopped dead). The page is told the film's real pixel density (it was told 2). The
  scanner sees a still picture (`scripts/fake-camera.py`) and the Photo sheet a stand-in key.

## Coach: lighter frames while an answer writes in (13 Oct 2026, v0.1.88)
- Measured with `scripts/audit-coach.mjs` (phone size, CPU slowed 4×, a fake keyboard and a mocked stream; per action:
  frames, long tasks, script/style/layout time, pops, jumps and GPU layers dropped; `TRACE=`/`PROFILE=` break one action
  down). Baseline v0.1.85 → v0.1.88 (4×, dark): opening the Coach worst task 548 → ~260 ms and style 883 → ~360 ms;
  an answer writing in paints ~3× less (2.1 s → ~0.6 s of main-thread paint over 5 s) and runs half the script per frame.
- A word that has come in now settles into a plain word: its two soft-focus copies (`.soft::before/::after`) and its own
  layer go once its coming-in is over (`Words`, `SETTLE`), and saved replies are plain from the start (`still`). A whole
  saved conversation of soft words made every frame repaint and re-layer hundreds of them. Nothing on screen changes:
  the copies are invisible by then.
- The orb no longer re-measures the page for every new word: inside a tall pop-up's list nothing can move an orb slot,
  and scrolling something with no slot in it moves none (`inTallList`, `noSlotIn` in `ui/Sphere.tsx`).
- The list's glide after a new line is handed to the browser as a ready-made spring curve (Web Animations on
  `translate`), so it runs at the screen's rate even while the page is busy writing the next words in; a new line picks
  the spring up where it is on screen. It used to be stepped from script every frame.
- Tapping a suggestion: the suggestions step away (200 ms fade and a 4 px lift, like New chat) instead of vanishing in one
  frame; they take no room while they go, so your message rises where they were. Same for the suggestions under an old
  chat.
- A message sent from the keyboard keeps to its landing place while the keyboard goes down: the list now tells it in the
  same frame (the scroll event came a frame late, so the flying copy trailed its bubble).

## Orb screen: the typing box fades away, nothing jumps as it closes (13 Oct 2026, v0.1.89)
- Sending what you typed: the box used to vanish in one frame. It now fades out where it was (200 ms; `popLayout`, so the
  words writing in above don't push it), with your words still in it, and the keyboard leaves at the same moment instead
  of a beat later. It fades back in when it returns.
- Closing with the keyboard up: the keyboard going down re-flowed the screen while it faded, and the answer jumped down
  mid-fade. While the screen leaves, its keyboard room is held (`useIsPresent`), so it fades out as it was.
- The answer's words settle into plain words (v0.1.88) here too. Measured with `scripts/audit-coach.mjs` (4×, dark):
  answer writing in, long tasks 9 → 2, style 482 → ~210 ms, layers dropped 68 → ~31; closing, layout shifts gone.
- Not changed: the orb still grows and shrinks by its box size (a layout transition) when typing starts or an answer
  arrives; the orb's renderer follows that box, and the screen is small (a few ms of layout per frame at 4×).
- v0.1.90: after New chat the suggestions still vanished at once when one was tapped: moved into their leaving layer,
  they ran their rise-in again (starting invisible). They now keep still and fade (300 ms, a softer curve).

## Coach and orb answers write in without dropped frames, same look (13 Oct 2026, v0.1.92)
- Found with style-invalidation tracing (`scripts/audit-coach.mjs`, new `INV=1`, `WHY=1`, `MUT=1`, `DROPS=0`):
  - `.app:has(.sheet, .voice, [role='dialog']) .aurora i` (pause the colour field under popups): with an attribute inside
    `:has()` the browser re-checked it on every element added anywhere in the app and restyled every `<i>` (and the pulse
    dots) each time, so every new word restyled ~24 unrelated elements. Now classes only: `.app:has(.sheet, .voice, .ovl)`,
    with `.ovl` on the two full-screen overlays that are not sheets (Onboarding, the progress photo viewer). Helps every
    screen, not only the Coach.
  - The orb's frame loop runs every frame, so the browser updates every running CSS animation on the main thread every
    frame (even ones the compositor plays). Each word had four: its rise on the word itself, plus its three soft-focus
    layers. A word animating made its three layers restyle from scratch every frame. The rise now rides on the three
    layers (same keyframes, same timing; `.soft-s` became inline-block so it can move), and the word itself is still.
    Checked pixel for pixel with `scripts/word-ramp.mjs` (the word set frozen at 20 moments, 0-760 ms): identical.
- Measured (4× CPU, dark, without the layer watcher): Coach answer writing in, style 812 → ~340 ms per 5 s, long tasks
  ~19 → 0; suggestion answer 739 → ~360 ms, 3 → 0; orb answer 0 long tasks.
- The audit's layer watcher (`LayerTree`/`DOM` CDP domains) itself costs main-thread time per new element; `DROPS=0`
  measures without it.

## Your sent message flies as one move (13 Oct 2026, v0.1.93)
Measured frame by frame with `scripts/probe-send.mjs` (keyboard up and down, short and long, first message of a new chat;
the fake keyboard now slides in 250 ms like a real one; positions are read after each frame is drawn):
- Keyboard going down mid-flight: the flying copy followed the scroll position only, but the list glides that move
  (`translate` on the thread), so for a couple of frames the copy ran 100+ px away from its bubble, then caught up and
  stepped 14 px onto it at landing. The copy now rides the same glide (same curve, same clock), and the list tells it
  whenever it moves, including when the browser moved it (the list grew). Copy and bubble now stay within 0.1-2 px.
- A glide still finishing when you send (an earlier answer's play row) put the landing place 3 px off: taken into account.
- Long messages: the field shows only the end of a long message, and the copy swooped in from off the left edge with
  lines hanging over the keyboard. It now leaves with its last line on the field's line (the rest above it), its end where
  the text ended, kept inside the field.
- Not changed: when you send from the keyboard, the keyboard still goes down as the message nearly lands and the list
  rides down with it (by design since earlier rounds).

## No more hard cut-off edges in the Coach and on the orb screen (13 Oct 2026, v0.1.94)
Swept with `scripts/shots-cutout.mjs` (AVEN_GPU=1; end, mid and top of a long chat, keyboard up, writing in, answered, new
chat, the orb screen open, typing, writing in, answered; light and dark):
- Coach, scrolled up: the list ran sharp right under the typing bar, so words passed under the orb and the camera and were
  sliced off by the field's edges. It now melts away just above the bar (gone by its middle); with the keyboard up, above
  the bar where it rides. At the end the melt slides down out of the way (it follows the list's end fade), so the last
  message and an answer writing in stay whole. This is the Coach only: other sheets' buttons still float with nothing behind
  (v0.1.8); the Coach's bar is a whole row, not one button.
- Orb screen: a long answer was cut in a straight line above the buttons; it now melts there while there is more below
  (`.fade-bottom`, scroll-driven like the top fade). The typing box's focus glow was clipped by the scrolling area into hard
  bands above and below it; the area has room round its content now.

## The Coach opens with less to build; the orb's glide to the mic starts clean (13 Oct 2026, v0.1.95)
- Measured the orb's moves frame by frame (`scripts/probe-orb.mjs`, read after each frame is drawn): dock to the Coach's
  mic, keyboard up and down, back to the dock, the orb screen opening, shrinking for typing, thinking, closing. Each path is
  one smooth move that lands exactly (0.0 px); none reverses or pushes twice. What broke the dock-to-mic glide was the
  stall at its start: opening the Coach built every word of the saved chat as its own two spans (~650 elements restyled in
  the tap).
- Saved answers that are not being read aloud are now plain text; the words become spans only while one is read aloud
  (each word lights up) or while an answer writes itself in. Line breaks are the same (checked side by side). Coach open
  at 4× CPU: worst task ~200-220 ms → ~105-140 ms.
- Not changed: the orb screen's orb still grows and shrinks by its box size: measured, it costs little layout on that small
  screen and its path is smooth.

## Aven glass: neutral buttons, chips and cards are glass with a warm edge of light (13 Oct 2026, v0.1.96)
- The see-through grey rounded surfaces (buttons, chips, round buttons, cards, the dock, a sheet's bottom button, set
  number tiles) now share one material, painted once and never animated:
  - a soft glow of the area's own colour falling from the top;
  - a faint sheen;
  - a crisp 1 px rim that is warm along the top and fades down the sides;
  - a gentle lift.
  Text fields became wells. No new blur.
- Kept quiet on purpose. In dark, the set tiles and "+ Set" keep only the rim, so the active set stays the loudest thing in
  its card. In light, only the active set's tile glows. Round buttons use the same 1 px rim (1.5 px was too loud); the
  dock keeps 1.5 px. In dark, the dock's active tab is warm, not cool grey.
- Switched on by `<html data-glass="v2">` in index.html. The rules sit behind that attribute so
  `scripts/glass-shots.mjs` can compare with and without it. Checks: `scripts/glass-audit.mjs` (no new blind blurs);
  `scripts/flicker-layers.mjs` shows the same 11 drops with and without it.

## The live workout is a full page, not a pop-up card (13 Oct 2026, v0.1.97)
Omar spends about 3 hours a day on the workout, so it should feel like a place, not a temporary pop-up. He saw a before/after
preview (seven judged rounds, `/mnt/project-files/workout-fullpage/`) and said yes.
- The open workout fills the screen: square top, no grabber, no rim line. The header sits 10 px under the status bar.
  Minimise (arrow, swipe down) and resume from the bar work as before, on the same spring.
- Nothing behind it steps back or dims. It slides up over the page as it is, with a soft shadow on its top edge that fades
  out over the last 30 % (`.wk-shade`, transform and opacity only). The page behind still stops being drawn once covered.
- The status bar is the top of the page. It takes the workout's warm tint (the mix every tab uses, from the Train hue) on
  exactly the frames the window's top passes under it, and the tab's tint back as it leaves. Only theme-color changes;
  nothing on the page is restyled. The window's top edge is that colour all along, then eases into its light behind the
  title (fast on the left), and slowly towards the darker far corner, so no edge shows.
- The window reaches 48 px above its top edge (`--wk-lead`): the spring's slow last pixels happen off screen, so no strip
  of the page lingers under the bar at the end of a slide.
- Smoothness at 4x CPU (`scripts/perf-open.mjs`): minimise and resume draw fewer late frames than the card did, start the same.
  Films: `scripts/film-fullpage.mjs` (steady camera, `scripts/film-steady.mjs`).

Fix (v0.1.99): at the end of a minimise the window's 48 px lead band and its full-strength shadow came to rest over the
tab bar for the spring's slow tail (a dark strip at the bottom of the screen). The window now travels the lead further
down, and its shadow fades out over the last 12 % of the way, so nothing lingers over the tab bar.

Fix (v0.1.100): the rows under the floating workout bar no longer run sharp into the bottom edge ("+ Set" showed
below the bar). The list and focus pages stay solid down to the middle of the bar, so its frost still has rows to show,
then dissolve to nothing at the screen edge.


## Coach: the messages stay put while the keyboard goes down after a send (13 Oct 2026, v0.1.98)
Omar's recording: he sent "Ok", the message flew up smoothly, then as the keyboard went down the last messages vanished and
popped back a moment later, which read as the whole list jumping.
- Cause: the soft melt above the typing bar (v0.1.94) was placed at the keyboard's full room the whole time the keyboard was
  moving. The bar rode down with the keyboard, but the melt stayed up, hiding everything between them (up to 339 px), and
  jumped back down only once the keyboard had landed. The same happened, briefly, on the way up.
- Now the Coach tells the list where the keyboard is each frame (`--kb-now`, set where the list already rides with the
  keyboard) and the melt sits on the bar all the way (0 px hidden in every frame, dark and light, at 4x CPU). The room the
  keyboard hasn't covered yet doesn't count as "scrolled up", so the melt keeps out of the last message's way on the way.
- `--melt` is now registered and not inherited: it changes as you scroll and is used only by the list's own mask, so it is
  no longer handed down to every word of the conversation.
- `scripts/probe-melt.mjs`: the melt against the bar, frame by frame, while the keyboard comes up and while a message is sent.
  Its fake keyboard reports its final height once, as Chrome on Android does.

## The rest bar's glass is one piece round the orb (13 Oct 2026, v0.1.101)
Omar's screenshot (Rest over, full-page workout): the orb sat in a lighter, bluer square with a hard left edge, the
size of the orb's canvas (54 px). Third report of it; the two earlier fixes (layer split, fill fading early) were blind.
- Why: the orb is redrawn on every frame, so the phone redraws only that square of the screen. The bar's frost inside it
  is blurred from the screen as it was, and round the square that is the finished bar (already frosted and tinted), so
  the square came out frosted and tinted twice. DevTools, emulator and desktop captures redraw the whole frame, so it
  never showed off the phone (also checked on a real X display: nothing).
- Fix: an invisible layer under the bar's frost (`.wk-bar-even`, 0.5 % black, its opacity swaying on the compositor)
  makes each frame's redraw cover the whole bar and the blur's reach round it, so the frost is always blurred from the
  page alone. Compositor only (no script, no new paint); it rests while the window is parked.

## Clean look with depth: the glass is off, cards float on neutral depth, no orange (13 Oct 2026, v0.1.102)

Omar, after six rounds of "lit glass": *"Why is it still orange? Just bring it back to before we made the 3D look and the
glass look. But add depth."* He said yes to this look from a before/after picture.

- **Aven glass is off.** `index.html` no longer sets `data-glass="v2"`, so every rule behind `:root[data-glass='v2']` in
  `styles.css` is dormant (put the attribute back to compare; `scripts/glass-shots.mjs` still does). The lit-glass rounds
  (two-tone tab icons, tinted field, ring bloom) never shipped; they are on the branch `backup/glass-take6g`.
- **Ember's colour field is cool and quiet**: violet, slate and lavender at strength .15 (soft .08) instead of coral,
  magenta and amber at .55. That was most of the orange: the see-through cards took the field's colour. Other palettes keep
  their own fields; buttons and the active tab keep Ember's colours.
- **Dark cards on the tab screens are their own surface**, opaque charcoal one step lighter than the page, with a faint
  white top edge and a soft, deep, neutral shadow, so they float the way light cards do. All the same, nothing tinted.
  The Coach's pinned note is the same surface (coral only on its mark).
- **Light cards are clean white** (94 %) on their original shadows.
- No colour washes on cards: the coral bloom inside Today's workout card is hidden; today in the week strip is a neutral
  lift with coral letters (both modes); the play buttons' glow is tight in dark so it never bleeds onto a card.
- Paint only: no blur, no new layers, nothing animated (layer check TOTAL 11, as before).

## Clean look with depth undone: Aven glass is back (13 Oct 2026, v0.1.104)

Omar on v0.1.102/103 (teal palette): flat grey cards and a muddy blur under the tab bar; "I want this design back", pointing
at the glass round 5 "now" column (warm Ember field, glassy round buttons, frosted dock). PR #117 is reverted on its own:
Ember's field is warm again, the cards are see-through again, the week-strip `week-today` class is gone, and the glass is
switched off too (`data-glass` removed from index.html; the CSS stays dormant): his picture was the pre-glass app, and the
glass tint resolved to Ember coral in other palettes (brown cards and a peach dock rim in teal). Everything shipped after it (v0.1.103's pop-up step-back and the camera fix) stays.
Lesson: an opaque neutral card loses the glass Omar liked; "depth" has to come from the glass itself, not a solid block.

## Coach: answers fade in without blur, the list ends cleanly above the bar (13 Oct 2026, evening)
Omar on the phone (v0.1.103): "the coach is a mess… the text spits out, it's still laggy… just do it without the blur,
there was a version where you did it without the blur, it came out smooth". He asked for it, so the blur-in goes.
- **Answers (Coach and orb) write in without blur**, the v0.1.56 way he remembers: each word fades up 0.3 em into place
  (`.w-in`: `wordLight` + `wordCalm`), its light coming in a touch slower than the rise so no word pops in bright. One
  layer per word instead of the soft focus's three (`.soft::before/::after`), opacity and transform only, and it settles
  to plain text once in, as before. Your own spoken words on the orb screen, the Food date and the Onboarding titles keep
  their soft focus (not answers).
- **A calmer pace**: at most 45 words a second (was 70). A big clump from the stream used to pour out a line every
  150 ms, which read as text being spat out.
- **The list ends above the bar** ("the text bar on its own", Omar 22:07): the conversation fades out before the bar's top
  edge, so no text ever shows between or behind the orb, the camera or the field. At rest the last message sits 30 px
  above the bar. It rides with the keyboard (`--kb-now`, v0.1.98).
- **Each control on its own frosted glass** (Omar 22:10: "the text bar… the orb and the camera… its own circle that looks
  3D"): the field is a frosted pill, the camera a round frosted button, the orb rests in a frosted seat the field's
  height (`.frost-ctl` / `.frost-seat`, shared, `--fc-*` tokens): neutral glass, a light top edge, a fine rim, a soft
  shadow and a faint sheen on the top half. One small blur per control, never animated.
- **Soft-edge bar** (Omar picked it): behind the controls only a plain fade, no blur (each control has its own, so nothing
  is blurred twice): a neutral grey (rgb 21 22 28) easing in over 64 px to 35 % (`.edge-fade`, shared; `.edge-fade.frosted`
  adds a blur where a bar has no frosted controls; light: the sheet's pale colour at 40 %).
- **The pill opens while you type** (Omar 22:19, "expands when I type and compresses when I'm done, like iOS"): on focus
  the camera tucks back and fades, and a beat later (60 ms, so the keyboard's lift doesn't hide it) the pill's left edge
  glides over its place with a visible overshoot (about 5 px, `apple(0.62, 0.4)`); when the keyboard goes it glides back
  and the camera fades in from 0.9 only once the edge has mostly passed it.
- **It grows as you write**: an auto-growing field, a line at a time up to four lines, then the words scroll inside
  (`apple(0.5, 0.25)`); the end of the conversation rises with it. Moves only: the tint and rim are six solid pieces in
  one see-through group (left and right columns of top cap, middle, bottom cap: the left column slides, the top caps
  rise, the middles stretch), the frost never moves (only its outline is cut back, `clip-path`), the shadow stretches,
  and the words sit in a window 10 px inside the rim: their box grows a line at once and is played back from where it
  was on the same spring, so the lines that move rise with the top edge and are never cut by it. Interruptible. A draft
  keeps the bar wide when the keyboard goes (as on iOS), so its lines never re-wrap under the returning camera.
- **Sending, iMessage-style** (Omar 23:41, "the text moves from the text bar into the chat seamlessly"): the very words
  in the field, same letters in the same place, lift out of the pill on the frame you tap send; their bubble gathers
  round them out of the field's inside shape (its colour in pieces under one opacity: two caps that move and a middle that
  stretches, so its corners are never squashed; the tail corner settles in), the field's bright ink settles to the
  bubble's softer one, and they glide on a soft spring (`apple(0.6, 0.15)`, the shape on `apple(0.42, 0.08)`) to their
  place above the bar, passing over the pill as one object. The bubble keeps the field's line breaks (`lines` on the
  message, read off the field's hidden copy) and the words fly at the field's size, so nothing re-wraps or jumps; the
  field now types in the bubble's letters (weight 520, the placeholder stays as it was). For its first ~80 ms the flying
  shape is the pill's inside itself (the pill's outline up to the send button, its corners and solid colour), then it
  turns into the bubble: one object leaving the field. The emptied pill closes up on the same frame on a firm curve of its
  own (`CLOSE`, `apple(0.34)` already moving: past half closed by about 60 ms; a `.closing` class points the parts at it,
  since changing the curve's property on the bar restyled all of it). The cursor hides until "Ask the Coach" comes back
  at 140 ms, and then the bar settles in one move: the keyboard goes, the left edge glides back and the camera returns
  (the keyboard used to wait until the message had nearly landed, a second beat after everything else).
- **Bar polish (r5)**: the frost's top follows the lines on their own spring and its left edge the opening on the
  opening's (two registered properties, `--cf-gt`/`--cf-gl`; one transition carried both and the frost trailed the pill
  by 60 ms as it grew or closed up); a new line comes up through a soft bottom edge (a mask on the words' window, not a
  hard cut that sliced its letters); the camera tucks to 0.82 as the edge passes and fades a touch slower.
- Cost (4x CPU audit): no long tasks and no dropped layers on keyboard up/down. Three things that made layers come and go
  were removed: a React state for "open" (re-rendered the whole chat: a 50–60 ms stall; now a class on the bar), the
  moving parts without `will-change`, and a mask and an opacity fade on the field's text (now only past four lines, and
  the placeholder fades by colour). The orb stays where it is (the shared sphere draws it above the sheet).
- The header fade starts a few px below the header, so no letter tails peek under it.
- Clips: `scripts/clip-coach.mjs <out.mp4> [--palette ember|aurora] [--half]` films a send and a long streamed answer at
  real or half speed (half: the page's clock and animations run at half speed). Backups: `backup/coach-r4-pre-noblur`, `backup/coach-r5-pre-send` (round 4 as Omar saw it).

## Frosted tab bar with a soft edge (13 Oct 2026, v0.1.105)

Omar on v0.1.103: "the blur underneath looks garbage". Cause: two full-height "progressive blur" layers under the dock
(9 px and 20 px, each faded in by a mask) with the dock's own 28 px blur on top. A blur faded in by a mask is a cross-fade
of a sharp and a blurred copy (the muddy double edge on the card above the dock), three blurs deep. Now:
- the dock reuses the Coach bar's shared `.edge-fade` (one frost, never animated): a light 6 px frost that starts 16 px
  above the pill and is full ~40% down it, with a pure-grey tint only below the pill's top. Content still visible above
  the dock stays fully sharp; at rest the last card ends 48 px above the pill, clear of it.
- the pill is frosted glass of its own: blur(20px) saturate(1.4), a 20% pure-grey fill (no colour cast, so the field comes
  through as on iOS), light from the top, a hairline and a soft shadow. Light mode: the same in white.
Omar picked the thin neutral tint ("I want it neutral so the frosted glass can come through") and declined a deeper shadow.
Measured: scroll frames within noise of before (fewer, smaller blur layers); tab icons 5.5:1 on the pill.
