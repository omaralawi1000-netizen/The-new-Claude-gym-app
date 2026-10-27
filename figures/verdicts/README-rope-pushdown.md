# Rope Pushdown, round 5 (fixes for judge round 4)

Round 4 files are in `round4/`; the verdict is `judge-verdict-r4.md`. Code: `../code-r6/`. Script: `rope22.sh`, which exports
nothing but `MOTION=pushdown`. Every log below covers **every frame** of the 130. Everything is self-checked, not judged.

## Must-fix 1: the far rope end floating at the hip
- **Your options A and B did not work.**
  - I measured them first (`far-end-trials-log.txt`): starting the split earlier, delaying the turn, or both still left 14-17 floating frames.
  - Option C alone (the far arm wider) still left 8-12, and so did bending the wrist or hiding the hand.
- **The cause:** seen from behind at -115, the end cap is the outer end of the grip. However the timing moves, the cap always clears the glute 3-5 frames before the fist does.
- **What works:** while the far fist passes the hip, it stays turned in and the arm sits a little wider. Both are far-arm-only channels in `pushdown.py`:
  - `twist_l` -55 deg, ramping f8-30 and f52-68, back out over f82-106.
  - `abduct_l` +10 deg around both crossings, dropping to +4 at lockout.
  - With the fist turned in, the rope end hangs below the fist instead of leading it.
  - It turns out with the near hand for the lockout. Every key has a small creep, so there are no flat holds.
  - This is the far arm only. The near arm is untouched, and the far hand is behind the body for most of the rep.
- **This needed a longer rope.** With 0.40 m strands the wider, turned-in far arm flattened the V: ROPEMONO 60-100 mm back-steps at f33-40 and f70-73.
  - **0.44 m** strands fix it. That is a 36-inch rope; my round-4 "0.40 = 36 inch" was short of it. The hammer stays at 0.33 m.
- **`far-end-log.txt`:** **0 floating frames.** The worst frame with the cap showing has 181 px of fist (f73).
- **What you see:** `pushdown-f036.png`, `pushdown-f072.png`, `far-and-near-arm-x2-f036-f072.png`, and in `pushdown-hands-closeups.jpg` the far hand at f36/f72.

## Must-fix 2: red
`colour-log.txt`: `GLOW_EMIT` is now **0.08**, the scene default and the same as the hammer.

| Source | Core | Lightness |
|---|---|---|
| Pushdown f0/20/36/48/72 | 221-224/46-48/30 | 0.541-0.543 |
| Hammer, passed (clip f30/f55) | 220-221/48/31 | 0.553 |
| Curl re-render f30 / f55 | 220/52/35, 220/45/29 | 0.543 / 0.533 |

- **Core R does not follow emission.** It stays at 222-225 from 0.075 to 0.085, while G and B move, so 0.085 never brought R down.
- **Against the curl:** R is +1..+4. G and B sit between the curl's two keys, which are 7 apart in G themselves.
  - Against f55: within 4 on every channel (R +1..+4, G +1..+3, B +1).
  - Against f30: G -4..-6 and B -5. So the ±4 mark holds against one curl key, not both. Flagged.
- **Against the hammer you passed:** within 4 on every channel (R is the widest gap).
- **Lightness:** within 0.01 of the curl's f30 and 0.010 of its f55.

## Must-fix 3: baked settings
- **Move file:** `motions/pushdown.py` has an `ENV` block with GLOW_EMIT 0.08, GLOW_OUTLINE 0.45, OUTLINE_T 0.4, TILT_SPAN 90 and the camera/prop settings. `hammer.py` has its own.
- **How it applies:** `render8.py` uses the block as defaults (a script export still wins).

## Every-frame logs
- **Contact (`contact-log.txt`):**
  - **Hands:** 0 hand-skin points inside the rope, worst clearance 0.3 mm.
  - **Rope shape:** ROPESTRAIGHT 0.0 mm, ROPEMONO 0.0 mm.
  - **Rope vs body and head:** 0 crossings, rope-to-body at least 5.9 mm, rope-to-head at least 132 mm.
  - **Clip height:** at least 155 mm above the exits (f67).
- **Tilt (`tilt-log.txt`):** max |2nd diff| 0.123 deg/f² (far) and 0.009 (near).
  - The turned-in far fist swings its rope line fast, which first gave 0.63.
  - Longer turn-in ramps plus TILT_SPAN 90 fixed it. The far fist's tilt peaks at -4.3 deg (was -7).
  - **Identical runs (0.0 deg) at f0-15, f98-129 (far) and f0-26, f78-129 (near):** the rope runs straight there (phi < 45), as you accepted last round.
- **Cable (`cable-log.txt`):** 1 tangent frame, **f25**, a 25 px run against the 24 px mark (the sweep past the shoulder line).
  - f24, f26 and f84 are no longer tangent.
  - This is the one you said to judge on the clip.
- **Framing (`framing-log.txt`):** the near fist is at least 53 px from the column.

## Files
- **Keys:** `pushdown-f000/020/036/048/072.png`, `pushdown-keys.jpg`, `pushdown-keys-appsize.jpg`, and `pushdown-f048-cam-65.png` (for Omar's comparison).
- **Hands:** `pushdown-hands-closeups.jpg` (both hands at f0/20/36/48/72, clip side and from above). `far-and-near-arm-x2-f036-f072.png` shows the far hip and the near triceps.
- **Logs:** `far-end-log.txt`, `far-end-trials-log.txt`, `contact-log.txt`, `tilt-log.txt`, `cable-log.txt`, `framing-log.txt`, `colour-log.txt`.

No clip yet.
