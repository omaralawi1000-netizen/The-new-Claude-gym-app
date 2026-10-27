FAIL. Score: 8.0 / 10.

# Rope Hammer Curl, round 4: judge verdict

Round 4 is better than round 3:
- The biceps notch is gone.
- The framing is centred.
- The f0 near cap no longer merges with the strand.
- The f30 belly and the f55 "ear" are gone.
- ROPEMONO reads 0.

It is still below the curl's 9.0, for four reasons:
1. The "clay grey forearm" claim is false: the forearm is measurably pink.
2. The fist tilt is frozen for 37% of the loop, with corners at both ends.
3. At the bottom of the rep (f0) the far strand is still a soft C-hook, not a taut line.
4. At the top key, the move's signature muscle doesn't read.

All four are cheap to fix, and none needs a rig change.

There is no clip yet, so motion was judged from the per-frame logs (ROPETILT, ROPEMONO, CAMDIAG) only.

## What I checked
- `hammer-f000/030/055.png` at native size, plus my own nearest-neighbour crops:
  - hands and rope at x5 (f0, f30, f55);
  - the near arm at x4;
  - the pulley at x5.
- I sampled pixel colours on the forearm muscles and on neutral clay.
- I mapped the red glow pixels per key.
- I read all 16 close-up panels, `rope-x4`, `biceps-*`, `forearm-x6` and `pulley-4x`.
- Logs: `contact-log.txt` (45 EZGRIP lines) and `framing-log.txt` (130 frames).
- Code: `code-r4/rope10.sh`, `render8.py` (lines 60-83, 150-171, 255-290), `props.py` (`strand()`, the cable wrap) and `hammer.py`.
- I compared the scripts against the approved `barbell-r18/code/clip21.sh`.

## The builder's claims, checked

| Claim | What I found | Verdict |
|---|---|---|
| ROPEMONO 0 violations, worst 0.3 mm | 45 lines. Every frame reads ≤ 0.3 mm (f0 and f125 are 0.3, the rest 0.0). TOTAL 0. | **True.** But ROPEMONO only catches back-steps, not bows (flaw 3). |
| 0 hand-skin points inside, 0 crossings, ≥ 2.1 mm to the body, ≥ 176 mm to the head | Every line reads `inside 0`, clearance 0.3-0.4 mm and `crossings 0`. The body minimum is 2.1 mm (strand vs FDS). The head minimum is 176 mm at f61-62. | **True.** The bottom settle (f105-129) is only sampled every 5th frame, though it's a hold. |
| Tilt -14° f0-f20, through 0 at about f38, +5.1° at the top | The log matches. **But the tilt is pinned at exactly -14.0° from about f103 through f21, which is 48 of 130 frames.** It has a corner at **both** ends: about 0.8°/f to 0 at f21, and about 1°/f to 0 at f102. The f102 corner isn't flagged. | **True, but under-reported** (flaw 2). |
| `FORE_NOLIGHT=1` in every script; "the forearm under the near biceps is clay grey" | `FORE_NOLIGHT=1` is exported in rope6/8/9/10.sh. **The forearm is not grey.** The forearm strips in front of the biceps read R-G **+8.5** at f55 (native 330-345 x 180-215) and **+14.4** at f30 (345-380 x 232-245). Neutral clay in the same frames reads -2 to -4. **The cause is the bloom, not light:** the approved curl also exports `BLOOM_FORE=1` (clip21.sh). That masks the forearm muscles out of the AOV bloom mask (render8 line 259). The rope scripts don't export it, so the halo is still painted over the forearm. | **Light linking: true. "Clay grey": false** (flaw 1). |
| Notch fixed (`UNDER_ARM_IN=0.014`) | `biceps-notch-x6` r3 vs r4: the stepped grey bite is gone. A 1-px nick remains on the lower-left belly edge at x6, which can't be seen at 1x. | **True. Fixed.** |
| Centred: midpoint -2..+1 px, base 25 px, top 45 px | CAMDIAG: mid 478-481 on all 130 frames, margins constant. At native and app size the figure plus column sits balanced. | **True. Fixed.** |
| No belly at f30, no ear at f55 | f30 x5: both strands run straight to the sleeve. f55 x5: the far strand bows less than 1 native px. **f0 x5 (native 395-420 x 300-360): the far strand leaves the fist downward, bows out about 4 px to the left as a C, then turns into the sleeve from above.** At f30 x5 the near strand runs straight down about 5 px under the fist, then makes a tight knee toward the clip. | **f30/f55 true. f0 not taut** (flaw 3). |
| f0 near cap tilts up off the strand line | f0 x5: the strand leaves under the near fist and the cap stands clear. | **True. Fixed.** |
| Pulley "wrap barely visible", "rim ring faint" (flagged) | x5 f30 (native 505-625 x 480-600): the cable reaches the left rim at about 10 o'clock and disappears. No wrap and no tail into the carriage can be seen. The rim ring is about 6 grey levels from the face. The cable is a 1-px line at 177-195 against a 237 background, so it reads silver, not "dark coated". | **Honest. Still a disc with a string** (flaw 5). |
| Tilt-ramp corner at f21 (flagged) | Confirmed, plus a second corner at about f102. See flaw 2. | **Must-fix before the clip.** |

