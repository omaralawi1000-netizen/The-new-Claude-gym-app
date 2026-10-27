FAIL. Score: 6.5 / 10.

# Rope Triceps Pushdown, round 2: judge verdict

Most of round 1's choreography and test fixes are done. The station is closer, the strands are 0.27 m, the twist and split creep with no flat holds, the contact test is real and covers the top and the lockout, and the pulley is in frame. But the lockout key still does not teach the move:
- At the keyed camera (-65) the lockout reads as a fist holding a dumbbell at the thigh. The builder says so himself.
- The triceps reads as one flat red shield, not a horseshoe.
- The rope inherits the hammer's non-taut strand. Here it makes a squared Ω "coat-hook" above the fists (f0, f20).
- That same hook eats strand length, so at lockout the clip ends up at wrist height (f48) and the inverted V never forms.

There is no clip yet, so motion, the loop seam and the turnarounds could not be judged. I judged the native stills and my own nearest-neighbour crops at x5-x10: hands and rope at f0/f20/f48, the triceps at f48, the wrist at f0/f20, the pulley at f0, the camera A/B panels for -80 and -105 at x3, and all 16 close-up panels. I also read pushdown.py, props.py, rope4.sh/rope5.sh and the full contact log.

## Camera decision: -105 (the builder's pick), with the column moved off the hands
**Reason:** this page teaches the triceps. At -105 both triceps show as full red bellies on the back of the arm, the elbow-extension arc is still close to profile (only 15° past side-on), and the head is a featureless egg, so turning the face away costs nothing.

Why not the others:
- **-65:** shows one shield-shaped triceps, and the split is edge-on.
- **-80:** shows one good triceps, but the far one is hidden.
- **-125:** the forearm arc swings into depth.

The condition: at -105 f20 the near fist and rope sit right on top of the column, so the hand merges into the pole. Move the station about 0.15 m toward the camera's right, or re-target the camera, so the column clears the near fist by at least 25 px at every frame. This departs from the rules' "pushdown -65", so update figure-rules.md and put the -65/-105 pair in front of Omar on the watch page.

## The builder's claims, checked against the pictures

| Claim | What I found | Verdict |
|---|---|---|
| Braid 0.09, flat filleted caps | Same props.py as the hammer. The helix reads in the close-ups (left clip side f48/f60), and the caps are a cone, a body and a flat filleted end. | **True.** |
| One smooth Bezier, no Z-kink | No corners. But at f0 and f20 (native x5-x6, px 540-640 x 190-330) each strand leaves the sleeve, swings out sideways and hooks down into the top of the fist: a squared Ω or coat-hook, which is not a taut Λ. You can see it in close-up "right clip side" f0/f20 too. | **Smooth, not taut** (flaw 1). |
| Continuous fist tilt | ROPETILT runs smoothly from +1.0 to -4.0 and back to +1.0, with phi between 57 and 65°, and no flips. | **True.** |
| Open-fork pulley in frame, about 18 px from the edge | pulley-4x-f000: the carriage top is about 15 px from the top edge and the wheel about 25 px. The fork isn't visible from this camera. The cable drops from the left rim like a yo-yo string, with nothing running over the wheel into the column. | **In frame. Doesn't read as a pulley** (flaw 5). |
| Lens 43, base margin about 30 px | rope5.sh `CAM_LENS=43 CAM_TZ=0.90`, and the base is about 40 px clear at f48. | **True.** |
| 0 inside, 0 crossings | 60 frames: every 5th, plus f0-5, f44-62 and f112-129. Every frame reads `inside 0` for both hands, worst clearance 0.3 mm, and `crossings 0` on all 60 lines. Rope-to-body minimum is 5.9 mm (stopper.l vs FDS.l), and rope to head is at least 131 mm. `ROPE_INSET=0` is used for both the log and the keys. | **True.** |
| Split doesn't read at -65 (flagged) | Confirmed, and it's worse than "edge-on". At f48 the cable comes down to the near wrist (native about px 527, 318) and the clip sleeve sits beside the near knuckles (close-up right clip side f48/f60). The clip is about level with the fists, so there is no V to see from any angle. | **Flaw 2.** |
| "Rope hangs as an inverted V at lockout" | Not true in the stills, at -65 or at -105, where it reads as a horizontal bar behind the hips. | **False.** |

## Flaws, in order

