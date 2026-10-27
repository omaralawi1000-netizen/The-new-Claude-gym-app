# Barbell Curl r18: fixes for judge r17

The r17 verdict is in `../barbell-r17/judge-verdict.md` (FAIL 7.5). r18 is r17's pose and motion, unchanged (same `ELBOW_MIX=0.8`, `LOCKW_SEP=190`). Only the rendering, the clay core and the proofs changed. Settings are in `code/clip21.sh`.

## Flaw 1: aliased edge where the forearm meets the biceps
- **Cause:** the bloom mask came from the object-index pass, which is not anti-aliased.
- **Fix** (`MASK_AOV`, default on): the mask now comes from a shader AOV, a per-object value written by every material.
  - Cycles filters an AOV like the image itself, so the mask edge is anti-aliased by construction. It is not a blur or a 2x trick.
  - The same mask still covers the bar, plates and hands.
- **Proof:** `near-elbow-native-x8-r17-vs-r18.png`, native pixels x8 (nearest-neighbour), r17 against r18 at f40/44/52/60/70/76/80. The staircase of pink pixels along the boundary is gone, and the edge now grades over 1-2 px.

## Flaw 2: pink speckle and red lines in the forearm on the ramp frames
There were two causes. Both are measured, not guessed.
1. **The glowing biceps lit the forearm red.**
   - The Glow material is emissive, so it is also a light. The forearm crevices facing it picked up red light, and that was the pink lines.
   - **Fix** (`FORE_NOLIGHT=1`): Cycles light linking. The glow objects no longer light the 44 forearm-muscle objects or the clay core. Everything else still gets the glow's light, exactly as before.
   - **Proof:** `glow-light-test-x8.png`.
2. **The core did not reach the elbow.** `SQ_FILL_T0` went from 0.12 to 0.03, so the core now runs from 0.03 to 0.72 along the forearm.

**Squash start: kept at 55°.** I did not move it to 38°.
- `forearm-overlap-no-squash.txt` measures forearm points inside the biceps with the squash off.
- Overlap starts growing at f34-36, which is 74-80° of elbow flexion. With the ramp at 55-85°, the squash is already at 93% at 80°, so it was not late.
- `squash-start-38-vs-55-x8.png` (r18b, ramp from 38°) looks the same at x8 as the 55° build. So I kept the smaller change.

**The core is always on.** It is built at setup, before f0, and follows the forearm on every frame regardless of the squash strength. That was already true in r17. It is internal Clay and does not show when the arm is straight.

## Flaw 3: far arm tucked into the trunk
New signed test (`TRUNKDIAG` in `render8.py`):
- It checks each biceps, brachialis, triceps and deltoid vertex against each trunk mesh **separately**: latissimus, serratus anterior, pec major (all three parts) and external oblique.
- A point counts as inside only if the nearest-face normal AND a ray-parity count both say inside.
- Points within 10 cm of the shoulder joint are skipped.

**Result** (`arm-trunk-hand-thigh-r18.txt`, every frame f0-20 and f110-129):
- About 650-670 points are inside per arm, at most 17-22 mm deep, mostly the triceps and biceps against the latissimus.
- **This is not 0. Approved r15 is not 0 either** (`arm-trunk-baseline-r15-vs-r18.txt`): 293 points at f0, deepest 16.4 mm.
  - This is Z-Anatomy's layered muscles overlapping at the axilla. The triceps long head runs under the lat tendon, and no soft-body solver flattens them.
  - What r18 adds (about 290 against 88 points) sits 15-28 cm down the arm, where the 38 cm grip lays the upper arm against the lat. It is on the far side of the arm from this camera. The deepest point is **21.6 mm** (near arm, f120-121), against r15's 16.4 mm. On the other frames it is 15.8-17.1 mm.

**Wider grip, tried** (`grip-width-test.txt`, `grip-190-vs-200.png`):

| Half-width | Points inside at f0 | Bottom abduct | Top abduct |
|---|---|---|---|
| 190 mm | 668 | -6.5° | +1.0° |
| 200 mm | 589 | -5.5° | +6.8° |
| 205 mm | 533 | | +8.0°, hits the cap |

- At 200 mm the elbows visibly flare out at the top (f60 in the picture), so the f52/60/70 tops no longer match.
- Per your rule, I kept the 38 cm grip and recorded the trade-off in figure-rules.md.

## Flaw 5: hands against the thighs
Hand skin (palm, dorsum, both digit surfaces) against rectus femoris, the vasti, the adductors, gracilis, sartorius, TFL and pectineus (same file):
- **0 inside on every frame f0-20 and f110-129.**
- Nearest point: 28-39 mm (dorsum against rectus femoris), from f0-4 and f121-129. On the other frames nothing is within 40 mm.

## Flaw 4: far-chest speckle
Not targeted separately. The far side gets the same AOV mask. Please look at f44-76 on the far axilla.

## The same numbers as r17
- **Slide** (`slide-r18.txt`, 130 frames): grip centre, off-axis and roll all have a **0.00 range** for both hands.
- **Grip** (`grip-contact.txt`, every 5th frame, 208 checks): **0** hand-skin points inside the bar.
- **Clipcheck:** no spikes. Seam 0.255 against a median of 1.101 (r17: 0.255 / 1.103).
- **Biceps red pixels on the near arm at f52/60/70:** r18 408 / 304 / 434, r17 400 / 301 / 427, r15 497 / 399 / 522.

## Files
- `curl-clip-r18.mp4` and `.webm`: 130 f, 960x640.
- `r15-vs-r18-side-by-side.mp4`: live r15 on the left.
- Frames f114-129 were rendered after a container restart, resumed from the same settings. Clipcheck shows no step at f113 to f114.
