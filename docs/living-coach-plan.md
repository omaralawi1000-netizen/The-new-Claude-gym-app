# Aven Coach: a real, living coach (plan v8.1)

Plan written 25 Oct 2026 (judged 9/10 by an independent judge). Every step waits for Omar's own clear "go" for that
exact step; a "yes, but…" is not a go. Omar's doc for it: https://claude.ai/artifact/5Yph3LzGfTSMBu986opScs.

## Progress (keep this up to date after every step)

| Step | State | Where |
| --- | --- | --- |
| 1 · Honest voice | **SHIPPED v0.1.179 (26 Oct, PR #204, Omar's go 00:18).** Refined through round 9; six fresh judges 7 → 7.5 → 7.5 → 8 → 8.2 → 8.4, every must-fix done | README "Living coach, step 1"; before/after https://claude.ai/artifact/GjDMaqc9pEpChSCGqHzvPZ; replies per round in /mnt/project-files/living-coach/step1-r*-run*.json |
| 2 · Goals you tell it | **BUILT on branch `claude/project-thread-fomqy0` (26 Oct overnight, Omar's go 00:37), NOT shipped.** Thirteen fresh judges 6.5 → 7.5 → 8.0 → 7.0 → 7.8 → 7.3 → 7.8 → 7.8 → 8.2, then 4 more rounds on 26 Oct morning (Omar: "Can you do it even better?") 8.3 → 8.2 → 8.3 → 8.3 (live Coach ~6.3 on the same nine); every judge: ship-ready, what's left is polish and the test brain's variance | README "Living coach, step 2"; before/after https://claude.ai/artifact/H9vdoBAX4QC5vaLd6P1wYz; results /mnt/project-files/living-coach/step2/; harness /mnt/project-files/living-coach/tools/_goals.test.ts (never commit) |
| 3 · Phone test (APK) | not started | — |
| 4 · Morning looks | not started | — |
| 5 · Full coach | not started | — |
| 6 · Sunday review | not started | — |

**Next:** step 2 waits for Omar's yes on the before/after page. To ship: pull the default branch (the other session
works on Coach memory and Gemini Live), merge it into the branch, bump the version, `npm run verify`, PR, merge.
Left open by the last judge (polish, not blockers): a stall's change is sometimes asked instead of saved (GOALS now
writes the actions out); the first plan reply can carry two asks; a goal is sometimes saved on a "help me" before the
yes. Steps 3–6 each need a new go.

**Judges (Omar, 25 Oct):** a judge never builds fixes itself. It may suggest a better solution with the exact how-to; the
builder implements it, and a fresh judge checks it.

