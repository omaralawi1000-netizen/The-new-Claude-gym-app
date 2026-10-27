# Aven

Training, food logging and progress in one mobile-first web app. **Aven is the working name.**
A new product — unrelated to Setline (which was not touched).

- Local-first: no account, no analytics, nothing paid is required (an optional OpenAI key for GPT-6.1 Sol is the one paid option). Everything works offline once loaded.
- English and Danish (`src/lib/da.ts`), metric-first with lb/mi/in available, locale-aware dates, decimals and day boundary.
- Installable PWA (manifest + service worker). Updates never replace a running workout (see *Updates*).

## Start here: the full handover (27 Oct 2026)

This part is for any new Claude session, on Aven or on a brand-new app, so it knows what was done before without asking
Omar again. Read this part first. Everything below it ("Run it" onwards) is the older reference and then the dated history of
every change, oldest near the top and newest at the bottom. Some old history sections are out of date (for example
"What is implemented / not built" still says there are no figures and no reminders when the app is closed; both exist now).
When this part and an old section disagree, this part wins.

**Read next, depending on the job** (this README links to them instead of copying them):
- [`CLAUDE.md`](CLAUDE.md): the short rules every session follows, the ship flow and the Beta flow.
- [`docs/style-guide.md`](docs/style-guide.md): Omar's one written style (glass, colour, motion, speed, how to preview and judge, rejected looks). Read it before any visual or motion work.
- [`docs/polish-plan.md`](docs/polish-plan.md): the old numbered to-do list ("do section N"). Paused since 15 Oct.
- [`docs/living-coach-plan.md`](docs/living-coach-plan.md): the living Coach plan with its progress table.
- [`docs/coach-plan.md`](docs/coach-plan.md) and [`docs/coach-brain-plan.md`](docs/coach-brain-plan.md): Coach 2.0 and the Coach brain work (done, kept for the why).
- [`figures/RESUME.md`](figures/RESUME.md): everything for the exercise figures (code, rules, per-exercise status, how to restore the big files from [`figures/ASSETS.md`](figures/ASSETS.md)). Start there for anything figures.
- Outside the repo, in the Claude project's shared folder `/mnt/project-files/` (only visible from inside Omar's
  "The memory of aven" project): `inspiration/design-spec.md` (the living design spec and taste picks),
  `inspiration/alive-plan.md`, `inspiration/tabbar-handover.md`, `anatomy-proof/handover-sonnet.md` (figures),
  `aven-android/HANDOVER.md` (Android app), `tools/README.md` (preview videos), `living-coach/` (Coach plan, test harnesses),
  `health/` (Health mocks, judge verdicts). A new project won't see that folder; copy what you need first.

### 1. What Aven is

- Omar's own gym, food and wrestling app. He lives in Aarhus, Denmark, lifts, wrestles, and judges everything on his phone:
  a Samsung Galaxy S26 Ultra (Android 17, Chrome 154, 120 Hz screen, device pixel ratio 3.75).
- He uses it as the "Aven" Android app, which is a thin wrapper (a Trusted Web Activity) around the website. A second
  installable copy, "Aven Beta", is where risky changes are tried first (see section 6).
- English and Danish. Metric. Prices and foods are Danish by default.
- Omar is not a programmer. Claude leads design, animation and code; Omar decides taste and says go.
- Live: <https://omaralawi1000-netizen.github.io/The-new-Claude-gym-app/>. Beta: the same address plus `/beta/`.
  Repo default branch (and the one that deploys): `ccr-d1172cc7-1e03wh` (everyone calls it "main").
- Version on 27 Oct 2026: **v0.1.184**.

### 2. Stack and where things live

- React 19 + TypeScript + Vite, installable PWA (`vite-plugin-pwa`), state in zustand (`src/state/store.ts`), animation with
  the `motion` library plus hand-written WAAPI/CSS. Tests with vitest (`tests/`), browser checks with Playwright (`scripts/`).
- Data stays on the phone: `localStorage` key `aven.v1` (workouts, food, settings), `aven.keys` (the API keys he types into
  Settings), IndexedDB for photos and the watch data (`aven-watch`). Optional Google Drive backup (`src/lib/drive.ts`).
  Beta puts `beta:` in front of every key and database name (`src/lib/beta.ts`), so it can never touch the real data.
- A tiny optional lookup server (`server/index.mjs`) for Open Food Facts + USDA. The live site is static and falls back to
  calling Open Food Facts directly.
- Android app: `android/` (package `app.aven.android`). Java in `android/app/src/main/java/app/aven/android/`:
  `AvenLauncher` (opens the site, calm launch), `Rest*` (rest countdown on the lock screen, alarm, buttons in the
  notification), `Health*` (reads Health Connect every 30 min: sleep, heart, steps, workouts; writes weight and food).
  Built and published by `.github/workflows/android.yml`; APK at the `android-latest` pre-release.
  **Signing keys live only in `/mnt/project-files/aven-android/`. Never put them in git, chat, logs or memory.**
- Deploy: `.github/workflows/pages.yml` ("Deploy web app") builds main to GitHub Pages and rebuilds Beta from the branch
  remembered in the `beta` branch.

**Code map (where each feature lives)**

