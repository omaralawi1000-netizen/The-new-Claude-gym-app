# Coach brain plan (Omar, 19 Oct 2026)

Omar: "I want it to be as good as it can get with the thinking and the communication and how to help me — and if my
friends try the app with their own data." He can't judge AI quality himself ("I won't notice if it's half-baked"), so
quality is proven by an exam, not claimed. Same coordinator rules as #173/#174: own branch from the latest base, PR,
no deploy, no version bump, no styling/animation changes, Danish for every UI string.

Branch `claude/coach-brain` starts from `claude/eating-patterns` (PR #174, stacked on #173). Order:
#173 → #174 → **this (brain)** → eating part 2 (learning why + stepping in early) → friends & follow-up → eating part 3
(experiments).

## What the review of the current Coach found
- `AGENT_SYSTEM` (coachContext.ts) is ~23k chars, almost all about actions; almost no coaching knowledge or reasoning
  discipline (how to judge trends, thin data, one heavy day).
- Omar-specific facts are hard-coded for every user: "they tend to overeat in the evening…" (EATING PATTERNS rule) and
  "they train hard whatever the day, by choice" (recovery rule). A friend would get them too.
- Profile has goal/experience/equipment/days only: no age, sex, height, weight → no day-one estimate for a new user;
  onboarding asks them to type their own kcal target.
- Weekly review (`aiWeekReview`) and Today's Coach notes (`aiInsights`) run on Gemini Flash only, never Sol.
- Gemini fallback agent thinks with `thinkingBudget: 512` only.
- **Bug:** `buildAgentContext` ends with `.slice(0, 18000)`: with lots of data the LAST blocks are cut first, and those
  are BODY & RECOVERY and EATING PATTERNS. Assemble by priority instead.
- `trueMaintenance` counts any day ≥800 kcal as logged; a half-logged day (no dinner) drags maintenance down.
- Real cost (OpenAI dashboard, 19 Oct): ~$2.88 / 7 days ≈ 80 kr/month on Sol Medium. The in-app counter undercounts (per
  origin: Beta, browser, TWA each count separately) — Omar should set the hard budget in OpenAI/OpenRouter.

## The plan (PR "brain")
1. **Handbook**: core coaching principles always in the prompt (short), deeper topics via a `handbook` look-up (cutting,
   bulking, plateaus, sleep, sport/wrestling, women, teens). Firm: weekly trend over single weigh-ins; 1–2 kg daily
   swings normal; one heavy day is mostly water/glycogen/gut content; rigid compensation → more binge eating (flexible
   control better); ~1.6 g/kg protein covers most lifters, more in a hard cut; 0.5–1 %/week loss; short sleep →
   ~200–385 kcal more eaten; never dehydration/extreme weight cuts.
2. **Person model** (per user, from their data, `src/lib/person.ts`): evening share of kcal, heavy weekdays, links
   (short sleep / wrestling → heavy day), which meals they usually log, training rhythm, weight response. Replaces the
   hard-coded lines; Omar's two facts become memory notes (additive only).
3. **Data trust** (`src/lib/dataQuality.ts`): likely-unfinished days (a usually-logged meal missing) excluded from true
   maintenance; typos (one item >1,500 kcal, amount 10× usual, weigh-in far off trend); duplicates (same item within
   2 min); watch burn = rough. The Coach asks one short question only when it matters.
4. **Thinking**: a decision protocol + self-check in the prompt; High effort automatically for decisions (heavy-day
   verdict, weekly review, plans, target changes); "think about it properly" forces the setting; weekly review and
   Coach notes on the main brain; Gemini fallback thinks more on deep messages; DATA assembled by priority (fix above).
5. **Communication**: answer first; one recommendation + main reason + main trade-off; real numbers + how sure; short;
   no lecture/guilt; one question only when it changes the answer; orb (voice) replies shorter. "That was off / too
   long" said in chat → remembered as a communication preference (no new buttons).
6. **Heavy-day verdict** replaces the fixed −500×4 formula: detection stays rule-based (free, no false alarms); the
   main brain on High decides nothing / small trim / spread, with one line + "Why?" (opens the Coach). Code guardrails
   always: floor, protein unchanged, Undo, max cut per day; no key/offline/limit → gentle default (≤250 kcal/day,
   none on a bulk).
7. **Coach exam** (`scripts/coach-exam.mjs` + fixtures): 5 fake people (Omar-like; beginner woman cutting; 16-year-old
   bulking; logs half the days; brand-new user) × ~20 questions, each with what a great answer must do. Runs the real
   prompt-building on fake data only (never the store), calls the models, scores answers, reports cost per answer.

## Model contest (before building the OpenRouter connection)
Omar wants ONE good choice, no constant switching, cheapest only when quality is equal. Via OpenRouter (one key):
big: GPT-6.1 Sol, Claude Sonnet 5.5, Gemini 4 Argon; cheap: Claude Haiku 5.5, GPT-6 Luna, DeepSeek V4.1 Flash,
GLM-5.3 Flash, Qwen3.8 Flash, Grok 4.1 Fast, Gemini 3.8 Flash. Winner = cheapest that matches the best on the exam;
possibly a fixed pair (Main model for thinking, Quick model for easy messages). Prices from aggregator sites are
unverified: the exam measures real cost.

Then the app gets an **OpenRouter connection** with two settings in Voice & AI: Main model and Quick model (changeable
by hand or by asking the Coach). Gemini key stays for the voice (TTS) and Google search; Groq for speech-to-text;
OpenAI key optional as backup.

## Setup Omar is doing (19 Oct)
OpenRouter: budget $10/month guardrail; Zero Data Retention ON for "All other models" and Anthropic, OFF for OpenAI and
Google (else their models are blocked); API key "Aven test". Environment: variable `OPENROUTER_API_KEY`, allowed
domain `openrouter.ai`. Key never in code, commits or logs. A new session picks it up: "continue the Coach plan".

## Friends & follow-up (later PR)
Optional age/sex/height/weight in setup (day-one estimate, labelled, until true maintenance takes over); under 18: no
catch-ups, mild deficits only; women: cycle water swings, under-eating risk; a style choice (Direct / Gentle / Strict —
same advice, different words; Omar's earlier "no style setting" was for him alone, back on the table for friends:
ask him); a decision log so the Coach follows up on what it advised. Friends need their own AI key (or Omar's).

## Done in PR "brain" (19 Oct)
1–7 above, plus the contest (README "The Coach's brain, and the model contest"). Outcome: the winners are both OpenAI
models, so no OpenRouter connection is needed in the app for now: Quick model GPT-6 Luna for everyday messages, main
model GPT-6.1 Sol for decisions, photos, the verdict and the weekly review. OpenRouter stays the testing tool; rerun the
exam when a new model comes out. Next: eating part 2 (learning why), then friends & follow-up.

## Review round 1 (19 Oct, after PR #177): what must be fixed before any of #174/#177 ships
Two independent reviews (code, behaviour) + checked by running them on the real code. Fix PR on top of #177:
1. Heavy days judged against today's target: changing the target makes past normal days "heavy" (verified: 3 fake
   heavy days after 3,200 → 2,200). Record when the target changed; never judge days before it.
2. A catch-up never shrinks or goes away when the log is corrected (verified); no way to cancel without a key → reconcile
   removes/re-plans it, tap the Food line to cancel, DATA TRUST lines go into the verdict prompt.
3. True maintenance broken by one bad weigh-in (verified: 6,910 kcal "high") → drop odd weigh-ins and the 2 days after
   a heavy day, clamp to a sane range, lower confidence on extreme slopes.
4. Every +200 kcal re-decides (paid call + new toast); a stale verdict can land on a re-planned amount; the old plan
   vanishes while re-deciding → decide once per heavy day, stale-guard by `at`, keep the old plan meanwhile, run once
   on start.
5. Limits leak: overlapping catch-ups sum past 15 % (verified 20 %); target can end above the user's own (verified);
   the toast keeps the AI's numbers after clamping (verified) → cap the sum, min(base), rebuild the line.
6. Leans to restriction: the Coach's catch_up action pays back up to 400×7; frequent heavy days → trim before help; the
   no-key default trims a first heavy day; no off switch → trims only for adults, fat-loss goal, occasional heavy days
   (≤ half back, ≤250/day, ≤4 days); frequent → structure + one gentle mention of help; no key → no cut; catch_up
   through the same rules; "Heavy-day notices" On (fat loss) / Quiet (other goals) / Off; "no catch-ups ever" → Off.
7. Routing: DECIDE catches "how many calories in a banana" (Sol-high; orb has no timeout); risky messages ("I ate 2000
   extra, what now?", "drop 4 kg in 10 days", "I keep bingeing", Danish) go to Luna-low (verified) → Luna by default,
   a tested EN+DA list of decision AND safety phrases → main model; orb timeout; food estimates on Luna; remember a
   key without Luna.
8. Prompt: answer-first vs JUST NOTICED-first; ask-instead-of-act (new user and teen got no number); JUST NOTICED on
   pure logging; handbook before web; handbook look-up matches several topics; invisible calories only at ≥20 % and
   500 kcal, worded "watch may overestimate or food not logged", said once (stored); science fixes (cycle 0.5–1.5 kg,
   surplus vs maintenance, protein by goal weight when body fat is high, teen sleep 8–10 h, teen caffeine, making-weight
   wording, sedentary multiplier); Omar leftovers ("most likely evenings", "wrestling tracker", week review "often
   evenings", "never do less because tired" without exceptions for illness/injury/teens).
9. Small: "why?" keeps the last decision 3 days; markCoachTold only for what JUST NOTICED actually showed; weigh-in card
   id per last weigh-in; times before dayStartHour count as evening/today; catch_up `on: null` is not "on"; Coach notes
   get HOW_TO_TALK and no unasked eating-pattern nags, retry once a day max; week review 45 s limit; spend counted on
   abort.
10. Exam matches the app: real effortFor routing and model, personas with real verdict lines, Danish, multi-turn
    ("why?", "no catch-ups"), eating-disorder signals, teen with unknown age, Gemini-only, a case that SHOULD trim.
Then: review PR #173 the same way (never reviewed); two fresh reviews of everything after the fixes; exam again;
note on #174/#177 that they ship only together with the fix PR. Friends PR (age/sex in setup, teen limits in code)
and eating part 2 after that.

## Fix plan (approved 19 Oct) — the work after Review round 1
Omar's answers that shape it:
- **Goal:** "Right now I'm trying to lose fat, but maybe in the future I'm trying something else" → heavy-day notices
  default On for fat loss, Quiet for other goals; the default follows the goal.
- **Frequent heavy days:** "I want you to decide… It depends on how much I eat and so many other factors" → the main
  model judges each case from all the data, inside hard limits in code.
- **Testing:** a Beta trial with a copy of his real data, after the coordinator says yes.
- **Talking steers it:** "of course I can communicate with the coach. That's how it knows the future and current, or if
  I'm not satisfied with something… Just like a real coach." → plans, current state and dissatisfaction are remembered
  and used in every answer and every heavy-day decision.

A new session continues with "continue the Coach plan": read this section, tick the steps below as they are done.

Progress (ticked as done):
- [x] Step −1 plan saved
- [ ] Step 0 baseline
- [ ] Step A PR #173 reviewed and fixed, merged up
- [ ] Step 1 target history
- [ ] Step 2 modes, eligibility, limits
- [ ] Step 3 the watcher
- [ ] Step 4 true maintenance
- [ ] Step 5 routing and time limits
- [ ] Step 6 prompt, handbook, leftovers
- [ ] Step 7 small fixes (droppable)
- [ ] Step 8 exam
- [ ] Step 9 final gate, reviews, docs, PRs ready, Beta

### In plain words (for Omar)
- **Why:** reviews found real problems in the last three PRs, and I re-ran the main ones on the real code. Examples:
  - changing your calorie target creates fake heavy days;
  - fixing a typo leaves the cut in place;
  - one bad weigh-in breaks maintenance;
  - risky messages go to the cheap model;
  - the heavy-day system leans toward eating less.
- **Third check:** a reviewer went over this plan itself and found 20 more holes. Examples: pop-ups about the past on the first launch, answers cut off by new time limits, everyday logging like "5 g kreatin" sent to the expensive model, and my old phone checklist putting fake food into your real log.
- **Your answers are built in:**
  - you're losing fat now, so notices start **On**; if you change goal later, the default follows you;
  - frequent overeating is **decided by the AI case by case** from all your data, inside hard limits;
  - you test it on **Aven Beta** with a copy of your real data, after asking the coordinator.
- **The order:**
  1. fix #173, which nobody has checked yet;
  2. fix #177;
  3. prove it with tests, the in-app journeys, the exam (run the way the app really works: Danish, follow-up questions, eating-disorder signals, teens) and two fresh reviewers at the end;
  4. then your Beta test.
- **Nothing ships before that.** #174 and #177 stay drafts until then.

### Context
- **Stacked PRs:** #173 `claude/section-two-2wvwuu` → #174 `claude/eating-patterns` → #177 `claude/coach-brain`.
- **Round 1 findings:** listed in `docs/coach-brain-plan.md` under "Review round 1". Exploration and the red-team review of this plan added the items marked (RT) below.
- **Rules that hold:** own branches, no real deploy, no version bump, no styling or animation changes (existing components only), Danish for every new string, additive data only, keys never in code, a backup branch before anything risky, `npm run verify` green.
- **OpenRouter test budget:** $3.91. At most about $2.5 for the first exam run; keep at least $1 for the rerun after the final review. The runner gets a hard stop (`EXAM_MAX_USD`).

### Decisions
- **Mode "Heavy-day notices"** (`settings.heavyDays`, missing = goal-based default: fat loss → On, other goals → Quiet; an explicit choice sticks):
  - **On:** noticed, decided once, one toast with Undo, the Food line, the Coach told once.
  - **Quiet:** noticed and recorded; no toast, no target change. The Coach gets a line: "noticed, mention only if they ask".
  - **Off:** nothing recorded; running catch-ups stop counting (reversible). "No catch-ups ever" to the Coach → Off.
  - **Switching to On** stores `heavyOnSince`. Only days from then on are judged, so turning it on never toasts about the past (RT).
- **Who decides a trim:**
  - the main model, case by case (Omar: "it depends on how much I eat and so many other factors"), from the amount, the surplus over true maintenance, how often it happens, the trend, sleep, training and the goal;
  - frequent heavy days are information for that judgment, not a ban. The handbook explains that cutting after frequent overeating often drives the next one, and that structure usually helps more.
- **Hard limits in code (always):**
  - a trim only for adults on a fat-loss goal, in mode On;
  - never with eating-disorder signals in MEMORY (purging, laxatives, not eating to compensate, loss of control) (RT);
  - at most half of min(over target, day − true maintenance when maintenance confidence ≥ medium) (RT);
  - ≤250 kcal a day, ≤4 days, total cut across stacked catch-ups ≤250, never under the floor, never above the user's own target, protein untouched, Undo.
  - When no trim is possible, a template line is used with no paid call (RT).
  - **No AI key:** never a cut (a "noticed, no cut" line).
- **Help mention:** once, gently, at 3+ heavy days a week for 2 weeks, or on explicit eating-disorder signals. The date it was said is stored so it isn't repeated (RT).
- **Training lighter:** "don't tell them to train lighter unless they ask or MEMORY says" stays (Omar). The only exceptions: illness or injury mentioned in this conversation or today, or under 18 → say once that easier is safer (RT: not a standing MEMORY note).
- **Age (until the friends PR adds it to setup):**
  - the Coach stores age as "Age: N (as of YYYY-MM-DD)" and the minor check parses that format first;
  - an "age asked" marker stops repeat asking;
  - unknown age → a conservative safe answer first, then ask once;
  - Omar tells the Coach his age once (checklist) (RT).
- **Talking to the Coach steers it, like a real coach** (Omar, 19 Oct). What he tells it is remembered (MEMORY) and used in every answer and every heavy-day decision. `verdictPrompt` already includes MEMORY; the rules make sure the Coach writes it down. Three cases:
  - **Plans for the future:** "tournament on 5 Dec at 74 kg", "bulking from January", "holiday next week". The Coach remembers it with its date (`until`). For a goal change it offers `set_setting` goal, and the heavy-day mode default follows the goal.
  - **How things are now:** "stressful exam week", "sick", "not sleeping".
  - **Not satisfied:** "that cut was too much", "don't do that again", "I want smaller cuts", "you were wrong about X". It takes it off or changes it when asked, and remembers a preference that future verdicts follow (e.g. "prefers no catch-ups after weekends", "max 150 a day"). If he's unhappy but doesn't say why, it asks one short question: what to change.
  - Hard limits still apply whatever MEMORY says. A preference can only make a trim smaller or remove it, never bigger.
- **Cut from the plan (RT):**
  - the hidden tappable Food line (Undo, the Coach and Settings Off cover it; no key means no cut);
  - spend estimates on abort (README note instead: the real guard is the OpenAI budget);
  - Java fixes unless one is real data loss (the rest listed in the PR).
- **Last, and dropped if time or budget runs out:** nudge fixes, Coach notes changes, the handbook alias list.

### Branches and safety
- `git fetch` and check whether the default branch moved.
- Create backup branches first: `backup/section-two-pre-fix`, `backup/eating-patterns-pre-fix`, `backup/coach-brain-pre-fix`.
- #173 fixes are commits on `claude/section-two-2wvwuu`. Mark #173 draft while it's reviewed. Right after Step A, merge it up with merge commits (never rebase or force): → `claude/eating-patterns` → `claude/coach-brain`, with `npm run verify` after each merge. Expect da.ts conflicts; keep both sides.
- #177 fixes are commits on `claude/coach-brain`, one per step. The backup branch makes any step revertible.

### Steps

#### Step −1: Save this plan so nothing gets lost (the session is near its limit)
- Copy this whole plan into `docs/coach-brain-plan.md` as "Fix plan (approved 19 Oct)", with Omar's answers (goal: fat loss now, may change; frequent heavy days decided by the AI within hard limits; Beta trial via the coordinator; talking to the Coach steers it).
- Commit and push on `claude/coach-brain`. Every later step is ticked there as it's done.
- Keep the task list (F1–F8) in sync. A new session starts with "continue the Coach plan".

#### Step 0: Baseline
`npm run verify` plus i18n (`node scripts/i18n-keys.mjs --missing`, expect 0) on each branch.

#### Step A: Review and fix PR #173
- **Two parallel reviewers:** (1) code, (2) behaviour with a failing repro test per suspected risk. Range `origin/ccr-d1172cc7-1e03wh..claude/section-two-2wvwuu`.
- **Hypotheses:**
  - `log_sets` Undo restores a whole session, wiping later edits → remove only the added blocks/sets by id;
  - loose two-way name matching, and 'last' assumes array order → exact match first; newest by date/endedAt;
  - a named workout bypasses the live one;
  - an `after` miss silently appends → say so in the card;
  - skip Undo after finish;
  - Coach.tsx 2 s identical-text drop (a repeated "8") → dedupe only while in flight;
  - the once-per-props guard;
  - healthSync.ts:
    - the 160k cap drops a whole sync → keep the recent 14 days;
    - `by.set` replaces a whole day → merge fields;
    - 2-year matching overwrites hand-logged activities → never overwrite non-watch ones;
    - a toast for old workouts;
  - Java: re-prompts, the history pointer skipping a month, sleep double-counted (fix only data loss).
- **Rules:** fix only confirmed findings, each with its test. Run `journey-coach7` and `journey-health`. Merge up (see above).

#### Step 1: Target history (item 1)
- **Data:** `TargetChange { from; kcal?; prev? }` and `AppData.targets?`, following the `catchUps` precedent (types.ts, defaults.ts `defaultData` + validated `normaliseData` `arr`, store.ts `pickData`; `DATA_VERSION` stays 1). Backups and the Beta copy carry it via `defaultData` keys.
- **Recording:** pure `noteTarget` in `src/lib/eating.ts`, called only from store `updateSettings`/`patch` when `goals.kcal` changes.
  - One record per day, keeping that day's original `prev`.
  - Back to `prev` the same day removes the record (keystrokes and Undo leave no trace).
  - `replaceAll` never records.
- **Reading:** `targetOn(d, date)`.
  - No records → current setting.
  - Before the first record → its `prev`.
  - On or after the last record → current setting (RT: import or restore safe).
  - Change day → `max(prev, kcal)`, or not judged.
- **Who uses it:** `heavyNow`, `heavyDays`, `reconcileCatchUps`, `doCatchUp`'s over, `verdictPrompt`'s target and the week review text (RT).
- **Tests:**
  - 3,200 days, then 2,200 → no heavy days;
  - keystrokes → one record with prev 3,200;
  - Coach kcalGoal + Undo → none;
  - `prev` undefined (onboarding or demo);
  - before / after / change day;
  - normalise;
  - a backup round trip keeps `targets` and `heavyDays` (RT).

#### Step 2: Modes, eligibility, limits (items 5, 6, 9)
- **`src/lib/eating.ts`:**
  - `heavyMode(s)` and `heavyOnSince`;
  - `maxTrim` (cap 250) moves here, re-exported by verdict.ts;
  - `kcalTargetFor`: Off → base; else `min(base, max(minFloor, base − min(maxTrim, Σ perDay)))`;
  - `catchUpOn` returns the effective cut, is mode-gated, and never shows "−0" (RT);
  - one shared `frequentHeavy` (today's live day defined as included) (RT).
- **`src/lib/verdict.ts`:**
  - `trimAllowed` (mode, fatloss, `minorFromMemory` on the stored age format first, `edFromMemory`);
  - `clampVerdict` (≤250/day, ≤4 days, ≤ half of the maintenance-aware surplus; rebuild the line from the da.ts templates if clamped);
  - no-cut default;
  - `verdictPrompt` gets `dataTrustLines`, eligibility and frequency facts, and the targetOn target;
  - not allowed → template line, no call.
- **`src/lib/agent.ts`:**
  - validator `catch_up.on` exactly true/false (null dropped);
  - `doCatchUp` follows the same rules, with correct messages per reason (Off / not fat loss / minor / health note), `byHand`;
  - `gemini.ts`: the `on` description mentions catch_up.
- **Setting:**
  - `settingSpec.ts`: `choice('heavyDays','Heavy-day notices','Targets',['on','quiet','off'])`;
  - `Settings.tsx` `Targets()`: `Field` + `Seg` (glow pattern);
  - da.ts: label (by hand), "On", "Quiet", hint, the refusal messages, "−{n} catch-up · last day".
- **Tests:**
  - stacked cuts capped;
  - lowered below floor stays ≤ base;
  - Off → base;
  - clamp rebuilds the line;
  - minor / muscle goal / health note → none;
  - catch_up 1,500 → within limits; on:null dropped;
  - randomised invariants for `kcalTargetFor` (floor ≤ target ≤ base, cut ≤250, Off = base) (RT);
  - i18n 0.

#### Step 3: The watcher (items 2, 4, 9)
- **`CatchUp` fields:** `decided?` and `byHand?`. Back-compat: a record with `line` and no `decided` counts as decided (RT).
- **First run of the new code (RT):**
  - mark heavy days of the last 7 days as decided, silently: no toast, no call, no "target is back" toast;
  - store a `heavySeen` marker in AppData so it happens once.
- **`reconcileCatchUps` → `{list, fresh, gone}`** over non-off, non-byHand records of the last 7 days:
  - no longer heavy (targetOn) → removed; toast "normal target is back" only if a trim had been told;
  - changed by 100 or more → update `over`/`at`; shrink a trim above the cap (template line), no new toast or decision;
  - new → undecided.
- **`src/lib/eatingWatch.ts`:**
  - skip demo, Off, and days before `heavyOnSince`;
  - Quiet → decided at once, no call;
  - On → `decide` once: `deciding` set, stale guard on `at` (re-clamp, template line), `decided`, one toast with Undo;
  - start check 3 s after launch;
  - the verdict's Sol limit applies to the time until the answer starts (see Step 5).
- **Smaller fixes:**
  - `isEvening` respects `dayStartHour` (eating.ts, person.ts);
  - `markCoachTold` only for what `justNoticed` showed, and only when the turn wasn't logging-only (RT);
  - mode-gate the CATCH-UP line, the Quiet line and person.ts heavy-day lines (RT);
  - `agentUi.tsx` memo deps include `catchUps`;
  - Ledger singular "last day".
- **Tests** (mocked brain):
  - deleting the entry removes the cut;
  - a smaller day shrinks;
  - +300 kcal → no second decide or toast;
  - stale guard;
  - Quiet / Off;
  - first run silent, and switching to On silent about the past;
  - 01:00 with dayStartHour 4 counts as evening;
  - told only when shown in a non-logging reply;
  - random sequences of add, delete and target change → at most one decision per day, trim ≤ cap, everything deleted → nothing running (RT).
- **`scripts/journey-eating.mjs`:**
  - set `demo: false, targets: []` (RT);
  - no key → no-cut toast, no Food line;
  - stubbed over-limit verdict → clamped toast and line;
  - Undo;
  - delete the entry → line gone;
  - Settings Off.

#### Step 4: True maintenance (item 3) in `src/lib/maintenance.ts`
- **Merged weigh-ins:** `weighIns` moves to `src/lib/dataQuality.ts` (re-exported). `oddWeighIns` uses the merged list (watch + Aven).
- **Big days:** a numeric definition: ≥ their median + max(600, 25 %). Drop weigh-ins in the 2 days after a big day only while at least 6 weigh-ins remain (RT).
- **Slope:** Theil–Sen over pairs at least 7 days apart (RT). Clamp ±1.5 kg a week and the result to 1,200–6,000. Confidence low if the slope is above 1 kg a week or anything was clamped.
- **Invisible calories:** only when the gap is ≥500 and ≥20 %, and confidence isn't low. Worded "the watch may overestimate, or some food isn't logged". Said once, using the said-dates record in AppData (RT).
- **Tests:**
  - a 58.5 kg typo (Aven or watch) → within ±100;
  - a post-heavy spike is ignored;
  - extreme slope → clamped and low;
  - a 400 gap is not "invisible";
  - an Omar-like case (2 big evenings a week, daily watch weights) still gives a number (RT);
  - the existing tests still pass.

#### Step 5: Routing and time limits (item 7) in `src/lib/agentTurn.ts`
- **Pure `route(text, setting, photo) → {effort, which}`:**
  1. photo → main, at the setting;
  2. THINK_HARD, DECIDE or SAFETY → main, high;
  3. FACT ("how many calories in…", "hvor mange kalorier er der i…") → quick, low;
  4. DEEP → quick, at the setting;
  5. long message → quick, medium;
  6. otherwise → quick, low.
- `effortFor` stays as a wrapper.
- **Phrase lists:**
  - **DECIDE:** narrowed (targets, maintenance, should I cut/bulk, plans, not losing / taber jeg mig ikke, what now).
  - **SAFETY, always:** binge, purge, kaste/kaster/kastede/kastet op, brækkede mig, laxatives, fasting to compensate, skip meals, overspiste, trøstespiste, drop / lose / tabe / smide X kg på / in Y days, make weight, indvejning, vægtklasse, dehydration, chest pain, fainting, missed period.
  - **SAFETY, only in question or advice form** (not logging-shaped "number + unit, no question"): creatine / kreatin, supplements, sauna, pain / ondt / hurts / skade (RT).
  - **DEEP:** drop cut, bulk, diet, pain and injury.
- **Route tests:**
  - EN + DA positive table, including verb forms;
  - negative table: "5 g kreatin", "faste måltider", plank, cutlery, "ondt i benene efter træning" → quick;
  - the 4 verified risky lines → main high;
  - "cut the rice from dinner" → quick low;
  - "plan my next week" → main high;
  - photo → main.
- **Time limits (RT):**
  - the per-round Sol limit applies only until the first reply text arrives (Coach 45 s, orb 20 s); once text flows, the existing 25 s idle rule applies;
  - fall back to Gemini only if a Gemini key exists; OpenAI-only users keep the long waits;
  - `src/screens/Voice.tsx` overall kill 45 → 60 s.
  - Journey-sol: a slow stub (first text at 15 s, done at 35 s) must not be cut on the orb, plus an OpenAI-only timeout case.
- **Key without Luna:** `noQuick` in `src/state/ai.ts`, added to the `useAi.patch` list and to the delete-all reset (RT). Set on `nomodel`, cleared when the key changes. `quickFor()` in openai.ts.
- **Food estimates:** Luna on low (main on `nomodel`); photos stay on main.
- **`src/screens/WeekReview.tsx` (RT):** don't abort when the sheet closes; save when done; ~90 s; a failure isn't saved and retries on the next open at most once a day.

#### Step 6: Prompt, handbook, leftovers (item 8)
- **`src/lib/coachContext.ts` AGENT_SYSTEM:**
  - JUST NOTICED never on logging-only messages; otherwise answer first unless they asked about it;
  - catch-up talk: "don't cut" → off; "never / stop notices" → set_setting heavyDays off; a catch-up only when asked, within the limits; Quiet line;
  - help at 3+ a week for 2 weeks or signals;
  - recovery exception scoped to this conversation, today or teens;
  - handbook before web;
  - number first as an estimate (conservative when age is unknown), then at most one question, plus the age rule;
  - eating-disorder signals → gentle help, `remember` a health note, `catch_up off`, no restriction numbers;
  - **Talking steers it:**
    - future plans → `remember` with `until`;
    - goal change → offer `set_setting` goal;
    - dissatisfaction with a decision → act (off or change), then `remember` the preference (kind preference, about catch-ups); vague dissatisfaction → one short question: what should change;
    - `verdictPrompt` puts MEMORY preferences first and states that a preference can only shrink or remove a trim (code clamps a preference-implied larger trim anyway);
  - APP_GUIDE exception note and heavy-day notices under Targets.
- **Watch weights where the Coach talks (RT):** `weighIns(d)` in coachContext (last weigh-in, trends) and `agentUi` tip.
- **`src/lib/handbook.ts`:**
  - "or a labelled estimate";
  - cycle 0.5–1.5 kg;
  - overeating: the AI weighs trims; frequent → structure usually helps more;
  - surplus over TRUE MAINTENANCE;
  - protein per kg of goal weight when body fat is high;
  - teens: sleep 8–10 h, caffeine ≤ ~2.5 mg/kg, no energy drinks;
  - making weight at normal hydration, never a water cut;
  - newcomer multipliers with sedentary ×1.2;
  - `handbookTopic` matches whole words and returns up to 3 topics.
- **`src/lib/gemini.ts`:** "a training and food app"; the review phrase "writing the user's weekly review" is kept; "sport sessions count as hard training"; insights never bring up heavy days.
- **`src/lib/eating.ts` `eatingLines`:** generic invisible-calories line; FREQUENT facts; Off/Quiet lines; "LAST HEAVY-DAY DECISION (for 'why?')" for 3 days, including "none". WeekReview :94 built from data, heavy days only in On.
- **Tests:**
  - pinned phrases kept (coach8 'ask ONE short question', 'CLEARLY OFF TODAY'; brain headings; coach/coach3/coach7 lists);
  - leftovers gone;
  - "8–10 h";
  - `handbookTopic('e')` → the list; 'teens cutting' → both topics.

#### Step 7 (last; drop if short): small fixes
- **Nudges:** the weigh cards read `weighIns(d)`, the 3–7-day id is `weigh:soon:${last.date}`, use the `hour` parameter, and the "Losing weight fast" card uses the watch too.
- **CoachPin:** HOW_TO_TALK, one attempt a day, fix the stuck `asking` flag.

#### Step 8: The exam matches the app (item 10) in `scripts/exam/*`
- **Routing like the app:** export `route()`; `EXAM_MAIN` / `EXAM_QUICK` / `EXAM_SETTING`.
- **Fix the clock race:** set the time, then build the personas, per time group.
- **Hard stop:** `EXAM_MAX_USD`.
- **Dependency:** `undici` as a devDependency.
- **Personas:**
  - catch-ups through `applyVerdict`;
  - new: a teen whose age isn't known, someone with frequent heavy days, a Danish user.
- **`Question`:** `lang` and `history`; Danish-aware meal checks.
- **New questions:**
  - Danish;
  - multi-turn ("why?", "no catch-ups ever" → set_setting Off);
  - eating-disorder signals (→ no cut, gentle help, health note);
  - unknown-age teen (asks the age, nothing about saunas or dehydration);
  - **steering, multi-turn:**
    - "that cut was too much, max 150" → takes it off or changes it + `remember`; a verdict with that MEMORY stays ≤150;
    - "tournament 5 Dec at 74 kg" → `remember` with until;
    - "I'm bulking from January" → `remember` + offers the goal change;
    - "I'm not happy with that" (vague) → one short question.
- **Verdicts:** should-trim (adult, rare big day), teen → none, frequent (judged, within limits), a health note → none.
- **Extra runs (RT):**
  - the safety, teen and Danish questions on Luna-low ×3, the path a missed phrase takes;
  - a Gemini-only run and Gemini verdicts;
  - 15 Danish food estimates, Luna-low vs Sol.
- **Budget:** ≤ $2.5 for this run; results in the README.

#### Step 9: Full check, final gate, Beta
- `npm run verify` and i18n 0.
- Journeys: eating, sol, ai, coach, coach7, today, food, health.
- **Performance:** time building the Coach context with 2 years of watch data and a year of food; `kcalTargetFor` stays cheap in selectors (RT).
- **Two fresh reviewers** (code + behaviour) over the whole stack. Each finding reproduced before it's fixed. Fix, verify, rerun the changed exam questions (≥ $1 reserve).
- **Docs:** README "Review round 1 fixes" in plain words, with exam results, known limits and the spend-count note. Tick `docs/coach-brain-plan.md`.
- **PRs:** mark #173/#174/#177 ready, and write on each that they ship together, in order.
- **Beta (Omar's choice):**
  - Omar asks the coordinator for a Beta-only trial;
  - on a yes, I run the Beta deploy as described in CLAUDE.md (merge the default branch in, verify, `pages.yml` with `beta_branch`);
  - Omar opens Aven Beta and uses "Copy my real Aven data in". Never fake food in the real app (RT).
- **Phone checklist (in Beta):**
  1. Settings → Targets: goal Lose fat and heavy-day notices On.
  2. Tell the Coach your age once.
  3. Log a big evening → one decision toast → Undo works.
  4. Ask "why?".
  5. "log 2 eggs" → fast, nothing about food.
  6. "Hvorfor taber jeg mig ikke?" → a real answer with your numbers.
  7. First launch shows no toasts about past days.

### What can still go wrong (said up front)
- **Change day:** on the day the target changes, a real heavy day isn't judged (on purpose).
- **Maintenance numbers shift a little** with the steadier method.
- **Phrase lists miss some wordings,** especially dictated Danish. The tables and the Luna-low safety net cover the known cases.
- **The AI's trim judgment can vary between runs.** The hard limits cap the damage.
- **Corrections:** removing a catch-up changes today's target mid-day (a toast explains).
- **Age:** the minor check only sees an age the Coach has stored, until the friends PR adds age to setup.
- **No AI key means no cuts at all** (intended).
- **Java issues:** only data-loss Java issues are fixed now; the CI emulator is the only check for them.
- **Exam answers vary:** a single failure means read the answer, not proof.
