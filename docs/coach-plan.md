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
- [ ] **Phase 2, part B**: the Coach's cards animate (arrival, preview sheen, Apply "seal", week strip, drawn Undo, rolling
  setting values); ships after Omar's yes on a clip.
- Phase 2 as planned: **it can change anything he can tap**: capability audit of every store function and screen; all settings
  (profile, meals, reminders, Today cards, plate step, weight jumps, rest per exercise); custom exercises; recipes and saved
  meals; measurements; `set_split` for the whole week; Preview → Apply for every plan-sized change; the full app guide served
  by section, with a test that fails when a screen, setting or action is missing from it.
- [ ] **Phase 3: memory that grows**: the conversation kept longer and searchable; a weekly digest stored as memory; a newer
  fact replaces an older one; additive data change only (in backups).
- [ ] **Phase 4: internet, recipes, recommendations**: web search (OpenAI web search tool / Gemini Google Search grounding)
  with sources; recipes (high-protein / low-calorie) with macros computed by the app from real foods, Save as recipe / Log a
  portion; recommendations grounded in look-ups, through the existing Coach pin.
