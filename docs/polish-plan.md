# Polish plan (Omar's list, 11 Oct 2026)

Work one section per session. Each ends with: checks, pull request into `ccr-d1172cc7-1e03wh`, merge, deploy green.
When a section is done, change `[ ]` to `[x]` here in the same pull request.

- [x] **1. Page transitions flicker** (top, middle, dock icons when switching tabs). Done in PR "Fix page-switch flicker":
  the switch now starts from the new screen's first painted frame (`gate` in `src/App.tsx`), the status-bar tint no longer
  re-styles the whole page every frame (`src/ui/statusBar.ts`), and the dock's closing label travels with its icon
  (`src/ui/TabBar.tsx`). Tools: `scripts/flicker-tabs.mjs`, `perf-tabs.mjs`, `rapid-tabs.mjs`, `film-tab.mjs`, `prof-tab.mjs`.
  Omar still to confirm on his phone. Progress is the heaviest tab to open.
- [ ] **2. Workout screen**: lags and flickers when it opens; scrolls sideways a little (lock horizontal scroll completely);
  the rest-timer bar at the bottom sometimes shows two colours (a lighter block behind the orb, see-through over the cards);
  make the timer animation better.
- [ ] **3. Sheets and keyboard**: lag when the keyboard opens in sheets (Quick add etc.); bottom buttons (Add, Finish…) must
  not sit on a card: only a frosted blur behind them, content scrolling under it.
- [ ] **4. Top fade** on every scrolling screen (workout screens first) so content fades out instead of being cut off.
- [ ] **5. Exercise detail visual, part 1**: replace the abstract dot figure with a real picture of a person doing the
  exercise (animated start → end position) with the working muscles highlighted. Do one movement type first (rows / T-bar
  Row) and get Omar's OK on how it looks.
- [ ] **6. Exercise detail visual, part 2**: the other movement types (presses, curls, squats, pulldowns, …).

Also known, not asked for yet: a food "Add to Breakfast" sheet showed up behind the Library tab after closing an exercise
sheet (leftover sheet in the stack); the live workout timer (~18 min) disagrees with the saved duration (1 h 47 min).