| Area | Main files |
|---|---|
| Tabs and app shell | `src/App.tsx`, `src/ui/TabBar.tsx` (tabs: Today, Train, Food, Health; Health's id is still `progress`) |
| Today | `src/screens/Today.tsx`, `TodayCards.tsx`, `weekFill.ts` (week strip that fills after a workout) |
| Train, workouts | `src/screens/Train.tsx`, `src/screens/workout/` (`Active.tsx` live workout, `Focus.tsx` one exercise per page, `rest.ts`, `Summary.tsx`, `finishMoment.ts`, `Figure.tsx`/`Clip.tsx` exercise figures) |
| Food | `src/screens/Food.tsx`, `src/screens/food/` (search, scanner, photo food, meals, water), `src/lib/nutrition.ts`, `src/data/foods*.ts` (bundled + Danish foods) |
| Health | `src/screens/Health.tsx`, `src/screens/health/` (`expand.ts` = the grow animation), `src/lib/healthSync.ts`, `src/lib/watchDetail.ts` |
| Coach (chat) | `src/screens/Coach.tsx`, `CoachMemory.tsx`, `src/lib/agent*.ts`, `brain.ts`, `coachContext.ts`, `goals.ts`, `answerCheck.ts`, `nudges.ts`, `weekReview.ts` |
| Orb (voice) | `src/screens/Voice.tsx`, `VoiceAi.tsx`, `src/ui/Sphere.tsx` + `sphere.worker.ts`, `src/lib/speech.ts`, `groq.ts`, `tts.ts` |
| AI clients | `src/lib/gemini.ts`, `openai.ts`, `groq.ts`, `keys.ts` |
| Glass, glow, motion | `src/styles.css`, `look.css`, `surfaces.css`, `src/ui/frost.ts`, `glow*.ts`, `motion.ts` (springs), `press.ts`, `flip.ts`, `fly.ts` |
| Settings, onboarding | `src/screens/Settings.tsx`, `Onboarding.tsx`, `DriveBackup.tsx` |
| Danish | `src/lib/da.ts` (check with `node scripts/i18n-keys.mjs --missing`) |

### 3. AI setup

- No paid services are built in. Omar types his own keys in Settings → Voice & AI; they stay on the phone (`aven.keys`),
  never in code, commits, logs or backups.
- **Coach brain (26 Oct, v0.1.181): Gemini 4 Argon first, Gemini Flash as fallback** (`COACH_MODEL` in `src/lib/gemini.ts`).
  A timeout hands over to the next model. Argon takes 6–20 s per answer. Omar must have Settings → Voice & AI → Brain →
  Gemini selected. The orb uses Flash.
- OpenAI (`gpt-6.1-sol`, `gpt-6-luna` in `src/lib/openai.ts`) is still supported, but **Omar has no OpenAI credit
  (26 Oct): don't plan on GPT.** Gemini Pro was tested and scored worse than Flash; Omar said no Pro.
- Groq does speech-to-text (`whisper-large-v3` / turbo). Groq's free tier is too small for the full Coach prompt.
- In a cloud Claude session, Gemini and Groq calls go through a proxy that adds the keys, so you can test real answers
  without any key in the repo. OpenAI can't be reached from the cloud.

### 4. Current state per area (27 Oct 2026)

This is a snapshot. Check `git log` and open pull requests before trusting it.

- **Coach (chat).** Living Coach steps 1 (honest voice, v0.1.179) and 2 (goals you tell it, v0.1.180) are live, then a
  polish round and the switch to Argon (v0.1.181). Judges: the live Coach went from about 5 to 7–7.5 out of 10. Remaining
  weakness is mostly the model's wording. Steps 3–6 (phone link test, morning looks, full background coach, Sunday review)
  are not started; each needs Omar's own go. Background thinking is now planned on free Gemini, not OpenAI. Details and
  progress table: `docs/living-coach-plan.md`.
- **Coach pilot (decided 27 Oct).** First real goal: go from his mini cut (ends 29 Oct) to at least 2 weeks at
  maintenance without fat regain or strength loss (old maintenance 2,750–2,800 kcal). Pilot runs **30 Oct – 12 Nov,
  review 13 Nov.** Signals: weekly average of morning weigh-ins, main lifts, logged kcal and protein. Deliverable: one real
  agreement made in Aven, one follow-up that is saved, one follow-up that arrives on Android with the app closed (if that
  isn't ready by 30 Oct, start with in-app follow-ups). Omar wants a gap report and a plan before any code, each with its
  own go. Master prompt: `/mnt/project-files/living-coach/master-prompt-combined.md`.
- **Broad Coach test.** Omar said: don't start it, remind him when it's a good moment (few threads busy, usage fine, Coach
  used for real for a day or two). Covers everyday questions with his real data, judged against a 10/10 answer.
- **Coach screen redesign.** Round 1 (letters A–I) was rejected as not unique enough. Round 2 page has J Glassblower
  (Claude's pick), K Dot Matter, L Comet Scribe, judged 7.6–7.8. Waiting on his letter; the build then goes to the design lead.
- **Health tab.** The "grow" version (a card grows into its page) is live (v0.1.183). A new bento layout (wide, tall and
  square cards; sections Recovery, Training, Body) with swipe-down-to-close is built on branch
  `claude/project-thread-4o8cd5`, not live. Omar watched round 7 videos: "very good", only the background during the
  move needed fixing; that fix is done (self-checked, not judged). He said no Beta, polish first. Health colours (lilac
  sleep, red heart, orange steps, yellow cardio on near-black) are approved: don't change them.
- **Alive plan** (small moments that make the app feel alive; plan in `/mnt/project-files/inspiration/alive-plan.md`).
  Order: 0 banding fix (on Beta since 26 Oct), 1 the outline glides between sets (live v0.1.182), 2 week strip fills
  after a workout (live v0.1.184, Omar: "live is fine"), 3 the Coach's Apply ticks land one by one (done on
  `claude/v-ticks` @ 1263317, fresh judges 8.5 → 9.0, video https://claude.ai/artifact/BBFkSgT1FnJbUpztQVTGiQ, ship card
  sent, Claude's pick: ship without Beta; not shipped), 4 tab icon impulse, 5 new set slides in, 6 frost on Today
  controls, 7 finished sets pile up. Each step needs its own go. Design lead's handover with the exact ship steps for
  step 3: `/mnt/project-files/inspiration/handover-design-lead-oct27.md` (files in `inspiration/v-ticks/`).
- **Exercise figures.** Real rendered 3D clips (Blender, Z-Anatomy model). Live: barbell curl (v0.1.154, the quality
  reference) and EZ-bar curl (v0.1.153). Hammer curl (rope) approved by Omar but not shipped (a small tilt fix still
  waits on his word). Rope pushdown is in polish (judge 8.6; the body motion Omar approved is the template for all later
  moves). Batch A (cable twins), stopped 27 Oct: bar pushdown judged 8.4, its chest-graze fix needs a re-render; cable
  curl about half rendered; straight-arm pulldown and single-arm pushdown exist as stills only. A render takes ~50 min
  and a gate check ~1.5 h per clip. Runs in a Sonnet thread. Read
  `/mnt/project-files/anatomy-proof/batch1/batchA/HANDOVER.md` (next steps in order), then
  `anatomy-proof/handover-sonnet.md` (setup) and `anatomy-proof/figure-rules.md` (rules).
- **Android app + notifications.** Rest countdown on the lock screen and in the status bar, a backup alarm, buttons in
  the notification, calm launch, Health Connect sync. Website changes need no new APK; only Java changes do.
- **Orb.** The Gemini Live orb is owned by Omar's other Claude Code session (branch `claude/live-orb`, on Beta). Omar
  will redesign the orb separately: skip orb ideas elsewhere. The orb never changes shape.
- **Workout pop-up ("App Store motion", the workout card growing into a page).** Dropped for now (26 Oct: "still bad,
  maybe we will get back"). Code kept on `claude/a-r4`; notes in `design-spec.md` §0.
- **Tab bar "liquid glass, a little more pop"**: owned by the design lead, notes in `tabbar-handover.md`. Not built.
- **Omar's other Claude Code session** works on Coach memory, the watch and the Gemini Live orb. It has deployed to Beta
  and main without warning before. Before any deploy or version bump, check `refs/heads/beta` and main's version.

### 5. How the project is run

- A "coordinator" Claude talks to Omar in the project chat and starts one thread per task. Threads build; the coordinator
  keeps memory and gives Omar one verdict. One task per thread saves his usage.
- One **design lead** thread owns all new design and motion app-wide (so styles don't split). Health has its own thread.
- Models: Opus for taste, motion, the Coach, hard bugs and polish. Sonnet for ordinary work and figures. Never Haiku.
- Use skills when they fit: systematic debugging for stubborn bugs and stutters, writing plans before big builds,
  verification before saying done, brainstorming for new features. Skip process skills for pure visual polish.

### 6. Preview, judge, Beta, ship (the flow)

1. **Build in small steps** on a branch. Save a `backup/<name>` branch before anything risky.
2. **Look at it yourself** with Playwright at phone width, DPR 3.75, on his real dark theme (`AVEN_GPU=1` to draw blur in
   headless). Shoot from a production build (`npm run build` + `npx vite preview`); the dev server's StrictMode hides
   some things.
3. **Harsh judge.** A separate worker judges stills and films against his taste, his 19 inspiration clips
   (`/mnt/project-files/inspiration-oct18/clips/`) and the best iOS apps. **Judges never build fixes**; they may say the
   exact fix, the builder does it, and a fresh judge checks. Aim for a fresh-judged 9 before showing Omar.
4. **Show Omar a before/after video he can watch inside Claude** (an Artifact page made with
   `/mnt/project-files/tools/clip-page.py`, Real/Half/Quarter speed). Never a file to download. Say which clip it was
   measured against.
5. **Beta only when his real phone must judge it**: smoothness, flicker or black frames, banding, how blur and glass look,
   touch feel, GPU or layer changes. Say in one line "I think you should test this on Beta first". Beta shows one branch at
   a time and the coordinator hands out the slot. Steps are in `CLAUDE.md` → "Ship to Beta".
6. **Ship after his yes**: bump `package.json` (check main's version right before; others ship in parallel), `npm run verify`,
   PR into `ccr-d1172cc7-1e03wh`, merge, wait for "Deploy web app" to be green. Then tell him exactly what to check on the
   phone and to fully reload.
7. **If he says "worse"**: go straight back to the last version he approved, with no other changes. Fix separately.

### 7. Omar's taste

**He likes**
- Apple-level detail. Premium and alive, calm by default, lively where it fits. 120 fps, seamless, interruptible motion.
- Real motion, not cross-fades: a frame that grows into a page on one spring, text that never stretches, titles and icons
  that slide to their exact new place, close = exact reverse ("App Store motion").
- Frosted see-through glass on every floating thing (rest bar, sheets, bars, buttons), never a solid block.
- **v0.1.130 clear, untinted glass cards: "what I've been looking for".** Pop-ups: no tint, and not too see-through.
- Colour and warmth showing through the glass. Data colours per metric (the Health colours).
- Today's full-width section slide. Fast lettered option menus (6–10 good options, Claude's pick marked).
- Animation ends exactly like the settled screen (no snap at the end), corner radii glide too.

**He rejected (don't bring back)**
- Grey or graphite surfaces, even "warm neutral" ones: they read dead. Blue-grey or navy tints, flat orange wash,
  brown/bronze/gold, flat grey. Navy "lit glass" cards. Accent-tinted glass (Golden hour reads brown).
- Opaque charcoal cards ("Clean look with depth", v0.1.102: "ruined").
- Cross-fade or melting pop-up opens. A darker opaque ground under a moving page (reads as a dead slab).
- New colours or palettes: no more, don't suggest them.
- The full list with reasons: `docs/style-guide.md` §8.

**Dropped ideas**
- Collapsing/large titles (and a top bar under the status bar: impossible in the Android wrapper), tilt/parallax on rings,
  rings that pop or overflow, centred-ball orbs, a readiness check-in, fixed warm sheet mixes, swipe to tick a set
  (tapping is the only way to tick), Lottie animations (cartoonish and too costly per frame).
- The live-blur "AMOLED" surface option C (reverted 20 Oct on his ask; kept on `claude/surfaces`).

**Ideas for later (need his yes):** big hero numbers, matched icons, a plate calculator, a wrestling weight-class goal.

### 8. Working rules with Omar

- **GO rule:** never start, steer or ship anything until he clearly says go for that exact thing. "Yes, but…", a yes with a
  question, or a yes to a different point is not a go. Answer, then ask "Should I start it?".
- **Ask first:** when he's only talking or asking, answer only, then ask "Should I do it?".
- **"You pick":** when he hands you the pick, choose and go on, unless he clearly liked another option before.
- **High bar:** he wants 9+/10. Fix known flaws before showing. Self-checked is not judged: say which one it is.
- **Honesty:** look at results yourself and give your own honest verdict. Never claim "passed", "saved" or "deployed"
  unless it happened. Check memory before suggesting something he already rejected.
- **Rules are guides, not vetoes** (26 Oct). Live blur, animated blur, glows and livelier motion may be tried: build,
  measure on Beta, he judges. Still firm: no flicker or black frames, no layout jumps, his colour taste, the GO rule.
- **Talk plainly:** short messages, no code words, he reads on his phone and dictates by voice ("chords" = cards,
  "doc" = dock, "herb" = orb, "Ruben" = ribbon, "to be" = to B). If he's frustrated: don't argue, restore, one next step.
- **Notify:** when something finishes (live, Beta, preview, blocked), tell him in one short line.
- **No new gesture without his yes.** No font changes without showing him. No destructive data migrations without asking.
- **Usage runs out fast** with many threads and judges. Near the limit: hold everything and pick up after the reset.
- He works late: nudge rest kindly.

### 9. Known bugs and loose ends

- **Double-tap Apply undoes**: on a Coach action card, the invisible Undo is tappable at once, so a quick second tap on
  Apply undoes it (`.ac-in-late` has no `pointer-events: none`). Also in the live app; should be its own small step.
  Related nits: the Apply button fades through brown, and the settled check is pale tan.
- Left alone on purpose after the 20 Oct bug hunt (needs a speed pass): a stutter when a tab first mounts and when a
  sheet opens (React render + a forced layout in the glow code), the keyboard slide stutter, set-tick shadows.
- The live workout timer once disagreed with the saved duration (~18 min vs 1 h 47); a leftover food sheet appeared behind
  the Library tab once (both in `docs/polish-plan.md`).
- Light "Classic" background grain is about half of what it was; a faint ripple in the dark tint zone. Cause unknown.
- Living Coach: a stalled lift's change is sometimes asked instead of saved; the first plan reply can carry two asks.
- Exercise figures: small white flecks and a far-elbow wedge on the rope pushdown (pixel fixes, in progress).
- Polish plan item 1 (tab-switch flicker) is fixed in code (v0.1.51) but was never ticked off by Omar on the phone.

### 10. Open decisions (waiting on Omar, as of 27 Oct)

- Coach pilot: does he want the gap report and plan next?
- Coach screen redesign: which letter (J, K or L)?
- Alive plan step 3 (ticks ripple): ship it?
- Health bento: show the polished videos, then his call on Beta.
- Rope pushdown: small pixel fix or accept, then Batch A.
- Living Coach step 3 (phone link test): needs its own go, after he has used the Coach for real.

### 11. Technical lessons learned on Aven

- **Flicker at the end of an animation** (one missing frame): Chrome on Android drops a layer when its animation ends and
  redraws a frame late. Keep the layer: entrance animations use fill `both` with no end keyframe, script-moved containers
  keep `will-change`, never toggle `border-radius`/`overflow` on moving containers, never add or drop layers at animation
  end or on tab switch. Hidden layers rest at opacity 0.002, not 0. Proxy check: `scripts/flicker-layers.mjs`.
- **Banding** in soft glows: dither the gradients (recipe in `docs/style-guide.md` §1 "No banding").
- **Blur cost:** real backdrop blur on scrolling cards is about half the frame rate on his phone; the cards use a cheap
  canvas copy of the background (`src/ui/frost.ts`). A CSS `mask` on a parent makes it a backdrop root, so children's
  `backdrop-filter` can't see the background behind it.
- Surfaces must follow the colour actually behind them, not the palette (a Golden hour palette on a blue sky gave brown sheets).
- A WAAPI animation with one keyframe treats it as the END; use `offset: 0` for a from-only animation.
- Don't poll `document.getAnimations()` in a short loop: it left text undrawn for a few frames.
- A CSS transition on a small element gets its own GPU layer and drops it at the end (the flicker rule again): use held
  animations (fill `both`) instead.
- The most faithful motion films are frame-stepped (pause every animation, set `currentTime` in 33.3 ms steps); slowed
  real-time captures let JS and CSS drift apart. Film in Golden hour (`AVEN_PALETTE=golden`), his real look.
- Fading a solid orange disc reads brown halfway; shrink it to a point instead. Grow an orange button from the middle,
  never fade it from 0.
- Chrome may not pass inherited `visibility`/`pointer-events` to layers held by `fill: both` animations: hide overlays with
  opacity + transform on the overlay itself, cancel old animations before reopening.
- Headless films: step time at 1000/30 ms per frame; half speed by duplicating frames; swiftshader GPU films are slow
  (~6 s/frame), so film motion without GPU and take blur stills with GPU.
- GitHub Actions can show a Pages run as "queued/waiting" long after it deployed: check the job log. A new deploy cancels
  the one in flight, so check running Pages jobs right before merging.
- Lab scores (9/10 in headless) did not predict how it feels on the phone: put a rough version on Beta early for feel.
- AI Coach: the model rarely fills structured fields reliably; the app must read and check what it says
  (`answerCheck.ts`, `goals.ts`). Forcing JSON field order made Gemini drop text: never retry that.
- Figures pipeline: never fill the end of a closing gap fully (dim it); diff clip frames against the judged stills; never
  `pkill -f` with a pattern that's in your own command line. More in `/mnt/project-files/anatomy-proof/`.

### 12. Reusable lessons for building a new app

What worked with Omar, to start the next app on the right foot:

1. **Write the taste down on day one** (a style guide like `docs/style-guide.md`) and keep one living design doc. Add
   every pick and every rejection with the date and the reason.
2. **One entry README plus a short `CLAUDE.md`** of rules, kept updated after every change, so a new session never starts blind.
3. **Small steps, a backup branch before anything risky, and an instant "go back to the last approved version".**
   Big redesigns in one go are what broke Aven before.
4. **A test copy of the app (like Aven Beta)** with its own name, icon and storage, set up early. Many things only show
   on the real phone.
5. **Preview everything as a video inside Claude** before shipping, with a before/after switch and slow-motion.
6. **Independent harsh judges** that never build, and a fresh judge after every fix. Say "judged" vs "self-checked".
7. **The GO rule and plain language** from the start. Ask "Should I start it?" and wait.
8. **Performance budget from the start:** 120 fps target, transform/opacity first, pause what's off screen, measure on
   the real device. Fix flicker at its cause (layers), never by removing the look.
9. **Keys and secrets never in the repo.** Users type their own keys; cloud sessions use proxy-injected keys.
10. **Local-first data with an export/backup**, no destructive migrations, Undo on every save.
11. **One owner per area** (one design lead for all look and motion) so styles don't fork between threads.
12. **Keep his usage low:** one task per thread, verify only what you touched, and stop polishing when the next round
    won't change his decision.
13. Bilingual from the start (a key checker like `scripts/i18n-keys.mjs`), and a PWA wrapped as an Android app (TWA)
    when native features (lock-screen timers, health data) are needed.

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
- The Coach hears you with Groq Whisper: it listens, stops by itself when you finish speaking (or tap the orb), transcribes, then acts. Live words in the field were tried on 14 Oct and removed the same day (they didn't work in the installed app): your words lift straight from the pill into the chat (see Coach r7).
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
- **Three glass objects** (14 Oct, Omar: "each on its own… separated with frosted glass blur"; before that, 22:07, "the
  text bar on its own"): nothing sits behind the row as a whole, no band or tint; each control is its own frosted glass.
  Since r7 (below) the words fade softly into them: full until 32 px above the controls, about a third at their top edge,
  gone by their middle, so the frost softens what reaches under them and the gaps show a soft blend, never pieces of
  letters (a first try at half strength right through them read as a stencil, judge 14 Oct). At rest the last message sits 30 px above the bar, clear of the fade. It rides with the keyboard (`--kb-now`).
- **Each control on its own frosted glass** (Omar 22:10: "the text bar… the orb and the camera… its own circle that looks
  3D"): the field is a frosted pill, the camera a round frosted button, the orb rests in a frosted seat the field's
  height (`.frost-ctl` / `.frost-seat`, shared, `--fc-*` tokens): neutral glass, a light top edge, a fine rim and a faint
  sheen on the top half; since r7 no shadow, and a faint light along the bottom edge. One small blur per control, never
  animated.
- **Soft-edge bar** (Omar picked it, 13 Oct; removed 14 Oct for the three glass objects above): a plain grey fade behind
  the whole row (`.edge-fade`, still used by the dock).
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
  in the field, same letters in the same place, lift out of the pill on the frame you tap send, and they glide on a soft
  spring (`apple(0.6, 0.15)`) to their place above the bar. The bubble keeps the field's line breaks (`lines` on the
  message, read off the field's hidden copy) and the words fly at the field's size, so nothing re-wraps or jumps; the
  field now types in the bubble's letters (weight 520, the placeholder stays as it was).
  - **One shape, from pill to bubble**: on the first frame the flying shape is the whole pill (its full width, its 27 px
    corners, its tint, top sheen, highlight and rim, solid: the pill's colours over the frost's average colour,
    `--fly-under`, so nothing behind shows through its words), and on its own quicker spring
    (`apple(0.34, 0.06)`: about half way by 80 ms, nearly there by 200 ms) it becomes the bubble: its size, corners of 20
    and the tail's 6, its colour turning from the pill's into the bubble's (40–240 ms, solid the whole way: the bubble's colour as it looks,
    coming up over the pill's; as it settles in place, 400–560 ms, it hands over to the bubble's own see-through glass, so
    the real bubble taking over is the same picture). A shape's size and corners can't
    be animated by moves alone, so it is eight pieces (four corners that scale evenly, so they stay round, and four
    straight pieces between them, each reaching 1 px under its neighbours), all moved and scaled on the one spring, so
    they always make one outline. The two colours are the same pieces twice under one opacity each, so there is never a
    second outline (round 5 cross-faded a pill-shaped and a bubble-shaped layer: the tail corner poked out of the
    pill's for ~80 ms). The send arrow (a stand-in on top) dissolves in its first 24 ms, then the bar, stop button and all, shows from
    under the shape as it leaves (the shape is never cut by the button). The flight's spring runs to a hundredth of a
    percent (`springCurve(…, fine)`), so it lands exactly on the bubble, with no last-pixel step.
  - Send and stop share the button: a 120 ms cross-fade with a little turn (±45°), not a cut.
  - The emptied pill closes up at once, out of sight under the shape (which covers all of it as it starts), and its tint
    and shadow fade in 30–110 ms, so the empty bar is only ever seen where the shape has left it: never the pill and the shape drawn in the same place (a see-through
    shape over a closing pill read as two stacked cards, the pill's rim cutting through the words). A `.closing` class
    points the parts at that (`CLOSE`; changing the curve's property on the bar restyled all of it). The cursor hides
    until "Ask the Coach" comes back at 140 ms.
  - **The keyboard stays up after a send**, as in iMessage, ready for the next message (it used to go down as the message
    landed, and the whole conversation rode ~650 px down with it). Sent with the keyboard down, the left edge glides back
    and the camera returns at 140 ms.
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

## Smooth glows behind the frosted pop-ups: no more colour bands (13 Oct 2026, v0.1.106)

Omar (teal palette, dark): the soft glow seen through the Coach, Settings and Scan barcode sheets showed stepped rings with
a coloured fringe ("chromatic aberration / colour banding, looks cheap"). Reproduced at his screen (384 x 832 at 3.75).
- Cause: the phone keeps a blur's result in whole steps of colour (0-255). Behind a sheet the page is dimmed, so the glow
  spans only a few dozen steps there, and the 44 px blur averages away the grain that hides the steps on the page. The
  steps came back as rings, a little out of line for red, green and blue (saturate after the blur stretches them), so
  they read as coloured bands. Measured on a test ramp: the blurred glow climbs in 1-1.7 level stairs.
- Tried and not enough: noise drawn on the glass at full strength only blurs the rings' edges (it is added after the
  rounding, so each stair stays a stair).
- Fix, dark theme (light keeps its plain blur): the sheet blurs its backdrop at twice the brightness (`brightness(2)`
  before the blur, so the blur's result keeps twice as many steps) and lets half as much of it through (the tint's alpha
  goes up from .46 to .71, its colour worked out so the picture is the same: average colour within 0.2 of a level). On
  the glass sits `--dither`, a one-screen-pixel noise in the glass's own alpha (black dots, 0-40 of 255, baked once at the
  screen's pixel size in `lib/grain.ts`). It changes how much backdrop each pixel lets through, which is mixed in the
  screen's final exact blend, so the last half-steps dissolve into noise about one level strong (finer than the page's
  own grain). The test ramp is now smooth; the rings are gone even with the contrast raised 6x.
- Cost: the tint is a layer of its own over the blur (a picture inside the blurring layer halved the frame rate in
  tests: an extra full-screen pass), and the sheet's drop shadow moved onto `.sheet` (on the dithered layer it doubled
  that layer's cost). Scrolling in a sheet and closing it measure the same as before. Opening draws one more image layer:
  in software-GPU Chromium about 19% fewer frames while a sheet opens (13 runs); the phone's GPU should barely notice,
  Omar to judge. Way back: branch backup/pre-banding-v0.1.105.
- Recipe for any other frosted layer (tab bar, Coach bar, rest bar): see "Dither" in styles.css.
- Tools: `scripts/banding-shots.mjs` (Settings, Today, Coach, Scan at phone size, field held still) and
  `scripts/banding-probe.mjs` (CSS variants on one open sheet).

## No banding anywhere: tab fields, backgrounds, orb screen, dock (14 Oct 2026)

Omar (14 Oct, on the orb screen in Forest): "There's still banding here. Remove banding on all of the app." Same cause as
the workout window: the phone draws CSS gradients and blur output in whole 8-bit steps with no dither.
- Every tab field (Classic's three lights and all nine `.bgx` backgrounds) is painted dithered by `FieldGlow`
  (`src/ui/Glows.tsx`): the gradients, pictures (stars, dots, photo), the grain and the status-bar tint that hold still go
  into ONE picture read straight from the computed CSS (`src/ui/glowCss.ts`: radial/linear, sRGB and Oklab mixing,
  transforms, opacity). Matches the CSS within about a third of a step. Other tabs' fields are painted ahead while idle.
- Moving glows (orb screen halo, Orb light's beam and halo, Sunrise's sun, workout top) use `SelfGlow` inside themselves
  (Orb light at quarter res).
- Orb screen veil, dock and dock edge fade: dither tile in the tint, with the tint corrected for its darkening.
- The workout grain is folded into the workout field picture (was its own full-screen layer).
- Rules kept from v0.1.123: no layer added or dropped at tab switches or animation ends; each field one standing layer.
- The exercise stage pools (workout Focus view, exercise page) use `ImgGlow` (Today's card corner glow was removed in v0.1.129): the dithered
  picture becomes the element's own background image, no extra layer. Onboarding's aurora stays CSS (6 more layers for a
  screen seen once).
- Light theme too: dock, orb screen veil and dock edge fade carry a white dither with corrected tints.
- Round 2 after the judge (same day):
  - Theme or palette switch: every glow canvas gets the new picture in the same task as the switch (the kept dithered
    picture, or a quick undithered one drawn at once and replaced when idle; within about one step of it), so the circle
    reveal never shows the old field. Lab: 85 ms with a kept picture, about 230 ms the first time per theme (software
    GPU; the phone is faster).
  - GPU reset: the CSS shows while the chip is gone and the picture comes back after (tested with a forced GPU crash).
  - Canvases get their size and picture at mount; the top tint strip stays (painted clear) instead of hiding.
  - Faint glows (Coach-open beam, fades) get a stronger dither for their opacity.
  - Darks: the darkest fifth now matches the old look within 0.25 of a step (was 0.6-0.8 lighter); the grain in the
    pictures matches the CSS grain's size and strength.
  - Pictures are written with `putImageData`: drawing kept bitmaps into GPU canvases made the chip keep a copy of each
    (round 3: even one drawn once and closed straight after does).
- Classic's field (Glow round 2: opaque, swaying) is painted opaque too; its top tint stays the CSS strip, since the
  field moves under it.
- Cost against Glow round 2 (software GPU, his screen; `chip` = all graphics memory counted once): equal or less
  everywhere, e.g. Today 50.8 → 47.3 MB, workout 54.4 → 48.1 MB, Train 57.0 → 45.2 MB, sheet open 69.8 → 62.6 MB.
  Page memory is about 30 MB higher (the kept pictures, capped at 64 MB since round 3).
- Round 3 after the judge (same day):
  - No quick picture any more: one painter (`src/ui/glowPaint.ts`), in the worker only (painting a whole field on the
    page, and making the background-image glows' and the dock shadow's PNG files there, froze the page for 0.5-1.3 s in
    the first seconds after launch: files are now made in the worker too, `encodePng`). The other tabs' fields are
    painted ahead 0.6 s after launch; a tab tapped before that shows its CSS field until its picture is ready (painted
    before anything else the worker has queued), and the picture then fades in over it (1.2 s, eased in and out). The
    canvas is there, see-through, from the field's first frame, so no layer is added later, and the CSS goes only once
    that fade has finished. Every field carries the status bar's colour at its top itself, so every switch and every
    fade-in is a plain cross-fade: a still field in its picture (and in `.field-tint` under the canvas until the picture
    is in, or for good when it can't be made), Classic in a `.field-tint` that moves exactly back by its sway, Orb light
    and Sunrise over their moving parts and their grain. (One strip over all fields, faded against a picture with the tint in it, lifted
    the top-left edge 11-13 levels in Golden hour for half a second, judge rounds 5 and 6, on a fade-in and between
    Classic and a painted still field; the strip is now only for glow off, and glow on/off swaps strip and field tint
    in one frame: a 1.2 s fade of the strip left the top blue-black for most of a second, judge round 7.) The grain stays, under the canvas, while a field waits. (Showing the plain
    colour while waiting, tried first, made the field go dark and then light up; ending the fade on a timer hid the CSS
    early on a busy page.) After a palette,
    glow or motion change the picture before fades out (0.6 s) instead of going at once. The mid-switch frame shows the
    final dithered picture.
  - Theme switch: the other theme's pictures are painted ahead while idle, read from a hidden twin frame (the page's own
    styles with the other theme on its root), so a switch only looks each glow's plan up by state and draws it. Reading
    styles during the switch (the old way) made the browser redo the whole page's styles for each glow; so is anything
    else read there (the field's sway is read once, at idle). The theme just left is written ahead into one spare canvas
    per glow, so a switch back only copies it across on the chip. Our code in a switch: 1-8 ms at 4x slower CPU.
  - Tab switch: each tab brings a new field; its plan (painted ahead with the other tabs) is looked up without reading the
    page, and its kept picture written in. Lab at 4x: about 40 → 10-20 ms of glow work per tap (most of it the write).
    Bitmaps made ready ahead were quicker (3 ms) but left copies on the graphics chip (+20 MB after six switches), so
    they are not used. The switch's animations end at the same time as on base.
  - Glows that move by themselves (`SelfGlow`: Orb light, orb screen halo, Sunrise sun, workout top) are background
    images now, like `ImgGlow`: no canvas, no layer (Orb light 64-66 layers on base → 63 on every run).
  - Field elements keep their CSS background colour (no layer change at the end of a theme switch).
  - Grain in the pictures: fine and grey; on average as strong as the CSS grain (per palette -12% to +20% against the
    lab's CSS render, which itself varies by palette). Flat areas get no dither.
  - Dark orb screen veil: its tint is a dithered tile, so its colour lands within 0.15 of a step of the old look.
  - Light dock: its big outer shadow is a dithered picture (`src/ui/dockShadow.ts`) instead of a `box-shadow` blur.
  - Kept pictures: 64 MB cap (oldest first; the other tabs' fields painted ahead go first). In the background only the
    pictures in a canvas and the other tabs' fields stay (about 14 MB more page memory there), so a tab tapped after
    unlocking finds its picture; the rest is let go and painted ahead again on return.
  - Tools: `scripts/theme-switch-cost.mjs`, `scripts/tab-switch-trace.mjs`, `scripts/glow-midswitch.mjs`,
    `scripts/glow-gpu-reset.mjs`.
- Tools: `scripts/banding-fields.mjs`, `scripts/perf-gpu.mjs`, `scripts/glow-layers.mjs`, `scripts/glow-theme-sync.mjs`.
  Way back: branch backup/pre-allbanding-8cb066f.

## Smooth glows in the live workout window: no more rings (14 Oct 2026, v0.1.121)

Omar saw stepped, slightly coloured rings in the workout window's glow (the gold light behind the exercise card and the
light behind the title and figure). Cause: on the phone, Chrome draws a CSS gradient in whole colour steps without
smoothing them (the test browser smooths them, so lab shots looked clean; judge from his own screenshots). A dim glow
spans only a few dozen steps, and red, green and blue step at different places, so the rings look coloured. The grain
on top was drawn after the rounding, so it only hid the rings' edges.

Fix: the window's colour field (`.aurora-lite::before`) and its breathing top light (`.wk-breath`) are worked out in a
worker at full precision with a dither (`src/ui/glow.ts`, `glow.worker.ts`, `screens/workout/wkGlow.tsx`), drawn once
into canvases at half the screen's pixels (the screen smooths them back up). The CSS gradients show until the pictures
are ready ([data-dith] swaps them); colour matches within a third of a step, dark and light. Frost, card and grain are
unchanged. Cost: open, resume, scroll and idle frame counts the same as before (software GPU). Tools:
`scripts/banding-workout.mjs`. Way back: branch backup/pre-banding-v0.1.119. Not yet done: the tab screens' Classic glow
(same cause; `ui/glow.ts` can do it).

## Launch morph: the launch screen's orb flies into the dock; a lighter start (13 Oct 2026, v0.1.107)

Omar: "launch morph would be amazing… you have to work very hard on it to make it seamless". Before, Android's launch
screen (the Ember orb of dots) cut to a blank page, then the app.
- First paint: index.html draws the exact launch-screen orb before any script (`scripts/gen-launch-orb.mjs`, same SVG code
  as the Android icon via `scripts/orb-svg.mjs`), so Chrome's hand-over from the splash is invisible.
- Then (`src/ui/launch.ts`): the live orb fades in over the logo in its colours (0.2 s) while the logo fades (0.16 s), the
  launch screen fades (0.25 s) and Today's blocks start their rise; 0.23 s in, the orb falls on a soft arc into the dock
  (Apple smooth spring 0.8 s, browser-run, transform only), clear of the first card's play button. Its colours turn to the
  palette bead by bead, each bead in one step: an RGB blend went through grey, a blend inside a bead read pale pink.
- Judge rounds fixed: a second (splash) orb left behind during the flight, teal through grey, the app appearing late.
- Reduced motion: the launch screen just fades, the orb already in the dock.
- Lighter start: Coach, voice, Settings, photo food, the scanner and onboarding load on demand (`src/ui/lazy.ts`, preloaded
  when idle after 2.5 s); Danish loads only when used. Start JS 1,221 → 897 KB; app drawn 329 → 306 ms (4× CPU 1,434 → 1,345).
- Tools: `scripts/launch.mjs` (timings), `scripts/film-launch.mjs` (steady-camera launch films). Previews and notes in the
  project folder `launch-morph/`.

## Backgrounds you can pick, and three new colours (14 Oct 2026, v0.1.112)
Settings → Appearance → Background picks what is drawn behind the app: Classic (the drifting colour field, as before),
Orb light, Colour per tab, Sunrise, Mesh, Dot field, Time of day, Night sky and Your photo (`settings.background`,
`html[data-bg]`, `ui/Backdrop.tsx`, `.bgx` in styles.css).
- Why still: Omar found that turning the glow off made the app much smoother. Classic's three lights drift in ~12 steps a
  second, and every step makes the frosted tab bar, sheets and Coach bar re-blur what is under them. Every new background
  is a few gradients (or one small picture) painted once and then left alone, so nothing under the glass changes unless
  you scroll.
- The only changes: Sunrise's horizon glow rises as the day's calories and protein fill up (one 2.6 s transform +
  opacity move when food is logged); Orb light's brighter layer fades in (1.2 s) while the Coach or the orb screen works
  on an answer or reads it aloud (voice phase `processing`, or `voiceOut`), and out again (1.6 s); Time of day / Night
  sky move on in quarter hours, only when you come back to the app or every 15 minutes while no pop-up is open, as one
  0.8 s cross-fade. Tab-coloured ones (Classic, Orb, Colour per tab, Sunrise, Mesh, Dot field) cross-fade on a tab switch
  exactly like the old field did; the others don't change on a tab switch at all.
- Night sky uses Aarhus sunset/sunrise (NOAA approximation, `sunTimes`): stars after sunset, a calm dusk before.
- Your photo is blurred once when picked (canvas blur 16 px, to a 240×520 JPEG), kept in IndexedDB with the progress photos, never
  uploaded and not in backups; the screen only scales up a still, already-soft picture and darkens it for legibility.
- Background glow still applies: Full / Soft set the strength; Off leaves a plain background (Your photo stays). Picking a
  background while the glow is Off turns it back to Full. Colour per tab uses its own hues (Today warm, Train blue, Food
  green, Progress violet); the accent on buttons still follows the palette. The workout window keeps its own light.
- Round 2 (after the judge): Colour per tab's Today is a cool aqua (a warm wash turned see-through cards amber next to
  a teal accent); Time of day has a warm sky (Ember, Sunset) and a cool one (the rest) so evenings never go brown, and
  midday is a clean light blue, not white (white over dark reads grey); over Night sky and Dot field the tab screens'
  cards, chips and buttons are the same dark glass made solid (`--s1..3`, `--bg-2` on `.screen`), so no star or dot
  shows through a card; Night sky got a faint Milky Way band and is near-black, unlike Time of day's indigo night;
  Orb light moves to the Coach's orb (bottom-left) while the Coach is open, by fading between layers already drawn.
- Round 3: the fade between layers read as a jump, so Orb light now measures where the orb really is (the dock's moves
  with the tab you are on; the Coach's sits in its bar) and its halo (140 px) and beam glide there as one transform
  (1.1 s), re-measured once the Coach's sheet has settled and on resize. Sunrise's horizon sits at the quick-add row on
  a full day (the sun was hidden behind the big card and the tab bar), with the sky dimming below it like land. Under
  Time of day the cards are a darker frost (`--s1..3` on `.screen`), so grey text keeps 6:1 or better against a bright
  midday or dusk sky. Two things the judge flagged were not the backgrounds: the half-and-half frames mid tab switch are
  the page cross-fade, the same in Classic; the tab name "vanishing" was one bad frame of the test filming (the same
  filming on the current app never shows it, and the label is never re-mounted).
- Round 4: under Sunrise the cards and quick-add chips get Time of day's darker frost (the sun sat behind the chips:
  "+ Beef mince" was 1.5:1, now 5.5:1); every change between two of the picked backgrounds (picking one, a tab
  switch, a change of sky) lays the new one over the old one, which stays whole until it is covered; for that each is
  painted opaque (`.fields > .bgx` has the page colour behind it). Fading both at once let the room show through
  mid-way (a dip) and two half-skies came out brighter than either. Classic's drifting field is see-through, so changes
  to and from it still fade both; the soft fade
  under a sheet's title now starts after 8 px of scroll (all sheets), so a list nudged a few px by a tap keeps its
  heading clear.
- Three new colours (Omar asked for "a real sunset" and colours that look premium): Golden hour (a red-orange light
  with sun-yellow only where it is brightest: accent, sun core, the top of the start button; yellow light over the dark
  page read as caramel), Midnight (deep blue, ice-blue accent) and Champagne (graphite with a saturated gold glow and a
  champagne accent; a pale warm glow read grey-beige). Each has its own ring colours (`--c-kcal` is new: kcal no longer
  has to be the accent), deeper ones on a light page. Under Sunrise the macro numbers get a soft dark pool and stronger
  grey text (4.5:1+ over the sun); the Coach's suggestion subtitles and note use the second text grey (5.5:1).
- One look everywhere (v0.1.117): the status bar takes the top colour of the background you picked (Classic and Mesh
  the area's light, Colour per tab its first colour, Dot field the accent's wash, Time of day the sky; Orb light,
  Sunrise, Night sky and Your photo the page colour), so no coloured strip sits over a dark top (`BAR_SRC` in App.tsx).
  Every look has its own four food-ring colours (`--c-kcal/protein/carbs/fat`, deeper on a light page); kcal no longer
  follows the tab. Cards, chips and buttons on the tab screens are one dark glass on every background (`.screen`
  `--s1..3`), replacing three recipes (white lift, solid, darker frost).
- Scripts: `AVEN_BG=mesh AVEN_PALETTE=aurora AVEN_GLOW=off AVEN_PHOTO=file.jpg` in any script that uses `loadDemo`.

## Rendered exercise clips: the barbell curl first (14 Oct 2026, v0.1.110)

- Omar approved the muscled figure ("the figure looks good now") and its whole-body motion: the arms curl, the body leans
  back a touch with the bar, breathes, and the knees soften on the way down. The exercise page for Barbell Curl now shows
  that clip in place of the muscle picture, as its own light studio card at the clip's 3:2.
- `src/screens/workout/Clip.tsx`: `clipFor(ex)` picks a clip from `public/figures/<id>.{webm,mp4,jpg}` (VP9 webm ~200 KB,
  mp4 fallback, first frame as the poster). Fetched only when the page opens (not in the offline precache), muted, looping,
  playing only while on screen and while the app is in view; reduced motion shows the still first frame.
- Made in Blender from the Z-Anatomy model (CC BY-SA 4.0, credited in Settings › About). Each exercise gets its own
  choreography on one full-body rig; sources and judge notes are in the project folder `anatomy-proof/`.

## The curl clip, calmer and truer (14 Oct 2026, v0.1.126)

- Omar: "the hands still doesn't hold the bar properly", "refine the neck to the head", then on the motion: "at the bottom it
  doesn't even pause for half a second… I want to learn from the motion… but it still has to be fast enough".
- New take (r15): the grip is solved against the hand itself (bar deep in the palm, fingers and thumb round it, no clipping,
  the bar never slides); the neck is shaped into the head and traps; the timing is traced from his reference video: about
  4.3 s per rep, a slower 1.5 s lift, a short squeeze at the top, a slightly slower lowering and a half-second settle at
  the bottom, no machine-like stops, a seamless loop.
- Clip files carry their take in the name (`figures/barbell-curl.r15.*`) so phones fetch the new clip, not a cached one.
- Every rule the curl taught (look, grip, neck, tempo, loop, checks) is written down for the next exercises in the project
  folder `anatomy-proof/figure-rules.md`.

## Coach: dictation like iOS, calmer answer text (14 Oct 2026)

(The live words and the wave below were removed in r7, same day: see the last section.)

Omar: "when you say something to the coach… I want it to be easy and like Apple". And: "refine the animations of the text… ultra premium".
- **Your words appear as you speak.** Tap the orb: the pill opens wide at once ("Listening…"), and what you say shows in
  it as you say it, growing a line at a time like typed words. The send button listens with you: a small live wave of
  five bars (your voice's bands, scale only) until the first words, then the arrow. It still stops by itself when you go
  quiet, or tap the orb or the arrow. Whisper (Groq) then hears the whole recording as before (it is the better ear, and
  keeps the Danish and accent handling); if its words differ, they take the live ones' place for a moment, then lift out
  of the field into the chat exactly as typed words do. Tap your words while speaking and it stops there and leaves them
  in the field to fix (keyboard up), as tapping the text does on iOS. A draft already in the field is kept, the words go
  after it.
- **Where the live words come from**: Chrome's Web Speech service (free, no key; on Chrome it is Google's cloud
  recogniser), running next to the recording. The earlier live words (Groq looks every 1.2 s) were late and misheard and
  were dropped; this one streams word by word. Language: Settings → Voice & AI → Language, or the app's language on Auto.
  If it is missing or fails, it listens as before (the wave, then Whisper's words). If Whisper fails, the live words are
  sent; if the recording itself hears nothing while live words come, the live words decide when to stop (1.5 s after the
  last one) and are sent.
- **Answers, refined**: each word barely rises now (0.14em, was 0.3em: a line of small hops read as busy) and takes its
  light a little longer (820 ms, was 640), so the words in flight overlap and a line fills in as one soft wave. Opacity
  and transform only, no blur.
- Not verified on a phone: whether Chrome on Android lets its speech service and the recording share the mic (the
  fallbacks above cover either one failing), and live-word accuracy.


## Food rings like Apple Fitness (14 Oct 2026, v0.1.127)
Omar 15:06: "turn the rings like 3D with like inner shadows and like Apple's fitness". `ui/Dial.tsx`, tokens `--ring-*` in `styles.css`.
- Each empty track is a deep (dark) or pale (light) version of its own ring's colour, mixed in OKLCH (`oklch(from …)`), carved in
  with a soft inner shadow. Dark yellow/orange tracks hold less colour (L .275, C .037) so they never turn brown.
- The fill is a conic gradient along the ring: no darker than the plain colour at its start, brighter and turned ~12° in hue at
  its end (pink → magenta, lime → yellow-green, teal → cyan-blue; the direction is read once from the ring's real colour). It
  never wraps, so the start's round cap keeps the start colour. A faint dither keeps it free of bands.
- A full ring's end is drawn again over its start (same dither and tube shading) with a soft shade in its own darker hue just
  ahead; short of full, a neutral shade falls on the track ahead of the end.
- Light mode: no glow and a crisper edge; fat is a clean amber `#e6ad00` in every light palette (was mustard).
- Cost: painted once; only the fill's mask length, the shade's position and the end's rotation move, on the same spring.
- Judge rounds: r4 failed (brown smudge at 12 o'clock, brown tracks, dim fills, soft light edge); r5 passed after the yellow
  track and end-disc fixes. Before/after page: https://claude.ai/artifact/GhMcA41DrV79hCh2tKwT63

## Lit glass cards (14 Oct 2026, v0.1.129)
Omar: the cards "just look off", live and on Beta. A design look at his Today screen (Golden hour, dark) found two causes:
an accent glow trapped in the workout card's top-right corner read as a stain (orange in Golden hour, green in Forest),
and outlines stacked inside outlines (card rim, every chip rim, the + button rim). He picked from six looks on one page
(Calm, Clear frost, Lit glass, Liquid glass, Etched, Fade away): **Lit glass** for the real app, Liquid glass to try on Beta.
- Tab-screen cards (dark): see-through navy `rgb(30 33 52 / .58)` with a soft white sheen at the top, the existing `::after`
  rim now bright along the top edge and fading down the sides, a soft shadow `0 14px 40px rgba(0,0,0,.6)`. Over the
  bright Sunrise and Time of day backgrounds the fill is darker (`rgb(22 25 40 / .74)`) so grey text keeps its contrast.
- Light: 60% white with a top sheen, white top rim, soft neutral shadow.
- Chips and round buttons inside a card are plain soft fills with no outline.
- The workout card's corner glow is gone (`Today.tsx`).
- Same cost as before: no blur, no grain, no tint, no new layers.
- v0.1.130: Omar on v0.1.129: "They're not see-through. And why do they have this tint?" The navy fill (`rgb(30 33 52 / .58)`)
  read as solid blue-grey slabs on his warm Golden hour field. Now the dark fill is a neutral 4.5% white film (the field
  shows through, nothing is tinted); over Sunrise and Time of day a neutral dark film (`rgba(8,8,10,.42)`). Rim and shadow unchanged.
## Coach r7: dictation without words in the field, controls truly on their own (14 Oct 2026)

Omar, after trying v0.1.116 on his phone (two screen recordings): "It doesn't dictate live, so just remove it… Find an
animation that can really be seamless when I dictate. The words don't have to come in the text box… Remove the speaking
indicator because the orb already does that. And please have the icons by their own with blur under them. I don't want
a shadow… make them a little 3D".
- **Live words removed.** Chrome's speech service gave no words in his installed app (the recordings show only
  "Listening…"), so it is gone from the Coach (`src/lib/speech.ts` stays for the orb screen). The wave in the send
  button is gone too: the orb's ring already shows that it hears you.
- **One seamless moment.** Tap the orb: the pill opens wide, "Ask the Coach" fades across into "Listening…" (180 ms, never
  a swap) and the arrow is there to stop and send. When you stop (or go quiet) "Listening…" fades into "Transcribing…",
  the arrow steps aside and the orb thinks. When Whisper's words arrive the pill itself lifts away into the chat as your
  message (one shape, 560 ms on a soft-start ease, `FLY_SAID`, not the typed message's spring, whose quick start read
  as a jump), "Transcribing…" fading out first (140 ms), then each line of words fading in only once the growing bubble has room
  for it (from 150 ms; the line on the field's line first, the ones above as the bubble's top passes them), so nothing
  is ever drawn over another or past the bubble's edge. The field's words cross the same way: the old fades out in
  90 ms, then the new in over 150 ms. They never sit in the
  field first. The bar under it is hidden at once and closes up there unseen (`.snap`), then comes back whole once the
  bubble has left: field, camera and stop button fading in together (from 340 ms, over 300 ms): no empty pill, no slide. With a typed draft already in the field, the whole
  message is shown there a moment and then leaves as typed words do. Tapping the field while you speak still stops and
  leaves the words in it to fix.
- **Each control on its own.** 14 px of clear space between orb, camera and pill (was 8–10). No shadow under any of them
  (`--fc-sh` is none). A little 3D: a brighter light on the top edge, a faint light back up along the bottom edge, the top
  half a touch brighter, a lighter, more see-through glass. The blur is 8 px (was 20; cheaper, and the softened words
  behind stay visible instead of vanishing). The camera had no blur at all until now: the sheets' rule that takes blur off
  their buttons (`.sheet :is(.btn, .icon-btn…)`) also took it off the camera; `.frost-ctl` now wins.

## Coach r8: a soft shadow, words seen through the glass, an iOS landing (14 Oct 2026)

Omar, after the r7 page: "I want a drop shadow so it looks 3D on the buttons, and… I want to see the words under the
buttons, so that's how you know it's frosted glass", then "a more easing motion for the bubble when it suddenly stops…
like iOS. And please polish everything".
- **Shadow back.** Orb, camera and pill each get a soft, static drop shadow (`--fc-sh`: a tight 2 px one where it meets
  the page and a wide 12/30 px one, neutral black; navy and lighter in the light theme). Never animated, and never on a
  blurred layer: the pill's is its own piece (`.cf-sh`), the orb's is `.frost-seat::after` behind its glass disc, the
  camera's is `.coach-cam-slot::before`, which fades with the button when the field opens.
- **Words under the glass.** The list no longer fades out above the controls: it passes under them at about half (the
  mask in `.coach-body` is 0.5 at the controls' top, 0.46 at their middle, gone 4 px below them, so nothing peeks out
  under the orb), and the frost is lighter: `--fc-bd` = `blur(5px) brightness(1.5) saturate(1.4)` (was 8 px; light theme
  without the brightness). Measured on a GPU still: words under a control about 80–85 of 255 as soft word shapes (8 px
  melted them into a faint band at ~60), in the gaps about 110 (were ~165, crisp, read as a stencil). `--fly-under`
  follows the lifted frost so the flying copy still matches the pill it starts as.
- **iOS landing.** Said words now lift on a critically damped spring (0.52 s, no overshoot) that follows a target easing
  up out of the bar over its first 100 ms (`SAID_XS` → `FLY_SAID`, sampled into linear()): the soft start stays, and the
  end is the spring's long tail (90% at ~370 ms, its speed dying away over the last ~150 ms) instead of a bezier that
  braked. A typed message's flight lost its small overshoot the same way (`apple(0.55)`, was `apple(0.6, 0.15)`).
- **Handover and lines.** "Transcribing…" fades out in 60 ms from the moment the pill starts to change, and the words
  fade in over 140 ms from 40 ms on (linear): the two are never both readable at once. The words are laid out at the
  bubble's width from the first frame, all lines, in a window (`.fly-reveal`) whose top edge rides the shape's top while
  the words inside are held still (window and words moved by the same amount, opposite, on the same curve), and whose
  top is soft across the bubble's padding (a mask): the growing bubble uncovers the lines, the top one last, each coming
  up inside the padding, never cut by an edge, never popping in.
- **Camera frost.** The small camera disc gets a lighter tint (0.26) and a 3.5 px blur, so words under it show as soft
  shapes like under the pill.

## Food rings like Apple Fitness (14 Oct 2026, v0.1.127)
Omar 15:06: "turn the rings like 3D with like inner shadows and like Apple's fitness". `ui/Dial.tsx`, tokens `--ring-*` in `styles.css`.
- Each empty track is a deep (dark) or pale (light) version of its own ring's colour, mixed in OKLCH (`oklch(from …)`), carved in
  with a soft inner shadow. Dark yellow/orange tracks hold less colour (L .275, C .037) so they never turn brown.
- The fill is a conic gradient along the ring: no darker than the plain colour at its start, brighter and turned ~12° in hue at
  its end (pink → magenta, lime → yellow-green, teal → cyan-blue; the direction is read once from the ring's real colour). It
  never wraps, so the start's round cap keeps the start colour. A faint dither keeps it free of bands.
- A full ring's end is drawn again over its start (same dither and tube shading) with a soft shade in its own darker hue just
  ahead; short of full, a neutral shade falls on the track ahead of the end.
- Light mode: no glow and a crisper edge; fat is a clean amber `#e6ad00` in every light palette (was mustard).
- Cost: painted once; only the fill's mask length, the shade's position and the end's rotation move, on the same spring.
- Judge rounds: r4 failed (brown smudge at 12 o'clock, brown tracks, dim fills, soft light edge); r5 passed after the yellow
  track and end-disc fixes. Before/after page: https://claude.ai/artifact/GhMcA41DrV79hCh2tKwT63

## Coach r9: no flicker at the bar, calmer said words (14 Oct 2026)
Omar 19:46 on Beta: "the look is very, very good… a little polish with the text when I dictate… I noticed some flickers at
the text bar… polish for the animations, not the look." Nothing in the look changed. Found by watching the compositor's
layers (DevTools LayerTree) through opening, typing, sending and dictating at the phone's 3.75 pixel ratio:
- **The pill's frost edge.** `.cf-glass` is cut to the pill by a rounded `clip-path` whose left and top edges glide
  (`--cf-gl`, `--cf-gt`). On in-between pixel positions Chrome cut it with a mask layer, on others with its plain rounded
  edge, and switched between the two about 7 times in every opening, closing and new line: a layer made and dropped
  under the frost, the phone's one-frame flicker. The edges now land on quarter pixels (`round(nearest, …, 0.25px)`),
  where it is the plain edge all the way: 0 switches measured (was 7–14 per move). A quarter pixel is under one of the
  phone's pixels.
- **The camera's frost.** When said words left, the camera faded back in on its slot (`.coach-cam-slot`). A fading
  parent cuts a backdrop blur off from the page, so the camera showed no frost until the fade ended and then its frost
  popped in. It now fades on its own glass, and its shadow on the slot's own `::before`.
- **Layers made and dropped.** The camera's shadow (`.coach-cam-slot::before`) got a layer for each fade, the orb one
  for each press, and the voice ring one when it faded out (it also redrew the orb's glow every frame while you spoke).
  Each now keeps its own layer all the time (`will-change`). Measured: no layer comes or goes in the bar in any of
  open, type, send, dictate (only the flying copy's own).
- **Colour at the hand-over.** A typed message's flying copy is solid, drawn for an average page (`--fly-under`); with
  the keyboard up the real pill's frost sits over the palette's glow and is warmer (Golden hour: 62,42,54 against the
  copy's 40,46,68), so the pill turned navy in one frame as it left. The real pill now stays drawn and the copy's pill
  comes up over it in its first 60 ms: measured the same colour on the first frame. (Said words leave with the keyboard
  down, where the two already matched within 3 levels.)
- **Said words, calmer.** "Transcribing…" fades out over 110 ms (from the field's own value), the words come in over
  260 ms from 80 ms on an ease (were 60 ms and 140 ms, straight), and settle the last 4 px up into place over 560 ms.
  The bar comes back after the bubble on an ease over 360 ms (was a straight 300 ms). "Ask the Coach", "Listening…" and
  "Transcribing…" cross over in 140 ms out, 240 ms in from 120 ms (were 90 and 150 from 90).

## Coach r10: one calm motion, bubbles on a shadow (14 Oct 2026)
Omar 21:13: "still not polished enough… even calmer and more polished… smoothly easing… attention to detail", and 21:15:
"the text bubbles on the coach screen to have a backdrop shadow so it looks very premium". Calm here means longer,
softer easing and fewer moving things, not more effects; the look is unchanged except the bubbles' shadow.
- **One motion for everything that moves in the bar** (`rampSpring` in Coach.tsx): a critically damped spring that starts
  soft and dies away with no point where it brakes. The opening's 5 px overshoot and the growing's small bounce are gone
  (they read as restless); opening and closing now match (0.62 s), a new line 0.52 s, a sent message's flight 0.58 s and
  its shape 0.42 s, said words 0.6 s with the softest start. The list's glide to make room is a touch slower (W 8, was 10).
- **Smaller things calmed:** the send/stop icon cross-fades (260/380 ms, the old one settles back as the new one comes
  forward; it used to turn 45 degrees in 120 ms); the send button 280/460 ms (was 160/260); the camera tucks away and
  comes back on a smooth ease instead of a spring (opacity 320 ms from 200 ms); the "typing" dots rise 3 px from 86 %
  instead of popping from 70 %; a sent message, a reply, its buttons and the tips all come in more slowly (760, 420,
  680, 640 ms); New chat fades the old chat over 280 ms (was 160); the voice ring breathes with your voice (each level
  glides in over 180 ms, swells 11 % at most) instead of following every flicker.
- **Bubbles on a shadow** (`--bubble-sh`): your messages sit on a tight contact shade, a short soft one and a wide, low
  one, like the bar's controls, in both themes (the old one was too faint to see). Static, never animated; a sent
  message's flying copy carries the same shadow, and for a typed message it fades in over 160 ms over the pill's own so
  the two never double up for a frame.
- **After a harsh review (r10b):** a typed message's copy now starts see-through and its paint comes up over the real pill
  over 200 ms while the pill holds its shape (`CLOSE`: it closes up on the copy's own shape curve from 60 ms, as the copy
  lifts away); the copy used to replace the pill's warm frost with its solid slate in one frame. The send arrow fades over
  120 ms from the tap (it was cut off by the copy). Closing is quicker with no tail (`MORPH_BACK` 0.4 s, done within half a
  pixel) and the camera starts back 80 ms in, so edge, camera and bar land together (the edge used to creep on ~14 px
  for half a second). Said words: the bar fades out over 160 ms under the lifting pill (`SAID_OUT`) and only then closes up,
  instead of vanishing. Light theme bubble shadow: warm and light, gone within ~18 px (it read as a grey Material card).
- Still measured: no layer made or dropped in the bar when opening, typing, sending or dictating.
- **Seamless settle (r10c, Omar 22:46: "seamless, not an animation, then a different look"):** every hand-over measured
  as the last animated frame (each animation held 1 ms before its end) against the first settled frame. Three steps were
  found and removed: (1) the flying copy's glass was a solid colour under an opacity and its ink an opaque colour under an
  opacity, a level or three off the real bubble's alpha colours: it now uses the bubble's own colours, alpha and all; (2) a
  moving, resizing copy can't draw letters on the page's pixel grid, so as the real bubble took over every letter edge
  stepped (up to 133/255, one line up to two pixels): the fix (the landing bubble on a layer of its own, `will-change:
  transform`, from the moment it is hidden, dropped 160 ms into the next send while the list moves) adds and drops a GPU
  layer, so it goes to Beta first and is not in this release; (3) a move still a ten-thousandth short on its last frame is drawn a hair differently
  from one at rest (the camera's rim stepped 51/255 as the pill closed): every Coach curve now ends on two frames held
  exactly at its end (`asCurve`). With all three: sent and said landings, pill close, keyboard ride end and the reply's
  words settling to plain text all within 3/255 (capture noise is 2/255).

## Keyboard: the chat always lifts with it (14 Oct 2026)
Sometimes the Coach chat stayed where it was when the keyboard came up, so a sent message landed under the bar. A sheet
takes away the keyboard's room (`--kb-room`, ui/Sheet.tsx) once its keyboard value is back at 0, and the keyboard's very
first frame on the way UP also reads 0: when that frame came right after the room was made, the room went again. The room
now goes only when the keyboard is heading down (`keyboardGoal() === 0`). Slowed ride probe: up to 5 of 6 failed before,
20 of 20 pass after.

## Coach 2.0, phase 1: it knows everything and follows the conversation (15 Oct 2026, v0.1.133)

Omar wants the Coach to be an agent over the whole app. The plan is in `docs/coach-plan.md`; this is phase 1.

- **Look-ups** (`src/lib/agentLookup.ts`): every request still carries the short summary (a week of food, the last workouts,
  top lifts), but the model can now ask for anything else and the phone answers at once from its own data: food on any day or
  by name over months, daily nutrition, workouts in any range, the whole history of one lift (best set, e1RM per session,
  what to do next), records and stalls, weigh-ins and measurements, wrestling and other activities, sets per muscle, the
  whole plan and the next 14 days, routines in full, exercises by muscle (English or Danish words) or equipment with the ones
  he does first, saved food, settings, memory, day notes and what he said before. `decide()` runs up to three rounds: look
  up, look up again if needed, answer. While it looks, the Coach shows "Looking at your bench press history…" under the
  typing dots; the orb shows it instead of "Thinking…". Each answer is capped at ~6,000 characters. Nothing extra leaves the
  phone: the results go to the same AI as the rest of the turn, and API keys never appear in them.
- **"It" is the exact item**: every food on a card and in today's DATA carries its id (`[ref e_…]`), the cards' notes in the
  conversation keep it, and `edit_food` / `delete_food` / `move_food` / `copy_food` / `replace_food` take `ref`. "Log a
  banana" → "move it to lunch" → "make it two" changes exactly that banana, even with another banana in breakfast. A ref
  that is gone falls back to the name.
- **One conversation** (`src/lib/thread.ts`): what is said at the orb screen joins the Coach's saved chat (and shows there);
  both build what the model sees from it. Undo and Apply at the orb are written back. "Continue in Coach" no longer copies
  the turns (they are already there).
- **Plan a day** (`plan_day`, `src/lib/planDay.ts`): "chest and triceps with some shoulder tomorrow" → the model looks up his
  exercises for those muscles and sends the day; without a list the app picks itself (the first muscle 3 exercises, the
  others 2, "some" 1; most done, then most recent; anything memory says hurts is left out). Each exercise gets the sets and
  reps from his routines and the progression target from his history. A preview card; Apply makes a routine for that day and
  places it as a one-off (the weekly plan is untouched); Undo takes both back, also by voice. A hard leg day before a planned
  wrestling day gets a warning line.
- **Newest model by itself**: the OpenAI model is picked from the key's model list once a day (`pickSolModel`): the newest
  `gpt-X.Y` or `gpt-X.Y-sol`, never mini/nano/pro/dated variants and never below GPT-6.1 Sol. Settings → Voice & AI → Model pins
  one. Spending is still estimated at GPT-6.1 Sol prices.
- Checks: `tests/coach2.test.ts` (17 tests), `scripts/journey-coach2.mjs` (stubbed Gemini: look-up round trip, orb → Coach
  "move it to lunch", plan → Apply → Undo), `journey-sol` now also proves a newer model on the key is used.
- Known, not from this change: `journey-coach` fails on the unchanged app too ("the copy hands over to the real bubble").

## Coach 2.0, phase 2 part A: anything you can tap, by talking (16 Oct 2026, v0.1.134)

- **Every setting is one table** (`src/lib/settingSpec.ts`): key, label, allowed values, what it changes. The schema's keys, the
  validator, the prompt's list and the guide all read it. Beyond the old 16: colours, background, glow, length unit, when a new
  day starts, fibre target, plate step, which view a workout opens in, the rest-over notification, every Today card on/off and
  their order, Coach notes, reminders and their time, quick water sizes, name, goal, experience, equipment and training days.
  `set_setting` takes several at once (`settings: [{key, value}]`): one card, one Undo; anything not in the table is dropped.
- **New actions** (all with Undo): `edit_meals` (rename, add, reorder; a meal with food in it is never removed),
  `log_saved_meal`, `delete_water`, `create_exercise`, `archive_exercise` (own exercises only), `set_increment`,
  `log_measurement` / `delete_measurement`, `workout_control` (pause, resume, start/skip/±rest, an exercise's rest, superset,
  move up/down, note, rename), `set_split` (the whole week incl. wrestling days, as a preview), `skip_day`, and
  `start_workout` "planned" (today's planned workout). Routine edits can change rest and warm-up sets too. The prompt now also
  teaches `undo_last` ("undo that"), which the schema had but the instructions never mentioned.
- **Big changes are previews**: the whole week, a planned day, deleting a routine or a workout, clearing a meal or a day
  (more than one food), and a routine edit with three or more changes. The card says what will happen; nothing changes until
  Apply; after Apply it can still be undone (button or "undo that").
- **A newer preview replaces the older one** (`replacedIds` in `ui/agentUi.tsx`): two versions of tomorrow can't both be
  applied; the older card says "Replaced by the newer version below".
- **The guide by section** (`guideSections` in `lib/coachContext.ts`, the `guide` look-up): the Settings section is built from
  the settings table, so it can't fall behind. A test fails if any action, setting key or Settings page is missing.
- **Fixes**: days the Coach plans once (`Routine.oneOff`, additive) no longer fill Train → Plan's routine list or the week
  editor, but still work in the plan and history; the OpenAI brain is called by the model actually used ("GPT-6.5" when the key
  has it) everywhere it is named; Gemini, if it ever turns the long schema down, is asked again in plain JSON mode with the
  schema written into its instructions (remembered per model; answers are validated the same way); `journey-coach` was stale
  (it matched a typed message's bubble by exact text, but the bubble now keeps the field's wrapped lines; and the calmer
  flight lands at ~1.7 s, after its 1.4 s window) and passes again.
- Checks: `tests/coach3.test.ts` (14), `journey-coach2` (+ week preview → Apply → Undo, several settings, a measurement),
  `journey-sol`, `journey-ai`, `journey-coach`.

## Coach 2.0, phase 2 part B: cards that settle, wait, seal and undo (16 Oct 2026)

The Coach's cards used to appear with no motion at all (restored chats are kept still while the sheet opens, and that rule
also stilled new cards). Now a card that arrives in this visit moves; a restored one stays still (`fresh` on the message).
All of it is transform and opacity, ends on the card exactly as it rests, and is off with reduced motion.

- **Arrival**: the card rises 12 px on the smooth curve (780 ms) while its glass fades in; what it says follows 110 ms later,
  the lines in a 55 ms cascade, and a soft ring opens out from the icon once. (A spring, or a slight scale, left the text a
  sub-pixel off its resting place, so the card visibly settled when the animation ended: 38/255 against the still card. The
  plain rise lands within 2–3/255.)
- **A preview waiting for its tap**: one slow light passes across its glass, once, 0.7 s after it lands. It never loops.
- **Apply ("seal")**: one after the other, the old title leaves upward (240 ms) and "Done" comes up from below (420 ms,
  180 ms later), so two titles never overlap. The icon pulses once from rest (it never dips the instant it is tapped) with the
  ring once more (`acHalo2`: a keyframe the icon already ran does not replay), the lines breathe once (40 ms ripple), and
  Apply fades out in place while Undo fades in over it, in one grid cell, so the card never changes height. A week card's
  subtitle turns to "2 days changed".
- **The week** (`set_split` previews): seven day dots under the title (routine initial, a green dot for wrestling, the days
  that change outlined); on Apply the changed days settle in one after another, left to right.
- **Undo**: the strike is drawn left to right through each line, as wide as its words, and the card eases back to 55 %. The
  subtitle stays and the buttons fade out but keep their room (taking them away collapsed the card in one frame); a card
  restored already undone simply has no buttons.
- **"Looking at…"**: each new status rises 3 px into the place of the one before.
- `scripts/film-cards.mjs`: films these moves frame by frame (animations frozen and stepped 1000/30 ms) and checks the
  seamless settle (1 ms before the end vs finished, ≤ 3/255). `CLIPS=2,5` films only some.
- A harsh-judge pass found the one-frame jumps above; after the fixes every clip settles within 0–3/255. Filmed in Aurora
  (`AVEN_PALETTE`, default `aurora` in the film script). Shipped as v0.1.135 on Omar's "I would call it done".

## Coach 2.0, phase 3: memory that grows (16 Oct 2026)

- **The whole conversation, kept** (`src/lib/archive.ts`): the chat on screen still holds its last 60 messages, but every
  message to the Coach or the orb is also kept on the phone (IndexedDB `aven-chat`, text only, each card as its one-line
  note with its state). It is read once when the phone is idle after start and kept in memory, so the look-ups stay
  synchronous. The `conversations` look-up searches all of it: Danish and English folded, words that carry no meaning
  ignored, a word's start counts ("knæ" finds "knæet"), a date range, the best 12 hits each with the answer beside it.
  Backups carry it as `chat` (additive: an old backup has none and restores as before; restoring merges, nothing is lost).
  Settings → Coach memory → Conversation history: search it, or delete it (confirm). "Delete all data" clears it too.
- **Memory v2**: `remember` takes `memory` (the number of the note it replaces: a correction rewords that note, its earlier
  wordings kept, Undo puts it back) and `until` (a temporary thing: "sick until Friday" ends by itself; a date in the past or
  over a year away is ignored). Each note goes to the model with its age; an ended one stays numbered but marked "ignore".
  Up to 60 notes; when full, an ended note makes room. The card shows the old wording struck through (drawn as the card
  arrives) above the new one. The memory page groups notes by kind, shows "Until …", "updated …", and earlier wording.
- **It learns from what he does with its work** (`src/lib/ledger.ts`): a food moved to another meal, an exercise swapped
  for another, a planned day applied or taken back, a setting changed back. Undoing a move or swap takes its moment back.
  Two moments that agree make a rule (one never does); the rules go to the model as LEARNED (at most 6) and are listed in
  Coach memory → Learned from you, where Forget drops one for good.
- **The weekly review** (`src/lib/weekReview.ts`, `src/screens/WeekReview.tsx`): the Today card's button now opens a sheet
  with every number of the week (workouts vs planned, working sets, protein on logged days, weight trend, records, streak),
  sets per muscle against the usual week (the 4 weeks before), last week's focus checked against the data, and the Coach.
  The app computes everything and offers the candidates (missed workouts, fast weight loss, a stalled lift, protein, a
  muscle that dropped, food logging); the Coach (Gemini) writes a 2–3 line verdict and chooses at most two of them — an id
  it was not offered is dropped. Without a key, the app's own verdict and its top two. Kept in `reviews` (one per week, the
  newest 26, in backups); the Coach reads its last two reviews and whether their priorities happened the week after.
  Progress → Weekly reviews opens them again (no second AI call).
  - Motion: the numbers roll in like the workout summary's odometers, the muscles' glass rises, each bar grows from the
    left (scaleX, 60 ms apart) and the usual-week mark fades in after it; then the verdict's words rise in and the
    priorities settle like the Coach's cards. Once per week per visit; reopened, it is still. Off with reduced motion.
- `scripts/journey-coach3.mjs` (in `run-all.sh`) and `scripts/film-review.mjs` (frame-stepped clips + seamless settle).

## Coach 2.0, phase 4: smoother Coach, the web, recipes (16 Oct 2026)

- **Smoothness** (measured with `scripts/audit-coach.mjs`, which now starts from a full 60-message chat and records the mic;
  4× CPU, production build; averages of 2 runs before and 3 after, software Chromium is noisy):
  - every chat row is its own memoised component (`ChatRow`): a streamed piece or a keystroke no longer rebuilds all 60
    rows; the Coach reads only `exercises` from the store. Scroll, type, send, new chat: about 25–32 % less script;
  - the orb re-measured the page on every frame while you speak (its voice level is a style write on the slot's button);
    a style change that is only `--voice` is now ignored (anything else on that element still counts): mic about −16 %.
    (A first version ignored every style change on that element and made the orb screen's answer measurably worse; fixed.)
  - the chat is saved when the phone is idle (and at once on close), not in the frame the answer ends;
  - the answer, sent message, quiet note and typing-dots entrances fill `both` with no end keyframe (style guide §4).
  - An answer streaming in is about unchanged: its cost is the word-by-word fade (deliberate, v0.1.88).
- **The web** (`geminiSearch` in gemini.ts, `solSearch` in openai.ts): a `web` look-up. Gemini's Google Search grounding
  first (free within its daily allowance), OpenAI's search tool only without a Gemini key (its per-search fee is counted
  in the monthly Sol limit, `recordFee`). The text goes back to the model as LOOKUP RESULTS; its pages (https only, no
  duplicates, at most 6) are shown as chips under the answer and saved with it. A failed search is said, never made up.
- **Recipes** (`propose_recipe`): the model names the ingredients with amounts and the method; the app matches each one to
  a real food (`findFood`, shared with logging, but never an AI estimate), computes the macros (`calcRecipe`) and shows a
  preview: per-serving kcal/protein/carbs/fat, every ingredient with its amount and kcal, misses flagged and left out, the
  method folding open. Save recipe (Undo), Log a portion (one serving now, Undo), Shopping list (copied). After Save the
  card keeps its name and its other buttons. `suggest_food` cards show the app's own totals (no number when a food is
  unknown) instead of the model's.
- **A routine from a photo or said** (`create_routine`) is a preview first, like a planned day.
- `scripts/journey-coach4.mjs` (in run-all) and `tests/coach5.test.ts`.
- **A recipe is never lost to the shape of the answer** (found on Beta: "I want cake" answered three times, no card). A model
  that turns the full schema down answers in plain JSON mode; its format hint said only `foods: array`, so ingredients came
  back as text and the whole action was silently dropped. Now: the hint writes every nested shape out; `agentFoods` reads
  text ingredients ("30 g whey") and other keys (`ingredients`, `quantity`, `method`…); anything still unreadable is said in
  a card ("Part of the answer couldn't be read"); ingredients are matched in parallel; and Settings → About → "Copy last
  answer" copies the AI's last raw answer (kept in memory only, no keys) for diagnosing the next odd answer.
  `journey-coach4` runs the plain-mode path end to end. Shipped as v0.1.137.

## Coach 2.0, phase 5 part 1: the coach around the workout (16 Oct 2026, v0.1.138)

All of it is the app's own numbers: instant, free, no AI.
- **One way to tick a set** (`completeSet`, src/screens/workout/complete.ts): a tap, a set said to the orb or the Coach
  (`log_current_set`) all find records and "beat last time", buzz, start the rest (not inside a superset, not after the last
  set) and play the row's moment (the row listens with `onSetDone`). Before, a set logged by voice skipped all of that.
- **Readiness** (src/lib/readiness.ts): fresh / normal / tired, from the last check-in (two days at most), wrestling logged
  yesterday or earlier today (a hard one counts double), a week much bigger than usual, and the same weights at a higher
  RPE. Every reason is kept so the app can say why. It only ever suggests; it never changes a plan by itself.
- **The briefing** (Briefing.tsx, `briefing()` in src/lib/coachWorkout.ts) at the top of a workout started from a routine
  or plan: today's targets for the first three lifts (the same numbers the rows hold, from `suggestProgression`) with what
  moved since last time, a neutral flag box (tired with its reasons and "One set less per lift" with Undo; fresh; wrestling
  tomorrow with heavy legs; a health note that isn't about one lift and hasn't ended), and one focus line. It folds away
  (Collapse) on the first ticked set; ✕ hides it for that workout; reopened after a restart mid-workout it isn't drawn.
- **The finish screen**: "Next time" for the main lifts (most volume first, at most two): what moved today and the next
  target, in the finish choreography (`data-fm="after"`). A one-tap check-in (energy, soreness, sleep; each optional, a
  second tap takes it back) saved as `checkin` on the workout (an added field, in backups).
- **Smarter load**: day plans for today or tomorrow are a set lighter per lift when tired (not where the Coach chose the
  sets) and warn after hard wrestling the day before (logged, not only planned); Today gets "Take it easier today" and
  "<routine> after hard wrestling"; a lighter week is suggested sooner (a stalled lift plus RPE up or tired check-ins);
  the weekly review gets a "tired after N of M workouts" priority, judged the week after. The Coach's DATA gets a
  READINESS line, the check-ins and wrestling rounds and intensity.
- **Fixes**: memory notes that have ended no longer flag a lift in the workout or keep it out of planned days. Swapped day
  differences: the Coach's sets-per-muscle look-up showed four weeks of sets as one week's, and the weigh-in reminder
  never fired.
- **The web only when it makes sense**: the Coach searches for a fact that could be wrong or out of date (a number, a
  study, a supplement, something recent), when asked to check, or for recipe ideas; never for everyday coaching it knows,
  their data or the app.
- **The app counts its own AI trouble** (src/lib/trouble.ts, on the phone only, no message text): an answer it couldn't
  read, part of one dropped, Sol falling back, a web search failing, no answer. Settings → About: "How the Coach is doing"
  with this week's count and Copy details (counts, the last five, the last raw answer).
- `tests/coach6.test.ts`, `scripts/journey-workout5.mjs` (in run-all), `scripts/film-phase5.mjs` (settle: finish screen
  1/255, chip 2/255; the fold's card is identical, only the background's slow breath differs). `journey-ai` now applies the
  routine preview (phase 4).

## Coach 2.0, phase 5 part 1b: a briefing that only says what matters (16 Oct 2026, v0.1.139)

Omar trains to failure whatever the day, so readiness only added suggestions he would ignore. Redone:
- **Gone:** readiness (fresh/normal/tired), "You look tired today", "One set less per lift", the after-workout check-in,
  lighter day plans and the tired nudges, the earlier lighter-week nudge, the weekly review's fatigue priority, the
  Coach's READINESS line. (Wrestling clashes stay: they protect his performance on the mat, not how he feels.)
- **Each lift says only what its rows don't** (`liftHint` in src/lib/coachWorkout.ts, `LiftHints` in Briefing.tsx), on its
  own card in List and Focus alike:
  - "55 kg × 8 · your heaviest yet": only when set 1's planned weight is the heaviest ever on that lift (a rep best is
    what the progression aims at almost every session, so it would show on nearly every card); it replaces the reason
    line, not repeats it;
  - a stalled lift: "Stuck at 60 kg × 8 · or reset to 57.5 kg × 12" (about 5 % lighter, top of the range) with Use it
    (the accent chip, 44 px target), which fills its open sets, with Undo;
  - "Last time: …", the note left on that lift last time.
- **Today card** (List): only what is about the whole workout (a health note that isn't about one lift, wrestling
  tomorrow on a heavy leg day), one compact row when there's one line; no card when nothing applies. In Focus those lines
  are a caption above the first exercise.
- **Next time** says what went up "this time" in grey (in the accent it read like an instruction).
- Judged twice (sliced fold fixed earlier; this round: the stall line read as a contradiction of the rows, a capsule row
  read as a search field, lines didn't share one alignment); tests and journey-workout5 rewritten.

## Recipes find the food in kitchen words (16 Oct 2026, v0.1.140)

Found on the phone: a mug cake left out plain flour, vegetable oil and chocolate chips ("Not found — left out") though the
food list has Wheat flour, Rapeseed oil and Dark chocolate. The matcher took the extra words as required. Now, only when
the words as written find nothing sure, `kitchenQuery` (foodText.ts) tries the kitchen's other way of saying it (plain /
all-purpose / self-raising flour → wheat flour; vegetable / neutral / sunflower oil → rapeseed oil; chocolate chips → dark
chocolate, milk chocolate chips → milk chocolate; caster / icing sugar → sugar; unsalted butter → butter; large eggs → egg;
whole milk, rolled oats, Greek yoghurt), else the same words without filler (chopped, melted, fresh…). The food picked is
the one shown on the card, so a swap is never hidden. Also: a spice only matches itself ("cinnamon" had matched Cinnamon
roll). Tests in coach5.test.ts.

## A failed screen download leaves the app usable

Coach and the orb are loaded as separate screen files. If a download failed, the deferred loader replaced its rejected
promise during React's retries, and the uncaught error could unmount the whole app. Rejected promises now stay stable,
and each overlay has an error boundary: the failed overlay is dismissed and the existing toast offers Reload. Reloading
fetches the current app; recovery does not clear workouts, food, chat or keys. Successful openings use the same components,
styles and animation curves. `scripts/journey-open-recovery.mjs` blocks both screen downloads, checks the app and Settings
remain usable, then unblocks them and verifies Coach and the orb open after reload. It is in `scripts/run-all.sh`.

This reproduces a download-failure crash; the owner's exact intermittent phone freeze and GPU flicker still need device confirmation.

## Relative orb transforms cannot stop the shared animation loop

The orb's position reader parsed native keyframes with `DOMMatrixReadOnly`. Valid percentage forms such as
`translate3d(0, 10%, 0)` need an element's dimensions, so that parser throws. Inside Motion's frame callback, the exception
could stop the shared frame scheduler: Today stayed visible while Coach remained off screen and sheets stopped responding.
Unresolvable keyframes now use the existing browser-sampled path; unresolvable inline transforms use the last resolved
matrix and request a fresh measurement. The native animations, their timing and the orb's renderer are unchanged.
`scripts/orb-motion.mjs` covers relative native and inline transforms, opening/closing Coach and continued keyboard motion
in both high-refresh modes. The observed phone's exact offending transform has not been captured.

## Coach and orb close/reopen isolation (17 Oct 2026, v0.1.142)

An exiting screen stays mounted until its animation finishes. Its microphone, request callbacks and shared voice-phase
cleanup used to remain active until that delayed unmount, so a fast reopen could lose the new microphone. Coach and
Dictation now release their session work when closing starts, once; late stop/permission callbacks cannot release a newer
session. Recorder chunks are captured per recording rather than looked up from the next recording's buffer.

Coach's flying message copies lived directly under `.app`, outside the closing sheet. They and their animation/listener
work are now removed on close, while ordinary sent-message motion keeps its existing curves and duration. Orb read/render
callbacks are isolated from Motion's shared frame scheduler: an interrupted browser animation read cannot strand Coach
offscreen. The fault-injection regression proves that recovery; the phone's exact browser error has not been captured.

Focused regression: `node scripts/journey-coach-reopen.mjs` covers repeat opens, overlapping exits, recording/permission
isolation, closing mid-send and a one-shot interrupted orb read. Also run `node scripts/orb-motion.mjs` and
`node scripts/journey-coach.mjs`. This request explicitly uses focused verification instead of the app-wide suite.

## Capture the remaining Coach/orb freeze on the phone (17 Oct 2026, v0.1.143)

The owner confirmed the second-open freeze persists in v0.1.142 with High refresh rate both on and off. Desktop touch,
blur and throttled-CPU checks do not reproduce it. This release is diagnostic, not a claimed fix or an animation change.
For 2.4 seconds after Coach/orb opens or closes, `lib/coachTrace.ts` compares browser frames with Motion frames, records
surface positions and error locations, and keeps at most 32 events in this tab's sessionStorage. It never records error
messages, chat, keys or app data; nothing is uploaded or added to backups. After a freeze and reload, Settings → About Aven
→ Record stutters → Copy report includes that trace, even without manually starting the stutter recorder. The trace is
temporary debugging instrumentation; remove it once the phone's failure is diagnosed.

`scripts/journey-coach-freeze-report.mjs` deliberately stops the actual running Motion scheduler, checks the report
distinguishes it from browser frames, then reloads and copies the preserved report. It also checks chat/key markers stay
out of the trace. Run it in both high-refresh modes, plus the focused Coach/orb checks above. Fault injection verifies the
diagnostic; it does not establish that the phone's freeze has the same cause.

## Folded recipe methods release the closing Coach and orb (17 Oct 2026, v0.1.144)

The v0.1.143 phone report showed Coach fully offscreen with its scrim still mounted 2.4 seconds after closing; both browser
and Motion frames were running. Reproduced with a saved recipe whose Method was folded. `Collapse` registers with its
parent's AnimatePresence, but its completion effect depended only on `on`: already folded, that stays false when the
parent leaves, so it never calls `safeToRemove` and the invisible scrim keeps catching Today taps. The effect now also
depends on `isPresent`, using the existing completion logic and timing. The same case affects a new recipe on the orb.
No animation curves, durations, glass, layouts, orb geometry or chat data changed.

`scripts/journey-recipe-close.mjs` first reproduced one retained dialog and scrim after a normal close. It covers saved
folded methods, expanded methods, closing during a fold, repeated Coach openings and a newly generated orb recipe (Gemini
stubbed), with high refresh on/off and reduced motion. Focused verification remains limited to Coach/orb for this request.

## Coach 2.0, phase 5b part A: food you can trust (18 Oct 2026, v0.1.145)
Omar asked why "Power Potatoes" logged as a plain potato. There were five causes: the AI rewrote food words, Danish and English didn't cross-match, glued words ("powerkartofler") didn't match the spaced name, his own foods lost ties to generic ones, and a match on only some of the words stopped the online search. The fixes:
- **Every word must match.** A local food counts as sure only if it covers every word said (cooking words don't count). Glued words match in any order ("vaniljeskyr" = "Skyr Vanilje"), in either language (about 80 Danish↔English food words, `FOOD_WORDS`). Otherwise the app searches the Danish list, then online, and uses a hit with every word. If there is none, the closest food is used and the card says "closest match".
- **Your foods first.** Saved foods, favourites and how often you logged a food in the last 90 days break ties (`foodBoost`). The AI sees an OWN FOODS list to copy names from exactly, and a rule to keep food words as said.
- **Habit first, otherwise ask once.** Tied foods can be far apart in calories: raw against cooked, or more than 35% apart. Then "Which one?" shows soft rows with kcal. One tap logs the food and `setChoice` remembers the pick. The rows fold away while the logged line and Undo unfold. White, brown and basmati rice (all cooked) are close enough: no question.
- **The name is never cut.** `foodRow` no longer passes the AI's name through the dictation splitter ("Rice, white, raw" stays raw).
- **Never guess a known food.**
  - No amount: your usual amount ("your usual"), else one typical portion, else "How much? Say it in grams".
  - Pieces of a food sold by weight: the AI gives only the weight; the food's own label still counts.
  - Volumes on gram foods: a dl, tbsp or cup portion first, then a density table.
  - Photo amounts are marked as estimates.
  - AI estimates are stored per 100 g plus grams, so "it was 150 g" works.
- **Corrections stick.**
  - "Make it 2" on 150 g means two portions.
  - A bare number that changes the kcal more than 5× waits for a tap ("Change it to this?").
  - Label fixes are saved onto any saved food.
  - A replace remembers the swap.
- **Quick entries.** New `log_quick` action, plus a local parser for "quick entry 100 calories", "300 kcal 20 g protein" and "500 kalorier pizza til aftensmad".
- **Speed and honesty.**
  - Foods are looked up in parallel, with "Looking up 3 foods…" shown meanwhile.
  - "Couldn’t reach the food database" is shown apart from "Not found".
  - No day said means the day you are looking at; a copy goes there too.
  - After midnight, before the day starts, a new food goes to Snacks.

Tests: `tests/food3.test.ts`, `scripts/journey-food3.mjs`. `journey-food` now answers the oats question.

## Coach 2.0, phase 5b part B: training logging you can trust (18 Oct 2026, v0.1.146)
- **After the gym, or another day.** With no workout running, or for another day ("yesterday I squatted 100 for 5"), sets go into a *finished* "Logged workout" for that day. A live workout is never started. Later sets that day join it, and records are counted. Today's logged workout is linked to the planned routine when its lifts are in it, so the plan shows it done; a rotation moves on. Undo takes it back.
- **One "current set"** (`src/lib/currentSet.ts`): the Focus page being looked at; else, after a superset exercise, the partner whose turn it is; else the exercise you last ticked in, while it has sets left; else the first open set. The list's highlight, the bar, the Coach's CURRENT SET and "8 reps" all use it. The Coach passes over unticked warm-ups unless "warm-up" is said.
- **Misheard numbers are fixed, never asked about** (Omar's call), by `fixMisheard`:
  - Only real speech slips count: a digit dropped or added (8 ↔ 80, 800 ↔ 80) and teen ↔ ty (18 ↔ 80). The fixed number must land within 10% of the plan or last time; a real lighter day is logged as said.
  - The card says "heard 18 kg → logged 80 kg", with an amber "Use 18 kg" chip to put back what was said.
- **Repeats, "same again", extra sets, Undo.**
  - The same set said twice within 20 s is logged once ("Already logged", with Log again).
  - "Same again" copies the last set of that exercise.
  - Past the last planned set, one more is added.
  - Undo takes back only that set, and clears the rest timer only if that set started it.
- **A workout left open.** Opening the app with a workout idle for more than 6 hours asks once: "Still training?", with Finish. It is saved as of its last set, so its time is right.
- **Kinds and names.**
  - The prompt's catalog marks bodyweight (kg = added weight), assisted, timed and distance exercises.
  - `log_current_set` takes seconds, same and warmup.
  - Wrestling can be given in rounds without minutes (about 3 min a round), and intensity 1–3 is in the schema.
  - Gym words map to catalog names: bench and bænkpres, RDL, pull-ups and chin-ups, squats, OHP, rows, curls, dødløft. A tie goes to the barbell lift, but a lift you log under another name four or more times still wins.

Tests: `tests/train2.test.ts`, `scripts/journey-workout6.mjs`. The agent tests and `journey-ai` now start a workout first where they mean the running one.

## Coach 2.0, phase 5b part C: never lose what you said (18 Oct 2026, v0.1.147)
- **Try again.** A failed answer leaves an error row with a Try again chip. It asks once more from the same bubble; nothing is sent twice. The failed question is marked `failed` and left out of what the model reads until it is answered. A key problem gets an Open settings chip instead.
- **A cut-off answer is a connection problem.** When a stream that drops mid-way leaves JSON that doesn't parse, it now counts as a network error, not "the answer didn't make sense". The half-written bubble is taken away.
- **A slow line is not a Stop.**
  - The orb's 45 s limit no longer passes as a silent Cancel. It says "Slow connection", with Try again, and the question is kept in the shared conversation (marked unanswered) so the Coach shows it too.
  - Sol gets 45 s in the Coach (`withTimeout`), then Gemini answers. Stop still stops everything.
  - Waits are said: "Still thinking…" at 8 s, "Slow connection…" at 20 s.
- **Typing while it answers.** The arrow stays Send while there are words in the field (Stop only when it is empty). The words wait, the arrow dims, and they go by themselves when the answer is done.
- **No tech talk as the answer.** "Gemini answered" style notes are only the small grey line. They are never the reply, never read aloud, and never saved as something the Coach said. The free Gemini quota's return is said in your own time ("back at 09:00").
- **Smaller fixes.**
  - A photo message is sent to the model once; the message being answered was in the history too.
  - `DEEP` matches whole words ("plank" no longer makes Sol think hard).
  - Coach dictation passes your lift and food names to speech-to-text, as the orb does (`sttNames`).
- **Day start.**
  - New installs start the day at 04:00; saved settings keep their own (a missing value is 0, as before).
  - DATA explains the day boundary after midnight.
- **No nagging.**
  - Daily insights read the Coach memory.
  - An insight set aside with ✕ is told to the model so it isn't raised again in new words.
  - A health note older than four weeks is asked about once ("Still true?", with "It's better now" or ✕).
- **Nothing Omar-only.** The guide's "they train to failure whatever the day" became neutral ("how hard they train is theirs to say; their MEMORY may say more"). Omar tells the Coach once, and it lives in his memory.

Tests: `tests/converse.test.ts`, `scripts/journey-coach5.mjs`.

## Coach 2.0, phase 5b part D: your watch, automatic (18 Oct 2026, v0.1.148, Beta first)
- **Path.** Galaxy Watch → Samsung Health → Health Connect → the Android app → the page.
  - The Android app uses Android's own Health Connect (Android 14+): no new library.
  - `HealthSync.java` reads, for the last 14 days: steps per local day (Health Connect's own total, so phone plus watch count once), and the workouts with their type, time, average and highest heart rate, active calories and distance.
- **Handoff.** A TWA can't run code in the page, so the numbers travel in the address after `#hc=` (base64url JSON; never sent to any server).
  - The launcher reads while the opening zoom plays (at most 650 ms). If it isn't done, the last reading goes instead.
  - Settings → Watch drives `HealthActivity` through `intent://health/connect|sync|off`. It asks for read access, reads, and reopens the page it came from, so it works for Aven Beta too. Without the app installed, the link offers the APK download.
  - `PrivacyActivity` is the rationale page Health Connect requires.
- **The page** (`src/lib/healthSync.ts`) only believes an address the Android app opened (the referrer). It checks and caps everything, then takes it out of the address.
  - Workouts become activities, merged by their Health Connect id: never twice, and your note is kept.
  - A run you logged yourself the same day, as the same kind and about as long, becomes the watch's.
  - Lifting from the watch is left out (Aven logs the gym itself). A new kind, `stairs`, was added.
  - Intensity comes from heart rate: under 70% of your highest easy, to 85% hard, above that max. Your highest is never taken as below 185.
  - Steps are kept per day (`AppData.steps`, an additive field, in backups).
  - Calories are shown, never added to the food target. The Coach's DATA says so too ("never tell them to eat them back").
- **Shown in:**
  - Train → History (the watch's own name, e.g. "Stair climber", with bpm);
  - Today's week line ("2 cardio · 11,800 steps a day");
  - Settings → Watch (Connect watch / Sync now / Disconnect, last synced, this week's numbers);
  - the Coach's WATCH CARDIO and Steps lines.
  - People without the Android app or a watch see nothing new.

### Polish audit fixes (same release)
- "Use 18 kg" toggles: one tap logs what was heard, another puts the fix back, and the card says which it is now. Before, it changed the set but the card still showed the old numbers.
- The thinking dots no longer blink when "Still thinking…" arrives. They stay one element; status lines cross-fade and fade out with the dots.
- The error row rises in like the other rows. On Try again it folds away instead of vanishing.
- Card subtitles roll like titles, and after Undo the "Remembered for next time" line goes back. The title roll no longer has a near-blank moment: the old words fade out for 360 ms, over the new one's start.
- Finish from "Still training?" opens the finish screen, which also covers Today changing behind it.
- **Memory leak.** Each switch to or from Today or Food kept the whole old tab alive: Chrome held the calorie ring's `<svg>` with its `<foreignObject>`. The ring now empties and detaches its svg when it goes. Over 60 switches, nodes went from 15.5k to 6.2k, and listeners now stay flat (they used to grow by 13 per switch).

## Done ✓ on the watch (18 Oct 2026, v0.1.148)
Omar trains with music in his earbuds and walks around the gym, so the phone is often out of reach. The earbud button controls the music app, not Aven, so it can't be the trigger. Always-on listening was tried before: it misheard him and reacted to other people.
- **Done ✓.** When the rest is over, the "Time for set 2" notification (phone, lock screen, Galaxy Watch) gets a "Done ✓ 80 kg × 8" button. One tap ticks that set exactly as planned through `completeSet` (records, haptic, the next rest). If Aven is awake, the notification becomes the next rest countdown.
  - Chrome allows only two buttons on a web notification. So once the rest is over, the Android app's alert reuses the Skip slot for Done. The rest worker (`android/site/…-rest/sw.js`) decides at the tap whether it was a Done: the rest has been over for more than 1.5 s. It then tells the page "done", with the tap's time. Judging it later in the page went wrong: a page asleep behind the lock screen hears a real Skip late, and it would have looked like a Done.
  - **Every tap is also kept** in Cache `aven-pending`, with its time. Behind the lock screen Chrome can pause the page or drop it, and the message is lost. That was Omar's first Beta test: the button showed, but the set didn't tick. The page picks the tap up when it opens and every time it becomes visible again (`rest.ts` `applyPendingDone`). Each rest's Done counts once, whether it arrives as the message, the cache copy, or both.
  - **Heard late, it still counts from the tap.** The set's time is the tap, and the next rest started then, so it may already be over ("Go").
  - The Android app's alert is no longer local-only, so it reaches the watch. Its "Set 2 ✓" line stays when Chrome takes its own copy away just after the tap.
- **A whole workout from the wrist (18 Oct, after Omar's gym test).** On his watch, "Time for set 2" came with no Done ✓ at all (photo).
  - The cause: Android had stopped the Aven app during the rest. The alert it then rang in a fresh start had lost its Done words (they weren't saved) and Chrome's buttons (they lived only in memory). Short test rests never showed it.
  - Now every word is saved, and Chrome's buttons ride along inside the end-of-rest alarm, so a fresh start still has them.
  - Done ✓ is also handled in the app itself. The next rest starts counting down from the tap, and its alert ("Time for set 3") rings with its own Done ✓. Each rest's notification tag carries the next set's words and its rest, plus the six sets after it (words `n`, `z`, `w`, from `rest.ts` `stepOf` / `stepsAfter`), so the app can carry on while Aven sleeps.
  - On a rest the app started this way, +30 s and Skip stay in the app (Skip rings the next set at once). The website's Skip means something else.
  - The rest worker keeps every Done tap as its own cache entry (`/aven-pending/tap-<time>`). It no longer closes Chrome's notification after a Done, so the next taps still reach it.
  - When Aven opens or wakes, it replays the taps oldest first. Each one ticks the set that was next and starts the rest from the tap's time. Taps for another workout are left alone (the real app and Beta share the cache).
  - The CI emulator does exactly this: it stops the app mid-rest and then taps Done ✓ twice in a row (`android/ci/emulator-check.sh`).
- **Tap and say was tried and dropped (same day).** A tap on empty workout space listened for one phrase ("8 at 80") on the phone's mic. Omar's verdict: it needs the phone in his hand, and then the tick is just as fast and never mishears. It was removed before it shipped.
- **Why it still failed on Omar's phone (18 Oct evening): the old Android app.** Every fix above lives partly in the Android app, and the APK he kept installing was an older download, not the new one. Every build was called "1.0", so nothing showed it.
  - Now the Android app's version is the build number (`versionName "1.<run>"`): Settings › Apps › Aven shows which build is on the phone. With build 1.111 installed, Done ✓ ticked the set in Beta on the first try.
  - The on-phone diagnostics used to find this (a rest log screen in the Android app, the "Last Done ✓" and worker-version lines in Settings › Training) were removed once it worked. The CI emulator still prints the rest log (`AvenRest`).
  - From Chrome's own source: a notification button is a plain broadcast, and Chrome drops a tap whose notification it no longer has. So the page must never close the rest notification while a Done ✓ can still come through it.
- Tests: `tests/done.test.ts`. Journey: `scripts/journey-done.mjs` covers Aven closed, and Aven asleep with the message lost.

## Coach polish: hold to ask, charts, Undo all, pick changes, copy a routine (18 Oct 2026, v0.1.148)
The last part of Coach 2.0, phase 5 (docs/coach-plan.md).
- **Hold to ask the Coach.** Hold a logged food (Food tab), a past workout (Train → History), an exercise (Train → Library, Progress), or a chart (Progress, an exercise's progress) for about half a second.
  - A soft ring settles around it and a small frosted pill rises above it: "✦ Ask the Coach". Tap the pill and the Coach opens about exactly that.
  - In the Coach, a chip over the typing bar says what it's about (× takes it off), and three questions about it replace the usual suggestions.
  - The model gets the item with the message as `[about: …]`: a food's numbers and its ref, a lift's history, a workout's sets, a chart's numbers. It stays with that message in the conversation.
  - The bubble shows a quiet tag naming the item.
  - One listener for the whole app (`src/ui/askHold.ts`) reads a `data-ask` tag (`lib/askAbout.ts`).
    - A short tap still opens the item as before; the click that ends a hold is swallowed.
    - A scroll or another tap puts the pill away, and it goes by itself after 6 s.
    - The ring and pill live on `<body>` and carry the item's own accent. The ring is clipped where the dock starts.
- **Charts in the chat** (`show_chart`): estimated 1RM per session for a lift, bodyweight with its trend, calories or protein per day (target line), weekly volume, sessions per week, minutes on the mat.
  - Built from the app's own data (`lib/agentCharts.ts`) and stored on the card as plain numbers, so it's still there when the chat is opened again.
  - Drawn by the Progress tab's charts, across the card's full width. The line draws in slower than on Progress, and a reopened card is drawn still.
  - Nothing to draw is said plainly ("No sessions of Nordic curl to draw yet"), never an empty chart.
- **Undo all.** When one answer made two or more changes, an "Undo all N" ghost button sits under its last card. It undoes newest first and folds away once nothing is left to undo. It's on the orb screen too.
- **Keep only some changes.** A routine rewrite (three or more changes) is a preview with a tick beside each change.
  - Untick one and its words dim and a strike draws across them; the button says "Apply 3 of 4".
  - On Apply, the changes left out fold away and the card says "3 of 4 changes applied". What the model is told happened leaves them out.
- **Copy a routine** (`duplicate_routine`): the same exercises, sets and rests, with their own ids so the two never share an edit. Named "Push copy", or whatever was said; a second copy gets numbered. It comes with Open and Undo.
- **Judge round 1 fixes:**
  - The ring and pill were coral on <body>; they now carry the tab's accent.
  - The ring was too tight and ran under the dock.
  - Change details wrapped mid-number.
  - The ticks were too loud after Apply.
  - The heading read "200 G".
- Tests: `tests/coach7.test.ts`. Journey: `scripts/journey-coach6.mjs`.

## Settings → Watch, fixed and redone (18 Oct 2026, v0.1.149)
- **Connect watch did nothing in the real app.** The page only believed the watch's numbers (`#hc=…`) when Chrome said Aven was opened by the Android app. That mark is gone once Aven reloads itself for an update, so the numbers coming back from Health Connect were thrown away and the button looked dead (the screen even said "Needs the Aven Android app"). Now they're believed on any phone where the Android app has opened Aven before (`appOnPhone` in `lib/androidApp.ts`). A made-up link on a phone without the app still does nothing.
- **The button never looks dead:** it says "Opening Health Connect…" / "Syncing…" while the Android app works, and if nothing came back after a few seconds: "Nothing opened? Open Aven from its app icon…".
- **The screen:** a status card (the watch in an accent seat when connected, a small dot, when it last synced); this week's workouts, active minutes and steps a day as three thin numbers; the last seven days of steps as quiet bars (today in the accent, rising in once, transform only); the last three watch workouts with heart rate and Easy/Hard/Max. Before connecting, three steps show how it gets here (your watch → Health Connect → Aven). Neutral surfaces, colour only on the status and today.
- Syncing is automatic: every time Aven opens from its icon, the Android app reads Health Connect first.

- **v0.1.150: after Connect watch, back on the Watch screen with the answer.** Omar's video: "Opening Health Connect…", then Aven reloaded on Today, so nothing said whether it worked. The Android app reopens Aven at its start; the page now remembers the tap (`aven.hc.ask`, 3 min) and opens Settings → Watch again: "Watch connected", or on the screen itself what to do (for a refusal: search Health Connect in the phone's Settings → App permissions → Aven → allow all). The remembered tap also makes the answer count when Chrome's "opened by the app" mark is missing.
- **v0.1.151: a readout while it isn't connected.** Under the Watch screen, one small line says what the Android app last sent back ("answer 21:05: HC yes · allowed · on · 14 days · 3 workouts", "unreadable (n chars)", or "tapped connect 21:04, no answer yet"). Omar's report: with access off, the "not allowed" message came; with access on, the pop-up closed and nothing showed. The line says which step drops it. Remove it once the watch connects.
- **v0.1.152: the real cause.** Run on the CI emulator end to end (Connect watch tapped in the page in the app, access already given): the Android app answered at once, but its address reads `#hc%3D…` because Android's `Uri.Builder.fragment()` codes the "=". The page looked for `hc=` only, so every answer, from Connect watch and from every launch, was ignored. The page now decodes the address first. `journey-health` uses the coded form; it fails without the fix.

## The Coach as a person who knows you (19 Oct 2026, PR, no version bump)
Omar: the Coach should feel like talking to a person who knows him and all his data. His screenshots showed what didn't:
- "I did calves, put it in" made a second "Logged workout" beside today's Legs & shoulders.
- Asking to move it logged the sets again.
- A question was sent twice.
- Protein ideas came only from his own foods.
- "Calves: about 0 sets a week" when he trains them (he just hadn't logged them).

### Natural logging
- **Sets told afterwards go into that day's workout.** `log_sets` joins any finished workout of that day, not only the ones the Coach made. A second "Logged workout" is made only when the day has none.
  - `workout` (last / a date / its name) picks another one.
  - `after` puts a new exercise right after the one named ("I also did hip abduction, put it after leg press").
  - The card names the workout, and Undo takes it all back.
- **No silent workouts.** `add_exercise` with nothing running says so, and starts one only with `start: true`. That silent start is what made the screenshot's mix-up.
- **Skip by voice.** "Skip this set" means `log_current_set` with `skip`. It takes the planned set out, and Undo puts it back.
- **New rules for the Coach:**
  - past tense is never a live workout;
  - a wrong log is fixed with undo + log again (never twice);
  - kg/reps not said means last time's;
  - talk like a person: "I forgot the pizza last night" → yesterday's dinner, "same breakfast as Monday" → copy, "half of that" → edit.
  - Food ideas: at most one or two from his usual foods, the rest useful new ones (Danish supermarket staples, simple dishes). An open request ("700 kcal, something") gets one short question first ("Sweet or savoury?").

### All the watch data, two years back
- **The Android app reads** (`HealthSync.java`) per day:
  - steps, active and total calories, distance, floors;
  - resting heart rate, HRV (RMSSD);
  - sleep, counted on the morning it ended: total, deep, REM, light, awake, bed and wake times;
  - weight, body fat, VO2 max, blood oxygen, breathing rate;
  - and the workouts.
- **Permissions:** each extra kind is optional (`MORE`). Only steps and workouts are needed for "connected". Connect watch asks for all of them, and history access only on Android 15+.
- **History:** the last 14 days every time, plus one older 30-day stretch, walking back about two years over the next openings, then from the top. A stretch that never reached the page comes again. A workout's heart rate, calories and distance are worked out once and remembered.
- **The page** (`healthSync.ts`) keeps it per day in `health` (additive; backups carry it). A day read again replaces that day.
- **The Coach** gets BODY & RECOVERY in DATA (`src/lib/recovery.ts`):
  - the last 7 nights with stages;
  - resting HR and HRV against his usual (30-day median);
  - the last 2 weeks against the 2 before;
  - weight, body fat, VO2 max.
  - A `health` lookup covers any range ("how did I sleep in September?"). Watch workouts in lookups carry bpm, kcal and km.
- **Recovery is mentioned only when clearly off** (Omar's choice): under 5 h of sleep, resting HR 7+ over usual, or HRV 25 %+ under. One short line where it fits, and never "train lighter" unless he asks.

### Fixes
- **No double send.** The Coach asks an opening question once per opening, and the same words within 2 s are asked once.
- **The little-work card says what is logged:** "No calf sets logged in the last 4 weeks", never "about 0 sets". Its Ask the Coach question asks first whether he trains them without logging.

### Review fixes (19 Oct, two reviewers, every finding reproduced in `tests/review173.test.ts`)
- **Undo on a Coach card takes back only what that card added.** It used to put back a copy of the whole workout, so a set
  changed by hand afterwards, or a second card's exercise, was lost with it.
- **Which workout:** the running one when it is the one named (it carries its routine's name); else an exact name, else the
  closest; the newest by date, whatever the list's order. A name that matches nothing says so instead of guessing.
- A finished workout keeps its own length when the Coach adds to it later (it used to stretch to "now"). "After leg press"
  when there is no leg press says it went at the end.
- **The same words twice** are dropped only while the first is still being answered; typed words never.
- **Watch:** a later sync adds to a day field by field (a read that failed on the phone no longer wipes sleep or weight);
  workouts are kept in date order; one deleted by hand never comes back (`hcGone`); only workouts from the last two days
  are announced. On the phone, the new kinds (sleep, HRV…) are asked for once on a sync when the watch was connected
  before they existed; sleep stages are added up in seconds (whole minutes per stage lost up to ~25 min a night) and a
  night written by two apps is counted once.
- **Recovery:** "usual" needs 3 days; a sleep time can no longer show as "6h60".
- **The watch's own walks** (auto-detected, no note) are kept and counted in the steps, but not listed in Train → History or
  counted as cardio on Today: with two years of history they buried the workouts (Omar, 19 Oct). A walk logged by hand,
  or with a note, is still listed.
- Not changed (reasoned in the PR): the 160k cap (real payloads are ~45k), two same-kind sessions on one day merging into
  the watch's, storage growth (~0.5 MB for two years), the history pointer moving on before the page has the data.

### Checks
- `tests/coach8.test.ts` (8) and `tests/health.test.ts` (+3).
- `scripts/journey-coach7.mjs`: calves after leg press in today's workout, the pizza in yesterday's dinner, a question back, BODY & RECOVERY with what is off.
- `journey-health`, `journey-workout6`, `journey-coach6`, `journey-sol`, `journey-ai`.
- The CI emulator grants the new permissions in its Connect watch run.
- **The new data needs the new Android app** (an APK publish after review). The web part works with the old app: it just gets steps and workouts, as before.

## Heavy days and catching up, true maintenance (19 Oct 2026, PR, no version bump)
(Superseded in parts by "Review round 1 fixes" below: the −500 × 4 formula, the 15 %/400 cap and the gentle default are gone.)
Omar: he overeats mostly in the evening and often logs it the morning after, as one big addition to yesterday. He asked his
coach to decide the tone. Chosen: direct, not soft and not harsh. The number is said straight, then the plan. Step 1 of 3
(step 2: learning why and stepping in early; step 3: experiments).

### Noticing a heavy day (`src/lib/eating.ts`)
- **Clearly over** = at least 600 kcal and 25 % over the target. Forgetting dinner and logging it the next morning is not a heavy day.
- **Two ways:**
  - **the same evening:** after 20:00, today goes clearly over;
  - **the morning after:** a log for yesterday (or up to 3 days back) made later, and that day ends clearly over ("logged the day after").
- `src/lib/eatingWatch.ts` checks 1.5 s after any food change and shows one toast: "Yesterday: +2,000 kcal over. Next 4 days: −500 kcal a day." with Undo.

### Catching up
- The overage is spread over the next days, the same amount each day: 2 days up to 900 kcal, 3 up to 1,500, else 4 (up to 6 when the floor is close). Never one brutal day: that sets up the next evening.
- A late log starts today; an evening one starts tomorrow.
- **Floor:** never under 80 % of true maintenance (or of the target while maintenance is unsure), and never under 1,800 kcal. Protein targets stay.
- Stored in `catchUps` (additive; backups carry it). Today's ring, the day fill and the Coach's "kcal left" all use the lowered target (`kcalTargetFor`). Under "kcal left": "−500 catch-up · 3 days left".
- More logged for the same day raises the plan (by 200+ kcal). Taken back (Undo, or "don't cut my calories" to the Coach) it is never set again for that day.
- The Coach can set one too ("I ate about 1,500 extra yesterday"): action `catch_up`.

### True maintenance (`src/lib/maintenance.ts`)
- From the last 4 weeks: average logged intake minus what the weight trend says (7,700 kcal a kilo, least squares so one odd weigh-in doesn't swing it). Weigh-ins come from Aven and from the scale through the watch.
- Needs about 10 logged days and 4 weigh-ins two weeks apart; until then the Coach says "not enough yet". Confidence low/medium/high from the days and weigh-ins; low is called an estimate.
- Relative to what he logs, so a target built on it works even if some evenings go unlogged. The Coach offers a target for his goal (fat loss −500, muscle +250) and never changes it unasked.
- **Invisible calories:** when the watch's total burn is 300+ kcal above it, roughly that much a day is probably not logged. Said once, without blame.
- **Weigh-in nudge:** in the morning, when the last weigh-in was 3–6 days ago, a quiet "Step on the scale?" card.

### The Coach
- DATA gets EATING PATTERNS: true maintenance, invisible calories, heavy days in the last 4 weeks (late or evening), the catch-up running, and JUST NOTICED (said once in its next reply, then marked told).
- 3+ heavy days a week for 2 weeks: it mentions once, gently, that a doctor or dietitian can help.
- The week review counts heavy days this week against the 3 before, and gives true maintenance.

### Checks
- `tests/eating.test.ts` (10): the 2,000 kcal morning-after log, forgotten dinner not flagged, growing and taking back, the evening case, the floor, maintenance for a known deficit, invisible calories, not enough data, told once, the `catch_up` action with Undo.
- `scripts/journey-eating.mjs`: the morning-after toast, the "−500 catch-up · 4 days left" line on Food, Undo. (It caught a render loop in the Food screen that the unit tests could not.)

## The Coach's brain, and the model contest (19 Oct 2026, PR, no version bump)
(The verdict's limits, the no-key default and the routing were changed by "Review round 1 fixes" below.)
Omar: "as good as it can get with the thinking and the communication… and if my friends try the app with their own data."
He can't judge AI quality himself, so quality is measured: a Coach exam on fake people, run on real models.

### What the review of the old Coach found
- Its instructions were almost all about actions; next to no coaching knowledge or reasoning discipline.
- Two facts about Omar were hard-coded for every user ("they overeat in the evening", "they train hard whatever the day").
- DATA was cut at a fixed length from the end, and the end was BODY & RECOVERY and EATING PATTERNS.
- Half-logged days counted as real: in the exam every model told "Ali" (dinner unlogged every other day) his maintenance
  was 1,470 kcal "with high confidence".
- A heavy day with a target of 1,800 or less was never noticed (detection needed room to trim).
- The weekly review and Today's notes ran on the cheapest Gemini only.

### What changed
- **Handbook** (`src/lib/handbook.ts`): the core of good coaching in every message (trend over weigh-ins, what one
  heavy day really is, no punishment after overeating, rates, protein, sleep, plateaus, teens, making weight, red flags),
  topics in depth by a `handbook` look-up. **HOW TO THINK** (numbers → trust → context → one choice, then a self-check)
  and **HOW TO TALK** (answer first, one recommendation with its reason and trade-off, numbers and how sure, short, no
  lecture or guilt, one question at most; MEMORY on tone wins).
- **WHO THEY ARE** (`src/lib/person.ts`): each person's own patterns with counts: evening share, heavier weekdays, heavy
  days after short nights or sport, what they log, weigh-ins, training rhythm. Replaces the hard-coded lines.
- **DATA TRUST** (`src/lib/dataQuality.ts`): unfinished days (a meal logged on half their days or more is missing and the
  day is under 75 % of a complete one) are left out of averages and true maintenance; slips (one item over 1,500 kcal,
  5× the usual amount, the same item twice in 2 min) and weigh-ins 2.5 kg off their neighbours are flagged for one
  question when it matters.
- DATA is built by priority: the important blocks always go in; history fills the rest up to 20,000 characters.
- **Thinking**: decisions (maintenance, targets, cut or bulk, not losing) and "think about it properly" / "tænk dig
  grundigt om" get high effort.
- **Heavy-day verdict** (`src/lib/verdict.ts`): detection stays rule-based; the main brain, thinking hard, decides none
  or a small trim from the goal, true maintenance, how often heavy days happen, sleep, the next days and age. Code limits
  whatever it says: at most 15 % of the target (and 400 kcal) a day, 7 days, never under the floor, protein untouched,
  Undo. Without a brain, a gentle default (no cut on a bulk; else at most half back, ≤250 a day, ≤4 days). The toast
  shows its line; the Coach is told the reasoning (asked "why?", it explains). A catch-up set by the Coach is capped the
  same way.
- The weekly review and Today's notes run on the main brain (review on high), with the handbook.
- **Two models** (Settings → Voice & AI → Quick model): everyday messages go to GPT-6 Luna, decisions, photos and
  "think about it properly" to GPT-6.1 Sol; a key without Luna falls back to Sol. Spending is priced per model.

### The model contest (`scripts/exam`)
Five fake people (someone like Omar; a woman cutting with a noisy scale; a 16-year-old bulking in a weight class; one
who logs only half his dinners; a brand-new user) × 20 questions (logging and editing with exact checks; thinking
questions read by hand), the real Coach prompt and look-ups, through OpenRouter.
- Round 1 (old Coach, 12 models): Sol 11/11 on the exact checks; Luna, Argon, Gemini 3.8 Flash 10/11; DeepSeek V4 Pro
  9/11 but slow; the cheap DeepSeek Flash, GLM and Qwen Flash failed logging (out); Claude models ignored the app's
  answer format through OpenRouter (out without extra work).
- Round 2 (new Coach): Sol 0 fails, Luna 1 (asked instead of acting: rule added; final run 0), DeepSeek V4 Pro 3.
  Reading the answers, Luna on the new Coach is close to Sol day to day; Sol is richer on the hard questions.
- Cost for the same 20 questions: Sol $0.90, Luna $0.055 (about 16× cheaper).
- Heavy-day verdicts (Omar-like, a one-off for a consistent cutter, a 16-year-old bulking): every model chose no cut,
  with the right reasons.
- Run it: `EXAM_MODELS=openai/gpt-6-luna npx vitest run --config scripts/exam/vitest.config.ts` (an OpenRouter key from the
  environment; costs money; `EXAM_VERDICT=1` adds the verdicts). Results go to `/tmp/claude-0/exam`.

### Checks
- `tests/brain.test.ts` (9): unfinished days and Ali's maintenance (~2,050, not 1,470), slips and odd weigh-ins, who they
  are, the verdict's limits and default, low-target detection, the rules every message carries, DATA by priority.
- `tests/eating.test.ts` and `tests/openai.test.ts` updated (verdict line, the trim cap, effort for decisions).

## Review round 1 fixes (19 Oct 2026, PRs #173 + #174 + #177, ship together, no version bump)
Two reviewers went over the last three PRs and I re-ran their findings on the real code: changing the calorie target made
fake heavy days, a typo fix left the cut in place, one bad weigh-in broke true maintenance (6,910 kcal "high"), risky
messages went to the cheap model, and the heavy-day system leaned toward eating less. A third reviewer went over the fix
plan itself and found 20 more holes. Omar's answers shaped it: losing fat now (maybe something else later), frequent
heavy days decided by the AI case by case inside hard limits, a Beta trial with a copy of his real data, and "talking to
the Coach steers it, like a real coach". The plan and its ticks: `docs/coach-brain-plan.md`.

### PR #173 (natural logging, watch history), reviewed for the first time
- Undo on a Coach card takes back only what that card added (it put back a copy of the whole workout, losing a set
  changed by hand afterwards or another card's exercise).
- Which workout: the running one when named; else an exact name, else the closest; newest by date whatever the list's
  order; a name that matches nothing says so. A finished workout keeps its own length. "After X" not found is said.
- The same words twice are dropped only while the first is still being answered; typed words never.
- Watch: a later sync adds to a day field by field; workouts in date order; one deleted never comes back (`hcGone`); only
  workouts from the last two days are announced. The phone asks once for the new kinds (sleep, HRV…) on a sync; sleep
  stages added up in seconds; a night written by two apps counted once. Recovery's "usual" needs 3 days; no "6h60".
- Every finding has its test: `tests/review173.test.ts`. Android build and emulator green.

### Heavy days, fair and safe
- **The target each day had** (`targets`, `targetOn`): changing the target never makes past days heavy; the day it changes
  is judged against the higher of the two.
- **Heavy-day notices** in Settings → Targets: On / Quiet / Off. Unset follows the goal (fat loss On, others Quiet).
  Quiet: noticed, nothing said or changed, the Coach knows. Off: nothing recorded. Turning On never judges the days
  before (`heavyOnSince`). "No catch-ups ever" to the Coach turns it Off.
- **Decided once**: a heavy day is recorded, then the main model decides once (more food that day updates the amount but
  never asks or pops up again; deleted and logged again, or undone, it is never asked again either). A day changed while
  it was thinking gets a plan fitted to the day as it is.
- **Hard limits in code, whatever the AI or anyone says**: a trim only for an adult (age known) on a fat-loss goal with
  notices On, never with an eating-disorder note in memory; at most 250 kcal a day for all catch-ups together, at most 4
  days, at most half of the real surplus (over true maintenance when it is known well), never under the floor, never
  above their own target, protein untouched, Undo. No AI key, or a trim not allowed: no cut and no paid call, just
  "+2,000 kcal over. Mostly water on the scale — back to normal today, no cut." A plan the limits cut down gets a pop-up
  line that says what really happens.
- **Corrections**: the big entry deleted or fixed → the catch-up is gone ("Your normal calorie target is back"); a
  smaller day shrinks it, quietly.
- **The first launch** marks what is already there as seen: no pop-ups about the past.
- The evening runs until the new day starts (01:00 with a 04:00 day start counts). The Coach is marked as having said
  JUST NOTICED only when it was told it, and not by a reply that only logged something.

### True maintenance that one bad number can't break
Weigh-ins far off their neighbours (Aven's and the watch's) are left out, and so are the two mornings after a big day
while 6 or more remain; the trend is the median of slopes between weigh-ins a week or more apart (Theil–Sen), clamped to
1.5 kg a week, the result to 1,200–6,000, and anything clamped or steep is low confidence. Invisible calories only at
500+ kcal and 20 %+, worded "the watch may overestimate, or some food isn't logged", brought up once.

### Which model answers what (`route` in `src/lib/agentTurn.ts`)
- Main model, thinking hard: decisions (targets, maintenance, cut or bulk, a new plan, "not losing", "what now"), "think
  about it properly", and anything where a wrong answer could hurt: overeating and purging, fast weight cuts, making
  weight, dehydration, warning signs, and supplements, sauna or pain when asked about. Photos: main, at the setting.
- Quick model: logging, small talk, quick food facts ("how many calories in a banana"), planning at the setting.
- English and Danish, both ways: `tests/route.test.ts` (e.g. "jeg kastede op", "tabe 4 kg på 10 dage" → main; "5 g
  kreatin", "faste måltider", "plank" → quick).
- The time limit (Coach 45 s, orb 20 s) is only for starting to answer; once words flow they are never cut; without a
  Gemini key there is nothing to hand over to, so it waits. A key without the quick model is remembered until the key
  changes. Food estimates on the quick model.

### The Coach's rules
- **Talking steers it**: plans ahead remembered with their date; a goal change offers to switch the goal; the age kept as
  "Age: N (as of date)"; "that cut was too much / max 150" → fixed now and remembered as a preference that later
  decisions follow (a preference can only shrink a trim); vague unhappiness → one short question.
- Frequent heavy days or eating-disorder signals → help mentioned once, gently; no numbers for eating less; a health note
  so no catch-up is ever set. Training lighter only for illness or injury mentioned now, or under 18.
- Number first, conservative when the age is unknown; the age asked once.
- Handbook before the web; science fixes (cycle 0.5–1.5 kg, teens sleep 8–10 h and caffeine ≤ 2.5 mg/kg, making weight
  at normal hydration, surplus over true maintenance, protein per kg goal weight with high body fat, activity from ×1.2).
- Nothing about one person written in for everyone (no "most likely evenings", no "wrestling tracker").
- Weekly review: keeps thinking when the sheet closes, never saves an empty answer, retries once a day; heavy days only
  with notices On. Coach notes: one try a day, never bring up heavy days.

### The exam, run the way the app works (`scripts/exam`, 19 Oct)
Each question goes to the model the app would pick. 8 fake people (new: a teen whose age isn't known, someone with
frequent heavy evenings, a Danish user) × 31 questions (new: Danish, follow-ups like "why?", purging, a teen asking about
the sauna, and steering: "max 150", a tournament date, "bulking from January", a vague "not happy").
- GPT-6.1 Sol + GPT-6 Luna as routed: 0 of 22 automatic checks failed, $0.88 for all 31. Reading the answers found 4
  things (a dietitian mentioned after only 3 heavy evenings; "that cut was too much" set a new catch-up instead of taking
  it off; "my metabolism is broken" went to the quick model; a test setup), fixed and re-run: all pass.
- Heavy-day verdicts on Sol (5 cases): no cut in all, with reasons from the numbers (surplus over maintenance, how often,
  structure over cutting); a MEMORY "max 150" was followed. Teen, health note and unknown age: blocked in code, no call.
- The safety questions forced onto Luna at low, 3 times each (the path a missed phrase would take): all safe; after one
  more rule fix the purging case saves its health note 3/3.
- Gemini 3.8 Flash only (a friend with just a free Gemini key): 0 of 11 checks failed, good answers, $0.37; on the
  verdicts it chose one small trim (−200 × 4, inside the limits) for a stalled adult with a +2,500 day, none otherwise.
- Danish food estimates, Luna at low vs Sol: median 5 % off for both (Luna 14/15 within 20 %, Sol 13/15), Luna ~37× cheaper.

### Final reviews (round 2, 19 Oct)
Two fresh reviewers (code and behaviour) went over the whole stack after the fixes. Every finding was reproduced with a
test first (`tests/behaviour2.test.ts`, `tests/review2.test.ts`, new rows in `tests/route.test.ts`), then fixed:
- The hard limits are checked where the target is worked out, not only when a cut is decided: a cut stops at once when
  a health note or a younger age is learned, the goal changes, or notices go Off.
- "Don't cut my calories" while a heavy day is still being decided: no cut lands afterwards. Undo of "catch-up off"
  brings back only what it took off. Two heavy days decided together: the pop-ups add up to what really applies (≤250).
- Dictated risky lines went to the quick model ("jeg har spist alt for meget i aften", "I want to drop to 74 for the
  tournament", "I'm going to skip dinner because I ate too much", "I feel dizzy after cutting water", "is it ok to
  train with a sore shoulder") → main model now; "log my weigh in 84.5", "I binge watched netflix", "pre-workout meal" →
  quick. Danish letters at word edges (JavaScript's `\b` misses "ædt", "øm").
- The age is only taken from a note about the person ("his dad, who is 45" is not his age). A health note always fits in
  memory, even when it is full (the oldest ordinary note makes room).
- A typo weigh-in that is the newest one is caught against all weigh-ins; "high" maintenance needs 3 weeks of weigh-ins;
  a maintenance that is only a guess never suggests a new target.
- A quick-model name fixed in Settings is tried again; the weekly review never runs twice at once.
- Exam rerun of the 14 questions these touch, plus the verdicts ($0.76): all good on reading. Purging → help, a doctor
  today, no fasting, health note, catch-up off; teens → no sauna or water cut, parent and coach involved, age asked once;
  "no catch-ups ever" → off, Settings Off, remembered; "max 150" → off and remembered. Verdicts: no cut in 4 of 5, one
  −150 × 3 for a stalled adult (inside the limits); teen and health note blocked in code.

### Checks
- New tests: `tests/heavy.test.ts`, `tests/heavyWatch.test.ts` (with a stand-in brain, incl. 25 random sequences of
  adding, deleting and changing the target), `tests/maintenance.test.ts`, `tests/route.test.ts`, `tests/coachRules.test.ts`,
  `tests/review173.test.ts`, `tests/behaviour2.test.ts`, `tests/review2.test.ts`. `npm run verify` green (481 tests);
  Danish 0 missing.
- Journeys: `journey-eating` (rewritten: no key → no cut; a brain that asks for −600 × 6 → −250 × 4 and the pop-up says
  so; deleting the entry takes it away; logged again, not asked again; Undo; Off records nothing), coach, coach7, food, health, sol, ai, today.
- Speed: the Coach's whole context with 2 years of watch data and a year of food builds in ~60 ms (desktop); the target
  shown on screen takes ~0.004 ms.
- Known limits: on the day the target changes a real heavy day isn't judged; maintenance numbers shift a little with the
  steadier method; phrase lists can miss dictated wordings (the tables cover the known ones); the AI's trim judgement can
  vary between runs (the limits cap it); the age is only known once told to the Coach until setup asks for it; no AI key
  means no cuts at all. The in-app spending counter is an estimate: the real guard is the budget set at OpenAI.


## Coach 2.1: a coach, not a script (20 Oct 2026, branch claude/coach-quality, on top of #177)
Omar on Beta: a dictated "Hvorfor taber jeg mig ikke?" (heard as "Hvorfor tager I mig jer mig ikke?") went to the quick model
and came back hedged, with "a doctor or dietitian can help" from nowhere. His point: the model is capable; the rules and the
model choice wasted it, and he wants "a dynamic coach, like a real coach".
- **Principles instead of scripts** (`AGENT_SYSTEM`, `COACH_STYLE`): answer what they asked from their own numbers; a clear
  recommendation; uncertainty only when it changes the advice; a conversation, not a report; misheard words worked out
  ("I hear it as…"); an ambiguous "my week" answered the useful way; evidence named when it decides a question. Overeating
  and binges are coached (proportion, the trigger, a practical plan), never sent to a doctor; real warning signs (throwing
  up, laxatives, fasting for days, fainting, chest pain) still are. Line counts, "say how sure you are", templates and six
  doctor lines removed. The app's mechanics (logging, actions, previews, look-ups) kept; foods for two meals are now one
  log per meal (a lunch-and-dinner message logged dinner twice).
- **DATA is facts, never orders**: frequent heavy days, just noticed, age, "clearly off", learned habits; a heavy day counts
  as talked about only when the reply mentions it; "User is 18 years old" is read as an age.
- **The right model per message** (`chooseModel`): logging, commands and quick facts → quick model at once; risky and
  decision phrases → main model thinking hard; any other question → one tiny quick-model call that sees the conversation
  before and whether it was dictated (31/31 on labelled messages; ~2 s; falls back to the phrase lists).
- **Longer when needed**: replies up to 4,000 characters; Gemini may write 6k tokens and think 1k; spoken orb answers short.
- **The test bench** (`scripts/exam`): old vs new from two checkouts, Omar's real backup as a persona (kept out of the repo),
  blind pairs for the chat (`pairs.mjs`), a judge model both ways round (`judge.mjs`), a $10 project ledger.
  Results: Omar's 10 blind pairs on his own questions — new 4, old 0, the rest equal or both weak (his feedback fixed and
  re-checked); the judge model 13–1 for new (it favours longer answers, so Omar's picks count). Logging 0/10 failures old
  and new; safety 5/5 (purging → a doctor, teens → no sauna or fast cut). Spent ≈ $4.1 of $10.
- **Review round (two reviewers, 20 Oct), fixed with tests:** Stop during the model choice now stops the turn (it answered
  anyway); the voice flag reaches the Coach chat (it never did) and survives the orb's Try again; short statements about not
  eating, fasting, water only, sauna, pills, pain, pregnancy or being under 18 always reach the chooser (they went straight to
  the quick model at low), and the chooser treats them as health questions (38/38 labelled); no quick model → no choosing call
  (never the main model just to choose), a slow choice is cancelled; "talked about" reads whole numbers (2,300 ≠ 300) and
  real words. Restored as knowledge: plan around wrestling, judge balance from set counts, conservative numbers when the age
  is unknown (asked once), ESTIMATE labels, pregnancy/medication/injury → a doctor okays changes. Added: concussion,
  rhabdomyolysis and heat red flags; no preference unlocks water cuts, saunas, fasting days, purging or training through sharp
  pain. Omar's calls: a long binge pattern (3+ weeks, "couldn't stop"/"feel awful") → the coach keeps coaching and once
  mentions a GP who knows binge eating; trims after frequent heavy days stay the verdict's judgement; the coach may delete
  memory notes when asked; the default monthly AI limit is 200 kr (a realistic month is ~85–145 kr).
- **Before shipping (v0.1.163, 20 Oct):** an amount that doesn't fit them ("2000 g rice" when they eat 200 g, or a never-logged
  food at a kilo and 1,500+ kcal) is asked — "Did you mean 200 g?" — never logged as heard; the last 7 days day by day are in
  DATA, so "how's my week?" is answered in one round (~16 s, was 19–29 s with a look-up round).
- Shipped to the real app with #173, #174 and #177 as v0.1.163 (Omar, 20 Oct: "I can only really test it on main").
  Next: the coach's notebook (what it advised, when to check), follow-ups and a weekly check-in.

## Coach deep dive and smoothness (v0.1.165, 20 Oct)
From Omar's 19 Oct recordings ("flickers, unpolished animations, stutters, icons disappearing"); strict judges 6/10 (live) → 9/10.
Tried on Beta first; Omar's yes 20 Oct. Judge files in /mnt/project-files/coach-polish/r13-deep/.
- Stutter: style writes that restyled the whole sheet are gone. No `[style*=]` test left of a combinator, no app-wide `:has()`,
  and --kb-room / --foot-h / --grow-pad are registered `inherits: false` and written on `.sheet-body` (10-17 ms → 0.2-1 ms).
- Flicker: an answer's word layers are kept until it scrolls off screen; the flying bubble hides by opacity (its layer is made
  at flight start); Today's Coach/Settings buttons keep their press layers (3 drops when the Coach opened → 0).
- Orb: closing with the keyboard up, it rides its button, then settles onto the dock line on a critically damped spring from
  the button's own speed (it leapt 175 px). Reopened mid-close, it coasts on and turns round from where it is (slot is a new
  element: keyed by id). It fades with the Coach when Settings opens over it.
- Older messages: loaded in idle batches of 6, never while answering, flying or with the keyboard moving; a sub-pixel shim
  on the thread makes each batch add whole pixels, so the view holds exactly still (scrollTop is whole CSS px).
- Stop X stays until the last word; typing dots keep their phase; waiting send button dims as a whole; photo chip folds away.
- Dock orb at rest: the script loop sleeps while the worker turns it; everything that can move or light it wakes it, plus a
  250 ms check of the dock's rect (idle main thread 130 → 40 ms/s at 4x CPU). Unchanged state is no longer posted each frame.
- Left as is: the typing bar's frost clip (no cheaper look-identical way: the blur is redone anyway as its parts move), a
  ~0.3 s send-button fade during the voice lift, and Chrome's grey band under the keyboard as it opens (platform).

## The watch in the background, and in detail (20 Oct 2026)
Omar wanted the watch synced more often, also when Aven is closed, and "the most detailed possible": continuous heart rate,
every sleep stage, steps.
- **In the background.** With "access in the background" allowed in Health Connect (Android 15 and up), `HealthJob` reads every
  half hour (Android picks the moment; not on low battery; again after a restart). Whatever opens Aven then finds numbers at
  most half an hour old and opens with them at once (read in the last 5 min: no wait at all; Sync now: under 2 min old, at
  once). The page itself can only receive them when Aven opens or Sync now is tapped: a web page can't be handed data while
  it sits open. Settings → Watch says whether background reading is on, and where to allow it if not. Already connected
  phones are asked for it once on the next sync.
- **The walk through the history moves only when the page has had a stretch** (`delivered`). Half-hourly reads would
  otherwise walk past two years in a day without the page ever seeing it. The older stretches are read once and kept until
  delivered, so the background reads stay light (Health Connect limits background reads harder; its exact quotas aren't
  published).
- **Detail** ("dt"): heart rate a minute at a time (the average of every reading in that minute: every few minutes at rest,
  every second in a workout, all the time with "measure continuously" on the watch), steps a minute at a time (Health
  Connect's own count, phone and watch counted once), every sleep session (naps too) with each stage and its times. The last
  3 days every time, older days 4 at a time back to 90 days. Minutes are packed two characters each and the whole answer is
  squeezed (raw deflate, "hc=z~…", about 4× smaller), so a week with everything else is about 20,000 characters. The
  emulator carried 60,000 without trouble (an earlier "too big" was only adb's own command-line limit: the test now reads
  the address on the phone).
- **Kept apart** in IndexedDB `aven-watch` (`lib/watchDetail.ts`, the last 365 days), not in the app data (every save would
  carry it) and not in backups (Health Connect has it). `watchDetails(from, to)`, `minutes(packed)` and `onWatchDetail` are
  the way in for anything that draws it. Delete all data clears it; Beta has its own.

## Weight and food into Health Connect (20 Oct 2026)
Omar: "weight and nutrition, from Aven". Aven now also *writes* two things into Health Connect, so Samsung Health and other
apps see them: each weigh-in (the last of a day) and each day's food totals (calories, protein, carbs, fat), as one record
per day each, named by date (`aven-w-<date>`, `aven-n-<date>`), so a day sent again replaces itself. Deleted here = taken
out there. A web page can't hand data to the Android app by itself, so they ride along when Sync now or Connect watch is
tapped (`w=` in the link, `lib/hcWrite.ts` → `HealthWrite.java`), only what changed in the last 90 days. They count as sent
only once the app answers `&hw=<n>`; "denied" (Write weight / Nutrition not allowed in Health Connect) sends them again
next time and Settings → Watch says where to allow it. Aven's own weigh-ins are skipped when reading the watch's back.
Not written: workouts and anything else (they'd come back as "watch workouts").

## More from the watch (20 Oct 2026, v0.1.168)
Omar: "add all the data, GPS also, skin temperature and body composition, the ones that make sense". Now also read:
- **Body composition** (the watch's scans): lean mass, body water, bone mass, basal metabolic rate (kcal a day); the day's
  last value, in `HealthDay` (`leanKg`, `bodyWaterKg`, `boneKg`, `bmr`).
- **Temperature**: body temperature, and skin temperature at night as the night's average off the watch's own normal
  (`skinDelta`, `skinBase`; Android 15 and up), an early sign of getting ill or under-recovered.
- **Climbing** per workout (`elevationM`) and the **GPS route** of the newest workouts (last 14 days, at most 8 per answer,
  thinned to 300 points, Google's encoded polyline), kept by the workout's Health Connect id in IndexedDB `aven-watch`
  (`routes`; `routeOf`, `routePoints`). Routes need "Exercise routes" allowed in Health Connect.
The Coach's watch look-up includes the new numbers. Left out on purpose: water and food logged in other apps (Aven has its
own), blood pressure and glucose (no device), cycle tracking, speed/power/cadence (pace comes from distance and time).
Already-connected phones are asked once for the new permissions (round 4).

## Corrections, done on the spot (20 Oct 2026, v0.1.169)
Omar's lunch, in four messages: "10 corn cakes" became 10 × a database's "serving (100 g)" = 4,200 kcal (to dinner, at
15:27); "majskiks, move it to lunch" → the same mistake again (paprika ones, 4,170 kcal); "the plain ones, 8 of them" →
only repeated back, plus a question about the brand; "about 75 kcal per 100 g" → "Couldn't find that in the log" twice for
food it had just logged. His words: the first one is understandable, but when I explain, it should understand me like a
real coach.
- **Counted things are pieces** (`foodText.placeholderPortion`): a database's stand-in portion ("serving (100 g)",
  "1 portion (100 g)", "100 g") is never taken as one of a counted thing unless they named it; how heavy one is gets
  estimated instead. The Coach is told the same ("10 corn cakes" = 10 pieces of about 8 g).
- **A fix finds the food wherever it went** (`pickEntry`): a meal that no longer holds it (the AI remembered dinner after
  it was moved to lunch) falls back to any meal that day; a ref copied with its brackets or cut short ("e_mvgpz3edi7…")
  is still read (it used to drop the whole fix without a word). A day asked for stays strict.
- **HOW YOU COACH**: a correction is an instruction: change it in the same answer with their numbers and a best estimate
  for the rest, say what changed; no repeating back, no asking for a brand.
- Exam: `fix-pieces` and `fix-kcal` replay his thread (orb, Danish, dictated) with the items in the log: 4/4 fixed both
  items, none asked about the brand ($0.01).

## Calm cards on busy backgrounds, untinted pop-ups (25 Oct 2026, v0.1.170)

Omar (20 and 25 Oct): on some themes the cards were "all over the place" (Sunset + Mesh) or a solid colour slab that
didn't read as blur (Golden hour + Night sky); after changing theme and switching pages the cards first showed the old
colours; he liked Champagne + Mesh ("dark glass with one soft glow coming through"); for pop-ups he picked C: no tint,
not see-through.
- **One look, no picker** (`src/surfaces.css`, `lib/types.ts` `lookOf` always A; Settings → Appearance → Surfaces and
  Sheets rows removed). One control glass for secondary buttons, chips and icon tiles; grain at half.
- **Pop-ups** take C's glass in dark: blur 44 px, saturate 2, brightness .84, black .34, no colour of its own.
- **Cards**: a still, soft copy of the field behind each tab (`ui/frost.ts`), held in place while the card scrolls (a
  scroll-driven transform, nothing blurs per frame). On loud or slab backgrounds the copy is tamed in OKLab toward the
  Champagne + Mesh look (`tame`): darker glass with the brightest glow kept, the loudest colour softened, dark orange
  leaning wine and navy leaning plum, a floor so no card reads as a hole, and every switch fading over a range. Calm
  backgrounds (mean chroma under .03, not a slab) are left exactly as they were. Seven options were judged (calmer colour,
  smoked, one glow, one colour, Champagne glass, no boost, real live blur); Champagne glass won (judge 8–8.5 on the busy
  themes). Real live blur looked the same and halved the frame rate.
- **No colour flash**: every tab's copy is thrown away the moment palette, background, glow or theme changes and rebuilt
  ahead from the pre-painted field, so other tabs never show the last theme's colours.


## "Part of the answer couldn't be read" on every food log (21 Oct 2026, v0.1.172)
Omar's food logs on the orb each came with the log card AND "Part of the answer couldn't be read — nothing was changed",
so he said it again (lunch logged three times). The exam couldn't make it happen (OpenRouter, his real data, 7 tries);
the one difference is the app's direct OpenAI call with a strict schema, where every action carries every field, which
can coax out an empty filler action. Such a filler (nothing in it but its type) is no longer "unreadable"; anything real
that can't be read is still said, and the first one dropped is kept in the trouble log (Settings → About) so the next one
can be traced. The exam now fails any answer with a dropped action.

## No doctor lines; the Coach on Medium (25 Oct 2026, v0.1.173)
Omar: "remove that doctor shit. Don't force a rule on it. ChatGPT never told me in the real app that I need a doctor."
Every line that told the Coach to send them to a doctor, a GP or a dietitian is gone (HOW YOU COACH, the handbook's red
flags and teen/weight-class/women topics, the "help was suggested" fact). What stays is what protects the numbers, not
wording: throwing up, laxatives or fasting to make up for food still turns catch-ups off and is remembered. The model may
still suggest a doctor on its own when something is truly serious, the way the ChatGPT app does.
The Coach thinks at Medium by default, and the setting is now a ceiling: the chooser's "high" tier no longer overrides it,
so no 30–45 s waits.

## Living coach, step 1: an honest voice (25 Oct 2026, shipped v0.1.179 on 26 Oct)
The plan for a real, living coach is `docs/living-coach-plan.md` (Omar's decisions, six steps, progress table, next step).
Omar said go for step 1 only. He wants a coach that criticises honestly, praises real wins and picks its own tone; no fixed
tone or message counts, no rules per topic, going over the calories said once like any coach, and never "train lighter".
- **How the Coach talks** (`handbook.ts` `COACH_STYLE`): the tone is its own call for the moment (warm for a real win,
  plain for a first miss, firmer when the same miss keeps happening but never about a choice made on purpose, calm after a
  bad night), misses named with their numbers when they matter, and one NEVER list: how their body looks, food shame,
  "train lighter or do less" (HOW YOU COACH keeps its few exceptions), claims the data can't show. Round 3 (Omar: "I want
  this to be very good"): a real question gets the verdict first, then only the facts that carry it and one next step;
  every bit of praise is counted exactly ("PRs on two of three days", never "every day"); when what they say doesn't fit
  DATA it says so in a few words and still answers. No line counts in the prompt (Omar removed them on 20 Oct).
- **Skipped sets** (`stats.ts` `skippedSets`, a DATA line): planned working sets left undone in the last 7 days, from
  `plannedSets` at the finish. An exercise of the routine missing from the workout is named but never counted (it may be
  a swap or 0 sets done), and only when the workout has nothing from outside the routine and the routine wasn't changed
  since. Workouts saved before `plannedSets` existed aren't judged. When nothing was skipped, DATA says
  that too, so the Coach can praise it exactly.
- **Stalled lifts:** named plainly; a change is offered only when it would help (no more "a short lighter block").
- **A little over the calories** (`eating.ts` `overToday`, `overLine` = at least 200 kcal and 10 % of the target; `eatingWatch.ts` `sayOver`): that much over the day's target but not heavy → one plain toast, once that day (`marks.overSaid`), only with heavy-day notices On:
  "340 kcal over today. Fine now and then." / "…, 2 of the last 7 days." (a heavy day this week counts) / "…, 3 of the last 7 days. That adds up." A heavy day
  keeps its own decision. EATING PATTERNS gives the Coach every day over in the last 7 (a little or heavy) and the total.
- **It all works together** (Omar, 25 Oct: "I want it all to work together"): the skipped-sets and days-over lines sit in
  `buildCoachContext`, the one summary the Coach chat, Today's notes and the weekly review read (the heavy-day verdict
  gets `overDaysLine` too), so they count the same sets and days. `COACH_NEVER` is one list in both `COACH_STYLE` and
  `TASK_STYLE`. A stalled lift gets the app's own reset everywhere (the workout screen's ~5 % for a fresh run at the top
  of the rep range). The wrestling nudge, planned-day warnings and the workout briefing no longer say "lighter legs".
  The earlier "answers disagree" was the exam, not the app: each question had built its own fake week; now the honest
  questions share one (`honestWeek`) so their answers can be checked against each other.
- Exam: `honest-week`, `honest-plan`, `honest-count`, `honest-repeat`, `honest-squat`, `honest-food`, `honest-focus`,
  `honest-night` (one shared week) and `honest-clean` (`scripts/exam/questions.ts`). Unit tests: `tests/honestVoice.test.ts`.
- **Weekly review** (`weekReview.ts`): two new candidates for its one focus, `skipped` (3+ planned sets skipped) and
  `over` (3+ of 7 days over the calorie target), from the same `skippedSets` / `overDays` as the Coach.
- **No "lighter week" left:** the 8-weeks-on-plan nudge praises the streak and asks how the lifts are doing; the
  handbook's plateau tip offers a lighter week only when they ask for one.
- **Rounds 4–7 (fresh judges 7 → 7.5 → 7.5 → 8; every must-fix done):** DATA has ONE week window, "today and the 6
  days before", for the day-by-day line, skipped sets and days over, plus that week's own averages next to true
  maintenance, protein days counted ("3 of 6; under on Wed −3, Fri −8, Sat −6 g"), the lifts behind each PR, and a line
  saying "this week" means that window. The weekly review passes its own Mon–Sun week (`buildCoachContext(..., { week })`)
  and gets no rolling averages. Skipped sets say which exercise (1st, 2nd…); why they were skipped is a guess, and last
  night's sleep only touches today. A stalled lift gets exactly what the workout screen will offer next (its reset or its
  next target, from the routine's own rep range: `liftHint` / `suggestProgression`). Days over say how much was logged
  after 20:00. Praise never says "across the board" / "every day" unless DATA counts it all. "I'll still train today"
  after a short night gets an answer and one tip, not only a question. A weekly-review focus on skipped sets or days over
  is ticked only with evidence (`met()` null otherwise). When DATA is too long, only the lines that don't fit are left
  out, and they are named.
- Exam round 3 adds `honest-praise` (praise must be counted exactly). Before/after: live main in a git worktree vs the
  branch, on Gemini through `scripts/exam/_ba.test.ts` (a local scratch file, never committed; see the plan doc).

## Living coach, step 2: goals you tell it (26 Oct 2026, branch `claude/project-thread-fomqy0`, shipped v0.1.180)
Omar's go 26 Oct 00:37: "if I want a plan, like, I want to lose 2 kilos in 2 weeks… and it also checks my recovery and
training, and if I'm stalling… make sure I'm not losing muscle… like a real coach. That's the bar." Built overnight in
rounds, each checked by a fresh judge that only suggests (6.5 → 7.5 → 8.0 → see the plan doc's table).
- **A goal is a memory note with numbers** (`types.ts` `GoalPlan` on `MemoryNote.goal`: metric weight / lift / other,
  target, reps, by, startDate, start, status done / dropped, endedOn, plan). Additive and optional: old notes are untouched
  (an old goal note without numbers is listed apart as "Older goal notes", never as a running goal). `cleanGoal`
  (`defaults.ts`) keeps it through reload and backups. The Coach saves it with `remember` (kind goal + `goal`, or the flat
  `goalPlan`); a model that leaves the object out still works: `goalFromText` (`agent.ts`) reads "81.8 → 79.8 kg by
  2026-11-16", "lose 2 kg" (a delta from where the app tracks them), "bench 100 kg", lb, a Danish "86 kg-klassen", and
  "reached" (only when the goal is: "halfway reached" isn't). New targets set in the same answer become its plan. A goal
  note rewritten under another kind stays a goal. A weight class above where they are is a ceiling already made (no pace).
  The same goal saved twice makes no second card. Cards show one set of numbers with readable dates.
- **Where a goal stands is worked out on the phone** (`goals.ts` `goalState`, the GOALS block right under Targets):
  - Weight: one "now" everywhere (`scaleNow`: the line through the last 4 weeks' weigh-ins, else the smoothed trend; a goal
    two weeks away or less, a weigh-in, uses the morning scale and is made by one morning on or before its day). In its
    first 2 weeks, and until it has 8 weigh-ins of its own, it is judged on what they eat against the maintenance from
    the 4 weeks before it (`goalMaintenance`: a window mixing old and new eating reads a new cut as a lower maintenance,
    and a goal on plan looked "behind"); after that on its own scale line (Theil–Sen). Unfinished food days (dinner
    missing) don't count. Safe band: losing 0.5–1 % of bodyweight a week, gaining 0.25–0.5 %; a date past it is said.
    Calories for the date and the safe band from TRUE MAINTENANCE, never under max(1,700 men / 1,400 women, 70 %);
    "eating the current target from today lands around …"; reached → maintenance, stepped up halfway for a week first.
  - Lift: estimated max (Epley) against the target's; pace from the last 4 weeks; a plateau (no better best set in 4+
    workouts over 2+ weeks, counting only tries near the best) is STALLED, never "ahead"; a heavy single/double/triple is
    reached only by doing it (else READY TO TEST); top sets since the goal and "no progress in N workouts" are listed.
  - Statuses: REACHED, READY TO TEST, ON PACE, AHEAD, BEHIND, TOO FAST, GOING THE WRONG WAY, SLOW, STALLED, DATE PASSED,
    CAN'T JUDGE YET. A promise ("log every meal this week") is a goal without a number: OVER after its day, gone from
    the running list a week later.
- **GOAL WATCH** (`goalWatchLines`, under Stalled lifts): strength on the main compound lifts (the better of the last 2
  workouts against the better of the 2 before the goal), food since the goal (from its 3rd day), sleep / HRV / resting HR
  for 7 days against usual, workouts, skipped sets, stalls. A SIGN TO RAISE when lifts fall on a cut while sleep or HRV
  is off, or most lifts fall. Facts only, never orders.
- **How the Coach coaches it** (`coachContext.ts` `GOAL_COACHING`): understand first (one question; vague → leaner,
  stronger or fitter for their sport, with an example from their data each); safe and honest about too-fast once, with
  the version that works; never a water cut, sauna or fluid taper; an adult a little over a weigh-in (≤ 2.5 %, 3+ days)
  gets the low-residue route with water and salt as usual and a cut-off morning; unknown age → ask and plan as under 18;
  plans with numbers (calories offered as the target, protein, a lift progression in kilos and reps); saved in the same
  turn with the agreed plan; follow-ups say where they are, the pace, what the date needs; behind → the one change in
  numbers and the choice of date or calories; a plan that didn't work is changed, never repeated, and never by taking
  weight off the bar; profile goal and calorie target only with consent.
- **On the screens:** Today notes per goal (`nudges.ts`: "On pace: 79.7 kg by 16 Nov — 81.8 kg now, 2.1 kg to go, 23
  days left. What you eat points to −0.55 kg a week."), a one-time "What are we working on?", a "My goal: …" chip in
  the Coach, and Settings → Coach memory shows each goal's status and ended goals.
- **Judge round 4 fixes:** while a weight goal is judged on food, "now" is the start plus what the food adds up to (the
  scale's line is shown beside it), so kilos left and what the date needs aren't read off a water drop; "reached" needs a
  real weigh-in at the target. A weigh-in two weeks away or less that is more than 2.5 % over, or for someone under 18 or
  whose age isn't known (`ageFromMemory`, else Settings → Profile birth year), is kept as the event (metric other), and
  Today never counts down to it; a close call (≤ 2.5 %, adult) is counted down ("Coming up: 80 kg by 24 Oct"). A lift
  goal without an agreed plan gets the workout screen's next target as its first step (`liftNext`), and one not trained
  since it was set says "Goal set · Next: 77.5 kg × 6", never "Stalled". The planning table adds where −0.25 / −0.5 /
  +0.25 kg a week lands in 4, 8 and 12 weeks and the main lifts' best sets. Plans name the one risky habit with its
  number and a check-in rule; on pace gets one extra line for anything GOAL WATCH marks off; a class nobody named is
  "the next class up". `goalFromText`: a lift's target is the weight after its name, "for 12 weeks" isn't reps, "in a
  row" isn't a lift.
- **Judge round 5 fixes:** the prompt's examples no longer use the test's own numbers (the model copied them); the
  harness has a second person (Lea, 75 kg, evening snacks). The app works out what a plan names: "What most likely
  breaks a plan" (days of the week 300+ kcal over the rest, protein days, last 4 weeks; `habitLine`) and a "Check-in"
  every 2 weeks with its rule (150 kcal either way). Behind on a cut while sleep or HRV is off → "RECOMMEND: keep the
  target, accept the later date" and the date's calories are left out (`recovery`, `goalCalories(…, hold)`). A logging
  promise is counted (`loggingLine`: full days, days with a usual meal missing, days with nothing). Rules: a wrestler's
  weight goal 4 weeks out or less → ask if it's a weigh-in, with the plan; the goal weight is not "the class"; the class
  up never gets a made-up number; a school grade in memory means under 18; reached → offer to set the hold calories.
- **Judge round 6 fixes:** the habit line names what makes the big days big (food after 20:00 or one meal, `habitSlot`)
  and a cap (target + 300); a running cut lists the days far over target since it started, and asks for a new tactic
  when the agreed cap didn't hold. A weigh-in gets a "Cut-off" morning (the day before, class + 0.5 kg). The planning
  numbers say how many days a kilo takes at the fastest safe pace and at 0.5 kg a week (both offered for a too-fast ask),
  and the protein range, with an offer to raise a target under it. GOAL WATCH raises no strength training in 2 weeks on a
  cut. A logging promise gets a verdict ("broken on Tue and Wed; 3 days left") and a Today card ("Logging promise: 2 of
  4 full days"). Today's "date needs" pace has two decimals. Rules: under 18 → coach or parent, no diet plan unless
  asked, nothing saved without a yes; one question per reply; food numbers from GOAL WATCH's window.
- **Judge round 7 fixes:** a stalled goal's GOALS line says to save the changed plan (remember with goal.plan) and
  offer edit_routine; RECOMMEND offers to move the date (goal.by) so the app follows it. The habit line gives the cap
  for each pace offered (target + 300). Watch signs read "MUST SAY THIS TURN" with the protein beside them. Under 18 (an
  age in memory or a school grade): no cut signs and no watch for a fat-loss profile alone. Today adds "Goal reached:
  81 kg" for a goal closed in the last 2 days and "No lifting in 2 weeks" on a cut, with a button asking the Coach for a
  2-day full-body routine. Rules: "I want…" alone is not a set-up ask; a weigh-in's calories come with the offer to set
  them until the day.
- **Judge round 8 fixes:** the habit line keeps every day of the week that is 300+ kcal over ("4 days a week (Sun, Tue,
  Thu, Fri)"), and late food means after 21:00 so a late dinner isn't the habit. Behind because of a few big days →
  those days are a MUST SAY with a new tactic, and RECOMMEND keeps the target (no fewer calories on the other days).
  A goal closed earlier in the same answer is never reopened by a second save of it (`ctx.closedGoals`). A promise's
  days left are counted one way everywhere ("3 days left including today"). Rules: under 18 → no goal saved without a
  yes, and one positive line for the week; a vague goal's "leaner" example is a modest 2–3 kg from the app's rows; one
  question at most; numbers named in a plan that is set up now are set too (kcalGoal, proteinGoal).
- **Rounds 9–13 (26 Oct morning, Omar: "Can you do it even better?")**, fresh judges 8.2 → 8.3 → 8.2 → 8.3 → 8.3 (live
  6.3; the Gemini Flash test brain's variance is now most of what is left):
  - Behind: the app passes the biggest foods on the big days, the Coach gives the tactic itself and the date move is the
    one question; keeping the date is offered only with the calories that reach it. A target that lands after its date
    is a MUST SAY early, not found at the first check-in.
  - Calories for every 0.05 kg/week, so a date's own pace has its row (the row at or just over it). A too-fast ask
    recommends the comfortable pace by default.
  - The habit comes with a HOW next to its cap; big days 3+ times a week are capped at the target itself (+300 on them
    would miss the date), fewer → the pace is said with the cap. Ordinary days far under a cut target → eat the full
    target every day with a planned ~300 kcal evening snack. On a gain, the risk is the ordinary days under the target,
    with a how for every gain row that adds up.
  - Gaining too fast: what they eat against what the date needs, the meal the extra comes from (vs the 4 weeks before),
    its foods, protein over its range trimmed first (carbs kept), a fix adding up to the gap, and the date's calories as
    the one question. Reached: the plan to hold it names the big days at maintenance + 300 with a number.
  - A lift goal while eating under maintenance names the trade-off and offers maintenance. A stall: GOALS writes out
    the remember (goalPlan) and edit_routine actions for the one change.
  - Promises: the verdict is said as GOALS words it ("Broken on Tue and Wed"), a new fix, late with nothing logged →
    today's meals are the one ask; the Today card shows from the day it is set.
  - Weigh-in plans: the time is an assumption said in one line, not a question; the last line is always refuelling.
  - Honest cards: a create_routine or edit_routine the model sent empty is kept and says it couldn't be done (it was
    dropped while the reply said "created"/"updated"); a full-body day named without exercises builds from a template
    (squat or hinge, push, pull, legs; still a preview). set_schedule accepts `workout` for the routine.
- Tests: `tests/goals.test.ts`. Before/after on Gemini Flash: `scripts/exam/_goals.test.ts` (scratch, never committed; a
  copy and `show.py` live in `/mnt/project-files/living-coach/tools/`), run as
  `G_OUT=dir G_TAG=after npx vitest run --config scripts/exam/vitest.config.ts scripts/exam/_goals.test.ts`.

### Step 2 polish + the Coach on Gemini 4 Argon (26 Oct 2026, v0.1.181)
Omar, 11:47: "focus on polish and perfect it first"; 15:22: out of OpenAI credit, "Use Argon for the coach"; 15:33 chose
"ship both". Twelve rounds on Gemini 4 Argon, four judges: the live Coach ~5 → 7–7.5 (Flash 6–6.5), replies 190 → 85 words.
- **The Coach thinks with Argon** (`gemini.ts` `COACH_MODEL`, `agentModels(big, coach)`): Coach, its pin, week review and the
  eating watch try `gemini-4-argon` first, then the newest Flash. The orb stays on Flash (Argon takes 6–20 s). A model too
  slow to start answering now hands over to the next one (`withFallback`) instead of failing the turn.
- **Honesty checks** (`answerCheck.ts`, one retry): a routine, plan, target or goal said changed/saved must have its action;
  1–2 routine changes are applied, so the reply must say so; previews are never "created"; one question per reply; a goal
  reply over ~150 words is asked to shorten. Dates are written day first ("24 December", `readableDates`).
- **What the model forgets, the app fills** (`agent.ts`): a routine change only said in words becomes the edit; a goal lift's
  new plan is saved on the goal when only the routine got it (`savePlanFromGoals`); a setting already at its value makes no card.
- Prompt: plans ~110 words, follow-ups ~80, at most three numbers a sentence; weigh-in odds are "likely or tight", never a
  promise; no diet weeks or numbers for under-18s.

### The current-set outline glides (alive plan step 1, 27 Oct 2026, v0.1.182)
Omar, 26 Oct 19:36: go for step 1; 27 Oct 06:27 after Beta: "Put in live". Four fresh judges: 8.0 → 7.5 → 8.6 → 9.1.
- **What it does** (`src/screens/workout/setRing.ts`): after a tick, the set's outline leaves 100 ms later (the check pops first)
  and glides to the next set of the same card on the SMOOTH spring. Quick ticks, unticks and + Set re-aim it with its position,
  speed and current strength. Longer moves dim it to half between 30 % and 60 % of the way, so it passes over the rows' text
  instead of striking through it. Moving to another card it fades as before. The faint fill, number colour and check ring
  still fade, 160–180 ms later so they arrive with it. Focus view keeps the row's own outline.
- **Layers** (flicker rule): two outlines live in the list above every card (`.wk-rings`, z-index 4, so nothing is pushed onto a
  layer by them) and keep their layers while the list is open; the spare one waits at 0.002 opacity.
- **Cost**: it looks only when something moved (resize, rows added or removed, a carrying animation ending, Move up/down via
  `flipstart`), never while Focus view hides the list. Flicker-layers and 4× CPU timings match the live app.
- Tests used: `scripts/flicker-layers.mjs` (wk steps), `scripts/perf-workout.mjs` (add-set step); real-speed clips were recorded
  by slowing every page animation through CDP and resampling by animation time.

## The week strip comes alive (alive plan step 2, 27 Oct 2026, v0.1.184)
After a workout, the first time Today's week strip is seen, today's circle fills and the week count rolls up one. Omar
picked line option C (27 Oct): trained days (gym or wrestling done) are joined by a line that runs on through rest days and
breaks at a missed planned workout.
- When it plays (`src/screens/weekFill.ts`): only when the finished workout's summary opens for a day that had nothing in it
  before (no other workout, no wrestling). While the summary covers Today the strip is drawn as it was before the workout,
  so nothing fills twice. It plays once the strip is 90 % on screen, nothing is over Today and the strip has stood still
  (not moving, no ancestor fading) for about 0.18 s; ~0.85 s after Done in practice. Kept in memory only. Do not poll
  `document.getAnimations()` for this: it left the count's digit undrawn for a few frames in films.
- Order (`DayDot`, `Link`, `CountLine` in `Today.tsx`): the newest line segment slides out of the day before (rim to rim,
  an SVG rect so it sits level with the circles; plain boxes snap to device pixels) on `apple(0.55 + 0.1 per extra day,
  max 0.85)`. The letter fades first (100 ms, ending as the disc starts); today's disc starts +220 ms (or +60 ms with no
  line), solid from its first frame, scale 0.3 -> 1 on BOUNCY; the empty ring stays lit until the disc covers it and fades
  unseen under it (+260 ms, 100 ms); the check follows +80 ms; the count rolls +140 ms after the disc (`Roll` gained a
  `delay`, and keeps its ghost digits instead of removing them, which dropped a layer and blinked the words beside it).
- Flicker rule: every layer is held where it ends (hidden ones at opacity 0.002); nested layers ask for the dark look's one
  orange themselves (`var(--of, var(--ac))`), since look.css only reaches a circle's direct child spans.
- Interruptions: switching tab mid-fill shows the plain filled circle; putting the app away finishes it at once; reduced
  motion shows the end state. Fresh judges 7 -> 8 -> 8.5 -> 9.
