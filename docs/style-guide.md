# Aven style guide

One look, one feel, for every session and thread. Written 14 Oct 2026 from what is live (v0.1.121) and from what Omar
decided. If this guide and an old README section disagree, **this guide wins**; if Omar says something new, change the
guide in the same pull request. `README.md` is the history of why; this file is the rulebook.

Omar judges on his phone (Galaxy S26 Ultra, 120 Hz, Chrome, installed app, DPR 3.75, 384 css px wide). Explain things to
him in plain, short words. Rules marked **[Omar]** are his own words or decisions: never reverse them without his yes.

**Rules are guides, not vetoes [Omar, 26 Oct: "remove all the rules that are not good for me… we can make live blur
actually good, a lot of apps do that"].** Blur and motion rules here are defaults and lessons learned, not bans. Live
blur, animated blur, animated shadows, glows and livelier or faster motion may all be tried: build it, measure it on his
phone (Beta), and let him judge. A past measurement ("half the frame rate") is a warning to measure again, not a reason
not to try. What stays firm is what protects him: no flicker or black frames, no layout jumps, a smooth result (120 fps
target, measured on Beta), backups and quick revert, his colour taste (no grey, no navy, no brown, no orange wash), his
data and keys, and the go rule (nothing starts or ships without his clear go).

## The quality bar [Omar, 14 Oct]

Omar wants the standard for animation, look and everything to be **very high, Apple-level**. Nothing goes to him that a top
iOS designer would wince at. Every Omar-facing preview passes a harsh judge first (section 7). Fewer rounds is never a
reason to show something mediocre: spend the extra round before he sees it, not after.

## 0. The four things that must always hold

1. **Blur AND smooth.** Frosted glass stays and may go further (live blur, animated blur) as long as it measures smooth
   on his phone (120 fps target, Beta). Never solve lag by removing blur (section 5).
2. **Motion that feels great.** Calm and Apple-like is the house default; livelier or faster motion is welcome to try,
   and Omar judges it on the phone (section 4).
3. **See-through frost, never a solid block** for anything floating (section 1).
4. **No orange on surfaces.** Colour only on things you can tap or that mean something (section 2).

## 1. Surfaces and glass

Tokens live in `src/styles.css` (`:root` dark block and `:root[data-theme='light']` block, near the top).

- **Page cards = `.plinth`** (radius `--r-md` 22 px; fill `--s1`; edge `inset 0 1px 0 var(--hl)` + `inset 0 0 0 1px var(--line)`;
  shadow `--sh-c`). Inner cells = `.plinth-2` (`--s2`, `--r-sm`). Floating bars and toasts = `.glass` (`--glass`, `--sh-a`).
- **Tab-screen cards = Lit glass [Omar, 14 Oct, v0.1.130]:** clear untinted glass, a 4.5% white film (no navy or any tint, no grain, no blur), soft white
  sheen at the top, rim bright along the top and fading down the sides, soft deep shadow. Chips and round buttons inside a
  card are soft fills with **no outline** (outlines inside an outlined card read as clutter). No accent glow inside cards.
- **Edge of light:** every glass surface has a 1 px white top line (`--hl`) and a hairline ring (`--line`). Do not add
  coloured rims. Shadows are deep and neutral (black / navy), never tinted.
- **Shadow ladder:** `--sh-c` card, `--sh-a` floating, `--sh-f` sheet. Pick one; do not invent new ones. Animating `box-shadow`
  repaints every frame, so the default is a static shadow (or one that fades as its own layer); a real animated shadow may
  be tried if it measures smooth on Beta.
- **Real frost (backdrop-filter) only where something passes underneath:** the tab bar, sheets, pop-ups, toasts, the Coach
  controls. Today, tab-screen and live-workout cards, buttons and chips have no backdrop blur: frosting them measured
  36 fps on Train/Progress (20 Oct), so they use a still copy of the field (`src/ui/frost.ts`). Live blur on them may be
  tried again [Omar, 26 Oct]: build it cheaply, measure it on Beta, and keep it only if it is smooth and he likes it.
- **Sheets (`.sheet`):** two layers under the content. `::before` = the blur (`--sheet-frost`, 44 px, dark adds
  `brightness(2)`); `::after` = the tint (`--sheet-tint`) carrying `--dither`. Drop shadow is on `.sheet` itself, not on
  the dithered layer (it doubled the cost). Sheet radius `--r-xl` on top corners.
- **Frosted controls (Coach bar etc.):** `.frost-ctl` (the control), `.frost-seat` (a seat a little bigger than the
  control), tokens `--fc-*`. Soft edges: `.edge-fade` (plain, tint only) and `.edge-fade.frosted` (adds a small blur; the
  tab bar uses `.tabbar-wrap.edge-fade`). Soft edges must not reach visible content (leave 48 px under the last card).
- **Soft static shadows on the Coach [Omar, 14 Oct, Coach r8–r10]:** the Coach controls and chat bubbles sit on a soft,
  static drop shadow painted with the element itself (`--bubble-sh` for bubbles): dark = deep and neutral, light = warm
  and faint (`rgba(60, 30, 30, …)`, gone within ~18 px; a grey Material-card shadow was rejected as too heavy). Never
  animated: a flying copy carries its own shadow and fades it.
- **Frost that follows the palette [Omar, 20 Oct]:** sheets, fields and bar tracks take a low-chroma tint from each
  palette's own hue (Settings → Appearance → Sheets: Before / Glass (default) / Deep, `data-surface` on `<html>`; values
  generated by `/mnt/project-files/inspiration/ac/sheet-tints-gen.py` into `src/look.css`), close to clear glass so the
  frost carries the colour. Never one warm tint for every palette ("disgusting"), never flat grey, never navy on a warm
  palette. Never tint glass with the accent.
