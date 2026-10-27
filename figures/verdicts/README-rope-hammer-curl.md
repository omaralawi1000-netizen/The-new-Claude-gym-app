# Rope Hammer Curl, round 5 (fixes for judge round 4)

Round 4 files are in `round4/`; the verdict is `judge-verdict-r4.md`. Code: `../code-r5/`. Logs: `rope15.sh` (contact,
framing), `TILTDIAG` (tilt), `rope18.sh`/`rope20.sh` (keys `hm18k`, close-ups). Everything below is self-checked, not judged.

## Flaw 1: bloom over the forearm
- **`BLOOM_FORE=1`:** it is now in every hammer script.
- **Movers excluded:** the BLOOM_FORE and FORE_NOLIGHT regexes skip any glowing muscle
  (`and not _re.search(GLOW_RE, ...)`), so the brachioradialis keeps its bloom.
- **`colour-log.txt` (forearm.py)** splits each of your boxes by what each pixel actually shows (PICKDIAG ray maps):
  - **f55 box:** R-G **+0.6** (was +8.5). Pass.
  - **f30 box:**
    - Taken as a whole it reads +11.0 (was +14.4). But 60 of its 455 px are the lit tip of the brachioradialis itself
      (+50, red by design).
    - The other 395 px read **+5.1**: the 1-2 px soft edge next to that glowing tip.
    - Further than 2 px from it they read **+2.4**, inside your ±3.
    - Neutral clay in the same frame reads -4.2.
    - So the f30 box passes only once the mover's own pixels and its edge are excluded. Flagged.
- **What you see:** `forearm-x6-f030-f055-r4-vs-r5.png` (your boxes in blue). The pink haze over the forearm strips is gone.

## Flaw 2: tilt frozen with corners
- **New formula:** your smoothstep, `x = clip((phi-45)/63, 0, 1); ang = 14 x²(3-2x)`.
- **The sign term was a second corner.** The sign term (share x 2) was hard-clipped at ±1 and made a corner of its own where
  |share| reaches 0.5 (0.23 deg/f² at f24 and f98). It is now soft-saturated: `g(1.5 - 0.5 g²)`, which has zero slope at ±1.
- **`tilt-log.txt`, every frame of 130:**
  - Max |2nd diff| is **0.123 deg/f²** (right) and **0.120** (left), against a pass of 0.15.
  - **No run of 3 identical values.** At the bottom the tilt creeps from -13.95 to -13.99 deg, because the elbow itself
    creeps there.
- **Code default:** ROPE_TILT has one default per prop in `render8.py` (hammer 14, pushdown 8). Old line-150/167 duplicates
  are gone; ROPE_INSET defaults to 0.006 for the hammer, and ROPE_STRAND to 0.33.

## Flaw 3: the f0 C-hook
- **New `strand()` in props.py:** each strand is a 32 mm arc tangent to the grip axis at the exit, then the straight tangent
  line to the sleeve mouth (12 mm below the clip), then a short blend inside the sleeve.
- **New check, `ROPESTRAIGHT`:** after the arc, how far the centreline strays from the chord.
- **`contact-log.txt`:** 96 frames, every frame of f0-30, f48-70 and f95-129, every 5th elsewhere.
  - **Straightness:** ROPESTRAIGHT worst **0.00 mm** (it is straight by construction; the check guards it).
  - **Pull:** ROPEMONO 0 violations, worst back-step 0.5 mm.
  - **Hands:** **0** hand-skin points inside the rope, worst clearance 0.3 mm.
  - **Rope vs body and head:** 0 crossings, rope-to-body at least 2.1 mm, rope-to-head at least 171 mm.
- **Clip solve:** it now takes the farthest clip position along the cable (a pushdown fix). I compared the hammer at
  f0/20/30/55/100: the clip heights are identical, so this log stands.
- **What you see:** `rope-x4-f000-f030-f055.png`. At f0 the far strand bends tightly at the fist, then runs straight to the
  sleeve.

## Flaw 4: brachioradialis at the top key
- **Your picks at f55:** (338,195) hits the clay under-layer over extensor pollicis longus; the strips around it are ECRB,
  extensor digitorum and ECU. None is the brachioradialis, so they stay clay.
- **Where the brachioradialis is:** a PICK grid over 320-360 x 170-230 finds it as a strip along the lower edge of the biceps
  (x 310-342). Those pixels are red (mean 219/71/57).
- **The catch:** it touched the biceps red, so the two read as one patch.
- **Fix:** the same per-muscle outline as the pushdown triceps (`GLOW_OUTLINE=0.45`). A thin darker line now separates the
  brachioradialis, brachialis and both biceps heads.
- **What you see:** `glow-x4-no-outline-vs-outline.png` (top row without the outline, bottom row with). At f55 the
  brachioradialis is its own lobe along the forearm. No camera lift was needed.

## Flaw 5: pulley
- **Carriage:** it sits 4 cm further back (`COL_LOW_Y` 0.84), so the cable leaves the wheel bottom and runs into it.
- **Rim ring:** 30% of the station value.
- **Cable:** r 4 mm, matte (Specular IOR Level 0.05).
- **Darkness:** native, the cable is 101-115 grey against a 238 background (123-137 levels darker; your target was 70).
- **At app size (x1/3):** the cable can be followed onto the wheel rim. The run into the carriage is only about 1 px there.
- **What you see:** `pulley-x5-f030-r4-vs-r5-and-appsize.png` (round 4, round 5, and app size x4).
- **Framing after the station moved** (`framing-log.txt`, every frame): the near fist is at least 155 px from the column, the
  midpoint +4..+7 px, the top margin 45 px, the base margin 23 px.

## Minor
- **Breath:** `breath` creeps 0.15 → 0.13 over the top hold (f54-65).
- **Rules typo:** fixed in figure-rules.md (the hammer's own orbit is -38).
- **New, the elbow speck:** a light 3x3 px speck sat on the brachioradialis at f0. The clay under-layer poked 0.4 mm in front
  of it just past the elbow, outside the `UNDER_ARM_IN` range. `UNDER_FORE_IN` (4 mm, t -0.25..0.1) pulls it in, and the speck
  is gone (`elbow-speck-x4-before-after.png`, at f0 and f55; no new holes).
- **Red:** with the outline it matches the curl and the pushdown, all three within 0.02 of each other in lightness
  (`colour-log.txt`).

## Files
- **Keys:** `hammer-keys.jpg`, `hammer-f000/030/055.png`, `hammer-keys-appsize.jpg`.
- **Close-ups:** `hammer-hands-closeups.jpg`, both hands at f0/30/55/70, clip side and from below.
- **Crops:** `rope-x4-...`, `forearm-x6-...`, `glow-x4-...`, `pulley-x5-...`, `elbow-speck-...`.
- **Logs:** `contact-log.txt`, `tilt-log.txt`, `framing-log.txt`, `colour-log.txt`.

No clip yet.
