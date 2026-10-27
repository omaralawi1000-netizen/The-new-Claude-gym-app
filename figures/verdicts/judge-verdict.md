# Judge verdict clip12-body: FAIL, 8.6/10 (body motion 9.0, rope/pixel finish 8.2)

Body motion is the best thing in this clip and is nearly right. It fails only on the unfixed r14 leftovers (fleck, f80 blob, far-elbow fan) plus one new near-tangent: the cable grazes the chest.

## What I actually viewed
- Pose strip f0 / f58 / f104 at full frame and at x1.2 crop (figure only).
- Head and shoulder x4 sheet: f50, 54, 58, 62, 66, 70.
- Far hand x5: f23-28. Far strand and clip x4: f25, f26.
- Fleck crops x6: f39, 40, 41, 70, 72, 74, 76, 78, 80.
- Far-elbow wedge x5: f14, 18, 20, 22, 93, 96.
- NOT viewed as images: the other ~95 frames. Per-frame back-edge, head and cable-gap measurements were run on f0-129 (every 6th frame for the table, every frame for step size), plus the cable gap on f44-72. I cannot play the mp4 or webm. Keys/ not viewed.

## 1. Body motion
- Measured (960x640 frames, figure about 444 px tall, so a phone at 350 px is x0.79):
  - head forward shift f0 -> f58: 16 px (301 -> 317), about 12.6 px on the phone;
  - back and hip line moves back: 7 px at the lumbar, 10 px at the buttock, 2 px at the calf;
  - knees: about 7 px;
  - head top drops about 3-4 px;
  - feet: heel and toe pixels identical at f0, 58, 104 (261-321), so feet are planted with no slide;
  - f0 vs f104: back-edge, head and knee values match within 1 px, so the loop returns cleanly.
- Smoothness: back-edge x at 4 heights over all 130 frames has max step 1 px and max second difference 1 px. No pops, no jitter. Easing is slow and asymmetric, the right feel.
- Look at f58: reads as a real lifter. Slight forward hinge with hips back and soft knees, head follows the trunk, chest drops toward the rope. It no longer looks like a puppet with only arms working. The neck and shoulder are clean at x4 (no pinch, no stretched fibres, no shoulder collapse, no intersections) in f50-70.
- Visibility: 12 px head and 8-10 px hip on a phone is visible but calm. It reads on the phone, not exaggerated.
- RECOMMENDATION: stay, or go up a little. Do not go down. If you touch it, raise chest and head lean about +20 to 25% (head shift 16 -> about 20 px) and leave knees at 7-14 deg and the hips as they are. Not required for a pass. Do not raise it if that closes the cable gap below (the lean is what brings the chest to the cable).
- Hands stay on the rope. I saw no separation in f23-28 or f39-80.

### New problem: cable grazes the chest, f48-64
- Cable-to-chest outline gap measured per row: it falls to 2-4 px over rows y 260-300 (a run of about 40 px) at f48, 52, 56, 60 and 64. It is 3 px at f56 and f60, and 17-19 px by f68-72. Against the rulebook limit (6 px for more than 24 px) this is a pass-fail miss, and a phone viewer sees the line riding the pec edge for about 15 frames at lockout. The gate says tangent 0, longest 12 px, so its test misses this chest case.
- Head: clear (gap more than 25 px in every crop). Shoulder: clear.
- Cause: the forward lean moves the chest toward the cable.
- Fix, any one:
  - move the pulley and column 3-5 cm further out, HIGH_Y 0.44 -> 0.48 (lockout cable then clears by about 8-10 px);
  - or shift the camera 3 deg (cam_orbit -115 -> -118);
  - or cut chest lean only at f46-66 by about 1 deg.
  - Then re-run CABLEDIAG with the chest rows included.

## 2. r14 leftovers (none fixed, all still visible)
1. MUST-FIX fleck: a lattice of white pixels about 6x8 px on the rope at the near-fist junction is clearly visible at f40, 41, 70, 72, 74 and 76. At x6 it looks like a small checkered patch. It is on screen about 20 frames per rep. Same fix as before: in holefill3.py, median-3x3 or no-paint in box (322-340, 344-360) for f38-42 and f68-80, and turn off the gap-end dimming there.
2. MUST-FIX blob at f80: a pale light-grey rounded patch about 8x6 px sits on the rope between the near hand and fingers, brighter than the rope, reads as a hole or a highlight. Source is the fill. Same fix, or dim it to the local rope tone.
3. Far-elbow dark fan: still there at f18, 20 and 22 (a dark wedge behind the far forearm, pointing down-right, strongest at f22 at about 10x14 px). f14 and f96 are clean, f93 is a smaller trace. Fix: raise far elbow bend about 10 deg more over f10-26 and f86-102, or `UNDER_ARM_IN` 0.020 on the far side. The fan is a grey dead surface, which Omar's rule forbids.
4. Far strand darker and flatter than near: still true at f25-26. Raise its base colour 8-10% and its bump.
5. Nice to have: the knob is a short dome cylinder.

## Gate RED item: far fist at f23-28
- I viewed f23-28 at x5, plus f25 and f26 wide at x4. The far hand sits below and behind the near hand, the strands run into it, the white clip cap sits on top of the strands directly under the cable. It does not float and does not flicker across f23-28. I agree with the previous judge: false alarm for the eye.
- Override the FARDIAG rule for f23-26 (visible 128-141 vs 150). Do not change the render for it.

## Scores
Stills / body motion 9.0, rope and pixel finish 8.2, cable clearance miss -0.3. Overall 8.6. PASS needs 9+.

## To pass (in order)
1. Remove the fleck and the f80 blob (one fix in the pixel stage, the same two windows).
2. Fix the cable-chest graze at f48-64 (HIGH_Y 0.48 or equivalent) and re-check at x4.
3. Hide the far-elbow fan (more far elbow bend f10-26 / f86-102).
4. Leave body motion as is (or +20% on head/chest lean only). Do not touch the feet.
Then re-look at x8 strips of f38-42, f68-82, f16-24 and a cable-gap measure at f44-70.
