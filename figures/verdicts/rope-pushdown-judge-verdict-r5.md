FAIL (stills). Score: 8.8 / 10.

# Rope Triceps Pushdown, round 5: judge verdict (judge round 6)

The round-4 blocker is fixed. The far cap no longer floats:
- On every frame where the cap shows, the fist shows at least 181 px.
- The cap now trails the fist out (it appears at f35) and back in (it is gone by f74).
- On the keys the end hangs below the turned-in fist instead of leading it.

The far-arm change reads as natural from this camera. The fist sits at the side of the glute with the elbow a little off the body. It doesn't look twisted at 1x or at x5.

The red flag and the f25 cable flag don't block.

It fails for a new defect brought in by the turned-in far arm. **Background shows through the far wrist as a white pinhole.** It is a 1x3 px speck at f36 (native 320, 311-313) and a 2x2 px speck at f72 (native 322-323, 305-306), each sitting in the dark far hand. The close-ups show where it comes from: a white sliver at the forearm-to-hand seam (`pushdown-hands-closeups.jpg`, lc f36/f48/f72). It isn't there at f0 or f20, before the turn-in. In a clip it will twinkle on the dark hand for most of f35-73. Omar will find it at x4.

## What I looked at myself
- **Keys at native size:** `pushdown-f000/020/036/048/072.png`, `pushdown-keys.jpg`, and all 20 panels of `pushdown-hands-closeups.jpg`, plus `far-and-near-arm-x2-f036-f072.png` and the round-4 `pushdown-f048.png` for comparison.
- **My crops (in this folder):**
  - `judge-r6-pushdown-far-arm-f020-036-048-072-r4f048-x5.png`: the far arm on each key plus round-4 f48, x5.
  - `judge-r6-pushdown-both-arms-x3.png`: both arms on each key, x3, for symmetry.
  - `judge-r6-pushdown-far-wrist-x10.png`: the pinholes at f36, f48 and f72, x10.
- **Pixel dump** of the far wrist (rows 305-321, x 310-339):
  - f36: a 1-px column reading 171/208/158 surrounded by 30-60.
  - f72: a 2x2 block reading 135-203 surrounded by 17-60.
  - The background here reads 240, so these are partial-coverage holes.
- **Logs, parsed myself:**
  - `far-end-log.txt`: 130 frames, 0 FLOATING. The cap is visible on f35-49 and f65-73 only, with the fist at 181-427 px on those frames. Before f35 and after f73 the cap is hidden while the fist is still partly visible (6-129 px), which is the right order.
  - `contact-log.txt`: 130 frames. 0 hand points inside, ROPESTRAIGHT 0.0, ROPEMONO 0.0 on every frame (the 0.44 m strands hold the V), 0 crossings, rope-to-head at least 132 mm, clip at least 155 mm above the exits.
  - `cable-log.txt`: 1 TANGENT run, at f25 (25 px at 436,187).
- **Red** (a crude median of R-G > 140 pixels, my own measure):

| Source | Core |
|---|---|
| Pushdown keys (PNG) | 228-231/56-58/37-38 |
| Curl r18 f30 / f55 (MP4, full decode) | 230/59/41, 223/52/38 |
| Hammer clip | 228-229/60-61/44-45 |

## Item by item

| Check | Finding | Verdict |
|---|---|---|
| Far cap floating (r4 must-fix 1) | 0 floating frames in the every-frame log. In the f36/f72 pixels the cap hangs below the fist, against the glute. At f48 the end is held horizontal in the fist, the same as the round-4 key I accepted. | **Fixed.** |
| Far arm turn-in and +10 deg wider: natural? | In x3 and x5 the far upper arm sits a few px off the lat, with the elbow pointing back and out. The forearm angles in to the glute, and the turned-in fist reads as the hand at the side of the hip. The near arm is unchanged. No candy-wrapper twist shows on the forearm muscles. The fist does go darker (it faces away from the key), which leaves a dark lump at f36/f72 at app size, but it is still readable as a hand. | **Natural enough.** It is the pinhole (must-fix 1) that comes with it. |
| Red (flag) | Against the curl's f30 the gap is within 4 on every channel by my measure. Against f55, R is +5..+8. The curl's own two keys are 7 apart in R and G. The thread's GLOW_EMIT 0.08 numbers on a re-render say the opposite split. Both methods put the pushdown inside the curl's own key-to-key spread. Side by side at app size the reds match. | **Accepted, doesn't block.** I'm replacing the ±4-against-both mark with "inside the curl's own f30-f55 range, ±2". |
| Cable tangent f25 (flag) | I can't judge it on a still: there is no f25 frame. The log says one 25 px run against the 24 px mark, at the shoulder line. | **Judge on the clip.** I lean towards accepting one frame of 25 px in motion, if it doesn't read as the cable sliding along the deltoid. |
| Hands on the rope | All 20 close-up panels: the fingers wrap the rope, the ends sit in the fists, no skin passes through the rope. | **Pass.** |
| Glow edges | The triceps outline reads as two heads on both arms at x3. The edges are anti-aliased. No pink speckle on the forearms on the keys. | **Pass.** |

## Must-fixes
1. **Background pinhole through the far wrist, f36 and f72, and by the close-ups across the whole turned-in range f30-80.**
   - Close the forearm-to-hand seam on the far arm under `twist_l`. Options:
     - pull the hand skin's wrist ring a few mm up inside the forearm;
     - or inset the distal forearm muscles toward the radius/ulna, like `UNDER_FORE_IN`;
     - or spread the twist over the forearm instead of the wrist, so the seam doesn't open.
   - The near-wrist close-ups (ra f36/f48) show a smaller white mark too. Fix both.
   - Also confirm with PICKDIAG what the 1x2 px light speck at the far fist/rope join on f48 (native about 318, 330) is. If it's background seen through the grip, the same fix or a small finger curl closes it.
   - **Pass:** no pixel above 150 inside the far hand/wrist silhouette, on every frame f20-90 of the clip build (a simple bright-in-dark scan is enough), and no white sliver at either wrist in the close-ups.

## Nice-to-haves
- At app size the turned-in far fist at f36/f72 is a dark lump. A little more fill on that hand, or 5 deg less `twist_l` if FARDIAG still reads 0, would make it read more as a hand.
- The near strand still runs as a diagonal across the lower back on f36-72 (round-4 nice-to-have). Correct occlusion, but check it in motion.

## Taken from the thread, not re-run (no Blender in my container)
- The FARDIAG, GRIPDIAG, CABLEDIAG and TILTDIAG numbers. I parsed them, but couldn't regenerate them.
- `far-end-trials-log.txt` (options A, B and C failing). I didn't open it.
- The thread's redm.py table.
- That the pinholes are the wrist seam. My evidence is that they sit at the wrist in the camera view, and the close-ups show a white seam sliver there only on the twisted frames. A PICKDIAG ray through (320,312) at f36 settles it.

## Can the clip render go now?
**Yes, with the seam fix in.** It is a local rig fix that doesn't move the rope solve. Re-run FARDIAG and GRIPDIAG every frame after it.
I'll judge the stills fix, the f25 cable sweep, the cap timing in motion and the loop seam together on that clip.
