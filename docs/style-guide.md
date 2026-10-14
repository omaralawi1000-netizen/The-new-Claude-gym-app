# Aven style guide

One written style for Aven. Every session and thread follows it. It is distilled from what is live (v0.1.120) and from
decisions Omar already made; the full history and the "why" are in `README.md` (section names are given so you can find
them). If a rule here and a new idea clash, the rule wins until Omar says otherwise. When he decides something new,
change this file in the same pull request.

Omar judges on a Galaxy S26 Ultra (384×832 CSS px at 3.75, 120 Hz, Chrome, installed app). Tests in headless Chromium
cannot show phone GPU load, so say "checked" for look and behaviour and leave "feels smooth" for his phone.

## 1. The three promises
1. **Blur AND 120 fps.** Frosted glass stays. Make it cheap; never remove it to fix lag (section 6).
2. **Slow, calm, Apple-like.** Never faster or snappier unless Omar agrees (section 5).
3. **One hand.** Things that do the same job look and move the same. Use the shared token, class or spring, not a new
   number.

## 2. Surfaces and glass
Floating things (rest bar, sheets, tab bar, Coach bar, buttons, pop-ups) are see-through frost: a translucent tint over a
blur. Never a solid block, never a visible rectangle behind a floating button.

- **Frost recipe.** Tab bar pill: `blur(20px) saturate(1.4)`, a 20 % pure-grey fill (no colour cast, so the colour field
  comes through), light from the top, a hairline, a soft shadow. Sheets: `--sheet-frost` (`blur(44px) saturate(2)`) with
  `--sheet-tint` / `--sheet-glass` (46 % dark, 58 % light). Generic: `--glass-blur`, `--glass`, `--glass-2`.
