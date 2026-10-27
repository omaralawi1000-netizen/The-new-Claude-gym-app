# Barbell Curl r17: judge verdict

**FAIL. Score: 7.5 / 10.**

r17 is a large step up from r16 and, in most ways, from r15. The hands are locked, the red haze on the forearm is gone, and most of the biceps is visible again at the top. It still fails the "nothing to wince at" bar on one thing that shows on every top-of-rep frame: the biceps-to-forearm boundary is now a hard, stair-stepped edge with no anti-aliasing. There is also a band of pink speckle and red slivers on the frames where the squash ramps in. Neither is big, but at the S26 Ultra's DPR the frame is upscaled about 3x, and a jagged red edge on the hero muscle is the first thing a designer's eye goes to. The fixes are small and confined to compositing and squash. This should be a one-round fix.

## What I checked
- I pulled every frame of `curl-clip-r17.mp4`, `r15-vs-r17-side-by-side.mp4` and the live `../curl-clip-r15.mp4`. I confirmed that the left half of the side-by-side is r15 by pixel difference against the r15 clip.
- I made my own crops: the near elbow at f36-84 (x3 to x8, nearest-neighbour and Lanczos), the far arm at f44-76, the bottom of the rep (arms against the trunk) at f0/10/115/125, hands against thighs at f0/20/120, and the ramp frames f28-40 and f84-96.
- Logs I read: slide (130 frames), grip contact (208 checks) and clipcheck. I also checked the ABDUCT curve myself: a range of -6.54 to +0.98°, a max step of 0.37°/f, a max change of step of 0.08°/f², and a seam step of 0.00.

## The six checks
1. **Forearm covering the biceps at the top: fixed (pass).** At f52/60/70 the near biceps is again a clear red belly beside an inward-leaning forearm, close to r15. It is a bit narrower than r15 at f60, because the forearm's edge now cuts the belly's lower edge in a straight diagonal. That is acceptable and reads as forearm against biceps.
2. **Bleed, sliver or edge line between the forearm and the biceps: FAIL.** See flaws 1 and 2. The haze is gone, but at native pixels the boundary is aliased, and the ramp frames show pink and red speckle in the forearm gaps.
3. **Hands locked, natural grip: pass.** The grip centre, off-axis and roll each have a 0.00 range for both hands on all 130 frames, and wristx is constant. The plate gap holds in `hand-on-bar-strip.jpg`. Grip contact shows 0 points inside the bar in all 208 checks. Close up, the fingers wrap cleanly at the bottom (f0, f20, f120) and at the top. Note: every GRIP line is identical because the hand is rigid in the bar's frame. That is expected, but it means this test cannot catch a pose change in the hand itself.
4. **38 cm grip at the bottom: pass, with a caveat (flaw 3).** The near arm hangs against the lat and chest the way a real shoulder-width curl does, and it reads natural, not squashed. The far arm is tucked so far behind the trunk that the far biceps is only a thin red strip at f0-15 and f115-129, about half as wide as in r15. Nothing visibly clips, but a shoulder at -6.5° (adducted into the trunk) is a place where hidden interpenetration is likely, and there is no trustworthy check for it yet.
5. **Loop and motion: pass.** The seam is 0.255 against a median of 1.103, and there are no spikes. Timing and bar speed are unchanged from approved r15. The elbows drift out by 7.5° over the lift, smoothly (≤0.37°/f), and that reads as the elbows travelling naturally, not as a correction. The motion is calm.
6. **Other: see flaws 4 and 5.**

## Flaws, with frame numbers and exact fixes

