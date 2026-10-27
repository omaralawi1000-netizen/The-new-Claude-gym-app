FAIL. Score: 8.5 / 10.

# Rope Triceps Pushdown, round 4: judge verdict

Round 4 fixes the hero muscle and the red:
- The triceps now reads as two heads at native size.
- The glow lightness matches the curl.
- At f48 the cable no longer grazes the deltoid.
- The rope, the contact and the pulley are clean.

It still falls short of 9.0 for one reason. **The round-3 far-stopper must-fix said "never leave 10-15 px of it showing".**
The thread's own FARDIAG log shows the far cap visible with no fist, or almost none, for about 8 frames of every loop: f34-38 and f70-76. That is the same floating stub as round 3, moved off the key frame and into the motion. It blocks.

There is no clip yet, so I judged motion from the per-frame logs only.

## What I verified myself
- **Keys:** `pushdown-f000/020/048.png` at native size, plus the app-size strip and the -65/-105/-115 comparison.
- **My own nearest-neighbour crops** (in this folder):
  - `judge-r4-hands-rope-x6.png`: the f0 near fist and V, and both fists at f48.
  - `judge-r4-triceps-cable-f048-x6.png`: the triceps at x6, and the cable at the near shoulder at x5.
  - `judge-r4-pulley-f000-x8.png`: the pulley at f0.
- **Triceps row scan (f48, rows 215-245, x 400-445):** along the head border, R dips about 15 levels and G about 25-30 levels over 2 px, a local luma dip of about 17%.
  - In round 3 the same scan showed R flat and one 20-level G dip.
  - At x6 the near triceps shows the lateral and long heads as separate lobes, and the far triceps shows two lobes.
- **Red:** I re-ran `redm.py` on the keys and on f30/f55 frames I extracted myself from the shipped `curl-clip-r18.mp4`.

| Source | Lightness | Core |
|---|---|---|
| Pushdown f0/20/48 | 0.551-0.555 | 224-227/49-51/31-33 |
| Curl f30 / f55 | 0.547 / 0.532 | 217/51/38, 214/46/34 |
| Round 3 | 0.506 | — |

  - Lightness is within 0.008 of the curl's f30 and 0.023 of its f55.
  - Core G and B match.
  - **Core R is 7-10 above the curl, against the r3 pass mark of ±3 per channel.** It is a slightly hotter red. Side by side in a list it is barely visible, but it is measurable.
- **Tilt:** I re-ran `tiltcheck.py`.
  - Max |2nd diff| is 0.017. **But** it also reports identical runs at f12-14 and f93-100 (0.0 deg), which the README left out.
  - The tilt there is 0 because the rope runs straight (phi < 45). Nothing is frozen while it should move, so I accept it. Report it next time.
- **Logs:**
  - Contact: 90 frames, 0 inside, ROPESTRAIGHT 0.0, ROPEMONO 0.0, 0 crossings. The clip is at least 192 mm above the exits at f59. This matches the README.
  - Cable: TANGENT at f24, f26 and f84 only. In f28-80 the cable is hidden inside the figure outline for 53-117 px and its visible near-outline runs are 1-11 px.
  - Far-end: FLOATING at f34, 36, 38, 70, 72, 74 and 76.
- **Code (`code-r5`):**
  - `pushdown.py`: `cam_orbit` -115 is baked in. The abduct keys are 2/10/11/12/10/2 at f20/36/48/60/76/100. `breath` 0.15 → 0.12 and `brace` 1.0 → 0.97 creep as specified.
  - `props.py:254`: strand 0.40 for `rope_high`.
  - `props.py:135`: `COL_HIGH_Y` 1.3.
  - `render8.py:88-89`: `GLOW_EMIT`, and `:310-333` the outline compositor.
  - `GLOW_EMIT=0.09` and `GLOW_OUTLINE` exist **only** in the `rope19.sh` env.
- **Close-ups:** I read all 16 panels of `pushdown-hands-closeups.jpg` (p12_*).
  - The fingers wrap the rope on every panel.
  - The ends sit in the fists.
  - No skin passes through the rope.

## Round-3 must-fixes, checked

| # | Must-fix | Finding | Verdict |
|---|---|---|---|
| 1 | Triceps doesn't read as two heads | The per-head outline is real (row scan and x6). At f48 x1 a darker line separates two red lobes on the near arm. `GLOW_FACE_MIN`/AO were dropped. | **Fixed.** |
| 2 | Red about 10% darker | Lightness now 0.551-0.555, against 0.506 in r3. Core R is still 7-10 above the curl. | **Lightness fixed. The ±3 core mark is missed on R** (must-fix 2, small). |
| 3a | Cable into the near deltoid at f48 | At -115 the cable lands steeply on the trapezius slope, about 15 px out from the neck, and vanishes behind the body. It doesn't run along the deltoid outline. It reads as a crossing, not a string tied to the shoulder. The -105 versus -115 crop agrees. | **Fixed on the key.** Tangent frames f24, f26 and f84 remain (thread flag 2): see below. |
| 3b | Far stopper floats | At f48 the far fist visibly holds the end on the hip (291 px of fist). **But f34-38 and f70-76 are FLOATING** (cap 9-86 px with fist 0-116 px; f34 has 41 px of cap and 0 px of fist, f74 has 33 px and 0 px). | **Not fixed. It moved off the key into the motion** (must-fix 1). |
| Minor | Flat holds, cable look, shared strand builder, framing script | All done, and verified in the code and the logs. | **Done.** |

