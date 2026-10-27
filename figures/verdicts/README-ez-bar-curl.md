# EZ-bar Curl pilot: round 2 stills (fixes for judge-verdict.md)

Round 1 files are in `round1/`.

## Files
- `ez-vs-r15-keys.jpg`: r15 (top row) vs EZ (bottom row) at frames 0, 30 and 55.
- `ez-keys-appsize.jpg`: EZ at about app size.
- `ez-f000/030/055.png`: full size.
- `ez-hands-closeups.jpg`: rows are f0, f30, f55 and f70. Columns are the right hand (clip view, from below) and the left hand (clip view, from below).

## Fixes
1. **Real contact test.**
   - GRIPDIAG with `PROP=ez` now tests the posed hand skin (SKIN + UNDER objects of each arm) against the built EZBar mesh. It uses a BVH nearest point, with the sign taken from the face normal.
   - Frames tested: 0, 20, 30, 41, every frame from 50 to 72, and 100.
   - Result: **0 skin points inside on every frame, for both hands. Worst clearance +0.3 mm** (the solved grip touches the bar).
   - The test does catch the old bar: on the round-1 setup it found 610 points inside at f55, with -12.5 mm clearance. That was your item 2.
2. **Cause of the f55 bar-in-hand.**
   - The r15 curl's elbow hinge brings the hands about 17 cm closer at the top. A straight bar hid this, because the hands slid along it.
   - A rigid EZ bar can't hide it.
   - Fix: new moves hinge the elbow about a level axis, so the forearms rise straight up the way a lifter's upper arm turns out to hold a rigid bar. Hand spacing now varies by only 1.4 cm, and the shoulders take that up with 0 to 4° of abduction, solved every frame so the grip width stays exactly constant.
   - The approved r15 barbell curl is untouched: the old hinge stays the default for `PROP=barbell`.
3. **Hand span.**
   - Measured along each hand's grip axis: thumb side -54.3 mm to little-finger side +45.2 mm from the grip centre.
   - The straight grip section now covers -66.3 to +57.2 mm, which is 12 mm clear each side. Bends start only after that.
4. **Bends.**
   - Centreline radius 45 mm (was 22).
   - The inner dip is 45 mm behind the bar line.
   - The connectors run at 38°.
5. **Wrist roll moved into the forearm twist.** A swing/twist split about the forearm axis sends the roll into `foretw`, so the wrist keeps only bend and side-to-side. Wrist correction is now 7.4° at the bottom and 3.2° at the top (was 7.5° and 10.2°).

## Note on f000
At app size the W reads at the bottom, but only mildly, because the bend plane is nearly edge-on to the camera. It reads clearly at f30.
