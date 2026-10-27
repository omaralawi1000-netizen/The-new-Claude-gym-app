FAIL. Score: 7.5 / 10.

# Rope Hammer Curl, round 3: judge verdict

Round 3 is a real step up. The Π-bracket is gone, the end caps now read as rope ends instead of microphones, the pulley wheel can be seen, the base clears the frame, and the contact numbers are honest. It still sits below the curl's 9.0, for one main reason: **the rope is not taut**. The new Bezier leaves each fist along the grip axis for 45 mm, whatever the turn. Where the clip is level with or above the rope exit, the strand dips and comes back up. The result is a belly under the far fist at f30 (the hero key) and an "ear" loop that sticks out past the far fist at f55/f70. A rope under a cable's pull cannot do either of those things, and an anatomist or a lifter will see it at once. The fix is small: two handle lengths and one check. After that, re-shoot only the rope stills. Nothing else needs to be redone.

There is no clip yet, so I could not judge motion, joints in motion, the loop seam or turnarounds. I judged the stills at native size and in my own nearest-neighbour crops at x3-x10: hands and rope at f0/f30/f55, near arm at f30/f55, pulley and base at f30, and the 16 close-up panels. I also read props.py `rope_geometry`, rope4.sh, rope5.sh, render8.py and the full contact log.

## The builder's claims, checked against the pictures

| Claim | What I found | Verdict |
|---|---|---|
| Braid pitch 0.09 | props.py:309 `ROPE_PITCH` default 0.09. In the close-ups (left clip side f30/f55/f70) the twist reads as a diagonal helix, not rings. | **True.** |
| Twist barely resolves at native 960 (flagged) | Agreed. At native size the strand is about 9 px wide, so you see a faint speckle at best (x8 crop of f30). That is a pixel limit, not a shader fault. | **Accepted.** I am withdrawing the round-2 demand that the braid read at 1x. At app size the rope reads by its shape and caps, which makes its shape the thing that has to be right (flaw 1). |
| One smooth Bezier per strand, no bracket or Z-kink | No corners anywhere: the f0 far-hand Z-kink is gone (close-up left clip side f0), and so are the Π bracket and the f55 right angle. **But "smooth" does not mean "taut".** See flaw 1. | **Partly true.** |
| Continuous fist tilt | ROPETILT climbs smoothly from -4.5° to +2.8° with no sign flip between frames, and both hands match to within 0.1°. Note that phi stays at 96-106° from f0 to f15, because the tilt never goes past 4.5°. Round 2 asked for up to 8-10°. | **True, but under-used.** |
| Flat filleted end caps | Cone taper, straight body and a flat end with a fillet, in every close-up and at native f30. They read as rope end caps. | **True. Fixed.** |
| Open-fork pulley | The cheek plate is gone and the wheel face shows (pulley-4x-f030). From this camera, though, the fork arms are hidden behind the wheel, the groove doesn't read, and the cable simply stops at the left rim (flaw 3). | **Built. Reads as a disc, not a pulley.** |
| Lens 43, pulley and base clear the frame | rope5.sh sets `CAM_LENS=43 CAM_TZ=0.80`. The base ends about 22 px above the bottom edge, and the wheel sits well inside. | **True.** Composition: see flaw 4. |
| 0 inside, 0 crossings | 44 frames: f0-45 every 5th, every frame f48-70, then f75-125. Every frame reads `inside 0` for both hands, worst clearance 0.3 mm, and `crossings 0` on all 44 lines. Rope-to-body minimum is 2.1 mm (strand.l vs FDS.l). In the close-ups no rope passes through skin. | **True.** |
| Low-pulley wrap hidden behind the wheel (flagged) | Confirmed. The cable meets the rim and stops, so the wheel reads like a coin with a string glued to its edge. | Fix is cheap (flaw 3). |

## Flaws, in order

