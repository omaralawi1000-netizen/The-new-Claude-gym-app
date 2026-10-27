# Barbell Curl r17: hands locked, and the top of the rep restored (fixes for judge r16)

The r16 verdict is in `../barbell-r16/judge-verdict.md`. This build is r15's motion with four changes. It is still `scene11f.blend`, rendered by the same pipeline, with `render8.py`, `pose.py` and `squash.py` in the scratchpad.

## Changes
1. **Hands locked at a shoulder-width grip.**
   - `LOCKW_SEP=190`: 190 mm per side, a 38 cm grip, down from r15's 50 cm at the bottom.
   - `ELBOW_MIX=0.8`: the elbow hinge is 80% r15's forearm axis and 20% level.
   - The per-frame width hold solves shoulder abduct from -6.5° at the bottom to +1.0° at the top, with a max step of 0.37°/f and a max change of step of 0.08°/f².
   - Result: the forearms keep r15's inward lean at the top (fix 1, option b, which the judge suggested), and the hands cannot slide.
   - Why not option (a): holding r15's top lean at the wide 50 cm grip needed 25° or more of elbow flare. At deep flexion the hand sits close to the shoulder's abduction axis, so abduction barely widens the hands.
2. **The forearm presses into the biceps instead of passing through it** (`squash.py`, fix 2).
   - Measured before: up to 1600 forearm-muscle points sat inside the biceps, 30 mm deep, at f60.
   - A geometry-nodes step after the armature pushes biceps and brachialis points out of the forearm's envelope.
     - The envelope is an elliptical, tapered capsule fitted to the forearm muscles (95th percentile, per tenth of the forearm).
     - Points move toward the humerus, the way flesh compresses onto bone. The first try pushed them radially, which wrapped a red ring round the forearm, so it was rejected.
   - It ramps in from 55° to 85° of elbow flexion, so straight-arm frames are untouched.
3. **No bloom over the forearm muscles** (`BLOOM_FORE`). It is the same object-index mask the bar and hands already use. The red haze on the forearm is gone.
4. **Clay core in the forearm** (`SQ_FILL=0.75`, from 0.12 to 0.72 along the forearm).
   - The forearm is separate muscles with gaps. Once the haze was gone, the biceps behind showed through the gaps as thin red lines.
   - A shrunken copy of the envelope, in the body's own Clay material, fills them.
   - At 0.85, or reaching the wrist, it poked out as a smooth band, so it was rejected.

## Proof
- **Slide** (`slide-r17.txt`, all 130 frames): the grip centre along the bar, off-axis and roll all have a **0.00 range** for both hands.
- **Grip** (`grip-contact.txt`, every 5th frame from 0 to 125, 208 checks): **0** hand-skin points inside the bar.
- **Clipcheck** (`clipcheck.txt`): no spikes. Loop seam 0.255 against a median of 1.103 (r15: 0.264 / 1.071).
- **Biceps visibility at the top**, red pixels on the near arm at f52/60/70:

  | Build | f52 | f60 | f70 |
  |---|---|---|---|
  | r15 | 497 | 399 | 522 |
  | r16 | 145 | 117 | 154 |
  | **r17** | **400** | **301** | **427** |

  r17 is about 80% of r15. r15's count includes red haze over the forearm, which r17 no longer has.
- `near-elbow-r15-vs-r17.jpg`: the near elbow at f52/60/70, 2x. `near-elbow-native-x3.png`: the same at native pixels x3.
- `hand-on-bar-strip.jpg`: the camera is locked on the right hand. The top row is r15 (it slides); the bottom row is r17 (locked).
- `r15-vs-r17-f0-f30.jpg`: the bottom and mid-lift, side by side.
- `curl-clip-r17.mp4` and `.webm`: the full clip. `r15-vs-r17-side-by-side.mp4`: side by side.

## Known, for the judge
- **The grip is narrower** (38 cm against 50 cm). At the bottom the upper arms now rest against the sides of the chest, like a normal shoulder-width curl.
  - My numeric arm-vs-trunk test is not trustworthy: it flags even approved r15.
  - Please check the bottom frames visually.
- **At native pixels, one faint thin line can remain at the forearm's edge next to the biceps** (near the elbow, f52/f70).
- `measure.txt` was not re-run. measure.py poses without the width-hold abduct, so its numbers would not describe this clip. Bar speed comes from the same elbow table as r15.
