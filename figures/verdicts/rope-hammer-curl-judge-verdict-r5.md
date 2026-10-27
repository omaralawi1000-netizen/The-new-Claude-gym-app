PASS (stills). Score: 9.0 / 10.

# Rope Hammer Curl, round 5: judge verdict

All five round-4 must-fixes went in, and I checked each one in the pixels or the code myself. The stills now sit at the
approved curl's level (barbell r18, 9.0):
- The forearm is clay.
- The rope is a taut V on every key.
- The fist tilt is continuous.
- The brachioradialis is lit where it should be.
- The pulley reads as a sheave.
- The red matches the curl.

This pass is for the stills only. There is no clip, so I couldn't judge motion, the tilt continuity in playback or the loop
seam. **The clip render can go now.** The move ships only if the clip also holds 9.0.

## What I verified myself
- **Keys:** `hammer-f000/030/055.png` at native size, and the app-size strip.
- **My own nearest-neighbour crops** (in this folder):
  - `judge-r5-hands-rope-x6.png`: both hands and the rope at f0, f30 and f55, x6.
  - `judge-r5-forearm-f030-r4-vs-r5-x8.png`: the f30 forearm in r4 against r5 (x8), plus the f55 near arm (x7).
  - `judge-r5-pulley-f030-x8.png`: the pulley at f30, x8.
- **Pixel diff r4 → r5:** all three keys changed (about 30k px each, within the figure and station area), so these are new renders, not reused files.
- **Forearm colour, measured on the PNGs:** f30 box (345-380 x 232-245) reads +11.0, down from +14.4. The f55 box (330-345 x 180-215) reads +0.6, down from +8.5.
- **Forearm, per-row R-G map of the f30 box:**
  - All the positive values sit in rows 232-236, on the diagonal lit edge of the brachioradialis, where they run 35-129.
  - Rows 237-245 read -5 to +3, the same as neutral clay. In r4 the same rows read +11 to +27.
- **Red:** I re-ran `redm.py` on the keys and on f30/f55 frames I extracted myself from the shipped `curl-clip-r18.mp4` (full-chroma decode).

| Source | Lightness | Core |
|---|---|---|
| Curl | 0.547 / 0.532 | 217/51/38, 214/46/34 |
| Hammer | 0.544-0.554 | 220-222/47-49/31-32 |

  Lightness is within 0.02 of the curl's f30, and the core is within about 3-6 of it. That passes, and it matches the thread's
  own table against its re-rendered curl.
- **Tilt:** I re-ran `tiltcheck.py` on `tilt-log.txt`. Both sides have 130 frames, max |2nd diff| 0.123 / 0.120 deg/f², and no
  identical runs. **Pass.**
- **Contact:** I parsed `contact-log.txt` myself.
  - 96 frames.
  - 0 hand-skin points inside the rope.
  - ROPESTRAIGHT 0.0 mm, ROPEMONO worst 0.5 mm, 0 crossings.
  - Frames missing from the sample: f31-47 (except 35, 40, 45) and f71-94 (except every 5th). This is as the README states.
- **Pulley grey levels at f30:**
  - Cable: 105-134 against a background of 236.
  - Wheel face: about 175.
  - Rim ring: dips to 138-150, about 25-35 levels below the face.
  - Cable reaches the rim at about 9 o'clock and a dark run leaves the bottom into the carriage.
- **Code (`code-r5`):**
  - `render8.py:262-263`: the BLOOM_FORE regex has `and not _re.search(GLOW_RE, …)`, and so does the FORE_NOLIGHT receiver list (`:265-266`).
  - `render8.py:169-170`: the smoothstep `x²(3-2x)` over (phi-45)/63, and the soft-saturated sign `g(1.5-0.5g²)`.
  - `render8.py:100`: one ROPE_TILT default per prop (14 / 8).
  - `props.py:284-316`: `strand()` is an arc, then a straight line to the sleeve mouth, then a sleeve blend. Note line 302: when the target is inside the wrap circle it tightens R below 32 mm, which is fine.
  - `props.py:254`: strand 0.33 for the hammer.
  - `props.py:130`: `COL_LOW_Y` 0.84.
  - `props.py:383-385`: the cable is matte, spec 0.05.
  - `render8.py:393`: `UNDER_FORE_IN` defaults to 4 mm.
  - `hammer.py`: `breath` creeps 0.15 → 0.13.
- **Close-ups:** I read all 16 panels of `hammer-hands-closeups.jpg` (h12_*, the round-5 rope20.sh build).
  - The fingers wrap the rope on every panel.
  - No rope passes through skin.
  - The bend sits at the fist edge.