- **Controls float.** Buttons that sit over scrolling content (Add, Finish, the Coach's field, camera, orb seat) are each
  their own small frosted glass (`.frost-ctl`, `.frost-seat`, `--fc-*`). Nothing sits behind the row as a whole: no band,
  no tint strip. Content scrolling under them fades out softly just above (`.edge-fade`, `--ft` top fade).
- **Edges.** A 1 px rim, light along the top fading down the sides (`--hl`, `--line`, `--line-2`). Round buttons 1 px; the
  dock 1.5 px. Never a hard cut-off: scrolling content ends in a soft fade (36 px under headers, melting behind bars).
- **Shadows** are soft, deep and neutral, from three tokens: `--sh-c` (card), `--sh-a` (raised), `--sh-f` (floating).
  Cards get depth from glass plus these, not from a solid fill. Shadows are painted once and never animated.
- **No bands (dither).** Any frosted layer over a soft glow in dark mode follows the "Dither" comment in `styles.css`
  (README "Smooth glows behind the frosted pop-ups"): `brightness(2)` before the blur, a higher tint alpha, and
  `--dither` noise in a layer of its own directly over the blur (`lib/grain.ts installDither`). Copy `.sheet::before` /
  `::after`. Light mode keeps a plain blur. Check with `scripts/banding-shots.mjs` before and after.
- **Do not** stack a blur on a blur, put a picture inside a blurring layer, or fade a parent of a frosted surface (the
  blur switches off until the fade ends: that was a flicker).
- Rest bar: one piece of glass around the orb (`.wk-bar-even` keeps the redraw whole). Do not split it again.
- Sheets: no sheet buttons sitting on a card; only frost behind them.

## 3. Colour
- **Palettes** (`settings.palette`): `ember` (default), `aurora`, `mono`, `sunset`, `forest`, `golden`, `midnight`,
  `champagne`. Each is a family. Pick colours inside the family; never import one from outside it. (Ember's
  carbs are plum, Food is apricot `#ffa05a`, Progress is dusty rose `#ee7280`: all warm. Mono has one coral.)
- **Backgrounds** (`settings.background`, `ui/Backdrop.tsx`, `.bgx`): painted once and held still, or moved by one
  transform/opacity change. The drifting Classic field is the costly one; new backgrounds must not drift.
- **The accent is for the one thing to do now** (Finish when all sets are ticked, the play button of today's routine,
  "Rest over", the next set). Everything else is neutral glass with colour only in an icon or a thin line.
- **No orange on surfaces.** Cards, bars and sheets must not take the accent as a wash. A colour field tinted warm is
  fine (Omar chose Ember's warm field back in v0.1.104); an accent-coloured card or dock rim is not. Check in a second
  palette (teal showed the brown-card problem).
- **Opaque neutral cards are rejected.** Depth comes from the glass, not a solid grey block (v0.1.102 → 104).
- **Rings**: each look has its own `--c-kcal/protein/carbs/fat`, deeper on light. Kcal does not follow the tab.
- **Status**: `--ok`, `--bad`, `--warn`, `--gold`. "Rest over" glows in the area's accent, not green.
- **Contrast**: small grey text on busy backgrounds needs 4.5:1; use `--tx2` / `--tx3` on `--s1..3` frost. Dark and light
  both ship; look at both.

## 4. Type, spacing, corners
- **Type.** `--f-ui` Geist for UI and numerals (numerals thin and wide-set), `--f-display` Newsreader for names and
  titles. Titles keep the v0.1.34 style: slanted serif for routine names, meals, the Food date, Today's workout card,
  Wrestling/Cardio and the empty-workout title; upright elsewhere. Do not unify them again.
- **Text is cut to what carries information**: icon-first actions, no section captions, no helper paragraphs. Warnings
  that protect data stay.
- **Radii** are tokens: `--r-xs` 10, `--r-sm` 14, `--r-md` 22, `--r-lg` 30, `--r-xl` 38. Use them; no one-off radii.
- **Screen corners (S26 Ultra).** Behind a pop-up only the page's content sinks back (to 95 % from the middle,
  `.stage-content`, `useStageDepth`); the background stays full-bleed and still. No card edge, no black corner pieces: they
  showed an outline and were removed in v0.1.76. The full-page workout is square at the top and its header sits 10 px
  under the status bar. Keep content clear of `--sat` and `--sab`; the tab bar is `--bar-h` 84 px.
- **Spacing**: last card ends 48 px above the dock pill; last Coach message 30 px above its bar. Check at 384×832.
- **Danish and English.** Every new UI string needs an entry in `src/lib/da.ts`
  (`node scripts/i18n-keys.mjs --missing`). Metric units, DKK.

## 5. Motion
- **Slow, calm, unhurried. Never faster or snappier without Omar's yes.** The easing comes from Apple's springs
  (`ui/motion.ts`): `TAP` (press, tick), `SMOOTH` (content settling), `SURFACE` / `SURFACE_EXIT` (sheets and cards, 0.45 /
  0.38 s), `WINDOW`, `BOUNCY` (a record, a gain, a sent message), `GENTLE` (slow fills), `KEYBOARD`. CSS equivalents:
  `--ease-out`, `--ease-io`, `--ease-spring`, `--ease-smooth`. Pick from this list; do not invent a duration.
- **Animate only `transform` and `opacity`.** Never animate blur, `box-shadow`, filters, width/height, top/left or
  anything that re-lays-out or re-blurs per frame. Soft focus is done by cross-fading still copies (`.soft::before/::after`),
  never `filter: blur` animating. Answers in the Coach and orb screen fade up without blur (`.w-in`).
- **Springs run in the browser** where possible (`springCurve` → Web Animations) so 120 Hz is honoured.
- **No flicker as things land.** Entrance animations fill `both` with no end keyframe; script-moved things keep
  `will-change` layers (README "No flicker as a page lands"). Do not remove a layer at the end of an animation.
- **Pause what is off screen.** The page behind a full-screen workout stops being drawn; the drifting field is paused
  while a pop-up is open; the orb rests when parked.
- **The orb never changes shape.** Light, rings, a press sink of about 5 %, a flash. No swell, no blob, no breathing outline.
  It only moves and resizes on flights.
- **Haptics** are one vocabulary: `haptic(name)` from `state/ui.ts`. Navigation, opening things and the orb flying are
  not felt, on purpose.
- **Reduced motion** (OS or Settings) stops drifting light, rise-ins and springs. New animations need that rule.
- Tab and page switches, sheets and the workout opening have approved motion. Change them only when the task is
  about them, one thing at a time.

## 6. Performance rules (these protect blur AND 120 fps)
1. Blur only small, fixed layers: tab bar, sheet backdrop, the rest bar, Coach bar controls. Cards and buttons on tab
   screens are painted, not live blur. The `--mat-*` lit-glass rules are off (`data-glass` is not set) and stay off.
2. Never blur on blur. If a control has its own frost (`.frost-ctl`), the bar behind it has none.
3. Never animate the blur or a layer under a live blur at 30 fps or faster (that is why backgrounds hold still).
4. Keep every blurred layer on its own compositor layer; do not re-render content under it every frame.
5. Do not re-render React for per-second clocks: tick only the line that shows them.
6. Long lists draw their first rows at once and the rest in batches.
7. **Every change must not make performance worse.** Measure before and after with the matching script:
   `scripts/perf-tabs.mjs`, `perf-open.mjs`, `perf-keyboard.mjs`, `perf-workout.mjs`, `perf-taps.mjs`,
   `perf-redraws.mjs`, `flicker-layers.mjs` (layer hand-backs; the baseline total is 11), `glass-audit.mjs` (no new blind
   blurs). Headless Chromium needs `AVEN_GPU=1` to render blur. CPU 4× slow-down stands in for a phone.
8. If a blur truly cannot be made smooth, explain the trade-off to Omar and let him choose. Do not decide for him.

## 7. Interaction
- **Ticking a set is tap-only.** Swipe-to-tick was removed (v0.1.15): sweaty hands at the gym, and a swipe can be
  mistaken for a scroll. No new gestures without Omar's yes.
- Pull-up on a sheet stretches like rubber (about 28 px max) and can be caught while it settles. Do not change that feel.
- Horizontal scroll is locked on the workout. Keyboard slides over sheets; only the bottom button rides it.
- Presses feel native: 80 ms down, spring release. No press flash on scroll.
- Every save offers **Undo**. His workout and food data is precious: no destructive migration without asking.

## 8. Preview and judge process
1. Small steps. One visual change at a time; no more than three visual things in flight across threads.
2. Before anything risky, save a backup branch (examples: `backup/pre-banding-v0.1.105`, `backup/glass-take6g`).
3. Big looks get a before/after preview, judged against Omar's actual complaint, over several rounds, before they ship
   (e.g. the full-page workout's seven rounds in `/mnt/project-files/workout-fullpage/`). Clips go to him as one page
   (an Artifact), never bare mp4/webm: see `/mnt/project-files/tools/README.md`. Films use a steady camera
   (`scripts/film-steady.mjs`); screenshots at 384×832.
4. Verify proportionately: `npm run verify`, plus only the `scripts/` journeys that touch the change.
5. Ship per `CLAUDE.md`. Tell Omar exactly what to check on the phone and to fully reload.
6. **"Worse" means revert.** Go straight back to the last approved version with no other changes; fix separately.
7. Look for what else on the screen looks unpolished, but list it as a suggestion instead of fixing it unasked.
8. Figures (the exercise pictures) have their own rules: `/mnt/project-files/anatomy-proof/figure-rules.md`.

## 9. Rejected looks: never bring back
- Opaque neutral "depth" cards and a cool, orange-free field (v0.1.102, undone in 104).
- Lit-glass rounds with two-tone icons and tinted fields (branch `backup/glass-take6g`); the `data-glass="v2"` rules stay
  dormant in `styles.css`.
- Two stacked "progressive blur" layers under the dock (muddy double edge).
- Animated blur on text, Onboarding or the Food date (use opacity only), and the heavy blur-in on Coach answers.
- All-upright titles (v0.1.30).
- Candy pink, a blue carbs colour in Ember, olive tints from amber on dark glass.
- Swipe-to-tick, and a wobbling or swelling orb.
- A lighter block or hard-edged square behind the rest-bar orb; a coloured stripe on "Rest over".
- A solid block or visible rectangle behind any floating button; letters cut round buttons like a stencil.
- Orange washes on cards, docks and rims.
