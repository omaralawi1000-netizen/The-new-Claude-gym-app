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