**How to see before/after Coach replies without the phone:** the exam's OpenRouter key isn't reachable from a cloud
session, but Gemini is (proxy-injected). Build the real system prompt with `agentSystem` on an exam persona (`scripts/exam`),
swap in the old `COACH_STYLE` from the default branch for "before", and call `gemini-flash-latest` with `AGENT_SCHEMA`
(the app's fallback brain; on Omar's phone the main brain is GPT-6.1 Sol, so wording differs). The ready-made harness is `/mnt/project-files/living-coach/tools/_ba.test.ts` (never commit it): copy it to
`scripts/exam/`, run `BA_OUT=out.json BA_AFTER_ONLY=1 npx vitest run --config scripts/exam/vitest.config.ts scripts/exam/_ba.test.ts`
(it also writes Today's notes); for "before", run it in a git worktree of the default branch; delete the copy afterwards.

Omar's answers (25 Oct, 20:12): the tone and how often are the Coach's call, like a real coach. No fixed number of messages. "Like a ChatGPT app that knows all my data." He picked **thinking in the background** (shown as about 30 kr a month on OpenAI; the honest range after review is below). 20:14: no rules per topic. "I just tell it, I need to gain some weight, or I need to take on 2 kilos, help me", and it remembers and helps, like a real coach.

## The short version

- **You tell it what you need, and it takes it on.** "I need to gain 2 kg for wrestling by December." It makes the plan with you (calories, protein, by when), remembers it, and follows up by itself until it's done. No rules or features per topic: wrestling, a weight goal, a lift, sleep, anything.
- **It's ChatGPT that knows all your data, and it talks first.** A few times a day, even with Aven closed, it looks at your day and decides by itself whether something is worth saying. Most looks end in silence. When it speaks, it's because it matters.
- **It's a conversation.** You can answer right in the notification and it answers back there. Everything lands in the Coach chat.
- **It picks its own tone.** It's warm for a win, plain for a first miss, harder when the same miss repeats, and calm after a rough night. Tell it "be harder" and it remembers.
- **It decides how often.** No fixed number. It sees what it already sent today and what you did about it, and stays quiet when nothing would help.
- **It tells you the truth.** Real wins with the number. Misses said plainly. Stalled lifts, skipped sets, protein, sleep, and whether you're on pace for what you told it.
- **It keeps you to your word.** Say "bed by 23:30" and it checks the watch the next morning.
- **Cost:** about 25 kr a month on your OpenAI key in a normal month, up to about 45 kr in a busy one. That includes the Today notes you already pay about 9 kr for. The background coach gets its own monthly limit, 50 kr unless you change it in Settings → Coach. A very busy month could reach it near the end; Aven tells you at 40 kr.
- **Order:** honest voice → goals you tell it → a test that the phone link works → the first background look (mornings) → the full coach → Sunday review. You try each one on your phone before the next starts.

## You tell it, it takes it on

An example (the numbers would be yours):

- **You:** "I need to gain 2 kg for wrestling, help me."
- **Coach:** "From 92.4 to 94.4 kg. At a safe 0.3 kg a week that's about 7 weeks, so mid-December. Your true maintenance is about 3,000 kcal, so I'd set your target to 3,250 and protein stays at 190 g. Shall I set it?" · *Apply* · *Undo* afterwards
- **Then it follows up by itself:** "Two weeks in: +0.5 kg, a bit slow. +150 kcal from tomorrow?" Or: "On pace: 93.1 kg, 3 weeks to go."
- **When it's reached,** it says so, and asks what's next (hold the weight, or a new goal).
- It works the same for anything you tell it: "bench 100 kg by summer", "sleep more", "wrestling season starts in January, get me ready". It remembers the goal and its plan in Coach memory, where you can see and change them.
- The one fixed rule stays: it never helps with starving, skipping meals or water cuts.

## A day with it (examples, all numbers from your data)

These are examples of what it *might* say. It decides each time whether to say anything at all.

- **Morning:** "Push today. Bench 82.5 × 8 is the target, 2.5 kg more than last week. You're up 0.3 kg this week, right on pace for 94.4 kg by mid-December."
- **After a short night:** "5 h 10 last night. Train anyway, you always do. Get protein in early, it's the day you'll snack most."
- **Evening, training not done:** "Pull day's still open, and it's the second one this week. Go tonight, or move it so the week holds." · *Going now* · *Move to tomorrow*
- **After a workout:** "Bench 85 × 6, a new best. That's 2.5 kg on September." (A workout logged in Aven is seen at once; one only on the watch can take a while to reach the phone.)
- **Protein behind:** "130 g of 198. Skyr plus a chicken dinner closes it."
- **Over your calories:** "340 over today. Fine once." At most once a day, and that's all. A big day (600+ over) is handled by the heavy-day check you already have.
- **A promise:** "You said bed by 23:30. The watch says 00:50. Same goal tonight?" Or: "23:20. Kept. Three nights now."
- **A stalled lift:** "Rows stuck at 70 × 8 for 4 sessions." It decides case by case whether to suggest something, and never orders you to go lighter.
- **Gone quiet:** "Haven't seen you since Tuesday. Busy, or is something up?"
- **You answer in the notification:** "what should I eat before wrestling?" It answers right there. If you ask it to change something ("move pull to Thursday"), the answer has an *Open to apply* button, and it's done with Undo the moment Aven opens.

## How it decides when to speak

- **It chooses its next look.** After each look it picks when to look again, like "after your usual training time" or "tomorrow morning". There's also a look when the watch sees a workout end, and one when you wake up.
- **A message has to earn its place.** It sees what it sent today and whether you acted. If it said something an hour ago and you're on it, it stays quiet.
- **It learns from you.** If you say "too much" or "stop the food ones", it remembers and changes. If its messages on something keep changing nothing, it asks you once whether to stop.
- **Only two hard rules**, so a bug can never spam you: no messages while you're asleep (learned from the watch), and never two within the same hour unless you're answering it.
- **While Aven is open,** it doesn't pop up; its message waits behind a small "Your Coach may have news" line.
- **You can always see it's alive.** The Coach screen shows its last look, like "14:05 · stayed quiet, you're on track". If it hasn't managed a look for a day, Aven tells you why (key, limit or battery) and how to fix it.

## The steps (each one needs your "go")

**Step 1 · Honest voice (in Aven, about 1 session).**
- The Coach's tone is its own call: warm for wins, plain for misses, harder on repeats. It names stalled lifts and skipped sets, not just missed days. The rules that never bend: nothing about your body or looks, no food shaming, never "train lighter", nothing your data can't show.
- The "over your calories" line.
- You check: a few real questions in the Coach chat. Then the real app.

**Step 2 · Goals you tell it (in Aven, about 2 sessions).**
- Tell it any goal in the chat. It agrees a concrete plan with you (numbers and a date), sets your targets when you say yes (with Undo), and saves the goal and plan in Coach memory.
- It keeps track: on pace, ahead or behind, from your data (weight needs 6 weigh-ins over 2 weeks before it judges). Every few weeks, or when you're off pace, it suggests one change. For goals the data can't measure ("get me ready for the season"), it checks in with questions instead of claiming a pace.
- Your active goal and how it's going show on the Coach screen, not only in memory.
- The first time, the Coach asks you once: "What are we working on?"
- Promises work the same way, just smaller: "bed by 23:30 this week" is saved and checked from the watch. Missed 3 times, it offers a smaller version, never a bigger push.
- Until the background coach exists (steps 3–5), it brings this up when you open the Coach and in Today's notes.
- You check: tell it a real goal, see the plan it makes, and check Coach memory. Then the real app.

**Step 3 · The phone test (Android app update, about 1 session).**
- Background thinking means Aven hands your data summary to the Android app, and the app has to wake up on time with the screen off. This step only proves both on your phone, for 2–3 days, with nothing visible changing.
- **What you'll do once:** install the new Android app by hand, like before, and set its battery to Unrestricted (Aven shows you where).
- If it doesn't work reliably, I come back to you with the fallback: the Coach plans its messages only when you open Aven and the Android app sends them at the right time (about 8 kr a month, but it can't react to something new while Aven is closed).

