# Barbell Curl r16: hands locked to the bar (fix for the live r15)

Omar, 18 Oct: "the hands like slide on the bar".

## Cause (measured, `slide-r15-before.txt`)
- r15 hinges the elbow about an axis set by each forearm, so the hands converge as the elbows bend.
- The bar was only centred between the two grip centres. Nothing held the width.
- Each hand's grip centre, in the bar's own frame, travelled **79.4 mm** along the bar: from 252 mm from the centre at the bottom to 173 mm at the top, and back.
- An old comment in pose.py even called this "fine on a straight bar: the hands slide along it". It was not fine.

## Fix (only this, everything else is r15)
- `ELBOW_AXIS=level`, the level elbow hinge already used by the EZ curl and the rope moves.
- `LOCKW=1`, the same per-frame abduct bisection the EZ curl uses, holding the f0 grip width. It needs only 0 to 1.66° of abduct, with a max step of 0.09°/f.
- `render8.py` and `pose.py` are copied here. A new `SLIDEDIAG=1` probe prints each hand's grip centre (mm) and roll in the bar's frame for every frame.

## Proof
- `slide-r16-after.txt`, all 130 frames: grip centre along the bar, range **0.00 mm** for both hands. Roll is 0.00° for both hands, and the off-axis offsets are 0.00 mm.
- `hand-on-bar-strip.jpg`: the camera is locked on the right hand's grip, at f0/15/30/45/60/75/90/105/120.
  - Top row is r15: the gap to the inner plate opens and the plate leaves the view at f45-75.
  - Bottom row is r16: the plate stays put.
- Hand skin inside the bar: 0 on every 5th frame from 0 to 125 (208 checks), the same as r15. Min distance 13.8 mm against a 13.5 mm bar radius.
- The wrist correction is steadier: 6.7-9.0° over the rep, against 3.8-10.8° in r15.
- `clipcheck.txt`: no spikes. Loop seam 0.266 against a median of 1.079, which matches r15 (0.264 / 1.071).
- `measure.txt`: body landmarks are identical to r15.
  - The bar's peak speed is 7.94 px/f (r15 7.97).
  - The hand path's x travel drops from 55 px to 36 px: the hands no longer swing inward.

## Files
- `curl-clip-r16.mp4` and `.webm`: the full clip, 130 f, 960x640.
- `r15-vs-r16-side-by-side.mp4`: live r15 on the left, r16 on the right.

## What changes visually (for the judge)
- At the top, the forearms rise straight up and the fists stay at their bottom width, instead of narrowing toward the chin. That is how a fixed-width grip on a straight bar behaves.
- Please check that the top still reads as natural and premium, as in r15.
