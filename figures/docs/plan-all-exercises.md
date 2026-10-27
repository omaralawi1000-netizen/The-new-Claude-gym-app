# Plan: every exercise figure, top quality at the best speed (25 Oct; approved by the coordinator with the parallel-render push)

## Recommendation (one path)
**Families, not single exercises.** For each equipment family:
1. Prove one hero exercise to 9+.
2. Lock it as a template: camera, prop, light, glow and checks.
3. Ship its twins in batches of 4-5, with one judge per batch.

Before building anything:
- **Real reference cards first:** every pattern gets 3 real frames (start, middle, end) and a short "how it really works" list before any modelling.
- **One automatic gate:** every check runs in one script, and nothing reaches a judge with a red check.

## Why (what cost us rounds so far)
| Figure | Rounds | Root causes |
|---|---|---|
| Barbell curl | 18 | Hands slid on the bar; bloom edges; pink specks |
| EZ curl | n/a | Fewer, because it reused the curl |
| Rope hammer curl | 8 | One whole restart from "that's not how a rope works" (pulley 70 cm in front); pinholes; cap on outlines |
| Rope pushdown | 8 and counting | A camera from behind hid the far fist, which led to far-arm hacks, then pinholes, then notches, then a flat V |

- **What went wrong:** in every case the cost came from rework, not render time. The causes were:
  - realism found late, by Omar;
  - defects found by the judge that a script could have caught;
  - camera choices that forced hacks.
- **What went fast:** twins on a locked template. The EZ curl reused the curl motion and only needed a new prop.

## The pipeline (each pattern)
1. **Reference card (about 30 min).** Pull 3 real side-view frames, or ask Omar for a video like he sent for the hammer. Write 5-8 realism lines: where the machine is, where the body stands, the grip, where the prop hangs or points, the path, and the tempo. The judge gets this card too.
2. **Camera test first (about 1 h).** Render stills at 3-4 angles before posing details. Pick the angle where both working limbs and the prop stay visible with no hacks (pushdown lesson: -140 removed 4 rounds of far-arm tricks).
3. **Pose and props (variable).** Re-use the template's motion where the pattern is a twin. New equipment models get built once, then shared.
4. **Gate script (automatic, about 2.5 h compute for 130 frames on 4 cores).** It runs every check, every frame:
   - contact / SLIDEDIAG (no slide);
   - ROPEMONO / ROPESTRAIGHT (ropes only);
   - FARDIAG (nothing floating);
   - CABLEDIAG;
   - CAMDIAG (framing);
   - TILTDIAG (smoothness, in deg/f²);
   - speck2h plus bgspeck with ray masks;
   - holefill3 / holefill2 auto pass;
   - clipcheck;
   - colour (redm);
   - loop seam;
   - motion smoothness (blurred step change).

   Output: one red/green sheet, plus zoomed crops of the hands and the prop at the keys.
5. **Stills judge, then clip judge.**
   - The stills judge is cheap and catches pose and realism before a full render.
   - The clip judge sees the clip only after the gate is green.
   - The judge is briefed with the reference card, Omar's taste and past failures.
   - The judge runs per batch: one judge looks at all 4-5 clips of a batch together.
6. **Fix every flaw the judge lists, then self-check.** The relay to Omar says which parts were judged and which were only self-checked.
7. **Omar checks once per batch** on one phone page. The page has every clip with Real / Half / Quarter speed and a real-vs-clip picture for each. He answers yes, or names what to change. He never checks pixels.

## Order
1. **Finish the rope pushdown (now).** It proves the high-cable template: station, swivel arm and camera -140.
2. **Batch A, cable twins (no new rig):**
   - Triceps Pushdown (bar)
   - Single-arm Cable Pushdown
   - Cable Curl (low cable + bar, curl motion)
   - Straight-arm Pulldown (a small new motion)

   About 2-3 days.
