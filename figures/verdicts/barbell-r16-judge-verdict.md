# Barbell Curl r16: judge verdict

**VERDICT: FIX.** The slide is fixed, but the top of the rep regressed below r15.

## What passes
1. **Hands locked to the bar.** `slide-r16-after.txt` shows a 0.00 mm range along the bar for both hands on all 130 frames. Roll and wristx are constant. In `hand-on-bar-strip.jpg` the plate gap holds. Zoomed crops at f0, f15, f30, f60, f66, f90, f118, f124, f127 and f129 show no visible slide.
2. **Grip contact.** No skin shows through the bar in any zoomed frame. The fingers wrap cleanly. The bottom wrists (f0, f110-129) match r15 with no new creases.
3. **Timing.** The bar-height curve is smooth through both turnarounds (top about f57-66, bottom about f120-129, with no hold). The loop seam is 0.266 against a median of 1.079. The abduct step is at most 0.09°/f. Body landmarks match r15.

## FIX list
1. **f46-f74: the near forearm (the figure's right arm, screen left) now covers the near biceps.** It is worst at f52-f70. At peak squeeze, the hero muscle shows only as a red sliver. In r15 at f52 and f60, the biceps was clearly visible beside an inward-angled forearm. This is the money shot, so it is a regression against r15.
   - Fix: bring back r15's slight inward forearm lean at the top without reopening the slide.
   - Option (a), preferred: add a small elbow flare or forward drift over f40-80, solved inside LOCKW so the grip width stays fixed. Make it a few degrees of shoulder abduction or flexion, eased with the same timing warp.
   - Option (b): lock a narrower width, about 215-225 mm per side instead of 254, so the top matches r15. Then check that the bottom hands still clear the thighs.
   - Pick by stills at f52, f60 and f70 against r15, before any clip render.
2. **f50-f70: red glow bleeds through the near forearm, and a fan of thin spiky slivers appears at the inner elbow and chest edge.** It shows clearly at f56 and f64. It reads as broken geometry: the forearm is pressing into the biceps or chest, and the glow halo is drawn through the occluder.
   - Fix: run a forearm-vs-biceps/pec intersection check (like GRIPDIAG) on f46-74 and push the solve until the count is 0.
   - Make sure the HALO is occluded by the forearm and does not show through it.
   - Fix 1 may clear most of this. Verify with zoomed stills.
3. **Re-run the proof set after fixes 1 and 2:** SLIDEDIAG (still 0.00 mm), GRIPDIAG, measure and clipcheck. Then post the r15-vs-r17 zoom of the near elbow at f52, f60 and f70.

## Notes
- **Far arm:** the straight-up forearm reads natural and premium. It is not robotic.
- **App size:** the top phase looks muddy on the near side, with the biceps hidden and red smear on the forearm. At the S26 Ultra's DPR the frame is upscaled, so those streaks will be visible. It does not read as premium until fixes 1 and 2 are in.
