FAIL. Score: 8.0 / 10.

# Rope Triceps Pushdown, round 3: judge verdict

Round 3 fixes everything that blocked round 2:
- The rope is a taut inverted V at f0 and f20.
- The clip-height logs clear both marks by a wide margin.
- The pulley now reads as a pulley.
- The column is off the near fist.
- The framing is centred.
- Light linking is on.

At f0 and f20 this is the best rope figure so far. It still falls short of the curl's 9.0, because the hero muscle and the hero key are not right yet:
1. The "two heads" claim doesn't hold. The triceps is still one red shield at x6 and at 1x.
2. The red is not "about 3%" darker. It is about 10% darker in lightness, and visibly deeper than the curl's accent.
3. At lockout (f48) the cable runs straight into the near shoulder and the far stopper floats beside the hip. At app size, the lockout key reads as a string tied to his deltoid.

There is no clip yet, so motion was judged from `pushdown.py` and the per-frame logs only.

## What I checked
- `pushdown-f000/020/048.png` at native size, plus my own nearest-neighbour crops:
  - the near arm, rope and fist at f48, x4;
  - the cable at the near shoulder at f48, x5;
  - the pulley at f0, x5.
- Row scans across the near triceps at f48 (rows 205-250) to look for a groove.
- The glow colour (mean and core) against the hammer's biceps at the same glow settings.
- All 16 close-ups, `rope-x4`, `triceps-x6`, `near-wrist-x6`, `pulley-4x`, `camera-pair-65-vs-105.jpg` and the app-size strip.
- Logs: `contact-log.txt` (60 frames), `framing-log.txt` (65 frames).
- Code: `code-r4/rope8.sh`, `rope9.sh`, `pushdown.py`, `props.py` (pulley/boom, strand) and `render8.py` (glow facing/AO, tilt).

## The builder's claims, checked

| Claim | What I found | Verdict |
|---|---|---|
| Clip ≥ 12 cm above the exits at lockout, ≥ 18 cm above the fists at the top | Logged per frame. Above the exits: 163 mm at f48, worst 143 mm at f59-61. Above the fists: 281 mm at f0, peak 285 mm. | **True. Passes.** |
| ROPEMONO 0, worst 0.0 mm; 0 inside; 0 crossings; ≥ 5.9 mm to the body; ≥ 128 mm to the head | All 60 lines agree. TOTAL inside 0, ROPEMONO 0. | **True.** |
| Inverted V shows at f0/f20 | `rope-x4` and my crops: two straight strands, a crisp sleeve, and bends only at the fist edge. | **True. Fixed.** |
| At f48 the far cap shows outside the far thigh | True, and it's a problem: a lone dark stub sticks out of the left hip (native 322-335 x 345-358) with nothing attached to it. At app size it reads as a blob on the hip. | **True. Needs a fix** (flaw 3). |
| Near fist ≥ 39 px from the column; mid +10 px; top 33 px; base 41 px | CAMDIAG: worst 39 px at f96, mid 490 on every frame. Visually clean. | **True. Fixed.** |
| Pulley: rim ring, and the cable over the top and back under the boom | x5 f0: the cable climbs the left rim, crosses the top and runs under the boom into the carriage. It reads as a pulley at app size. | **True. Fixed.** |
| "Long head and lateral head now read as two bellies with a darker groove" | **Not in the pixels.** Row scans at f48 across the lit area (native 403-436): R holds at 221-228 the whole way. G dips once, by about 20 levels over 2 px (row 220, x ≈ 415), which is under 2% luminance. At x6 (`triceps-x6`) I see one inverted-teardrop shield with a straight top edge. At 1x and at app size, one red block. The bulge just lateral to the red (native about 437-450, rows 200-260) is unlit grey with a pink bloom tint, and needs identifying. | **False at 1x. Barely there at x6** (flaw 1). |
| "About 3% darker red than the curl" (flagged) | Same mask (R-G > 60) on the same render settings: hammer biceps f30 has mean 220/79/66 and core 229/64/46. Pushdown f48 has mean 211/59/47 and core 217/51/37. That is R -4%, G/B -25 to -29%, and HLS lightness 0.56 against 0.51, about **10% darker**. Side by side in an exercise list, the triceps reads as a different, deeper red. | **Understated** (flaw 2). |
| `FORE_NOLIGHT=1` in every script | True (rope8/9.sh). Here the forearm is below the triceps, so the missing `BLOOM_FORE` matters less than on the hammer. I saw no pink forearm at f20/f48. | **True.** |
| f0 near-wrist dark square gone at -105 | `near-wrist-x6`: no hole. The wrist step at the cuff is the accepted r15 limit. | **True.** |
| Contact test ran before the boom was added | Acceptable. The rope, cable and pulley geometry are identical, and the station is not a contact surface. | **Accepted.** |

