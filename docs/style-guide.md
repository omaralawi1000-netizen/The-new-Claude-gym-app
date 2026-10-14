# Aven style guide

One look, one feel, for every session and thread. Written 14 Oct 2026 from what is live (v0.1.121) and from what Omar
decided. If this guide and an old README section disagree, **this guide wins**; if Omar says something new, change the
guide in the same pull request. `README.md` is the history of why; this file is the rulebook.

Omar judges on his phone (Galaxy S26 Ultra, 120 Hz, Chrome, installed app, DPR 3.75, 384 css px wide). Explain things to
him in plain, short words. Rules marked **[Omar]** are his own words or decisions: never reverse them without his yes.

## The quality bar [Omar, 14 Oct]

Omar wants the standard for animation, look and everything to be **very high, Apple-level**. Nothing goes to him that a top
iOS designer would wince at. Every Omar-facing preview passes a harsh judge first (section 7). Fewer rounds is never a
reason to show something mediocre: spend the extra round before he sees it, not after.

## 0. The four things that must always hold

1. **Blur AND 120 fps.** Frosted glass stays; make it cheap, never remove it (section 5).
2. **Slow, calm, Apple-like motion.** Never faster or snappier unless Omar agrees (section 4).
3. **See-through frost, never a solid block** for anything floating (section 1).
4. **No orange on surfaces.** Colour only on things you can tap or that mean something (section 2).

## 1. Surfaces and glass

Tokens live in `src/styles.css` (`:root` dark block and `:root[data-theme='light']` block, near the top).

- **Page cards = `.plinth`** (radius `--r-md` 22 px; fill `--s1`; edge `inset 0 1px 0 var(--hl)` + `inset 0 0 0 1px var(--line)`;
  shadow `--sh-c`). Inner cells = `.plinth-2` (`--s2`, `--r-sm`). Floating bars and toasts = `.glass` (`--glass`, `--sh-a`).
- **Edge of light:** every glass surface has a 1 px white top line (`--hl`) and a hairline ring (`--line`). Do not add
  coloured rims. Shadows are deep and neutral (black / navy), never tinted.
- **Shadow ladder:** `--sh-c` card, `--sh-a` floating, `--sh-f` sheet. Pick one; do not invent new ones. Shadows are static:
  never animate `box-shadow` (it repaints on the main thread every frame).
- **Real frost (backdrop-filter) only where something passes underneath:** the tab bar, sheets, pop-ups, toasts, the Coach
  controls. On tab screens and in the live workout, cards, buttons and chips have **no** backdrop blur on purpose: they sit
  over the soft colour field only, and frosting them cost 36 fps on Train/Progress. Look identical, cost far less
  (`.screen .plinth …` and `.wk-window .plinth …` rules). Do not turn it back on.
- **Sheets (`.sheet`):** two layers under the content. `::before` = the blur (`--sheet-frost`, 44 px, dark adds
  `brightness(2)`); `::after` = the tint (`--sheet-tint`) carrying `--dither`. Drop shadow is on `.sheet` itself, not on
  the dithered layer (it doubled the cost). Sheet radius `--r-xl` on top corners.
- **Frosted controls (Coach bar etc.):** `.frost-ctl` (the control), `.frost-seat` (a seat a little bigger than the
  control), tokens `--fc-*`. Soft edges: `.edge-fade` (plain, tint only) and `.edge-fade.frosted` (adds a small blur; the
  tab bar uses `.tabbar-wrap.edge-fade`). Soft edges must not reach visible content (leave 48 px under the last card).
- **Neutral frost [Omar]:** glass tint is neutral grey (R=G=B or the navy `--sheet-tint`), so the colour field comes
  through. Never tint glass with the accent.
- **Opaque fallback:** a dark card that needs to be neutral over a coloured field may be opaque charcoal, but Omar rejected
  "clean look with depth" (v0.1.102) as a whole: only do this where asked.

