# Figure rules: what the barbell curl taught us

Every exercise figure copies these rules. The curl is the reference (Omar, 14 Oct: "I want the figure to be the best
here, so you have the rules for everyone"). Movement groups are listed in [patterns.md](patterns.md). Scripts are in `source/`.

## Look
- MoveKit-style écorché: a grey clay muscle body with a smooth mannequin head. The working muscles glow red (GLOW_STRENGTH 16,
  GLOW_SIZE 0.95, HALO_R 0.03, HALO_K 12). The background is light grey.
- Use one material family. Body muscles use the fibre clay. Hand skin is smooth (ClaySkin, bump 0.05), never striped like a bandage.
  The neck carries the body fibres, which fade out along the chin-to-skull-base line (not at a level collar).
- Known limit: the head is still the egg. If Omar wants it, a real skull, jaw and ears would be a separate step.

## Build chain (do not rebuild what is approved)
- base -> rig.py -> scene.py (r7 look, LOCKED) -> bodyrig.py (full-body rig) -> handfix.py (hands, wrists) -> neck6.py.
  The current build is `scene11f.blend`.
- Weights are smooth fields of REST position, so every overlapping layer bends the same and nothing splits.
- Wrist: the forearm-to-hand blend runs from -35 mm to +8 mm around the wrist, and the wrist skin edge is tucked under the
  tendons (WT_IN 0.0008; deeper made a visible band).
- Neck (neck6.py):
  - trap flare from the skull base to the shoulders;
  - SCM ridges along the real SCM muscle path (scm.json);
  - a jugular notch hollow;
  - a soft step under the jaw;
  - back of the neck filled so the skull flows into it.
- Hide deep muscles that only ever poke through the skin (the 25 neck ones). Never sink the skin so far that bones show.
- Never subdivide the skin patches (it opens seams). Never hide the wrist skin (it shows stringy tendons).

## Grip (any bar, dumbbell or handle)
- Solve the grip against the real hand skin (hm/solve.py, mkgrip.py) with the prop's own radius. Never use fixed finger angles.
- The bar sits deep in the palm across the finger roots. Each finger joint closes until the skin touches the bar.
  The thumb wraps the other side and meets the index finger.
  - For the barbell curl: s 0.008, thumb 25,0,20,85.
- The bar is locked to the hand every frame and never slides. Each hand turns at the wrist to follow the bar line.
  Keep that turn at 11° or less by using the mean target axis.
- Check: GRIPDIAG=1 must show 0 skin points inside the bar at frames 0/20/41/70/100.
  Then render gripshots.sh close-ups: each hand, from the clip view and from below, at the bottom and top of the rep.

## Motion
- The whole body moves, not just the arms:
  - breath (one per rep: out on the lift, in on the lowering);
  - brace and scap set;
  - small lean-back (about 8° total, more reads as cheating);
  - hips forward a touch;
  - knees soft (4-9°, never locked);
  - slow side sway (0.9 cm) with a counter-tilt.
- The head stays level and lags the trunk by 4 frames (HEAD_LAG).
- Lean order: pelvis, then lumbar, then chest, a couple of frames apart. Nothing moves in lockstep.
- TIMING (r13, from Omar's MoveKit reference, traced frame by frame):
  - No dead stops. Cosine keys with flat holds read as a machine.
  - Ease into the end position and creep there (about 17 of 112 frames at the top), then ease out.
  - Lower about 1.1x as long as the lift.
  - Turn softly at the bottom, with no hold.
  - Author the main joint as a traced or smoothed per-frame table: pose2 `('table', [...])`, smoothed with sigma 3 frames.
- TEMPO (r15, Omar 13:30): "I want to learn from the motion... but still fast enough". Use about 4.3 s per rep, 130 frames:
  - lift about 1.5 s, peak bar speed 8-9 px/f or less (r14's 1.3 s lift still read rushed);
  - squeeze about 0.5 s, with a small extra squeeze (+3°) just before leaving the top;
  - lower a touch slower than the lift, about 1.6 s;
  - settle at the bottom for about 0.5 s, easing to full length with no dead stop.
  - To retime, warp the old timing smoothly (make_r14.py) and map EVERY body key through the same warp.
- Loop: every channel must wrap seamlessly. Check the loop seam with clipcheck.
- New exercises: trace a reference (bar or handle height to joint angle) the same way when one exists.

## Camera
- Fixed 3/4 clip camera (clipref), 960x640. No camera drift: it read as wobble.

## Render
- Fast mode: 16 samples, OIDN denoise, adaptive 0.02, PERSIST=1, about 24 s per frame, about 45 min per clip.
- It matches 48 samples within about 2 levels.
- Encode:
  - mp4: x264, crf 20, faststart;
  - webm: VP9, crf 36;
  - poster: jpg of f000.
- App: `public/figures/<id>.{webm,mp4,jpg}` plus the `CLIPS` map in Clip.tsx. Credit Z-Anatomy (CC BY-SA 4.0) in Settings.

## Checks before anyone sees it
1. Stills first, fix, then ONE clip render. Never spend a full render on something already rejected.
2. Run measure.py (landmark px travel and accel; bar R included) and clipcheck.py (no pops, loop seam close to the median step).
3. Close-ups of hands (gripshots) and neck (neck4.sh: clip view, front, side, back, top of rep) on the final build.
4. A harsh judge passes it, then Omar sees it on a watch page that plays inside Claude.
   The page is built with `/mnt/project-files/tools/clip-page.py`, shows old vs new, and has slow motion.
5. Ship only on Omar's yes.

## Props other than the barbell (learned on batch 1, 14 Oct)
- CONTACT TEST is the real one: posed hand skin against the BUILT prop mesh (BVH, face-normal sign), every 5th frame
  plus the whole top. Pass = 0 skin points inside on every frame. Rope also: 0 rope points inside the body and arm hulls.
  (`GRIPDIAG=1` in render8.py prints `EZGRIP ... TOTAL`.) A test that measures the bar against where we put the bar is circular.
- Rigid props held in two hands (EZ bar, straight-bar cable): level elbow hinge (`ELBOW_AXIS=level`, default when PROP is not
  barbell) and solve the abduction each frame so the grip width stays exactly the frame-0 width. The forearm-based hinge
  brings the hands 17 cm together at the top and puts the bar through the palms.
- Fit the prop to the hand: the straight grip section spans the whole hand (thumb to pinky, -54.3..+45.2 mm on the grip axis)
  plus a margin, so no finger sits on a bend. Bends at a real radius (EZ: 45 mm), never crimped.
- Wrist roll toward the prop goes into the forearm twist (foretw bone, scene12.blend), not the wrist joint.
- Rope: neutral grip; the stoppers sit on the side of the fist AWAY from the pulley (the cable pulls the rope toward it).
  Low pulley (rope curls): rope leaves the PINKY side, knobs over the thumbs. High pulley (pushdowns): rope leaves the
  THUMB side, knobs under the pinkies.
- Rope look (judge round 1, "reads as a metal pipe"): charcoal braided rope (three-strand bump, pitch 25 mm), matte black
  rubber stoppers (rounded cylinder 44 mm, r 21 mm, chamfer, domed end), steel clip with an eye, dark coated cable.
  Strand 0.33 m exit-to-clip since round 4 (was 0.27, first 0.38). Bends on 32 mm; a turn over ~45 deg starts bending
  up to 20 mm inside the fist edge so it hugs the fist (more puts the rope into the little finger).
- Rope contact test: unsigned distance from the rope CENTRELINE (every 5 mm: strands, wraps, stoppers, clip, cable) to
  every visible muscle, skin and the head >= that part's radius, and no centreline segment crossing a surface. Every 5th
  frame plus every frame of the holds. Plus hand skin and same-side muscles vs the rope mesh (signed, its normals are clean).
- Cable station recedes (StationMat, lighter and matte than the clay), wheel r 63 mm in an open fork with a darker rim ring.
  High pulley 0.44 m in front of the feet (`HIGH_Y=0.44`) at 1.80 m, so the pushdown rope hangs as an inverted V at lockout.
- Pushdown camera: cam_orbit **-115** in `pushdown.py` (rear three-quarter: both triceps show as full bellies; judge r3 picked
  -105, but there the lockout cable ran along the near deltoid's outline at every orbit from -95 to -110 and with +3 deg lift;
  at -115 it drops cleanly behind the neck-shoulder gap, the judge's own fallback). The column stands 1.3 m out (`COL_HIGH_Y`,
  now the default) with the pulley on a lat-tower boom, so the pole clears the near fist (>= 25 px every frame, `CAMDIAG=1`).
  Other cable moves: about -38 (the hammer's own orbit in `hammer.py` is -38).
- Cable moves: turn the camera (cam_orbit about -38°) so the column stands beside him, and the studio turns with it.
- GLOW = the movers of THAT exercise (render8.py GLOW_RE by MOTION, anchored regex: 'Brachialis' must not catch
  Coracobrachialis): curl and EZ biceps; hammer biceps + brachialis + brachioradialis (lit over its belly, u 0-0.55);
  pushdown the three triceps heads (lit t 0.12-0.75, the whole horseshoe). Each glowing muscle needs a `bt` band (render8 builds it).
- **Rope round 4 rules (judge, 19 Oct):**
  - A rope under a cable's pull is TAUT: it never runs back toward the hands. `ROPEMONO` (in `GRIPDIAG`) projects each
    strand from the fist exit to the clip onto the clip-to-pulley line; pass = 0 violations (> 1 mm back-step) on every
    frame tested. Heel handle scales with the turn, fan 0.15, fist tilt up to 8 deg (hammer 14 deg with in-fist bend 6 mm: the bottom turn is ~107 deg).
  - Strand 0.33 m exit-to-clip (0.27 put the clip level with the fists at lockout). Pushdown: clip >= 12 cm above the
    rope exits at lockout and >= 18 cm above the fists at the top (logged per frame).
  - The pulley must read: cable on the rim (`ROPE_RG` 1 mm), wrapping round and on into the carriage or boom.
  - `FORE_NOLIGHT=1` for every move with a glow (not just the curl).
  - Centre the figure + station: midpoint within +-20 px of x = 480 (`CAM_PAN`, metres sideways), checked by `CAMDIAG`,
    which also prints the pulley/head top margin (>= 15 px) and base margin.
  - The upper-arm clay under-layer can poke through in front of the biceps at full flexion (a grey stepped sliver):
    `UNDER_ARM_IN=0.014` pulls it 14 mm toward the humerus (0.006 left a small tick; no holes at 0.014). Find such things with `PICKDIAG` (rays through a pixel).
  - (Superseded in round 5: the facing/AO triceps glow darkened the red about 10%. See round 5 below.)
- **Rope round 5 rules (19 Oct, after judge r4/r3):**
  - Strands are a 32 mm arc at the fist edge plus a STRAIGHT line to the sleeve mouth (`strand()` in props.py).
    `ROPESTRAIGHT` (in `GRIPDIAG`): centreline <= 1.5 mm from the arc-end-to-sleeve chord on every frame.
  - The clip solve takes the FARTHEST clip position along the cable whose strands reach (scan down, then bisect).
  - Strand length per prop: hammer 0.33 m, pushdown 0.40 m. A wide lockout split cannot be spanned by 0.33 m strands; the V
    goes flat.
  - Fist tilt: smoothstep over phi 45..108 deg times a soft-saturated sign term `g(1.5-0.5g²)`. Check every frame with
    `TILTDIAG=1` + `tiltcheck.py`: |2nd diff| <= 0.15 deg/f², no 3 identical values.
  - Glow on a mover with several heads or muscles: `GLOW_OUTLINE=0.45 OUTLINE_T=0.4`, a per-muscle id AOV and a Sobel line,
    so heads read apart. Use it for the pushdown and the hammer. Never use facing/AO shading for this: it darkened the red
    about 10%.
  - Red must match across moves: run `redm.py` on the new keys AND a fresh render of the approved curl. Lightness must be
    within 0.02. Use `GLOW_EMIT` per move if needed (pushdown 0.09), never the shared colour.
  - `BLOOM_FORE=1` for every move with forearm muscles in front of the glow. Movers (GLOW_RE) are never occluders or light
    receivers. Check the forearm with `forearm.py`, which splits pixels by PICKDIAG.
  - Prop vs hero outline: `CABLEDIAG=1`. No visible cable within 6 px of the figure outline for more than 24 px on key frames.
    Pushdown camera -115 (cable behind the neck-shoulder gap) with the column 1.3 m out.
  - Loose prop ends: `FARDIAG=1`. A visible end cap needs its fist visible (>= 150 px) or must be fully hidden. Pushdown
    split 2/10/11/12/10/2 deg at f20/36/48/60/76/100.
  - Diagnostics run at module level in render8.py must not reuse globals that set_frame/set_cam read (`loc`, `tgt`).
    A ray hit stored in `loc` moved the camera from frame 2 on. Wrap them in a function.
  - Upper-arm under-layer: `UNDER_ARM_IN=0.014`, plus `UNDER_FORE_IN` 4 mm just past the elbow (the hammer f0 speck).
- **Rope round 6 rules (19 Oct, after judge r5/r4):**
  - Each move's render settings live in its motion file (`ENV` dict, applied by render8 as defaults). Clip scripts export only `MOTION`.
  - Every log (contact, tilt, far end, cable, framing) runs on EVERY frame of the clip build before the clip is judged.
  - Rope clip solve = the farthest root (the cable pulls the clip toward the pulley). Any key rendered before 19 Oct 15:00 used
    the old bisection (shorter hammer V); re-render keys from the clip build.
  - Tilt smoothstep span must exceed the move's largest phi (hammer `TILT_SPAN` 66, pushdown 90): no saturated holds.
  - Pushdown far end: split timing cannot hide a leading cap (the cap is the outer end of the grip from -115). The far arm
    turns in (`twist_l` -55) and sits wider (`abduct_l` +10, +4 at lockout) while its fist passes the hip; strands 0.44 m
    (36-inch rope) so the V spans it. Check ROPEMONO after any far-arm change: a flat V shows as back-steps of 20-100 mm.
- No flat holds on ANY channel while the main joint still creeps (cosine keys (40,x),(54,x) freeze the hands): creep instead.

## Ship bar and hand lock (Omar, 18 Oct)
- Omar (18 Oct 21:09): "I need them to be very polished." The curl's quality is the MINIMUM. A move that can't reach it does not ship, overhead moves included.
- Every figure gets a harsh judge pass before Omar sees it, with zoomed checks of hand on prop, joints and the turnarounds.
- **Hands never slide on a rigid prop.** Omar caught it on the live r15 barbell curl: each hand slid about 8 cm along the bar over the rep.
  - Cause: a forearm-axis elbow hinge brings the hands together, and the bar was only centred between them.
  - Rule: rigid bars (barbell, EZ, any straight handle) use the level elbow hinge (`ELBOW_AXIS=level`) plus the per-frame width hold (`LOCKW`, an abduct bisection in render8 set_frame).
  - Proof every time: `SLIDEDIAG=1` prints each hand's grip centre and roll in the bar's own frame. The range must be 0.00 mm along the bar.

## Glow and overlap rules (barbell r18, 19 Oct)
- **Bloom masks must be anti-aliased.** Build them from a shader AOV (`MASK_AOV`, the default in render8), never from the object-index pass. The index pass cut a stair-stepped edge.
- **The glow must not light what passes in front of it.** The Glow material is a light too. Use light linking to exclude the forearm muscles and the clay core from it (`FORE_NOLIGHT=1`), or crevices pick up pink lines.
- **Arm against trunk check:** `TRUNKDIAG=1` is signed and per mesh (nearest normal AND ray parity).
  - Z-Anatomy's layered muscles always overlap at the axilla. Approved r15 has 293 points at f0, 16 mm deep.
  - Pass mark (set by the judge, 19 Oct): deepest point ≤22 mm, and nothing visible in a native x4 crop of every flagged frame.
- **Known trade-off on the barbell curl:** the 38 cm grip (`LOCKW_SEP=190`) lays the far upper arm against the lat (about 290 more points, 15-28 cm down the arm, on the side the camera doesn't see). The far biceps reads narrower at f0-15. A wider hold (200 mm or more) flares the elbows at the top, so 190 stays.
- **Hands vs thighs:** `TRUNKDIAG` also checks hand skin against the quads and adductors. It must read 0 inside. The barbell is 28 mm clear.

## Rope round 7 rules (hammer clip 2, pushdown clip 1, 20 Oct)
- **Props must not sit on an outline.** A cap, knob or cable either sits ≥4 px inside the body outline or ≥6 px clear of it, on every held frame (`CAPDIAG`, `CABLEDIAG`). A crossing in transit (1-5 frames at speed) is allowed but always flagged to the judge.
- **No tiny mover slivers.** A 1-3 px piece of a red mover reads pink. `SLIVERDIAG=1` (2x2 rays per pixel, `SLV_BOX`, `SLV_NAMES`, `SLV_MIN` 8 px) finds visible far-arm mover pieces under 8 px. Fix by moving the far arm (`elbow_l` etc.), and re-check rope tilt after: a fast side ramp pushed tilt 2nd diff to 0.187 (limit 0.15). Ramp over ≥20 frames.
- **No background pinholes in hands.** `speckscan.py` (luma > 120 blobs ≤16 px with a pixel > 150, cut off from open background) on every frame of the clip build. Hidden fillers fix tunnels and seams: `FIST_SEPTUM=1` (palm-rope discs, gap ≤4 mm, 0.7x) and `WRIST_CORE=1` (forearm tube, 0.8x). `holefill.py` (2-D paint-in of exactly those blobs in one box) only as a last resort, and always disclosed.
- **Side channels:** pose2 adds `elbow_<s>`, `wrist_<s>`, `grip_<s>` offsets next to `twist_<s>` and `abduct_<s>`.

## Rope realism rules (Omar 20 Oct: "That's not how a rope works", with 3 real rope hammer curl videos)
- **Stand at the pulley.** In every real clip (Jay Cutler, Buff Dudes, James Harrison) the lifter stands right at the low pulley. The cable runs almost straight down from the clip to the floor, and the rope hangs from the fists. Our hammer had the pulley about 70 cm in front, so the V stuck out forward like a stiff handle. That is wrong.
- **The V hangs, it doesn't point.** At the top, both strands drop from the bottom of the fists, close together and almost vertical, to a clip well below the hands. At the bottom of the rep the rope hangs below the fists in front of the thighs.
- **Knobs:** low pulley (hammer curl) = knobs on the THUMB side (they stop the rope sliding down through the fist; Jay's top frame shows them over the fists). High pulley (pushdown) = knobs on the PINKY side.
- **Taut cable, soft rope:** the cable is one straight line from clip to wheel. The rope bends round the fist edge and then runs straight under load. It never reads as a rigid bar or frame.
- **Judge check:** compare a side view of the bottom, the middle and the top against a real reference frame. Check where the pulley is relative to the toes, the cable angle, and the V shape. Outline and speck checks alone missed this (round 7 passed it at 9.1).
- **Fists close together (rope hammer, r8):** at the bottom the fists sit close together in front of the thighs, not hip-width apart at the sides. With the hands apart, the 33 cm strands go flat across like a bar.
- **No machine behind the fists:** if the column would sit right behind the fists on the lift, keep it back and bring the wheel forward on a short floor arm (hammer r8: wheel 22 cm past the toes, column 72 cm out).

## Rope round 8 rules (pinholes)
- **Speck test = judge r7's:** 8-connected luma > 200, at most 16 px, a dark pixel within 2 px, every frame, box round both hands (`speck2h.py`). Confirm each hit is background with ray masks (`POCKETDIAG`, `bgspeck.py`), not a lit highlight.
- **Fill only what never grows:** a pocket that comes and goes on its own gets filled on every frame it appears (`holefill3.py`), so nothing flickers.
- **Gap ends get dimmed, not filled:** the last frames of a gap that closes (or the first frames of one that opens) are dimmed 60 % instead. A full fill makes the gap pop out a frame early.
- **Always check in sequence:** show raw against final in frame order (x3 strips). Never judge a fill on single frames.