1. **f40-f84 (worst at f52-f70): the hard, aliased edge where the near forearm meets the biceps.** At native x7-x8 the red-to-grey boundary is a 1-px staircase along the whole forearm edge. r15 had a soft, anti-aliased edge (under the haze). In motion this edge will crawl. It is what README "Known" item 2 calls "one faint thin line", and it is not acceptable on the hero muscle.
   - Cause: `BLOOM_FORE` uses the object-index (`IndexOB`) pass, which is not anti-aliased, so the bloom is cut to the pixel.
   - Fix: build the forearm mask from an anti-aliased coverage pass. Use Cryptomatte on the forearm-muscle objects (or a holdout/alpha pass of just the forearm), and multiply the bloom by `1 - coverage`. A cheaper fallback is to render the IndexOB mask at 2x and downsample it, or feather it with a 1-px blur.
   - Check: a native x8 crop at f52/60/70 should show a 1-2 px graded edge like r15's, with no staircase.

2. **f36-f48 and f72-f86 (the squash and clay-core ramp frames): pink and blue speckle in a band about 4-8 px wide along the forearm next to the biceps, and thin red lines in the forearm gaps near the elbow.** You can see it clearly at f40/f44/f76/f80 at native x8, and at f44/f76 at x3. At full flexion (f56-66) it is clean, so this is the ramp, not the end state.
   - Cause: the squash and the clay core start at 55° of flexion, after the forearm already overlaps the biceps in screen space. The core also starts at 0.12 along the forearm, so the gaps closest to the elbow still show the red behind.
   - Fix:
     - (a) Start the `squash.py` ramp at about 35-40° of flexion, still full by 85°.
     - (b) Make the `SQ_FILL` core independent of the ramp (always on: it is internal Clay and invisible when the arm is straight).
     - (c) Extend the core's near end from 0.12 to about 0.03, keeping the far end at 0.72.
   - Check: native x8 crops at f40/44/76/80 should show no pink or red pixels inside the forearm outline.

3. **f0-f20 and f110-f129: the far upper arm is tucked behind the trunk, the far biceps is only a sliver, and arm-into-trunk clipping is unverified.**
   - Fix: run a signed BVH test (same method as GRIPDIAG) of biceps, brachialis, triceps and deltoid vertices against the latissimus, serratus anterior, pec major and external oblique meshes on every frame from f0-20 and f110-129. The pass mark is 0 points inside.
   - If anything is inside, or as a visual improvement anyway: hold the bottom abduct at no less than -5° by adding LOCKW_SEP to 196-200 mm only if the top stills at f52/60/70 still match this round. Otherwise accept the grip and record the far-biceps width in the figure rules as a known trade-off.
   - Do not change the grip mid-rep: the lock rule stands.

4. **f44-f76: a whitish, flaky speckle patch on the far chest at the axilla next to the far biceps glow.** It is in r15 too, so it is not a regression, but it looks like noise from the bloom spreading over a fibre-clay crease.
   - Fix: give the far side the same occlusion mask (the anti-aliased one from flaw 1) for the pec and lat where they overlap the far biceps halo. Or lower HALO_R on the far biceps by about 30% between f40 and f80.
   - Low priority. Fix it if flaw 1's mask makes it cheap.

5. **f0-f10 and f120-f129: the near hand's knuckles sit right on the front of the near thigh.** It reads as plausible (the bar resting against the thighs), but nothing proves the hand isn't in the thigh, and the narrower grip moved the hand closer to it.
   - Fix: add the near and far quadriceps and the adductor surfaces to the GRIP contact test at f0/5/10/120/125/129 (hand-skin points inside the thigh = 0). If anything is inside, move the bar forward by 5-8 mm at the bottom through the pelvis-forward key, not by moving the hands on the bar.

## To pass next round
- Native x8 crops at f40, f44, f52, f60, f70, f76 and f80: an anti-aliased edge and no pink or red pixels inside the forearm.
- The arm-vs-trunk and hand-vs-thigh contact counts at 0, or a written reason why a count is a false positive.
- The same slide, grip and clipcheck numbers as r17.
- Fixes 1 and 2 are compositing and squash changes only. Make the stills first, then ONE clip render.

If flaws 1 and 2 are fixed cleanly and flaw 3 checks out, I expect this to pass at 9 or above. The hand lock and the top of the rep are now better than approved r15.