3. **Batch B, dumbbell and bar twins of the standing curl:**
   - Dumbbell Curl
   - Hammer Curl (dumbbell)
   - Reverse Curl

   It needs a dumbbell model. About 2 days.
4. **Shoulder + hip rig.**
   - Needed for: presses, raises, squats, hinges, rows and pulls (most of the 185).
   - It gets its own stress test: an 8-pose torture sheet, judged before any exercise uses it.
   - About 3-5 days. This is the biggest single investment and the gate for everything after.
5. **Big families in Omar's training order.**
   - First, I read his saved workouts and recent history from the backup (or ask him) and start with what he actually does.
   - Default order: bench/incline press (bench + rack), squat (rack), deadlift/RDL, rows, pulldown/pull-up, overhead press, raises, leg machines.
   - For each family, the first hero takes about 3-5 days. Each later batch of 4-5 twins takes about 2-3 days.
6. **Holds and bodyweight (about 25 near-static patterns).** Quick. They can be slotted in between heavy families when Omar's usage is low.
7. **Machines and cardio last.** The machine models are the slowest part.

## Parallel rendering (coordinator review, 25 Oct)
- **GitHub Actions matrix:** each job renders a slice of frames, or one whole clip, on its own 4-core runner. The repo is public, so this is free; up to 20 jobs run at once.
- **Inputs:** `scene12.blend` is 218 MB, over GitHub's 100 MB file limit. It goes up once as a release asset, and each job downloads and caches it. The code comes from the repo; `bpy` 5.2.2 comes from pip.
- **Outputs:** frames come back as artifacts, and the gate runs on the joined frames.
- **Effect:** a batch of 5 clips goes from about 12 h serial on this machine to about 1 h wall time. The whole library goes from about 18 h to about 1 h of render, if every clip were ready at once.
- **Where the saved time goes:** extra judge-free gate passes, such as a re-render after each fix and a full gate again. Never lower samples or skip checks.
- **Locally meanwhile:** 2-3 processes share the 4 cores, split by frames. That is about 1.5x, not 4x, because each process already uses the cores.

## Realistic time
- **The real bottleneck is fix rounds, not rendering.** Each round costs a full judge cycle plus Claude usage. Parallel renders turn a round's wait from about 3 h into about 1 h, but the number of rounds is what decides the calendar. The reference card, the camera test and the gate exist to cut rounds from 6-8 per hero to about 2-3, and to about 1-2 per twin batch.
- **Revised estimate, with parallel renders and 2-3 rounds per hero:**
  - Hero patterns: about 2 days each.
  - Twin batches: about 1 day each.
  - Library total: about 6-8 weeks of steady sessions, down from 10-14.
  - Usage limits are the remaining risk; one limit hit costs about 5 days.
- **Fastest wins first:** Batches A and B add about 7 exercises in about a week.
- **Rollout:** figures ship to the app per batch, after Omar's yes. Exercises without a figure keep the muscle-map fallback, so nothing waits on the whole library.

## What gets automated now (before Batch A)
- One `gate.sh <motion>` that runs every check above and writes `gate-report.md` plus a crop sheet. It fails loudly on any red.
- An auto pinhole pass (ray masks, then holefill3, then holefill2), with a raw-vs-final x3 strip in the report.
- A batch page builder: clips plus real-vs-clip pictures for a batch, ready to publish.
- A reference-card template, which also goes in the judge brief.

## What Omar checks
One yes/no per batch on his phone (about 5 minutes):
- Does it look like a real person doing the exercise?
- Is anything off with the hands or the equipment?

Pixel checks are the gate's job and the judge's job.

## Risks
- **Rig:** the shoulder+hip rig could take longer than planned. Mitigation: stress-test it before any exercise uses it, and keep the arm-only patterns flowing meanwhile.
- **Usage:** usage limits hold everything. Mitigation: hold cheap twin batches back for low-usage days.
- **Late "not how it works" findings:** mitigated by the reference card, and by asking Omar for a real video on any exercise he cares about most.