## Must-fixes

1. **Bloom paints the forearm pink (f30, f55; it will be worst f45-75 in motion).**
   - **Fix:**
     - Export `BLOOM_FORE=1` in the hammer scripts, as the approved curl does.
     - **But** the BLOOM_FORE regex in render8 (line 259-260) includes `Brachioradialis`, which is a mover here, and it would black its bloom out. Add `and not _re.search(GLOW_RE, ob.name, _re.I)` to that condition, so glowing muscles are never occluders.
     - Do the same in the FORE_NOLIGHT receiver list (line 262-263), so the brachioradialis isn't treated as forearm.
   - **Pass mark:** mean R-G of 0 or less (±3) on the forearm strips at f30 (345-380 x 232-245) and f55 (330-345 x 180-215).

2. **The fist tilt freezes for 48 frames and then turns a corner, at f21 and at f102.**
   - `render8.py:167` is `ROPE_TILT * clip((phi-45)/40, 0, 1)`. phi stays above 85° from about f103 to f21, so the tilt is a flat hold on the hands with a corner at each end. The rules ban exactly that ("no flat holds on ANY channel while the main joint still creeps").
   - **Fix:**
     - Replace the clip with a smoothstep that only saturates past the largest phi: `x = clip((phi-45)/63, 0, 1); ang = ROPE_TILT * x*x*(3-2x)`. That gives 13.9° at phi 107, about 9.7° at phi 86 and 0.4° at phi 50.
     - Then re-run GRIPDIAG on **every** frame of f0-30 and f95-129. If ROPEMONO back-steps at f15-25, raise the tilt cap to 15-16° rather than reinstating the clip.
     - Log the per-frame tilt. Pass: |second difference| ≤ 0.15°/f² on every frame, and no run of 3 or more frames with an identical value outside the top creep.

3. **The far strand at the bottom of the rep is a soft C-hook (f0, and by symmetry about f105-129).**
   - A cubic Bezier from the fist exit (tangent along the grip axis) to the clip (tangent along the cable) spreads a 107° turn over the whole strand.
   - ROPEMONO passes because the strand never runs backwards, but it still bows. A taut rope bends tightly at the fist edge (the 32 mm rule) and then runs **straight**.
   - **Fix (props.py `strand()`):**
     - Build each strand as a 32 mm-radius arc tangent to the exit direction, plus a straight tangent line from that arc to the clip (the circle-to-point tangent).
     - Keep the in-fist bend inside the fist edge, as now.
     - Add a check, `ROPESTRAIGHT`: past the end of the arc, the maximum distance of the centreline from the arc-end-to-clip chord must be ≤ 1.5 mm on every logged frame.
     - Re-run contact, because the straight run may come closer to the hypothenar at f0-15. The 14° tilt has room for that.
   - The same function drives the pushdown, so re-check its keys too.