## Round-4 must-fixes, checked

| # | Must-fix | Finding | Verdict |
|---|---|---|---|
| 1 | Bloom paints the forearm pink | Code fix present. f55 box +0.6. f30 box +11.0 overall, but my row map shows all of the excess sits on the brachioradialis's own lit edge (rows 232-236). The forearm proper reads like clay. In the x8 crop the pink wash over the forearm strips is gone. | **Fixed.** The thread's flag 1 does **not** block: the residue is the mover itself, red by design. |
| 2 | Tilt frozen with corners | Formula as specified. Every-frame log passes 0.15 with no identical runs. The top tilt is now +1.9 deg (was +5.1), because of the soft sign saturation, which is acceptable. | **Fixed.** |
| 3 | f0 C-hook | f0 x6: the far strand leaves the fist along the grip axis, turns through one tight arc of about 5 px, then runs dead straight to the sleeve. The near strand makes a tight U under the fist, then runs straight. f30 and f55 are straight as well. ROPESTRAIGHT 0.0. | **Fixed.** |
| 4 | Brachioradialis at the top key | f55 x7: a separate red lobe runs below the biceps (the lower wedge), cut off by the outline. The extensors crossing in front of it stay grey, which is anatomically right. f30: the near brachioradialis lights the top edge of the forearm over its proximal 2/3 and stops where the tendon starts. That's correct, and the far one lights too. | **Fixed** to the r4 pass mark. At 1x the f55 red still reads mainly as "biceps" (see nice-to-have 2). |
| 5 | Pulley a disc with a string | See the grey levels above. At app size the cable can be followed onto the wheel. The run into the carriage is about 1 px there, and visible at native. | **Fixed.** |
| Minor | Contact sampling every frame f15-25 and f105-129; scene defaults; breath creep; rules typo | All done (the log header and code lines above). | **Done.** |

## Must-fixes
None block the stills. These are **conditions for the clip render**:
1. **Commit the key-render script (records).**
   - The README says the keys are `hm18k`, rendered with `GLOW_OUTLINE`, and the outline is visible in the PNGs.
   - But no script in `code-r5` renders `hm18k`. `rope18.sh` renders `hm16k` with no outline.
   - Only `rope20.sh` (the close-ups) carries the final env: `BLOOM_FORE=1 GLOW_OUTLINE=0.45 OUTLINE_T=0.4`.
   - **Fix:** commit the script, and build the clip script from the rope20.sh `HM` line. A clip without `GLOW_OUTLINE` loses the brachioradialis/biceps separation, and one without `BLOOM_FORE` brings the pink forearm back.
2. **Contact on the fast frames (f31-47 and f71-94).**
   - These are logged only every 5th frame. They are the fastest arc and the frames where the strand sweeps past the far forearm (at f55 it crosses in front of it in projection).
   - **Fix:** run GRIPDIAG on every frame for the clip, plus TILTDIAG on the clip build.

## Nice-to-haves
1. **The f55 near cap sits on the collarbone (native about 350, 125).**
   - In projection the dark end cap overlaps the clavicle and neck outline. At 1x it reads as "resting on his collarbone".
   - Contact says the rope clears the body, so this is a read, not a clip.
   - If the clip shows it touching on f50-65, add about 1 deg of `abduct` at the top or lower `shoulder` by 0.3 deg.
2. **Signature muscle at app size.**
   - At f55, x1, the brachioradialis lobe and the biceps still merge into one red patch, and only the 1-2 px outline separates them.
   - Optional: raise `GLOW_OUTLINE` to 0.55 for the hammer only, then re-check the red lightness.
3. **Rim ring.** It is about 30 levels below the face at native, and at app size it is faint. That is fine for a background prop.

## Taken from the thread, not re-run (no Blender in my container)
- PICKDIAG identities:
  - which pixels are the brachioradialis versus extensor pollicis longus, ECRB and ECU;
  - the 60 mover pixels in the f30 box.
  My row map agrees with the split, but I didn't re-run it.
- The contact, tilt, framing and colour logs themselves. I parsed and re-checked them, but couldn't regenerate them.
- The claim that the clip-solve change ("farthest clip") leaves the hammer's clip heights unchanged at f0/20/30/55/100.
- The elbow-speck fix (`elbow-speck-x4-before-after.png`). I saw no speck at f0 or f55 in my own crops.

## Can the clip render go now?
**Yes.** Render it with the rope20.sh env, plus every-frame GRIPDIAG and TILTDIAG. I'll judge the motion, the tilt in playback, the
strand sweep past the far forearm, and the loop seam on the clip.