**Step 4 · The first background look: mornings (about 2 sessions).**
- One look each morning, after the watch says you woke. It decides whether to message you and what to say.
- **What you'll do once:** turn on Settings → Coach → "Coach messages". That tap also hands your AI key to the Android app. The switch turns everything off again.
- You check: a few mornings on your phone. Aven Beta can't test this, because the Android app always opens the real Aven.

**Step 5 · The full coach (about 2–3 sessions).**
- It chooses its own looks through the day, looks after watch workouts, answers you right in the notification, and adds buttons when there's a clear choice.
- You check: a week of normal life. Then we look at what it sent together and tune it.

**Step 6 · Sunday review (in Aven, about 1 session).**
- On Sunday evening it reviews your week against your goals and picks one focus for the next. The weekly review you already have becomes its Sunday message.

## Cost, privacy, battery

- **Cost:** each look is a quick, very cheap check first ("anything worth saying?", about 0.01 kr on OpenAI's small model). Only when the answer is yes does the big model write the message (about 0.2 kr). The morning look replaces the Today notes call you already pay for, so you don't pay twice. Answers to your replies cost about 0.2 kr each. That's about 25 kr a month in a normal month and up to about 45 kr in a busy one. On Gemini it's roughly a third of that (and it doubles from 1 Jan 2027). The background coach has its own monthly limit (50 kr unless you change it in Settings → Coach): when it's reached, the looks stop until the month turns and Aven says so.
- **Privacy:** your data summary and your key stay on the phone, inside the Android app's private storage (it's excluded from backups). The AI service gets the same summary the chat Coach already sends, now with today's watch numbers. The Android app's privacy text gets updated to say so. On Gemini's *free* tier, Google may use what's sent to improve its products; your OpenAI key and a paid Gemini key don't allow that.
- **Lock screen and watch:** messages show in full, like any chat app.
- **Battery:** a few alarms and short network calls a day, plus the half-hour watch read the app already does. Too small to notice. It does need Battery → Unrestricted, or Samsung puts the app to sleep after about 3 days. While it's writing a message (up to about 45 s), Android shows a small silent "Coach" notice; that's Android's rule for background work.
- **Switching it off** deletes your key and data summary from the Android app.