## Camera: ship -105
**I'd ship -105**, as the earlier verdict and the builder both chose. From the pair:
- **Triceps:** this page teaches the triceps. At -105 both triceps show as full bellies on the backs of the arms. At -65 there is one narrow shield edge-on, and the far arm is hidden.
- **Elbow arc:** at -105 the arc still reads, about 15° past profile. At f20 the forearm, fist and V are clean against the background.
- **Lockout:** -65 shows lockout and elbows-at-sides a little more plainly, in pure profile. But at -65 the figure is a side silhouette with a red sliver, which the curl's standard would not accept for a triceps page.
- **Head:** turning the face away costs nothing, because the head is the egg.

The pick comes with one condition: fix the f48 cable tangency (flaw 3). Also bake -105 into `pushdown.py` `cam_orbit`. Today it lives only in the `CAM_ORBIT` env of rope8/9.sh, so a clip script without that export would render at -65.

## Must-fixes

1. **The triceps doesn't read as two heads (f20, f48).**
   - The global facing falloff plus a 3 cm AO is too soft for 30-px-wide muscles, and it darkened the whole glow (flaw 2).
   - **Fix:** draw the head boundaries explicitly.
     - Write a second AOV `gid` with a distinct value per glowing head (long, lateral, medial, from the object name).
     - In the compositor, run a Sobel/Filter edge on `gid`, threshold it, and multiply the glow and emission by about 0.7 along that 1-2 px line.
     - That gives a crisp groove between the long and lateral heads at 1x, with no overall darkening.
     - Drop `GLOW_AO` back to 0 and `GLOW_FACE_MIN` back to the curl's value.
   - **Also:** run `PICKDIAG` at f48 native (442, 225) and (444, 245). If that grey bulge is the lateral head, its `bt` band or its GLOW_RE match is wrong, and it must be lit. The rules say "the three triceps heads (lit t 0.12-0.75, the whole horseshoe)".
   - **Pass:** at f48, x1, a visible darker line runs between two red lobes, and at x6 the lateral and long heads each show their own outline.

2. **The accent red is about 10% darker and deeper than the curl's (all keys).**
   - **Fix:** after fix 1 removes the AO/facing darkening, re-measure with the same mask. The core must be within ±3 per channel of the curl and hammer core (about 229/64/46), and the mean lightness within 0.02.
   - If it's still low, raise `GLOW_EMIT` for this move. Don't change the shared glow colour.

3. **The lockout key (f48): the cable runs into the near deltoid, and the far stopper floats.**
   - **Cable:** in the x5 crop (native 400-490 x 60-200) the cable meets the deltoid silhouette at about (440, 180), disappears behind the arm, and comes out again under the triceps. At app size it reads as a string tied to his shoulder. It's a tangency between the prop and the hero muscle's outline, on the key that sells the move.
   - **Fix (cable):**
     - Add a CAMDIAG line: the cable's projected segment must clear the near arm and deltoid silhouette by 6 px or more, or else cross well inside it, never tangent. Check it on f36-70.
     - Fix it by trying `CAM_ORBIT` -100 and -110, and `cam_lift` +3°, and keep the fist-column gap of 25 px or more.
     - If no camera clears it, accept the cable crossing *behind the head-to-shoulder gap*. That reads naturally.
   - **Far stopper:** it pokes out of the left hip with no strand or fist attached to it. That stub reads as a stray object.
   - **Fix (stopper):** whichever camera fixes the cable, also check the far cap at f40-62. Either show the far fist (a little more far-arm abduction at lockout: `abduct` 7 → 8°, still a strict split), or hide the cap fully behind the hip. Never leave 10-15 px of it showing.

## Minor (same pass)
- **Flat holds:** `pushdown.py` `breath` (38→52 at 0.15) and `brace` (20→54 at 1.0) are flat while the elbow creeps into lockout (f44-60). Give each a small creep (breath 0.15 → 0.12, brace 1.0 → 0.97), per the rules.
- **Cable look:** the cable reads pale silver at native, not dark coated. Use the same fix as the hammer's flaw 5: r 4 mm and low specular.
- **Shared strand builder:** this move shares `strand()` with the hammer. If the hammer's arc-plus-tangent rebuild (hammer r4, flaw 3) goes in, re-shoot these keys and re-run this contact log on the new build. The pushdown strands are straight today, so it should be a no-op here.
- **Missing framing script:** `framing-log.txt` has no script in `code-r4` (the hammer's is in rope10.sh). Commit the CAMDIAG command line that produced it.

## Can the clip render go now?
**No, but it's close.** Do fixes 1-3. Then re-shoot:
- f0/f20/f48 at the chosen camera;
- one -65 f48 still for Omar's comparison;
- a triceps x6 crop at f20 and f48.

Also log the red colour sample and the cable-clearance CAMDIAG. If those land, render one clip.
