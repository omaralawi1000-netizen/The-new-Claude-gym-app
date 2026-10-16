# Coach 2.0 plan (Omar, 15 Oct 2026)

Goal: a Coach that knows the whole app and all his data, follows a conversation, changes anything he could change by hand,
remembers what he said, plans his training from his own exercises, and can search the internet (recipes). One phase per
session; each ends with checks, a pull request into `ccr-d1172cc7-1e03wh`, merge, deploy green, and Omar testing it.
The polish plan (`docs/polish-plan.md`) is paused while this runs.

- [x] **Phase 1: it knows everything and follows the conversation** (v0.1.133)
  - Look-ups: the model asks for any of his data (`src/lib/agentLookup.ts`) and gets it back before answering; up to 3 rounds.
  - "It" is the exact item: every food on a card and in DATA carries `[ref …]`; food actions take `ref`.
  - One conversation for the orb and the Coach (`src/lib/thread.ts`).
  - `plan_day`: "chest and triceps with some shoulder tomorrow" → a preview from his exercises, Apply, Undo (`src/lib/planDay.ts`).
  - The newest GPT model on his key is used by itself; Settings → Voice & AI → Model pins one.
- [x] **Phase 2, part A** (v0.1.134): done as below.
- [x] **Phase 2, part B** (v0.1.135): the Coach's cards animate (arrival, preview sheen, Apply "seal", week strip, drawn
  Undo).
- Phase 2 as planned: **it can change anything he can tap**: capability audit of every store function and screen; all settings
  (profile, meals, reminders, Today cards, plate step, weight jumps, rest per exercise); custom exercises; recipes and saved
  meals; measurements; `set_split` for the whole week; Preview → Apply for every plan-sized change; the full app guide served
  by section, with a test that fails when a screen, setting or action is missing from it.
- [x] **Phase 3: memory that grows** (v0.1.136)
  - The whole conversation kept on the phone (IndexedDB `aven-chat`), searchable by the Coach and by him; older days load
    when he scrolls up; in backups (additive).
  - Memory v2: a newer fact replaces the older one (shown as "Updated", Undo); temporary things end by themselves
    ("sick until Friday"); each note's age goes with it; up to 60 notes.
  - It learns from what he applies, undoes and corrects (LEARNED, only after 2+ consistent signals, each one dismissable).
  - The weekly review: the app computes the week (training, muscles vs his 4-week average, PRs, food on logged days, weight
    trend, last week's priorities done or not); the Coach writes a short verdict and at most two priorities, each with one
    Apply. Animated sheet (rolling numbers, bars growing, cards sealing).
- [ ] **Phase 4: internet, recipes, meal plans**: web search with sources he can tap (consensus kept apart from early
  findings); recipes (high-protein / low-calorie) with macros computed by the app from real foods, Save as recipe / Log a
  portion; a 3–7 day meal plan from foods he eats, with a shopping list; a photo of a program → a routine preview.
- [ ] **Phase 5: the coach around the workout**: a short briefing when today's workout starts; a Coach line on the Summary
  (what moved, next time's targets, computed locally); a one-tap check-in (energy, soreness, sleep) that makes the next plan
  lighter when needed; smarter deload and wrestling load; long-press anything ("Ask the Coach about this"); small charts in
  the chat; "Undo all", before/after for routine edits, choose which changes to apply, duplicate a routine.
  - Hands-free sets (a trial on Beta first; Omar tried hands-free before and it misheard him and reacted to him talking to
    others): never always-on, it listens only after a tap anywhere on the workout (or the earbud button, if Chrome on his
    S26 allows it); it takes only set-shaped answers ("8 at 80", "same again", "skip", "done") and ignores the rest; a
    number far from last time is asked about, not logged; it says back what it logged with a few seconds to say "no".
  - Injury mode: "my shoulder hurts" → the moves that load it are swapped for two weeks, then it switches back by itself
    (phase 3's self-ending memory). Travel mode: "hotel gym, dumbbells until Sunday" → temporary routines, then back.
  - Race your past self: last time's numbers beside the set you are on (check what the workout already shows first).
- [ ] **Phase 6: programs and seasons**: multi-week blocks ("6 weeks to the tournament") with the weekly review as the
  checkpoint; wrestling weight class and competition dates with a safe make-weight plan (never dehydration or extreme cuts);
  targets that follow his weight trend, as a preview with the reason; "review my program"; a monthly recap card (lifts,
  records, wrestling, consistency) to keep or share.

Each phase's plan starts with a fresh look: ideas worth adding are added (and said), and anything that no longer pays off
is dropped (and said).

Not doing (worse for the Coach or not worth it): video form feedback (unreliable, false confidence), wearables and calendar
sync (logins and upkeep), usage analytics (his feedback is the measure), a chat "style" setting, changing targets silently.