4. **At the top key, the move's signature muscle doesn't read (f55).**
   - The glow pixel count falls from 2758 (f0) to 1070 (f55). At f55 the only red is the near biceps.
   - The diagonal strips in front of the biceps at native 330-345 x 180-215 are pink, not red. Either they're the brachioradialis, dimmed by the bloom-over-forearm mix-up (flaw 1), or the brachioradialis is turned away.
   - To a lifter, the top of a hammer curl with only the biceps lit reads as an ordinary curl.
   - **Fix:**
     - Run `PICKDIAG` on native (338, 195) and (335, 205) at f55.
     - If it hits the brachioradialis, flaw 1's fix should turn it red. Confirm at x6.
     - If it hits another forearm muscle, accept it, but check that the near brachioradialis belly shows red somewhere at f55 (any of native 320-360 x 170-230). If it's fully hidden, lift `cam_lift` by 3-4° for this move and re-check the f55 framing.

5. **The pulley still reads as a disc with a string (f30, native 515-560 x 500-550).**
   - Face-on, the near flange hides the groove. That's physically right, but nothing then shows the cable *passing through*.
   - **Fix:**
     - Move the carriage block back about 25 mm, so a short visible run of cable leaves the bottom of the wheel at 6 o'clock and enters the carriage.
     - Darken the rim ring to about 30% of the station value, about 25 grey levels below the face, so the wheel reads as a sheave.
     - Thicken the cable to r 4 mm and set its Specular IOR Level to 0.1 or less, so it reads as a dark coated line (at least 70 levels below the background), not silver. This also helps the pushdown.
   - Pass: at app size (x1/3) a viewer can follow the cable onto the wheel and into the carriage.

## Minor (do in the same pass, no re-judge needed)
- **Contact sampling:**
  - Log every frame of the bottom settle (f105-129) and f15-25, not just every 5th. Those frames are a hold and the tilt corner.
  - Re-run contact after fixes 2 and 3.
- **Hard-coded scene settings:**
  - `props.py` still defaults `ROPE_STRAND` to 0.27 and `ROPE_INSET` to 0.012, and `render8.py` has `ROPE_TILT` defaults of 10 (line 150) and 8 (line 167).
  - Put the rules' values in the code: 0.33, 0.006 for the hammer, and one default. Then a clip script that forgets an export can't silently render the old rope.
- **Flat holds:** `hammer.py` `breath` (54→65 at 0.15), `brace` (19→64 at 1.0) and `knee` (13→64 at 4.0) are flat. They're inherited from the approved curl and don't move the hands, so I accept them. But give `breath` a 0.02 creep so the chest isn't frozen at the top.
- **Rules typo:** figure-rules.md says "Other cable moves: about -38 (hammer: the motion's own -65 orbit)", but `hammer.py` uses -38. Correct the rule text.

## Accepted
- The braid doesn't read at 1x (a pixel limit).
- The figure is about 10% smaller than the curl's, to fit the station.
- The dorsal wrist cuff shows in the close-ups (lc f55/f70), the same limit as r15.
- The 1-px nick on the lower-left biceps edge at x6.

## Can the clip render go now?
**No.** Do fixes 1-3, which are an env line, one formula and the strand builder, plus 5. Then:
- check 4 with PICKDIAG;
- re-shoot f0/f30/f55, the close-ups and the x5 rope crops;
- re-run every-frame contact with ROPESTRAIGHT;
- re-run the colour sample on the forearm.

If those hold, render one clip, and I'll judge the motion, the tilt continuity and the loop seam on it.