1. **Ω or coat-hook strands above the fists (f0 and f20, native px 540-640 x 190-330; close-ups right clip side f0/f20).** *Blocking.*
   - **Cause:** the same as the hammer. props.py `strand()` keeps a 45 mm grip-axis handle (HEEL) and a 0.30 cable-line handle (FAN), so each strand runs out sideways and back.
   - **Fix:**
     - Use the hammer r3 verdict's flaw 1 fix: `h1 = HEEL*max(0.25, cos(phi/2))*min(1, D/0.15)` and FAN about 0.12-0.15.
     - Add the ROPEMONO check: the projection onto `d` must never decrease from exit to clip, with 0 violations over the 60 log frames.
     - Re-run the contact test. The thumb-side cut at f25-30 from round 2 is the risk to watch.
2. **The clip sits at wrist height at lockout, so there is no inverted V (f48, native px 470-570 x 300-390; close-ups right clip side f48/f60).** *Blocking.*
   - The hook length from flaw 1 eats the 0.27 m strands, and the clip is solved too close to the hands.
   - At f0 the sleeve is only about 9 cm above the fists, where round 1 asked for 20-25 cm.
   - **Fix:**
     - Flaw 1 gives back most of the length.
     - Then measure: at f48 the clip must sit at least 12 cm above the line between the two exits, and at f0 at least 18 cm above the fists. Print both lengths in the log.
     - If either check still fails, raise `ROPE_STRAND` to 0.30, which is still a real 30-inch rope.
3. **The triceps glow reads as a flat red shield, not the horseshoe (f48, native px 440-540 x 170-300; f0 and f20 the same).**
   - At -65 only the lateral head reads, as a hard-edged triangle with a stepped top edge (x5 crop, top right of the patch). The long head is a pink haze at the back edge.
   - The -105 panels show both bellies far more fully, which is part of why I chose that camera.
   - **Fix:**
     - Re-shoot at -105.
     - In an x6 crop at f20 and f48, check that the long head and the lateral head read as two lobes over the medial head at the elbow.
     - If the top edge still steps, add the deltoid to the AOV bloom occluder set, or start the triceps `bt` band at 0.15 rather than 0.12.
4. **Renders without light linking.**
   - rope4.sh and rope5.sh don't export `FORE_NOLIGHT=1`, so the r18 fix against pink spill in the forearm crevices is off.
   - **Fix:** add it to every export line, or make it the default in render8.
5. **The pulley reads as a disc with a string hanging from its rim (pulley-4x-f000).**
   - **Fix (same as the hammer):**
     - a darker inset rim ring on the visible face;
     - the cable carried over the top of the wheel, about 60° of wrap, and back into the carriage block, so it visibly runs through the pulley.
6. **The camera change needs the composition reset (camera-angle-ab, -105 f20, native px of the A/B panel at about 1290-1370 x 270-330).**
   - The near fist, rope and clip sit right on the column, so the prop disappears into the pole.
   - The keys at -65 are also weighted to the right: the figure plus column centre sits about 120 px right of frame centre.
   - **Fix:**
     - At -105, move the station or the camera target so the column clears the near fist by 25 px or more on every frame, and so the figure plus column centre is within ±20 px of x = 480.
     - Keep the top pulley margin of 15 px or more.
7. **A dark square on the near wrist at f0 (native px 590-600 x 238-248, x10 crop).**
   - A hole about 5 x 5 px with hard edges, at the near wrist where the far hand's thumb web shows behind it.
   - It is either a gap in the far hand or a cuff gap at the near wrist. At app size it is a 2 px dot, but at native it reads as a hole.
   - **Fix:**
     - Check whether the pixel belongs to the far hand's thumb web or the near wrist skin edge, using an object-index pick or a render with the far hand hidden.
     - If it's the cuff: same remedy as r15, the WT_IN tuck, or 1° more wrist flexion at f0-5.
     - Re-check at -105, where this spot may not be visible at all.

## Passed / accepted
- Twist 90 → 116 → 120 and abduct 2 → 6 → 7, both creeping from f24-26, with no flat holds (pushdown.py).
- Body creep through lockout.
- The pulley distance is right. The cable runs about 20-25° off vertical at lockout, which is acceptable.
- Hands: all 16 close-up panels show fingers wrapped, nothing through skin, and the caps under the pinkies.
- The glow set is exactly the six triceps heads (the GLOWS lines).

## Can the clip render go now?
**No.** Fix 1 and 2 together, then 3-6.
- Re-shoot f0/f20/f48 at **-105** with the station moved, plus the close-ups.
- Shoot one -65 still at f48 as the comparison for Omar.
- Log ROPEMONO and the clip-height checks with the contact log.
- Re-judge the stills, then render one clip.