- **Surfaces [Omar, 25 Oct, v0.1.170] (dark theme, `src/surfaces.css`, `data-look='a'` for everyone, no picker):**
  pop-ups/sheets are untinted dark frost ("I liked C because it didn't have a tint", "I don't want the pop-ups to feel like
  you can see through"): 44 px blur, saturate 2, brightness .84, black .34 on top; this overrides the palette tint above
  in dark. Page cards are a still, soft copy of the field behind them (`src/ui/frost.ts`; live blur measured about half the
  frame rate on 20 Oct, a lesson to measure again, not a ban). On loud or slab backgrounds (Mesh on Golden hour/Sunset, Night sky, Colour per
  tab, Time of day) the copy becomes "dark glass with one soft glow coming through", like Champagne + Mesh, which stays
  untouched; darkened orange leans wine (never brown), navy leans plum, never darker than 60 % (no holes), every switch
  fades over a range (hard steps drew bands). The copies are rebuilt the moment the theme changes (never show old colours).
- **One orange [Omar, 20 Oct]:** every accent is the same orange (`--of-*` in `src/look.css`); gains stay green.
- **Main buttons and switch pills [Omar, 20 Oct]:** a main pill is quiet glass; when it becomes ready the orange grows out
  from the middle (`clip-path` on the registered `--k`, label colour on the same number). An opacity fade over dark glass
  read as brown mud. The selected pill in a switch (`.seg-lens`) is a raised white bead with dark text, like a picked chip
  and the switch knob, a little under pure white; warm glass read as brown, grey glass as dead. A dark copy of the labels
  is drawn exactly inside the bead (`SegInk` in `ui/kit.tsx`, two nested clips moved by transform on the bead's frames),
  so every letter is dark where it sits on white, mid-glide too.
- **Opaque fallback:** a dark card that needs to be neutral over a coloured field may be opaque charcoal, but Omar rejected
  "clean look with depth" (v0.1.102) as a whole: only do this where asked.

### No banding (the dither recipe)
Chrome on his phone draws CSS gradients and blur output in whole 8-bit steps, so soft glows show coloured rings. The test
browser smooths them, so **lab shots lie: judge from Omar's own screenshots.**
- Behind blur: blurring layer = `backdrop-filter: brightness(2) blur(r) saturate(s)` with **no background**; the tint is a
  separate layer right over it with `background: var(--dither), <tint>` and `image-rendering: pixelated`. Noise drawn after
  rounding only hides the rings' edges. Full recipe and the maths: the "Dither" comment in `styles.css`; noise tile is
  installed by `src/lib/grain.ts` (`installDither`).
- A picture inside a blurring layer costs an extra full-screen pass (frames halved when measured): avoid it unless a
  Beta measurement says it is smooth.
- Large soft glows are painted by `src/ui/glow.ts` + `glow.worker.ts` (TPDF dither into half-res canvases; the CSS
  gradient shows until the picture is ready, then `[data-dith]` swaps it out). The picture is read from the element's own
  computed CSS (`src/ui/glowCss.ts`), so changing a gradient in `styles.css` changes the picture too.
  - Tab fields (Classic and every `.bgx` background): `FieldGlow` (`src/ui/Glows.tsx`) bakes everything that holds still
    (parts marked `data-bake`, Classic's `i`), plus grain and the status-bar tint, into ONE picture: the field stays one
    standing layer. Never lay new content over a field canvas (it becomes an extra full-screen layer).
  - A glow that moves or fades by itself (orb screen halo, Orb light, Sunrise sun, workout top): `<SelfGlow />` inside it.
    Like `ImgGlow`, its picture becomes the element's own background image (`[data-dith-img]`): no canvas, no layer.
  - Workout window: `screens/workout/wkGlow.tsx`.
  - A small glow inside a page (Today card corner glow, exercise stage pools): `<ImgGlow />` inside it; its picture
    becomes the element's own background image, so it adds no layer.
  - Never add or drop a layer at a tab switch or when an animation ends (v0.1.123 black frames). A glow canvas gets its
    size in the same frame it mounts (its picture too when one is ready; a tab's field's canvas otherwise shows
    see-through over its CSS, below), and its new picture in the same task as a theme, palette or size change, so a switch's
    snapshot never shows the old picture.
  - ONE painter (`src/ui/glowPaint.ts`), in the worker only. Never paint a picture or encode a PNG on the page: a whole
    field painted there, or the PNG of a background-image glow or the dock shadow, froze the page for 0.5-1.3 s after
    launch (`encodePng` in `glow.ts` makes files in the worker). A picture not painted ahead (a tab tapped in the first
    seconds) shows the CSS until the worker has it (a tab's field: see below). Never show a quick undithered stand-in: it
    bands, and the swap pops.
  - A theme switch or a tab switch reads NO styles (no `getComputedStyle`, no probe inserted or removed: either makes the
    browser work out the whole page's styles again, 100 ms a time on a slow phone). Each glow keeps its plan by state (the
    root's `data-*`, its own attributes, its size; `rootKey`/`hostKey`/`shareKey` in `glow.ts`); the other theme's plans
    and pictures are painted ahead while idle from a hidden twin frame (the page's styles with the other theme), the other
    tabs' fields from hidden copies. The switch only looks the plan up and draws; the page is read again once idle.
  - Pictures go into a canvas with `putImageData`, or, for a switch back to the theme just left, from ONE spare canvas
    per glow (an OffscreenCanvas written at idle, copied across with `drawImage`, reused each time, let go in the
    background). Never `drawImage` an ImageBitmap into a GPU canvas, not even one drawn once and closed: the chip keeps
    copies (+20 MB after a few tab switches, measured). A canvas kept in memory (`willReadFrequently`) is slower to write.
    Each new picture resets the canvas size first, so its old buffer is let go.
  - Kept pictures (pixels and image files) share 64 MB, oldest first, and pictures painted only on the chance they're
    needed (other tabs' fields) go before those of the glows on the page; a file still shown is never let go. In the
    background only the pictures in a canvas and the other tabs' fields stay (so a tab tapped after unlocking finds its
    picture), the rest is let go.
  - A field whose picture isn't ready (right after launch, a tab tapped before it was painted ahead) is painted first by
    the worker (a queue in front of it; image files are made in a second worker), shows its CSS meanwhile under the
    see-through canvas, and the picture fades in over it (1.2 s, `--ease-io`, opacity only); the CSS goes only once the
    canvas's own fade has finished (never on a timer: on a busy page the fade starts late). The status bar's colour at the top of
    the page belongs to each field, never to one strip laid over all of them: a strip faded against a picture with the
    tint already in it darkened the top twice over, and no one strip opacity was right for every row (the top-left edge
    lifted 11-13 levels in Golden hour, judge rounds 5 and 6). A still field has it baked into its picture, and until the
    picture is in (or for good, if it can't be made) in `.field-tint` under the canvas; Classic's `.field-tint` lies over
    its picture and moves exactly back by its sway (`sway-back`), so it holds still; Orb light and Sunrise have it over
    their moving parts and over the grain (the grain over it left the top edge lighter and greyer than the status bar).
    Every switch and every fade-in is then a plain cross-fade of two tinted images. The strip (`.fields-top`) is only
    for Background glow off; otherwise it rests at opacity 0.002 (not 0, so it stays a drawn layer). Glow on/off hands
    over between strip and field tint as a cut, never a fade (a fade of one against the other's cut left the top
    blue-black for most of a second). In a still field the canvas lies over the CSS, the grain and the tint (they stay under it while it waits, and
    go when it settles); in a field with moving parts it lies under the grain and those parts. It is there from the
    field's first frame, so no layer is added or dropped. Never show the field plain while it waits: it went dark, then
    lit.
    After a palette, glow or motion change the picture before fades out (0.6 s); if the worker can't paint, the CSS stays.
  - A glow shown faint (Coach-open beam, a fade) needs a stronger dither in its picture: `ampFor(opacity)`.
  - GPU reset (`contextlost`): the CSS shows until `contextrestored`, then the picture is written again.
- Frosted bars without brightness(2) (orb screen veil, dock, dock edge fade): the tint is corrected for the dither tile's
  darkening instead (maths in the `styles.css` Dither comment). The corrected tint is aimed at the old look's mean as the
  chip rounded it, so the darks don't lift. The dark orb screen veil's tint is itself a dithered tile (`--veil-tint-dark`,
  `src/lib/grain.ts`): its mean sits between whole steps, so each colour lands within 0.15 of a step of the old look.
- Big soft shadows band too: the light dock's outer shadow is a dithered picture (`src/ui/dockShadow.ts`, on
  `.tabbar.glass::before`), not a `box-shadow` blur.
- Light theme: the same bars carry a white dither (`--dither-light`) with the tint corrected for its lightening; the edge
  fade darkens its backdrop by the same first (`brightness(0.92728) contrast(1.17021)`).
- Proof tools: `scripts/banding-fields.mjs` (`SIM=1` = how the phone drew it before), `scripts/perf-gpu.mjs` (use the
  `chip` number: all graphics memory, counted once), `scripts/glow-layers.mjs` (layer life per step),
  `scripts/glow-theme-sync.mjs` (picture changes in the same task as the theme).
- Still CSS (small or seen once): onboarding's drifting aurora (6 more layers for one screen), button glows, Settings
  previews.

## 2. Colour

- **Dark is the default.** Both themes must work; check light for every new surface (`--bg`, `--s1…s4`, `--tx`, `--tx2`,
  `--tx3`, `--line`, `--line-2`, `--hl` are the only greys to use).
- **Palettes** (Settings → Appearance, `data-palette` on `<html>`): Ember (default coral family), Aurora (teal), Mono (grey
  light, coral accent), Sunset, Forest, Golden hour, Midnight, Champagne. **No more colours [Omar, 14 Oct 05:04].**
- **Each tab has its own light** via `data-hue` (`today`, `train`, `food`, `progress`) which sets `--ac` (accent) and the
  field colours `--h1/--h2/--h3`. A tab changes hue by cross-fading two field layers, never by transitioning the
  variables (that restyled the whole page: 45 ms per switch).
- **Derived accents:** `--ac-2`, `--ac-soft`, `--ac-text`. Use `--ac-text` for accent-coloured text (readable in both
  themes). Text on an accent fill uses `--ac-ink`.
- **Macro rings:** `--c-kcal`, `--c-protein`, `--c-carbs`, `--c-fat`, `--c-water`, set per palette with `html:root[...]`
  (needs `html:root` to beat the theme default). Four clearly different colours per palette; deeper in light.
- **No orange on surfaces [Omar, 13 Oct: "why is it still orange?"].** Any warm tint on a card, glass or sheet reads as
  orange to him. Colour goes on tappable things, rings, worked muscles and the one "next thing to do". Surfaces stay
  neutral. Do not push warmth into previews or judge notes unless he asks for a warm palette.
- **Write per-tab accent use on the element's own rule.** A `var(--ac)` set on `:root` resolves to `:root`'s accent, not the
  tab's.
- **Preview in his palette.** His phone shows the **teal (Aurora)** accent: render previews in it, with the tab bar and
  the Coach composer in the frame.
- **Body colours for the curl figure** are in `anatomy-proof/figure-rules.md` (grey clay, red worked-muscle glow).

## 3. Type, spacing, corners

- **Fonts:** display = `--f-display` (Newsreader Variable, serif, italic for names); UI = `--f-ui` (Geist Variable).
  Thin large numerals for hero numbers. **No font changes without showing Omar first** (titles went back to v0.1.29 style
  in v0.1.34 after experiments; collapsing/large-title headers were dropped by Omar).
- **Radii:** `--r-xs` 10, `--r-sm` 14, `--r-md` 22 (cards), `--r-lg` 30, `--r-xl` 38 (sheets). Nested corners:
  inner radius = outer radius − padding.
- **Screen corners (S26 Ultra):** about 29 px. It is an estimate, **not a token yet** (a `--screen-r` was added only on a
  pop-up branch). Only things that touch the screen corner (full-screen pages, sheets in motion) should follow it; it
  never changes an animation.
- **Safe areas:** `--sat`, `--sab`. Tab bar height `--bar-h` 84 px. Sheets are `100dvh − --sat − 46px` tall at most.
- **Touch targets** 44 px or more. Whole-device-pixel positions for anything that lands (a layer at a fractional pixel or
  scale ≠ 1 is soft and pops sharp on landing).
- **Languages:** every new UI string needs a Danish entry in `src/lib/da.ts`
  (`node scripts/i18n-keys.mjs --missing` must be empty). Metric units, DKK.

## 4. Motion

Default feel: **calm and Apple-like** [Omar]. Livelier, faster or snappier motion is welcome to try [Omar, 26 Oct]: show
it to him, he judges on the phone. The orb **never changes shape**.

- **Use the shared springs** in `src/ui/motion.ts` (`apple(duration, bounce)` = SwiftUI's spring):
  `TAP` (0.3 s, 0.15) press/tick; `SMOOTH` (0.36 s) content settling; `SURFACE` / `WINDOW` (0.45 s) sheets and the
  workout window; `SURFACE_EXIT` (0.38 s) leaving; `BOUNCY` (0.5 s, 0.3) records, sent message; `GENTLE` slow fills;
  `KEYBOARD` follows the keyboard. Do not invent a new curve.
- **In CSS:** `--ease-spring` (real spring sampled into `linear()`), `--ease-smooth` (near critically damped),
  `--ease-out`, `--ease-io`. Same physics as the script springs.
- **Run it on the compositor:** `springCurve` / the WAAPI mirrors in `motion.ts` let the browser draw script springs at the
  full refresh rate. Prefer them to per-frame JS.
- **Cheapest to animate:** `transform` and `opacity` (the compositor draws them). Start there.
- **Costly to animate, allowed to try [Omar, 26 Oct]:** blur (`backdrop-filter`, `filter: blur`: blur-ins, blurred exits,
  soft focus), `box-shadow`, `border-radius` on a big layer, `mix-blend-mode` on a full-screen layer. Build it, measure it
  on Beta, keep it only if it stays smooth and he likes it.
- **Avoid:** animating `width`/`height`/`top`/`left` (layout jumps) and colour variables on `<html>`/`.app` (restyles the
  whole page every frame).
- **Entrances:** fill `both`, **no `to` keyframe** (neutral end). Never an explicit end keyframe with fill forwards.
  Do not remove animation classes after they finish. Script-moved containers keep `will-change` permanently. Never toggle
  `border-radius`/`overflow` on `.stage`. (This is what stopped the one-frame flicker, README "No flicker as a page lands".)
- **Endless animation:** only stepped (`steps()`), only on screen, pause when covered, minimised or reduced
  (`data-motion='reduce'`, Settings → Background glow Soft/Off). Any rAF loop (the orb) makes every CSS animation restyle
  per frame: keep layers per word/row low.
- **Pop-ups:** the page behind recedes as one piece (`.stage-content` scale 0.95 under the dim; `.stage` background never
  moves). A sheet over a sheet takes the **subtle** step-back (scale 0.965, lift 8 px, same curve as the dim). No card edge
  on the page behind [rejected]. Close mirrors open.
- **Sheets glide in whole device pixels** (`snapPx`), keyboard slides *over* sheets and only the floating button rides it.
- **Press feel:** every tappable thing uses `.press` (`src/ui/press.ts`: 50 ms wait, 6 px slop, 120 ms minimum hold). **Instant tap [Omar, 19 Oct]:** a tap must show on the
  very next frames: the dip under a finger that stays put at 50 ms (one that creeps waits until 100 ms, a slow scroll), and a pop-up starts with its top edge at the screen's edge (its
  first frames are never spent out of sight). Never wait on a timer before opening; keep the open's first frame light. The extra
  40 px below the screen exist only on close (so the shadow has left before the sheet goes); otherwise close mirrors open.
- **Never locked by motion [Omar, 19 Oct: "non-linear animations"]:** anything moving can be caught. A leaving pop-up lets taps through to the
  page at once; tapping what opened it turns it round from where it is drawn (the leaving sheet itself presses nothing, and the spot of
  the tap that closed it is guarded 320 ms against a double tap), carrying its speed, on the
  open spring. Closed while opening, it turns round with the opening's speed. A tab tapped back mid-switch turns round on the next frame
  (no 50 ms wait: it is already built). Interrupt from the drawn position (`onScreen()` in Sheet.tsx), never the script's value, and start the turn's browser
  animations on this frame's clock (`Mirror.startNow`) or they hold still for a frame or two.
  A `.press` rule that sets its own `transition` must include `transform 520ms var(--ease-spring)` or the release snaps.
- **Haptics:** `buzz()` from `src/state/ui.ts` (obeys Settings → Haptic feedback). Few, light, one system.
- **Numbers that change roll** (`src/ui/Roll.tsx`), they never just swap.
- **Seamless settle [Omar, 14 Oct: "seamless, not an animation, then a different look"]:** the last moving frame and the
  first still frame must be the same picture (measure: hold every animation 1 ms before its end vs finished; within
  ~3/255). A stand-in that hands over to the real element uses the real element's own colours (alpha and all, not a solid
  colour under an opacity), and curves end on frames held exactly at their end (Coach `asCurve`).
- **Reduced motion** is respected on every new animation.

## 5. Performance (every change must not make it worse)

- **Blur is a budget, not a ban.** Small fixed blurred layers are cheapest; blur on blur, big live blur and animated blur
  cost more and may be tried if they measure smooth on Beta. Keep a blurred layer on its own compositor layer and do not
  re-render content under it every frame.
- **Per frame:** transform and opacity are cheapest; never write CSS variables on `<html>`/`.app`/`.fields` per frame (the
  status bar tint writes only to `[data-bar]` elements). Full-screen blend modes and animated gradients are costly: Beta
  first.
- **Pause what is off-screen.** Nothing animates behind an open pop-up. Idle redraws should be ~0.
- **Keep memory low.** Big layers (a full-screen field plus a window plus a page) starve the phone's GPU tiles and show as
  blank patches; warm the stage before a handover, release the leaving layer fast, never hold two full-screen layers longer
  than the move.
- **Large lists and chats build only what is on screen** (Coach builds the newest 6 messages, older ones on idle).
- **Never solve lag by removing blur.** If a blur truly cannot be made smooth, explain the trade-off to Omar and let him choose.
- **Measure, in order of cost:** `npm run verify`; `scripts/perf-app.mjs` (4× CPU, production build, `CSS=` A/B);
  `scripts/perf-redraws.mjs` (idle redraws); `scripts/flicker-layers.mjs` (layer drops); `scripts/glass-audit.mjs`
  (blind/stacked blur); `scripts/perf-taps.mjs`, `perf-tabspam.mjs`, `perf-workout.mjs`, `perf-keyboard.mjs`,
  `audit-coach.mjs`. Software Chromium at 4× CPU is a fair proxy for pixel cost; SwiftShader (`AVEN_GPU=1`) is only for
  how it *looks* (it saturates, and tiles SVG blurs: false fails). Headless can't reproduce GPU memory eviction: prove
  by measured load cuts.
- Report numbers as before/after. If you cannot measure on the phone, say "not measured on the phone".

## 6. Interaction rules

- **Tapping is the only way to tick a set [Omar, 12 Oct].** No swipe-to-tick, ever.
- **No new gesture without his yes.** No new feature or interaction ships because it is a nice idea: ideas are proposals.
- **Danger:** workout and food data is precious. No destructive migration without asking. Backups keep working.
- **API keys** are typed into Settings and stay on the phone: never in code, commits, logs or backups. No paid services.
- **Orb:** never changes shape; it moves, glows, breathes. It tucks under nothing (the v0.1.77 tuck was a regression).
- **Stardust** (the orb screen's orb while talking live, Omar 26 Oct): its dust may fold into a galaxy, swell with a voice,
  scatter from a finger and fly out to write words; that is the design he chose. While it answers it sinks into the Horizon
  (a large sphere below the screen's edge, kept below the words), and its dust draws each new card (outline and words) before
  the real card takes over. The small orb (dock, Coach) is drawn as the same dust; beads only for the launch logo. The usual
  orb keeps its shape everywhere.
- **Focus view / workout:** the live workout is a full page; Focus (one exercise per page) is a view of it. Rest bar is
  floating frost, never a solid block.
- **Tab-screen buttons/chips** stay without blur (section 1).

### UX laws checklist [Omar, 25 Oct]
Guides for threads and judges, never vetoes: they never override a rule above or lower quality. If a law and
something that looks good disagree, show Omar both and let him decide.
- **Hick's law:** few choices per screen; the rest goes one tap deeper.
- **Fitts's law:** big tap targets close to the thumb; sweaty gym hands miss small ones.
- **Doherty threshold:** every tap answers within 0.4 s (the instant-tap rule).
- **Peak-end rule:** the set tick and the workout finish are the moments that must feel great.
- **Proximity:** things that belong together sit together, with clear space between groups.
- **Similarity:** one look per kind of thing (one row style, one chip style, one button family).
- **Occam's razor:** calm and minimal; drop anything that doesn't earn its place.

## 7. How to work: preview, judge, ship

1. **Read first:** `CLAUDE.md`, this guide, the relevant README section, `docs/polish-plan.md`.
2. **Max 3 visual things at a time** across threads. If a fourth arrives, queue it. Parallel ships are sequenced: the second
   merges `main` after the first is live and bumps above it.
3. **Backup first** for anything risky: a branch `backup/<name>`. If Omar says "worse", go straight back to the last version
   he approved with no other changes, then fix separately.
4. **Full failure list up front.** Fewer, better rounds (he is cost-sensitive). After about four judge rounds, say the next
   judge is the last pass and looks only for noticeable defects.
5. **Visual or motion change = before/after preview** (a clip or picture) that Omar can watch **inside Claude**
   (artifact page; see `/mnt/project-files/tools/` for the clip page: Real/Half/Quarter/Pause). Never a file he must download.
   One picture with Claude's pick for visual choices, not a menu.
6. **Harsh judge before Omar** (a separate worker, Opus): give it Omar's taste, the palette, real-phone conditions and the
   earlier failure list. Judge *at rest* separately from *mid-scroll*. Judges must not push warmth/orange.
7. **Film rules:** steps of 1000/30 ms per frame for real speed; half-speed by duplicating frames (never minterpolate);
   clips without `AVEN_GPU=1` do not draw frost; freeze `document.getAnimations()` and step `currentTime` for stepped films.
   `AVEN_GPU=1` is needed to render blur in headless.
8. **Beta only when his real phone is needed to judge** [Omar, 14 Oct]. Beta is for: smoothness and frame drops; flicker or
   black frames; banding; how blur and glass look on his screen; touch and gesture feel; GPU, layer or performance changes.
   For those, tell him in one plain line: "I think you should test this on Beta first", deploy the branch to Aven Beta (see
   CLAUDE.md → "Ship to Beta": workflow `pages.yml` with input `beta_branch`), and ship to the real app only after his yes in
   Beta. Everything else (pure looks or timing that the in-Claude video already shows faithfully) goes straight to the real app
   after his yes on the video. If he says skip Beta, skip it. To ship: bump `package.json` (check `main` right before, others ship in parallel),
   `npm run verify`, PR into `ccr-d1172cc7-1e03wh`, merge, confirm "Deploy web app" is green. Red = his phone keeps the old
   version: fix at once.
9. **Tell him** exactly what to check on the phone (screen, action, what it should look like) and to fully reload.
   Tell him as soon as something is done, one short line.
10. **Plain words.** Short, no code talk. Answer-only when he is just asking; start work only on an explicit ask.

## 8. Rejected: never bring back

| What | Why |
|---|---|
| "Aven glass v2" lit-glass takes (accent-tinted cards, two-tone icons, ring bloom, coral overrides) | read as orange (13 Oct) |
| "Clean look with depth" (v0.1.102): opaque charcoal cards | Omar: "ruined"; reverted (kept on `backup/pre-revert-102`) |
| A card edge or rounded corners on the page behind pop-ups (v0.1.72–74) | rejected 13 Oct |
| Full step-back stacking (lower sheet 0.93 + peek) | replaced by the subtle step-back (`backup/stacking-r7-before-no-stepback`) |
| Swipe to tick a set | Omar 12 Oct |
| Collapsing / large titles; top bar under the status bar | dropped; impossible in standalone TWA |
| Rosé / Emerald or any new colour | Omar 14 Oct: no more colours |
| Accent glow in a card corner (hero workout card) | read as a stain (14 Oct, removed in v0.1.129) |
| Accent-tinted card glass ("colour glass") | Golden hour reads brown (14 Oct preview) |
| Navy-filled "glass" cards (`rgb(30 33 52 / .58)`, v0.1.129) | Omar: "not see-through… this tint… very ugly" |
| Font experiments in titles | back to v0.1.29 look in v0.1.34 |
| Camera drift on figures | read as wobble |
| Cross-fade / "melting" pop-up open | feels unnatural to him; a real moving frame is wanted |
| Holding the workout window longer on finish | halved fps |
| A deeper shadow on the dock | declined |

## 9. Exercise figures

The Barbell Curl figure is the reference. Every other figure follows
`/mnt/project-files/anatomy-proof/figure-rules.md` (look, build chain, grip, motion timing, camera, render, checks) and
`patterns.md` for movement groups. Credit Z-Anatomy (CC BY-SA 4.0) in Settings.

## 10. Before you hand something over

- [ ] Both themes, Danish strings, Aurora (teal) palette, tab bar and Coach composer in view.
- [ ] Nothing floating is a solid block; no warm tint on a surface.
- [ ] Springs from `motion.ts`; anything costly (blur, shadow, blend) measured smooth on Beta.
- [ ] `npm run verify` is green; the `scripts/` journey that touches your change passes.
- [ ] Judge passed (visual/motion), Omar said yes, version bumped, deploy green, phone check written out.
