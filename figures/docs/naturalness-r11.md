# Curl r11: hands + naturalness pass (14 Oct 2026)

Omar 04:22 "take a look at the hands"; 04:25 "check how natural everything is".

## Hands (handfix.py: scene8.blend -> scene9.blend; pose.py THUMB_OPP default 0)
- Flap at the thumb root: the thumb metacarpal's opposition swing (38°+30°) folded the dorsum/wrist skin. Opposition off; the
  thumb still flexes along the bar.
- Wrist "cuff": the forearm muscles got +18% girth (buff build), the wrist/hand SKIN patches did not, so tendons poked
  through and patch edges crumpled. SKIN patches now get the same girth field.
- Bandage look: hand skin used fibre-striped clay (bump 0.3). Now smooth skin (ClaySoft, bump 0.05).
- Tried and rejected: hiding the wrist skin (stringy tendons + gaps); subdividing the skin patches (seams opened between patches).
- Left: a small light facet at the thumb base at the bottom of the rep, and a faint ring where wrist skin meets the hand.

## Motion (motions/curl.py r11 vs r10)
| | r10 | r11 | why |
|---|---|---|---|
| shoulder set (scap) | re-set 0.35→1.0 in 5 frames every rep | stays set 0.85–1.0 | a lifter sets shoulders once per set; the re-set read as a twitch at the loop start |
| breathing | two breaths per rep | one: out through the lift, hold at the squeeze, in on the lowering | two per 3.7 s ≈ 32 breaths/min, panting |
| lean back (total) | ~10° | ~8° | 10° started to read as cheating |
| side sway | ±1.2 cm | ±0.9 cm | strict curls barely sway |
| knees on the lowering | 4→11° | 4→9° | a settle, not a dip |
| grip, wrist, elbow drift 6°, head stab, tempo 1.1 s up / 0.5 s squeeze / 1.7 s down | kept | kept | already natural |

Measured (static clip camera): head 9.4 px, shoulders 7.7–8.8 px (r10 10–12), max shoulder accel 0.044 (r10 0.18 = the twitch),
knees ≤0.21 px/frame. Trade-off: shoulder travel is now under the r9 judge's 10–15 px ask, chosen for natural over visible.

## Fast mode
16 samples + OIDN + persistent data: ~22 s/frame (r10 48 samples: 61 s). Stills f0/f41/f85 match within ~1.8 levels on the
figure; fine fibres a touch softer at 2x zoom (fast-s16-vs-r10.jpg).

## Neck (Omar 04:31: "from the neck to the head it's just attached to the body")
- Cause: the mannequin head's neck was a smooth matte tube (head material, no fibres), about 11 cm wide, on a fibrous body:
  a material break at the collar, and too thin for the build.
- Fix (handfix.py): the neck carries the body clay + fibres (running up the neck), fading to the smooth head between z 1.47
  and 1.525 (jaw); the neck is +16% wider and +6% deeper between z 1.42 and 1.535, so it flows into the traps.
- First try widened up to the ears: it fattened the lower face (bell shape). Kept below the jaw.
- Head lag (pose2.py HEAD_LAG=4): neck and head counter the trunk's lean 4 frames late (60/40 split), so the head is carried.
- Before/after: neck-before-after.jpg; hands: hands-before-after.jpg.