### No banding (the dither recipe)
Chrome on his phone draws CSS gradients and blur output in whole 8-bit steps, so soft glows show coloured rings. The test
browser smooths them, so **lab shots lie: judge from Omar's own screenshots.**
- Behind blur: blurring layer = `backdrop-filter: brightness(2) blur(r) saturate(s)` with **no background**; the tint is a
  separate layer right over it with `background: var(--dither), <tint>` and `image-rendering: pixelated`. Noise drawn after
  rounding only hides the rings' edges. Full recipe and the maths: the "Dither" comment in `styles.css`; noise tile is
  installed by `src/lib/grain.ts` (`installDither`).
- Never put a picture inside a blurring layer (extra full-screen pass: frames halved).
- Glows in the live workout window are painted by `src/ui/glow.ts` + `glow.worker.ts` (TPDF dither into half-res canvases,
  `[data-dith]` swaps the CSS gradient out). Any new large soft glow should use it. Open: tab-screen Classic glow
  (`.aurora i`) and `.bgx` backgrounds still use CSS gradients.
- Light theme: plain blur and tint, no dither (a doubled bright page would clip to white).

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

All of it: **slow, calm, Apple-like, never snappier unless Omar agrees.** The orb **never changes shape**.

- **Use the shared springs** in `src/ui/motion.ts` (`apple(duration, bounce)` = SwiftUI's spring):
  `TAP` (0.3 s, 0.15) press/tick; `SMOOTH` (0.36 s) content settling; `SURFACE` / `WINDOW` (0.45 s) sheets and the
  workout window; `SURFACE_EXIT` (0.38 s) leaving; `BOUNCY` (0.5 s, 0.3) records, sent message; `GENTLE` slow fills;
  `KEYBOARD` follows the keyboard. Do not invent a new curve.
- **In CSS:** `--ease-spring` (real spring sampled into `linear()`), `--ease-smooth` (near critically damped),
  `--ease-out`, `--ease-io`. Same physics as the script springs.
- **Run it on the compositor:** `springCurve` / the WAAPI mirrors in `motion.ts` let the browser draw script springs at the
  full refresh rate. Prefer them to per-frame JS.
- **What may animate:** `transform` and `opacity` only.
- **What never animates:**
  - the **blur** (`backdrop-filter`, `filter: blur`) anywhere [Omar]. No blur-in on Coach text: opacity and a small
    rise only (0.14 em, 820 ms);
  - `box-shadow`, `width`/`height`, `top/left`, `border-radius` on a big layer, colour variables on `<html>`/`.app`;
  - `mix-blend-mode` on a full-screen layer.
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
- **Press feel:** every tappable thing uses `.press` (`src/ui/press.ts`: 100 ms wait, 6 px slop, 120 ms minimum hold).
  A `.press` rule that sets its own `transition` must include `transform 520ms var(--ease-spring)` or the release snaps.
- **Haptics:** `buzz()` from `src/state/ui.ts` (obeys Settings → Haptic feedback). Few, light, one system.
- **Numbers that change roll** (`src/ui/Roll.tsx`), they never just swap.
- **Reduced motion** is respected on every new animation.

## 5. Performance (every change must not make it worse)

- **Blur only small fixed layers.** Never blur on blur. Never animate a blur. Keep a blurred layer on its own compositor
  layer and do not re-render content under it every frame.
- **Per frame:** animate transform and opacity only; never write CSS variables on `<html>`/`.app`/`.fields` per frame (the
  status bar tint writes only to `[data-bar]` elements); no full-screen blend modes; no animated gradients.
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
- **Focus view / workout:** the live workout is a full page; Focus (one exercise per page) is a view of it. Rest bar is
  floating frost, never a solid block.
- **Tab-screen buttons/chips** stay without blur (section 1).

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
| Animated blur (blur-in on Coach text, blurred exits, soft focus via blur) | GPU cost; rule |
| Tab-screen cards, chips or buttons with real backdrop blur | 36 fps on Train/Progress |
| Rosé / Emerald or any new colour | Omar 14 Oct: no more colours |
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
- [ ] Only transform/opacity animate; no new blur on blur; springs from `motion.ts`.
- [ ] `npm run verify` is green; the `scripts/` journey that touches your change passes.
- [ ] Judge passed (visual/motion), Omar said yes, version bumped, deploy green, phone check written out.