## The thread's four flags
1. *(Hammer flag, not this move.)*
2. **Cable tangent at f24, f26 and f84. Does not block the stills.**
   - It is a 26-38 px graze for about 2-3 rendered frames each way, while the clip sweeps past the shoulder line. It's a crossing in motion.
   - It's the first thing I'll check in the clip. If it reads as the cable sliding along the deltoid edge, shift the shoulder line or the `cam_pan` by 1-2 px' worth there.
3. **The far cap leads or trails the fist at f34-38 and f70-76. This blocks.** See must-fix 1.
4. **At -115 the elbow arc reads about 10 deg less in profile than at -105. Accepted.**
   - At app size f0 (fist at the chest, forearm forward) against f48 (arms straight down at the thighs) still reads plainly as a pushdown.
   - Both triceps face the camera, and -115 is the only orbit that clears the deltoid. I accept -115 over my round-3 -105 pick.
   - The cost: from behind, the far forearm and fist are hidden from f0 to f32, so the top of the rep reads one-handed. That is physically correct and acceptable.

## Must-fixes
1. **The far end cap floats in motion (f34-38 on the push, f70-76 on the return; far/left hip, native about 290-335 x 335-360).**
   - The cap swings out past the hip 2-3 frames before the fist does, and lingers 3-4 frames after the fist goes behind the hip. In a loop that is a dark stub popping out of his hip twice per rep.
   - **Fix:** make the cap trail the fist, not lead it.
     - Option A: bring the split earlier relative to the turn. Start `abduct` rising at about f16 and reach 10 deg by f32 (now 2 at f20 → 10 at f36), and hold the return at 10 until about f80. Then the fist clears the hip before the twist swings the cap out.
     - Option B: delay the `twist` turn-out by about 4 frames on the push and bring it back about 4 frames earlier on the return.
     - Option C: blend either one with a little more trunk-side abduction on the far arm only.
   - **Pass:** FARDIAG on **every** frame (not every 2nd) shows 0 FLOATING frames, with the cap hidden or the fist at 150 px or more.
   - Then re-run GRIPDIAG on f20-84 every frame, because the split timing changes the V.
2. **Core red R is 7-10 above the curl (all keys).**
   - **Fix:** try `GLOW_EMIT` 0.085. Lightness will come down toward the curl's (it is currently on the high side, 0.551-0.555 against 0.532-0.547). Re-run `redm.py` against the curl reference.
   - **Pass:** core within ±4 per channel and lightness within 0.02 of both curl keys. I've relaxed the mark by 1 for the codec difference between my MP4-extracted curl and a re-render.
3. **Bake the move's glow settings (records).**
   - `GLOW_EMIT=0.09` and `GLOW_OUTLINE=0.45 OUTLINE_T=0.4` live only in shell env (`rope19.sh`). A clip script that forgets them renders the r3-dark, one-shield triceps.
   - **Fix:** put them in `pushdown.py` (and the outline in `hammer.py`) as per-move defaults, the way `cam_orbit` now is.

## Nice-to-haves
- **f48 at app size:** from behind, the near strand comes out from behind the waist outline and runs diagonally to the near fist. At app size it can read like a stick across his lower back.
  - It's correct occlusion (the V is in front of him), but if the clip shows it, 1-2 deg more `cam_lift` would lift the eye line and show a little of the apex below the glutes.
- **Contact sampling:** the log covers odd frames only in f30-80. Log every frame of f20-30 and f80-100 too: those are the split ramps.
- **f24-26 / f84:** see flag 2. Judge it on the clip.

## Taken from the thread, not re-run (no Blender in my container)
- The CABLEDIAG, FARDIAG, GRIPDIAG and CAMDIAG logs. I parsed them and they are internally consistent, but I couldn't regenerate them.
- The camera trials (-95 to -125, the lifts, the pulley offsets) in `camera-trials-log.txt`. I only checked the -105 and -115 stills.
- PICKDIAG: that (442,225)/(444,245) is the biceps long head.
- That 0.33 m strands can't span a split over about 8 deg.

## Can the clip render go now?
**No.** Fix the far-cap timing (must-fix 1), with FARDIAG on every frame, and bring core R in line (must-fix 2). Then re-shoot f0, f20, f36, f48 and f72, and the hands at f36 and f72. If FARDIAG reads 0 FLOATING, render one clip. I'll judge the f24-26/f84 cable sweep, the cap timing and the seam on it.
