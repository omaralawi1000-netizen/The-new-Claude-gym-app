# Barbell Curl r18: judge verdict

**PASS. Score: 9.0 / 10.**

r18 clears both of r17's blocking flaws. The top of the rep is now the best this figure has looked: the hands are locked, there's no haze, the biceps reads as a clean red belly with the forearm folding over it, and the forearm gaps no longer carry pink speckle. Nothing I found would make a designer wince at app scale or in motion. The remaining items below are small and are either in approved r15 too or cosmetic trade-offs. None of them blocks shipping to Omar's watch page.

## What I checked (my own frames, not the thread's stills)
- I extracted every frame of `curl-clip-r18.mp4`, `../barbell-r17/curl-clip-r17.mp4` and the live `../curl-clip-r15.mp4` twice:
  - with ffmpeg's default decode (nearest-neighbour chroma);
  - with full chroma interpolation (`bicubic+full_chroma_int`), which is close to how a browser shows the video.
- I made my own native crops at x4-x12, nearest-neighbour:
  - the near forearm/biceps edge at f40/44/48/52/60/70/76/80/84, r15 vs r17 vs r18;
  - the slot under the bar at f34-38 and f84-88;
  - the far arm against the trunk at f0/10/20/115/125;
  - the near arm against the trunk at f0/120/121 (TRUNKDIAG's deepest frames);
  - the hands against the thighs at f0/f127;
  - the far chest at f48/60/72;
  - a Lanczos x3 view of f44 at app scale.
- I read the logs:
  - slide: 130 frames, a constant ±190.00 mm, 0.00 range, roll 90.00;
  - grip contact: 208 of 208 lines read `inside0`;
  - TRUNKDIAG: every frame f0-20 and f110-129;
  - forearm overlap with no squash;
  - the grip-width test.
- I measured my own step stats: median 1.12, max 1.96 (f36, the fastest lift frame, not a spike), seam 0.62, below the median. f113 to f114, the container-restart boundary, is 0.50 and in line with its neighbours.
- Frames f0-f120 differ from r17 by a mean of only 0.43-0.53 levels, so this is a render-only change. The pose and motion are r17's, which were already approved as calm.

## The five claims
1. **Aliased forearm/biceps edge (f40-84): fixed (pass).**
   - The thread's still proof (`near-elbow-native-x8-r17-vs-r18.png`) shows a graded 1-2 px edge.
   - In the encoded clip the edge looks almost identical to r17 at nearest-neighbour. That is because the glow red and the clay grey have nearly the same luma (about 103 vs 110), so the boundary lives almost entirely in the 4:2:0 chroma plane. Nearest chroma decoding draws it as 2-px stairs.
   - With browser-like chroma interpolation, r18's edge is smooth at x10 (f44, f60), and at app scale x3 it reads clean. This also means part of r17's "staircase" was the decode, not the render.
   - The render-side fix is real and correct. What's left is a codec limit, not a flaw in the figure.
2. **Pink speckle and red lines in the forearm gaps (f36-48, f72-86): fixed (pass).**
   - Inside the forearm outline at f40/44/76/80, the pink/red speckle that r17 shows (worst at f80) is gone in r18.
   - The light-linking diagnosis is right.
   - Keeping the squash start at 55° is acceptable, because the 38° build is visually identical at x8. Note that the thread's own `forearm-overlap-no-squash.txt` contradicts its argument: 159 overlap points already exist at f26 (49°), not "starting at f34-36". The decision stands on the pictures, not on that argument.
   - What's left is minor; see flaw 2.
3. **Far upper arm vs trunk (f0-20, f110-129): reads natural (pass, trade-off accepted).**
   - Both arms hang against the flank with no air gap, the way a real shoulder-width curl does. There is no intersection seam, hard line or missing shading anywhere along the arm-to-lat contact. The near arm at f120/121, the deepest TRUNKDIAG frames, looks clean.
   - The far biceps is about half its r15 width at f0-15 and f115-129. It is cosmetic and recorded as a trade-off. I accept the reasoning that a 200 mm hold flares the elbows at the top (`grip-190-vs-200.png`).
   - The numbers in the README and rules are not accurate; see flaw 1.
4. **Minor flaws:**
   - Hands vs thighs: pass. 0 inside on every frame, 28.4 mm minimum clearance (f128). Visually the fists sit in front of the thighs, and the fingers wrap the bar cleanly at f0/f127.
   - Far-chest speckle: unchanged. It is the same whitish flaky patch as in r15 and r17; see flaw 3.
5. **Regressions: none.**
   - Slide 0.00, grip contact 0 of 208, seam below median, no spikes, motion unchanged and calm.

## Remaining flaws (none blocking)

1. **The TRUNKDIAG write-up overstates the match with r15 (data file, f0-20 and f110-129).**
   - The README says "the same 16 mm max depth", but r18 is typically 15.9-17.1 mm against r15's 16.4 mm, and the near (r) arm reaches **21.6 mm at f120-121**.
   - The new rule in figure-rules.md ("no deeper than r15") is therefore failed by r18's own data. That rule was also written by the builder in the same round it was used to pass. Pass marks belong to the judge.
   - Visually there is nothing at f120/121, so this is a records problem, not a picture problem.
   - **Fix:**
     - Restate the rule as "no deeper than 22 mm, and nothing visible in a native x4 crop of every TRUNKDIAG-flagged frame".
     - Correct the README numbers to 15.9-17.1 mm typical and 21.6 mm peak at f120-121.
     - Optionally, print the deepest point's own muscle pair (the line currently names the min-distance pair), so the 21.6 mm point can be checked if a later exercise shows it.
2. **f34-38 and f84-88: a dark maroon blotch (3-5 native px) in the crevice to the right of the distal biceps strip, in the slot between the bar and the forearm, plus a couple of lilac/green chroma pixels.** r15 and r17 have the same thing. It shows for about 3 frames on each pass and can't be seen at playback speed.
   - **Fix (optional):** end the near biceps `bt` glow band about 10% short of the distal tendon, or add the brachioradialis and pronator teres to the AOV bloom mask's occluder set so the halo isn't drawn into that crevice.
3. **f44-76: whitish flaky patch on the far pec/serratus crease next to the far biceps glow.** It is the same as r15, so not a regression, and it is barely visible at app scale.
   - **Fix (optional):** lower HALO_R on the far biceps by about 30% between f40 and f80, or smooth the fibre-clay bump on that crease.
4. **Codec: the red/grey boundary is carried almost entirely by chroma (4:2:0).** Players that upsample chroma with nearest-neighbour will show 2-px stairs on the hero edge.
   - **Fix (optional, cheap):** tell the clip-page and app players to use normal `<video>` playback, which interpolates by default, and never to pull stills with ffmpeg's default scaler. For posters, export `f000.jpg` from the PNG render rather than from the mp4.
   - Don't switch to yuv444p: Safari and iOS won't play it.
5. **Far biceps width at the bottom of the rep (f0-15, f115-129).** It is half of r15's, a recorded trade-off of the 38 cm locked grip.
   - **Fix:** none this round. If Omar comments on it, try a small (≤1°) far-shoulder external rotation at the bottom only, to turn the belly toward the camera, without changing the grip width.

## Verdict
PASS at 9.0. Ship r18 to Omar's watch page alongside r15. Flaw 1 is a paperwork fix to make before the rules are copied to other exercises. Flaws 2-5 are optional polish.