## What it won't do (on purpose)

- No overeating program. Going over is said once, like any coach would.
- No built-in wrestling, meal or weigh-in programs. If you need help with any of them, you tell it, and it helps like a coach would. Wrestling always counts as training.
- No new safety system. The existing rule stays: never starving, skipping meals or water cuts.
- Never tells you to train lighter, never talks about your body or looks.
- No accounts, no server, no new paid service.

## Overlap with your other Claude Code session

It owns the Coach's knowledge and memory and the watch features. Three spots touch its work. Step 1 changes the Coach's style text. Step 2 adds goals and promises to the Coach's memory (its area, so this one needs the most care). Steps 3–5 add new Android files next to the watch reading and share the app's opening address. All of it is added on. Before each step I pull the latest app and read its newest changes; if it touched the same file that day, I wait or ask you.

---

# Research and build notes (Omar can skip)

## Research that shaped it
- Coaches reach out first from data; the failure is "communication without consequence" ([Trainwell](https://www.trainwell.net/blog/online-fitness-coaches-who-actually-check-in-on-you); [WHOOP Proactive Check-Ins](https://strengthinsight.app/blog/using-whoop-ai-coach/)).
- Fitbit's coach pinged after every short walk and got ignored, "would know when to shut up"; it acknowledged replies, then repeated itself ([Android Authority](https://androidauthority.com/fitbit-new-health-coach-worse-than-my-mom-3668153)); near-daily rest-day advice ([TechRadar, 29 Jun 2026](https://techradar.com/ai-platforms-assistants/fitbits-gemini-ai-coach-is-giving-users-unhinged-fitness-advice-heres-why-users-are-saying-they-cannot-wait-for-my-trial-to-end)). → Earn-its-place rule, outcomes in the prompt, never "train lighter".
- Just-in-time prompts: 17 % too early, 26 % too late; explain why ([Hardeman 2019](https://link.springer.com/article/10.1186/s12966-019-0792-7)). → The AI picks its own next look from his rhythm.
- If-then plans d = 0.65 ([NCI](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions)); one habit at a time ([Precision Nutrition](https://www.precisionnutrition.com/one-habit)); trend over single weigh-ins ([MacroFactor](https://macrofactor.com/macrofactor/)); autonomy-supportive language ([Les Mills](https://www.lesmills.com/articles/developing-and-testing-a-motivating-communication-style)); background thinking + morning delivery ([ChatGPT Pulse](https://www.tomsguide.com/ai/chatgpt-pulse-is-here-now-ai-starts-the-chat-and-curates-your-feed)).
- Prices: Gemini 3.8 Flash $0.75/$3.75 per M, doubling 1 Jan 2027 ([McKelvey](https://justinmckelvey.com/blog/gemini-api-pricing)); free tier may be used for training ([AIFreeAPI](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-rate-limits)); GPT-6.1 Sol $2/$10 ([AnotherWrapper](https://anotherwrapper.com/llm-pricing/gpt-6.1-sol)), cached $0.10 (`spend.ts`).
- Android: [App Standby Buckets](https://developer.android.com/topic/performance/appstandby); TWA two-way messaging: [PostMessage for TWA](https://developer.chrome.com/docs/android/post-message-twa) (Chrome 115+, androidx.browser ≥ 1.6, `PostMessageService`, the app opens the channel). Rejected: push server; Chrome periodic background sync ([docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)).

## Verified on main `61a174c` (v0.1.178)
`handbook.ts` `COACH_STYLE` (soft by design), `TASK_STYLE`; `coachContext.ts` `buildCoachContext`, `memoryBlock`, `CONTEXT_MAX` 20,000 (`buildAgentContext` can return up to 24k chars); `thread.ts` `THREAD_MAX` 60 (older messages go to the IndexedDB archive); `person.ts`; `dataQuality.ts`; `ui/CoachPin.tsx` `useInsights` (one main-brain call/day, mounted only by Today, gated by `coachPins`); `nudges.ts`; `eating.ts` `heavyLine` = max(600, 25 %); `verdict.ts`; `recovery.ts`; `stats.ts` `weightTrend`/`trendRate`; `types.ts` `body.goalWeightKg`, `MemoryKind` (no `promise`); `spend.ts` (Sol only); `brain.ts`; `openai.ts` (`solJson`, Responses API); `keys.ts` (localStorage `aven.keys`). Android: `androidbrowserhelper` 2.6.2; `HealthJob` (JobScheduler, 30 min); `AvenLauncher.getLaunchingUrl` (replaces the fragment with `dn=`/`hc=`); `RestDelegationService` → `RestNotifications.fromChrome` (unknown tags fall through to Chrome and show); `USE_EXACT_ALARM`; `RECEIVE_BOOT_COMPLETED` declared but no boot receiver; `allowBackup="false"`. APK sideloaded from the `android-latest` release, one package `app.aven.android`.

## Architecture (option C, background looks)

**Web → app ("brief"), over the proven channel.** The main route is the hidden notification the rest timer already uses: a notification from the rest worker at `/The-new-Claude-gym-app-rest/` whose tag carries data, with a new mark `aven-coach|`, chunked (≤ 4 KB per tag, brief id + sequence numbers, reassembled natively, a CRC per brief). `RestDelegationService` branches on `aven-coach|` **before** the rest code in both `onNotifyNotificationWithChannel` and `onCancelNotification` (so coach chunks never reach `chromeCancelled`) and never passes them to `super`. `showAppRest`/`clearAppRest` close other notifications: coach chunks get their own tag prefix that those calls skip, and the web closes each chunk only after native's ack arrives (next `cl=`) or after 60 s. Version handshake: native adds `av=<n>` to the launch fragment, the web saves it in localStorage (the address loses it after a reload) and sends nothing to an older app. Briefs carry `beta: IS_BETA`, and the app refuses Beta briefs. TWA postMessage is **not** used: in androidbrowserhelper 2.6.2 the `TwaLauncher` session is private and `AvenLauncher` finishes right after Chrome starts, which would kill the channel; it would also mean rewriting the launch Omar approved. Maybe later, as its own experiment.

**What's in a brief** (built by `src/lib/coachBrief.ts`, pure and tested): the same text the chat sends (`buildCoachContext` + `personLines` + `dataTrustLines` + `memoryBlock` + the GOALS block, by priority, capped at 20k chars), the look prompt (built in the web: one source of truth), the last 24 h of the Coach thread (what it sent + outcomes), Today's current nudge ids, the brain choice (Sol model; Luna as the gate model; or Gemini models), the remaining monthly budget, language. Sent on open, after any log/finish/settings/memory change (debounced 30 s), and **at once on `visibilitychange: hidden`** (he often logs and closes straight away); only when changed. Each brief has an id; if the next `cl=` doesn't confirm it, it is sent again. The brief also carries the **worked-out numbers** the messages may use: over/under the kcal target, protein left, today's lift targets and their change from last time, days and kg to each goal, promise streaks. **Keys never travel in tags:** turning on the switch (a tap) opens `aven://coach/setup` (a see-through activity like `HealthActivity`) with the keys in the intent's fragment; native stores them and nothing persists in Chrome. Keys changed later → a one-tap "Update the Coach's key" row in Settings → Coach. The keys go in the fragment, and a `adb logcat` check proves the address isn't printed. Switching off sends a tapped `aven://coach/off` that deletes keys, brief and alarms.

**App → web, the way back.** Native keeps a log (looks with `why`, messages, replies, button taps, tokens, cost, errors). It arrives (a) in the launch fragment `cl=` (merged with `dn=`/`hc=`/`av=`/`bo=` in `getLaunchingUrl`, never replacing them), on every launch from the icon or a notification; (b) on return from Recents: the web, on `visibilitychange`, shows a small "Your Coach may have news" line when a look was due since the last sync (it can't know whether one spoke); its tap opens `aven://coach/sync` (Chrome needs a tap for an app link), which relaunches with `cl=`. The web listens for `hashchange` too. Until then the thread lags; the line makes that visible.

**Native `CoachBrain` (new).** An exact alarm (`setExactAndAllowWhileIdle`; `USE_EXACT_ALARM` is already granted) starts a short foreground service (type `shortService`, allowed from an exact alarm; a 3-minute limit), so a slow AI call isn't killed by an alarm's ~10 s window or delayed by Doze. One look:
1. Read Health Connect once (last night's sleep if the record is there, steps today, exercise sessions today: type, duration, HR). Samsung often syncs late, so a missing record means "unknown", never "didn't happen".
2. **Gate** on the small model (GPT-6 Luna, $0.10/$0.50 per M, low effort, `max_output_tokens` 800 since the cap includes reasoning; measured in the exam): `{speak: bool, why, next_look}`.
3. Only if `speak` (and always for the morning look): **write** on Sol (low effort, `max_output_tokens` 2,000, 45 s timeout): `{text?, today_notes: Insight[], buttons?: ≤2 from a fixed set, covers: [nudge ids], next_look}`. The morning look always writes Today's notes in the existing `Insight` format (CoachPin reads them from the log), with or without a notification. With the switch off, the old `useInsights` call stays as it is. With it on, when Today opens and no notes for today have arrived from the log, Today shows the "Your Coach may have news" line at once; if there are still none by usual wake + 2 h (the morning look failed or hasn't synced), the old `useInsights` call runs as a fallback that day.
4. A response with status `incomplete` or no text is an error (logged, retried once at the next look), never silence.
5. **Number check:** every number in the text must appear in the brief's facts or worked-out numbers or the HC facts (± rounding); whole numbers up to 10 and clock times from memory are always allowed. Otherwise retry once, then drop (logged).
6. Post on channel `coach` (`MessagingStyle`, full text as Omar wants; Danish channel names in `res/values-da`). If the web said Aven is in front (a tiny `fg`/`bg` mark on `visibilitychange`, `fg` expiring after 10 min), post it silently (no pop-up, no sound) and the "Your Coach may have news" line picks it up (shown again once `next_look` has passed). **Only the Android app runs looks**, so the gate, write, number check and guards exist once, in Java.
The short foreground service shows a silent, minimum-importance "Coach" notification (Android requires one; it may stay hidden for ~10 s, a 45 s write will show it).
With Gemini only: the same two calls on 3.5 Flash-Lite (gate, $0.30/$2.50 per M per [McKelvey, 7 Oct 2026](https://justinmckelvey.com/blog/gemini-api-pricing)) and 3.8 Flash (write).

**Scheduling.** `next_look` clamped to 45 min–24 h ahead; a look at the usual wake time + 30 min (weekday/weekend medians from the brief, all-nights median under 3 weekend nights; default 08:00); a look when a new exercise session appears in the 30-min `HealthJob` read. `CoachBootReceiver` (`BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`) re-arms. **Bug guards, not coaching limits:** no message in sleep hours (usual bed → wake), never two within 60 min unless answering, at most 12 looks a day, stop when the month's budget is used. Brief older than 36 h: the prompt is told so and may only use watch facts and ask how he is; 3 days unopened → at most one "gone quiet" message, then looks pause until he opens Aven.

**Replies.** Inline reply (`RemoteInput`): native shows "…" at once (stops the spinner), then a short foreground service runs an **answer** call on Sol (brief + this conversation) and updates the same notification. If he asks for a change, the answer says what it will do and adds an *Open to apply* button (opens Aven with the request; the web runs it through the normal agent path with Undo). Buttons (*Going now*, *Move to tomorrow*, *On it*, *Got it*, *Not today*) act natively at once (withdraw that topic for the day, log the answer); *Move to tomorrow* is applied by the web via `rescheduleMissed` with Undo.

**Thread.** Background messages and notification replies are written into `thread.ts` as Coach messages with time and outcome, grouped into one "while you were away" row per day, so the 60-message window still holds the real chat (older messages go to the archive as today). A conversation inside a notification is kept in order inside its row (tested). Matching nudges are marked as said through the look's `covers` ids, so Today's pins never repeat it.

**Alive or broken.** The Coach screen shows the last look ("14:05 · stayed quiet, you're on track", from `why`). No successful look for 24 h while the switch is on → a Today notice with the reason from the log (key rejected, budget reached, battery restricted via `bo=` from `PowerManager.isIgnoringBatteryOptimizations`, no network) and the fix.

**Cost** (Sol $2/$10 per M, Luna $0.10/$0.50; looks hours apart, so caching barely helps and isn't counted): gate ≈ 9k in + ~200–800 out (to be measured in the exam) ≈ $0.001–0.0013 (≈ 0.01 kr); write ≈ 9k in + 1.5k out ≈ $0.033 (0.21 kr); answer ≈ 0.2 kr. A normal day: ~6 gates (0.04 kr) + 2 messages (0.42 kr, the morning one replacing today's Today-notes call) + 2 answers (0.4 kr) ≈ 0.86 kr ≈ 26 kr/month. Busy: 12 gates + 4 messages + 3 answers ≈ 1.5 kr ≈ 45 kr/month. Worst case under the guards, every look speaking + many replies, is roughly 90 kr. Today `solLimitKr` defaults to 200 kr, is shared with the chat, and at the limit Gemini takes over instead of stopping. So background looks get **their own budget** (`coachBgLimitKr`, default 50 kr, Settings → Coach): a Today notice at 80 % ("40 kr of 50"); reached → looks stop until the month turns, a Today notice says so, and the chat is untouched. Notification replies count toward it; once it's reached, a reply gets a free fixed answer ("Monthly Coach limit reached, open Aven to chat"), and the in-app chat keeps its own limit. `spend.ts` gains a Gemini price table (3.8 Flash $0.75/$3.75, 3.5 Flash-Lite $0.30/$2.50), counted only when he marks his Gemini key as paid (a free key costs nothing). Native adds its token counts to the log.

**Privacy.** The Android `health_privacy` text ("never leave your phone") is rewritten: with Coach messages on, a summary including watch numbers goes to the AI service whose key you entered. The keys sit only in the app's private storage (`allowBackup="false"`), never in logs or the brief.

## Step files
- **Step 1 (honest voice):** `handbook.ts`: `COACH_STYLE` becomes a judgement style (tone fits the moment; repeats get firmer; one shared NEVER list: body/looks, food shame, "train lighter", claims beyond data); stalls named, the reset offered only when it helps; skipped planned sets (7 days) as a fact in `coachContext.ts`; `eatingWatch.ts` over-target line at ≥ 200 kcal and below `heavyLine`, once a day. Exam (`scripts/exam/questions.ts`): misses named with numbers, firmer on repeats, no body talk, no "train lighter". `da.ts` for every string.
- **Step 2 (goals):** `remember` (kind `goal`) + `set_setting` exist, but a goal is free text. Additive optional fields on `MemoryNote` (old notes untouched): `target?: {metric: 'weight'|'lift'|'kcal'|'protein'|'sleep'|'steps'|'sessions'|'other', from?, value, unit, exercise?}`, `by?`, `plan?`, `status?: 'active'|'done'|'dropped'`; kind `promise` (`{if, then, check, due}`). The prompt teaches the loop: understand (one question if vague) → a concrete plan with numbers from TRUE MAINTENANCE/trend → Apply/Undo via `set_setting` → save → track. `coachContext.ts` GOALS block computed on the phone per active goal: progress, rate, ETA, on/ahead/behind with how sure (weight only with ≥ 6 weigh-ins over ≥ 14 days; lifts from e1RM history), plus **rate bounds from the handbook** (loss 0.5–1 %/week, gain surplus 200–400 kcal) that any suggested change must sit inside; `metric: 'other'` → no pace, check-in questions only. `body.goalWeightKg` counts as a weight goal when no note covers it. Goal progress on the Coach screen; Settings → Coach memory shows it too; the Coach asks "What are we working on?" once after this ships. Exam: "gain 2 kg for wrestling", "bench 100 by summer", "sleep more", vague goal, unsafe ask (water cut → refuses, offers the safe version), goal reached, behind pace, an 'other' goal (no pace claim).
- **Step 3 (phone test):** `coachBrief.ts` (with the worked-out numbers), chunked `aven-coach|` channel with acks and resend, `av=` handshake (localStorage), merged fragments, `bo=`; Android: `CoachBrain` storing only, plus a **background probe**: an exact alarm every 2 h for 3 days, each starting the short foreground service and making one tiny free HTTPS request (e.g. the site's own `version.json`), logging time, delay, success, standby bucket, battery mode; shown on a probe screen in Settings → About. Pass: briefs of 20 KB arrive 50/50 with 0 visible notifications (also counting the short foreground service's notice during the probe's HTTPS call), and ≥ 95 % of probe alarms fire within 10 min with the screen off. (Omar opens Aven daily, so Samsung's 3-days-unused sleep isn't proven by this; Unrestricted covers it.)
- **Step 4 (morning looks):** gate + write (Today notes always) + number check + own budget + morning schedule + `coach` channel + the switch (off by default; the tap hands over the keys) + log back to the thread + cost into `spend.ts` + "last look" status + the 24 h broken notice + `health_privacy` text.
- **Step 5 (full coach):** `next_look`, workout looks, inline replies with *Open to apply*, buttons, outcomes and `covers` in the brief, silent posting while in front (`fg`/`bg`, 10-min expiry), preference learning ("too much", "stop X" → `preference` notes); Settings → Reminders copy (both places in `Settings.tsx`, ~lines 823 and 1017, and their `da.ts` entries) no longer says "needs a push server".
- **Step 6 (Sunday review):** the weekly review's priorities become one focus chosen against the active goals; the Sunday-evening look delivers it.

## Tests
Unit: `coachBrief` (priority order, size cap, no keys in the brief), chunking + CRC, merged fragments, GOALS block (pace, ETA, rate bounds, 'other' = no pace), outcomes, Gemini pricing in `spend.ts`. Java unit: clamps, sleep-hours guard, 60-min guard, 12-look guard, own-budget stop, brief age, number check (worked-out numbers pass, invented ones fail), `incomplete` handling, `fg` expiry, Beta refusal, switch-off wipe. Exam: the gate + write prompts on the 5 exam personas × ~15 moments (speak or stay quiet? what?), judged, including "stay quiet" and "Luna gate missed it" cases (if the gate misses more than 1 in 10 real moments, the gate moves to Sol and the cost range is restated to Omar). Journey: open with a native log → thread rows + cost + pins deduped. Phone: Step 3 probe (3 days); Step 4 a few mornings; Step 5 a week, then review the log together.

## Ship rules
CLAUDE.md flow per step: `npm run verify`, PR into `ccr-d1172cc7-1e03wh`, version bump checked against main, Danish strings, style-reviewer for UI. Steps 1, 2 and 6 are text and logic: a chat transcript and screenshots, then the real app. Steps 3–5 need his phone: the web half ships inert (the handshake keeps it off on the current APK), then the new APK, then the switch. Aven Beta can't test the Android part (the app always opens the real address).