1. **The strands sag or hook instead of running taut (f30 far strand; f55 and f70 far fist; f0 both fists, phi 106°).** *Blocking.*
   - **f30, native x8 (px 540-620, 225-285):** the far strand leaves the sleeve, dips about 10 px *below* the clip into a belly, then climbs into the bottom of the far fist. At app size this reads as a dark lump between the fists.
   - **f55 native and close-up "right clip side" f55/f70:** the far strand curls out past the pinky edge of the far fist as a C-shaped ear, then comes back to the sleeve.
   - **Cause:** in props.py `strand()`, the first handle is `h1 = min(HEEL, 0.4*D)`, with HEEL 45 mm along the grip axis, whatever phi is. When the exit points away from the clip (phi 60-106°), the curve has to overshoot and come back. Those hooks also use up strand length, which pulls the clip up close to the fists (at f30 the sleeve is almost level with them).
   - **Fix:**
     - Scale the first handle by the turn: `h1 = HEEL * max(0.25, cos(phi/2)) * min(1, D/0.15)`, which comes to about 12-20 mm at phi above 90°. Drop `ROPE_FAN` from 0.30 to about 0.15.
     - Add an automatic check, `ROPEMONO`: along each strand, from exit to clip, the projection onto the clip-to-pulley direction `d` must never decrease by more than 1 mm. A taut strand never runs back toward the hands. Print the worst frame, and pass only at 0 violations over the same 44 frames.
     - Raise the fist-tilt cap to 8° for phi above 85° (f0-f20) so the bottom turn eases.
     - Re-run the contact test, because the shorter heel brings the rope closer to the hypothenar.
     - Re-shoot f0/f30/f55, the close-ups at f0/30/55/70, and an x4 crop of the rope at each key.
2. **The forearm muscles pick up pink from the glow (f30, native px 420-560 x 160-250: pink cast on the forearm and elbow muscles under the near biceps).**
   - **Cause:** rope4.sh and rope5.sh export the r7 glow settings but not `FORE_NOLIGHT=1`, and render8.py leaves it off by default (line 244). The approved r18 curl only got clean with light linking on.
   - **Fix:** add `FORE_NOLIGHT=1` to the export lines in both scripts, or make it the default in render8. Re-check the near forearm at f30 in a native x6 crop.
3. **The pulley reads as a disc with a string glued to its rim (pulley-4x-f030 and native f30, px 660-700 x 500-545).**
   - The fork arms and the groove don't show from this camera.
   - The cable ends at the rim at about 10 o'clock, and nothing continues past the wheel.
   - **Fix:**
     - Give the wheel's camera face a darker inset rim ring, about 6 mm wide and roughly 30% darker, so the wheel reads as a grooved sheave.
     - Carry the cable on round the groove and back into the carriage: about 40° of wrap along the rim, then a short straight run into the block, so it reads as running through the pulley and not ending at it.
     - Optional: bevel the carriage block and let its lower edge sit on the base plate. At the moment it floats about 3 px above the plate with a dark gap.
4. **The composition is weighted to the right (all keys).**
   - The figure and the column together span about px 420-790, so their centre sits about 125 px right of the frame centre. The left 40% of the frame is empty.
   - The curl reference sits centred.
   - **Fix:** pan the camera target sideways, toward the column, until the midpoint between the figure's centreline and the column's centre sits within ±20 px of x = 480. Keep lens 43, and check the 22 px base margin again afterwards.
5. **A stepped grey notch in the near biceps glow (f55, native px 425-475 x 165-220; smaller at f30, top-left of the belly).**
   - A two-step staircase, about 4 x 5 native px, cuts into the upper lateral edge of the red belly. A grey sliver in front of it has a hard stepped outline.
   - At app size it makes the hero muscle at the top of the rep look slightly bitten.
   - **Fix:**
     - Find the object in front of the biceps there (probably the lateral clay strip or the deltoid insertion). Either add it to the AOV bloom mask's occluder set, or start the biceps `bt` band about 5% lower so the halo doesn't reach that edge.
     - Re-check f55 in a native x8 crop.
6. **f0: the near stopper reads as if it is in the middle of the rope (f0, native px 400-560 x 270-360).**
   - The near cap points straight forward, and the strand comes out right beside its base heading the same way. At native size and app size the cap and the strand look like one bar.
   - **Fix:** this should mostly resolve with flaw 1, because a shorter heel handle plus 8° of tilt lets the strand leave below the fist instead of beside the cap. Confirm on the f0 re-shoot. If it doesn't resolve, add 3-4° of extra forearm pronation at f0 only, easing out by f15, so the cap tilts up off the strand line.

## Accepted, no action
- The braid is a texture you only see in close-up; at 1x the strand is too thin for it to show.
- The low-pulley wrap is hidden behind the wheel face, provided flaw 3's continuation into the carriage is done.
- The figure is about 10% smaller than the curl's, which is the price of fitting the station.
- The dorsal wrist cuff shows only in the camera from below, the same accepted limit as r15.

## Can the clip render go now?
**No.** Fix 1 is blocking. Fixes 2-5 are each one line or a few minutes of work, so do them in the same pass. Then re-shoot the three keys, the close-ups, and x4 rope crops at each key, with the ROPEMONO log. If the rope is taut in those stills, render the clip, and I will judge the motion, the joints and the loop seam on it.
