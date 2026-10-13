# Polish plan (Omar's list, 11 Oct 2026)

Work one section per session. Each ends with: checks, pull request into `ccr-d1172cc7-1e03wh`, merge, deploy green.
When a section is done, change `[ ]` to `[x]` here in the same pull request.

- [ ] **1. Page transitions flicker** (top, middle, dock icons when switching tabs). Three attempts (11 Oct: start from
  first paint, faster fades, kept screens without card rise) were all reverted at Omar's request: he wants the original
  animations (slide, cards rising in, slow 0.8 s colour fade) and the flicker fixed without changing how they look.
  Findings to reuse: on his 120 fps recording the app draws only ~30 fps during a switch; faded colour layers pile up while
  you keep switching (AnimatePresence removes leaving layers only once all are done); the status-bar tint rewrites `--bar`
  on <html> every frame (restyles the whole page); the dock's closing label starts on top of its icon. Tools:
  `scripts/leak-tabs.mjs`, `perf-tabs.mjs`, `film-tab.mjs`, `prof-tab.mjs`. Change one thing at a time and get his OK.
  13 Oct (v0.1.49): the one-frame flicker as a page/tab/sheet lands is fixed (layers kept when animations end; see README
  "No flicker as a page lands", `scripts/flicker-layers.mjs`). Waiting on Omar's phone check before ticking.
- [x] **2. Workout screen**: lags and flickers when it opens; scrolls sideways a little (lock horizontal scroll completely);
  the rest-timer bar at the bottom sometimes shows two colours (a lighter block behind the orb, see-through over the cards);
  make the timer animation better.
- [x] **3. Sheets and keyboard**: lag when the keyboard opens in sheets (Quick add etc.); bottom buttons (Add, Finish…) must
  not sit on a card: only a frosted blur behind them, content scrolling under it.
  (12 Oct: v0.1.3's frost still left a band, because the list ended above the button. v0.1.5: the buttons float over
  the list, which melts into a soft blur under them; sheets behind the top one no longer ride the keyboard. v0.1.8: as in the Claude app, the keyboard slides over sheets and
  only the button rides it (no resizing per frame); buttons are plain floating glass pills, nothing behind them.)
- [x] **4. Top fade** on every scrolling screen (workout screens first) so content fades out instead of being cut off.
  (12 Oct, v0.1.4: one shared eased fade `--ft` on tab pages, live workout, Orb talk list, onboarding. Sheets keep their own.)
- [ ] **5. Exercise detail visual, part 1**: replace the abstract dot figure with a real picture of a person doing the
  exercise (animated start → end position) with the working muscles highlighted. Do one movement type first (rows / T-bar
  Row) and get Omar's OK on how it looks.
- [ ] **6. Exercise detail visual, part 2**: the other movement types (presses, curls, squats, pulldowns, …).

- [ ] **7. Workout focus view** (12 Oct): one exercise per page, glides to the next when its sets are done.
  - [x] Step 1 (v0.1.17): switch button, finger paging, dots, auto-advance, bar jumps to the page.
  - [x] Step 2 (v0.1.21): the card you're on glides from the list to its place on the page, and back (`morph.ts`).
  - [ ] Step 3: during rest, the stage shows a big calm countdown and the next set's numbers.
  - [ ] Steps 4 and 5: moving figures (this replaces items 5 and 6). Recommended: Aven's own line figure per movement type,
    working muscles glowing; free, tiny, 120 fps. Paid alternative: ExerciseDB GIF pack (~$300 once). Omar decides.

Also known, not asked for yet: a food "Add to Breakfast" sheet showed up behind the Library tab after closing an exercise
sheet (leftover sheet in the stack); the live workout timer (~18 min) disagrees with the saved duration (1 h 47 min).
