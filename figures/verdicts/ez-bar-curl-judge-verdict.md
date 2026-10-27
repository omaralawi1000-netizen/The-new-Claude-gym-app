# EZ-bar Curl pilot (batch 1): judge verdict

**Verdict: FIX FIRST. Do not render the clip yet.**

The body, look, light, camera and motion are unchanged from r15, which is good. The forearm twist is clean: there is no pinch and no candy-wrapper. The bottom-of-rep grip is as good as the approved r12/r15 grip. But the hand-to-bar contact at the top hold is not proven, and in one close-up it is visibly wrong. The README's "GRIPDIAG 0 inside" claim does not test the EZ bar at all (see item 1). Hands are the one thing Omar has failed twice. So nothing goes to a 45-minute clip render until the bar is checked against the real bar mesh and the right hand at the top is clean.

What I looked at: README, figure-rules.md, ez-vs-r15-keys.jpg, ez-hands-closeups.jpg (every panel at full size and 3x), ez-forearm-twist.jpg, ez-f000/030/055.png at 4x next to r15 frames 0/30/55 (taken from curl-clip-r15.mp4), and grip-r12-closeups.jpg as the approved grip reference. I made app-size crops at 0.4x (about a 384 CSS-px stage) and read props.py, twist.py and render8.py.

---

## Must fix before the clip

### 1. GRIPDIAG does not test the EZ bar (render8.py lines 194-205), so "0 inside" proves nothing
- **What is wrong:** with `PROP=ez`, the check measures each hand's skin against an *infinite straight line* through that hand's own grip centre, along that hand's own grip axis (`pose.GRIP[side]['c'/'a']`). It never reads the `EZBar` mesh, so it cannot see:
  - the fillets and bends;
  - the connectors;
  - any mismatch between where the bar is and where the hand thinks it is.

  It is circular: the grip was solved against that same line. The tell-tale is that "closest 13.8 mm from a 13.5 mm bar" is exactly the r12 straight-bar figure.
- **Frames:** it only ran at f0 and f60. figure-rules.md asks for 0/20/41/70/100, and the top hold (about f50-72) was not covered.
- **Fix:**
  - Test the evaluated skin (Palm, digits, Dorsum, plus the thumb/thenar objects) against the actual `EZBar` mesh. Use a BVHTree from the evaluated EZBar: find the nearest point, then take the sign from the face normal, or use a ray-parity inside test.
  - Report the count inside and the minimum clearance per hand.
  - Run it at 0/20/41/55/60/70/100 and at every frame of the top hold (50-72).
  - Pass = 0 inside on every frame.

### 2. f55 (top hold), right hand (screen left), clip view: the bar runs into the back of the hand
- **Where:** ez-hands-closeups.jpg, bottom-left panel.
- **What is wrong:**
  - The outer bar comes in from the plate side and passes **in front of** the lateral dorsum: hand skin shows above and below it.
  - It then ends in a pointed, cone-shaped cut on the back of the hand near the index knuckle. That is the shape a cylinder leaves when it intersects a surface. It is not occlusion.
  - No thumb is visible wrapping it.
  - In r15/r12 at the same frame, the bar crosses the hand cleanly and the fingers close over it.
- **At native 960:** the bar slopes down into the back of the right hand with the fingers standing up in front, so it reads as "bar stuck into the hand" rather than "bar in the fist". This is the same class of failure as the earlier "bar through the fingers" round, and it sits in the most-held part of the rep, from the clip camera's side.
- **Fix:** once item 1's real test runs, find which part of the bar is inside the hand: the grip segment, the outer fillet, or a roll mismatch between the bar's bend plane and the palm. Then:
  - if the hand's grip axis or centre does not lie on the built segment at the top, rebuild the bar per frame from the posed hands or re-solve the wrist correction against the built segment, not against the target vector;
  - if the cause is the thumb or web, close the thumb with mkgrip against the real bar at the top pose.

  Re-render this exact close-up and confirm the bar disappears *behind* the hand at its lateral edge, with the thumb wrapped.

### 3. Both hands, inner bend: the little finger sits on the start of the bend
- **Where:**
  - from below at f0, both hands (ez-hands-closeups top row, columns 2 and 4);
  - clip view f0 at 4x: a Z-step right at the little-finger edge of both fists;
  - f30 at 4x, screen-left hand: a sharp V right at the little finger.
- **Cause:** `make_ez` centres the 130 mm grip segment on `c`, which is the circle through the **middle finger** joints, not the centre of the hand.
  - From the middle finger, the little-finger edge is roughly 45-50 mm away and the index edge about 25-30 mm.
  - The inner fillet tangent starts 53 mm from `c` (65 mm minus the 11.9 mm fillet tangent).
  - That leaves about 0-8 mm of straight bar under the little finger. On a real EZ bar the whole hand sits on the straight angled section.
- **Fix:**
  - Measure each hand's skin extent along its grip axis (the min/max of `t` in the GRIPDIAG loop).
  - Build the straight section to cover [t_min - 12 mm, t_max + 12 mm], which means offsetting the segment centre about 10-12 mm toward the little finger.
  - Lengthen `seg` to about 0.15-0.16.

### 4. Bend radius: the bends read as crimps
- **Where:** f0 and f30 at 4x, and the from-below close-ups.
- **What is wrong:** the 22 mm fillet on a 27 mm bar gives tight, pipe-kink bends. At app size (0.4x) on f0 they read as two small glitches next to the hands, not as a W. Real EZ bends are long and smooth (centreline radius about 40-60 mm).
- **Fix:** fillet radius 0.040-0.050, together with item 3's longer segment so the straight grip still clears the hand. Smooth S-curves also make the W read more clearly at app size.

### After 1-4
- Re-render:
  - the three key stills;
  - the gripshots, at f0, f30, f55 and f70, each hand, clip view and from below. Add the mid-rep f30 close-up, which is missing today and is where the W shows most.
- Then hand them back for judging. Only then render one clip.

---

## Should fix (in the same pass, low cost)

### 5. Put the roll part of the wrist correction into the twist bone
- The wrist correction is 7.5° at the bottom and 10.2° at the top, which is within the 11° rule. But it is a free `rotation_difference` at the wrist.
- Any part of it about the forearm's long axis is pronation or supination happening *at the wrist*, which a real wrist cannot do. It is also what creases the wrist skin.
- The fix: log the WRISTCORR axis (it is already printed).
  - Project the correction onto the forearm axis.
  - Add that angle to `foretw` (for example 22° to about 26-30° if it is consistent, or per frame).
  - Leave only flexion and deviation at the wrist.
- With a twist bone now in the rig, the hand should not twist at the wrist.

### 6. The W reads weakly in the poster frame
- At app size, f0 (the poster per figure-rules) reads as a near-straight bar with smaller plates. The EZ identity only reads clearly at mid-rep (f30), and moderately at the top.
- Items 3 and 4 help.
- If it still does not read, ask Omar whether EZ-type clips may use a mid-lift frame (about f25-30) as the poster. That is a rules change, so it is Omar's call, not the pipeline's.

---

## Passed / accepted

- **Forearm twist (ez-forearm-twist.jpg):** no pinch, no candy-wrapper, and no flattening at mid-forearm. The bottom-pose silhouette and muscle forms match r15. DQS plus the 0.05 to 0.95 ramp is the right model: the radius rolls over the ulna with most of the turn at the wrist. The turn-in itself is subtle at app size, which is fine and honest.
- **Bottom-of-rep grip (f0):** both hands from the clip view and from below are fists closed round the bar, the thumb wraps over and meets the index finger, and the knuckles and fingers wrap as well as r12/r15, apart from the little-finger and bend contact in item 3.
- **Top-of-rep left hand (screen right):** fingers close over the bar, and the bar exits behind the hand on the plate side. Clean.
- **Wrist-skin edge from below (f55 bottom row, columns 2 and 4):** an open cuff with tendon gaps and a few skin tags. I compared it side by side with grip-r12-closeups.jpg and it is the same level as the approved r12/r15, not worse. It is not visible from the clip camera. The small dark wrist notch in the clip view (screen-left wrist, f0) is also present in r15. Accepted as the known limit; nothing new here.
- **Dorsum/digit seam on the back of the hand at the top:** the same as r12. Not new. Long-term polish only.
- **Plates, 34 cm vs 40 cm:** accepted. They match a real EZ load (iron 10-15 kg plates are about 30-38 cm), the shorter bar and plates are correct for an EZ (about 120 cm overall), and the plate tops still frame the head at the top. The sleeve stubs past the collars look a little long next to the smaller plates. That is cosmetic only and optional: trim the sleeve from 0.26 to about 0.20.
- **Anatomy of the grip angle:** the direction is correct. The hands are semi-supinated: the thumb side turns forward/out at the bottom, the little-finger side turns back toward the body, and the inner bends dip back with the centre section forward. That is a real EZ W. 22° is a plausible, slightly shallow camber; real bars run about 20-30° on the outer grip. The forearm turn equals the handle angle and the wrist stays near neutral, which is the point of the bar. Keep 22°. Two caveats are anatomical as well as visual: the hand must sit wholly on the straight angled section (item 3), and no pronation at the wrist (item 5).
- **Body, motion, look and camera:** identical to r15 at f0/30/55. Nothing is worse than r15 anywhere except the hand contact issues in items 2-3.

## Can the clip render go ahead now?

**No.** Fix items 1-4 (5 is strongly recommended in the same pass), re-render the stills and gripshots including f30 and f70, and get a re-judge. Then render one clip.

---

## Round 2

**Verdict: PASS. The ~45 min clip render can go now.** All four must-fix items and the should-fix are fixed. Hands are clean at f0, f30, f55 and f70, from both views. The W reads at app size at mid-lift and at the top. One thing is visibly worse than r15: at the top hold the near biceps glow is mostly hidden. I accept it as honest rigid-bar mechanics, not a defect (see "Worse than r15"). Two cheap conditions are listed at the end; neither one blocks the render.

What I looked at: README, figure-rules.md, every round-2 image at full size and 3-5x, round-1 vs round-2 crops of f0/f30/f55, r15 frames 0/30/55 pulled from curl-clip-r15.mp4 next to EZ at native 960x640 and at a 384x256 app stage, and the code in render8.py (posed, set_frame, the EZ GRIPDIAG block), pose.py (level hinge, abduct, foretw) and props.py (make_ez). No Blender here, so I checked the code paths and the pictures but could not re-run the numbers. No saved GRIPDIAG log exists in the project.

### Claims checked

| Claim | Check | Result |
|---|---|---|
| BVH test against the real EZBar mesh, 0 inside, worst +0.3 mm, catches round 1 (610 inside) | render8.py lines 236-266: builds a BVHTree from the **evaluated `EZBar` mesh in world space** each frame, then tests every evaluated vertex of every SKIN and UNDER object on that side (find_nearest, sign from the face normal). | **Real test. Fixes item 1.** It is no longer circular. The sign test is valid: a flipped-normal bar would report everything inside, and a test blind to the bar could not have found 610 inside on round 1. Numbers not re-run (no log saved). |
| Level-axis hinge plus 0-4° abduction, exact grip width | pose.py: the hinge is `flex_axis([0,0,-1])`, which is the lateral x axis in the humerus frame and is fixed in the upper arm, so it is still a true hinge. render8.set_frame bisects `abduct` within ±8° until grip separation equals f0's. barbell/r15 keeps the old axis by default. | Correct. The bar is built once and the width is held, so a rigid bar is honest. Visually: the shoulders are at the same height as r15, the elbows stay at the sides with no visible flare, and there is no elbow-crease pinch at f30/f55. |
| Straight section fitted to the hand span, 12 mm each side | make_ez: straight part = [t_lo - 12 mm, t_hi + 12 mm] = -66.3 to +57.2 mm, and the corners are solved so that this length stays straight after filleting. | **Fixes item 3.** The round-1 Z-step at both little fingers (f0, 5x) is gone. From below at f0 and f30 the little finger sits on straight bar, with the bend starting just past it. |
| Bend radius 45 mm, W depth 45 mm, 38° connectors | make_ez defaults: EZ_BEND_R 0.045, EZ_DEPTH 0.045, EZ_CONN_DEG 38. | **Fixes item 4.** The bends are smooth S-curves, not crimps, at every close-up. The outer bend has a slight rise then settles to the sleeve line. That looks like a real EZ outer bend, not a glitch. |
| Wrist roll moved into the forearm twist, 7.4°/3.2° | posed(): a swing-twist split about the forearm axis through the wrist. The twist is applied to foretw plus the hand bones, and only the residual swing stays at the wrist. | **Fixes item 5.** The logic is right. Small note: WRISTCORR prints iteration 0 only, so the 7.4/3.2 figures are first-pass values. Harmless. |
| W mild at f0, clear at f30 | At the 384 px app stage. | Agreed. f0: two faint wiggles next to the fists, which do not read as EZ on their own. f30: a clear W. f55: the bends read above the hands. |

### Hands, all four frames
- **f0:** both fists are closed round the straight section, and the thumb meets the index finger. From below, the little finger sits on straight bar for both hands. Same quality as r15.
- **f30 (new close-up):** both fists sit cleanly on the angled section, and the W is obvious. In the left hand's clip view the inner bend runs just under the wrist. That is foreshortening (the bar crosses the forearm's line in depth), not a collision.
- **f55 (round-1 item 2):** **fixed.** The right hand from the clip view now reads as a fist from behind. The bar passes behind the fingers, comes out cleanly on both sides, and has no cone-shaped cut. The left hand is clean. From below, both thumbs wrap.
- **f70:** the same as f55. Clean.
- **Carried over and accepted as before:** the open wrist cuff with tendon strands seen from below, and the dorsum/digit seam on the back of the right hand at the top. Neither is visible as a defect at 960 or at app size.

### Worse than r15
1. **The near (right) biceps glow is mostly hidden at the top hold (about f45-72).** With the level hinge, the near forearm rises nearly vertical, straight in front of the biceps from the 3/4 camera. Only two red slivers show, where r15 showed a clear red belly. The far biceps reads better than in r15, and at app size there is still red on both arms.
   - This is the correct mechanics. A rigid bar keeps the hands at a fixed width, and r15's hands closing 17 cm only works because they slide along a straight bar. So it is not a defect.
   - It is still a visible change from the approved look, so point it out on the watch page. Do not change the hinge to win back the glow.
2. Nothing else is worse. The body, motion keys, light, camera and plates are unchanged. Abduction of 4° or less is not visible.

### Code note (not blocking)
- The BVH test covers SKIN and UNDER only. The forearm muscles (MUS) are not in it.
- Nothing in the images suggests forearm-to-bar contact. If the test is generalised to other props, add MUS for that side within 4 cm of the bar.

### Poster frame
- f000 (the poster under figure-rules) shows the W only weakly. As a thumbnail it reads as "barbell curl with smaller plates". f30 shows the W clearly and the biceps at their brightest.
- **Yes, ask Omar** whether EZ-type clips (and other props whose identity only shows mid-rep) may use a mid-lift poster at about f28-32.
  - It costs nothing: the poster is a jpg of one clip frame, so it can be swapped after the render without re-rendering.
  - It is a rules change, so it is his call. Do not hold the clip for it.

### Before or with the clip (cheap, not blockers)
1. Save the EZGRIP and WRISTCORR console output next to the README, for frames 0/20/30/41/50-72/100. The pass then rests on a record, not on a sentence.
2. After the render, run the normal measure.py and clipcheck.py (loop seam), and render gripshots on the final clip build as figure-rules requires.

## Can the clip render go ahead now? (Round 2)

**Yes.** Render the one clip. On the watch page, show it against r15 and call out two things: the level-hinge top position, with the near biceps partly hidden, and the poster-frame question.

## Clip 1

**Verdict: PASS. The watch page can be published to Omar.** Nothing blocks it. The hands stay on the bar on every frame I checked, with no pop, jitter or slide. The loop closes cleanly. The bar timing matches r15 almost frame for frame. Nothing is worse than r15 except the near-biceps occlusion at the top, which was already accepted in round 2. **Poster: f30**, but only with Omar's OK, because it changes the rule (see below).

What I looked at: the README, clipcheck.txt, measure.txt and ../ezgrip-log.txt. I decoded all 130 frames of ez-clip-1.mp4, ez-clip-1.webm, r15 (curl-clip-r15.mp4) and the side-by-side, and checked them with my own measurements: template tracking of the plates and hands, a frame-to-frame diff, a temporal second-difference scan, crops at 3-5x of both hands through f20-48, f44-76 and f74-104, and a 384x256 app-stage sheet next to r15. The extracted frames have been deleted.

### Claims checked

| Claim | My check | Result |
|---|---|---|
| clipcheck: no spikes | Second-difference scan over the upper body and bar. The top values are f27-36, the fastest part of the lift, and they come in a smooth run with no isolated peak. r15 has the same profile (its peaks are also at f28-36, slightly higher). | **Confirmed.** No pops anywhere in the rep. |
| Loop seam 0.249 vs median 0.926 | On the decoded mp4 the pixel step at the seam is 0.62, against 0.15 (f128->129) and 0.35 (f0->1) on either side. That bump is the H.264 I-frame at f0, not motion: r15 shows the same thing (0.63 against 0.15/0.35). Tracked positions, measured against f0, run smoothly through the seam. Plate R x: f126 -0.72, f127 -0.69, f128 -0.52, f129 -0.35, f0 0, f1 +0.42, f2 +1.06. The hands and plate L behave the same way. | **Seamless.** Note: comparing the seam with the *global* median is a weak test, because the seam falls in the slowest part of the rep. Follow-up for clipcheck.py: compare it with the 3 steps on each side. |
| Bar max 7.97 px/f at f32 | My tracking of the near plate gives a peak of 8.21 px/f at f34. r15 tracked the same way gives 8.18 at f32. | **Within the 8-9 rule and the same as r15.** The difference from 7.97 is only which point gets tracked. |
| Body landmarks under 0.5 px/f | My head track peaks at 0.13 px/f. | Consistent with the claim. |
| ezgrip-log: 0 inside on every frame, worst +0.3 mm | The log covers f0/20/30/41, every frame from f50 to f72, and f100. TOTAL 0 inside. ABDUCT peaks at 4.36° at f61-62 (round 2 said "0-4°"; that small an excess cannot be seen). | **Round-2 condition 1 is met.** The forearm muscles (MUS) are still not in the test (see the far wrist below). |
| Final-build hand close-ups match round 2 | ez-hands-final-build.jpg is **pixel-identical** to the round-2 ez-hands-closeups.jpg (only the C2PA metadata differs). The posters are also pixel-identical to the round-2 stills, but their PNG metadata shows fresh render times (23:43 and 23:57). | Consistent with a deterministic re-render of the same build, but the jpg alone cannot prove it was re-rendered rather than copied. It does not matter for this verdict, because I checked the hands directly in the clip frames. |
| Side-by-side synced | I matched each panel against the source clips frame by frame. Both panels are a 560 px crop from x=200, and all 130 frames are synced with zero offset. | **Confirmed.** |
| Posters are clip frames | poster-f000 and poster-f030 differ from clip f0 and f30 by codec noise only (0.73 and 0.77 mean); each one's best match is its own frame. | Confirmed. |

### Hands, frame by frame
- **Top hold f45-72 (the round-1 failure):** clean on every frame, checked at 5x every 4 frames. On the near hand, the back of the hand faces the camera, the fingers rise over the bar, and the bar passes *behind* the fingers: it shows through the finger gaps and comes out cleanly on both sides. There is no cut into the back of the hand. On the far hand, the fist is wrapped on the angled section and the thumb side is clean. The hand-to-bar relationship does not change visibly from f48 to f72.
- **Lift and lowering f20-44 and f74-104:** both fists stay closed on the angled section, and the W bends sit just outside the fists. There is no sliding, finger flicker or grip pop between frames.
- **Far wrist at mid-lift (f29-31 and f92-94):** the inner bend crosses in front of the ventral wrist and forearm, and at 5x it makes a small busy S-shape over the wrist. r15 has the same overlap with its straight bar at the same frames, so this is the approved camera geometry and not new. It is invisible at 960 and at app size. Watch item: this is exactly where the untested MUS layer sits, so add MUS to the contact test before the next two-hand prop (as in the round-2 code note).

### Motion vs r15
- The near-plate height tracks r15 within about 2.5 px over a 220 px rise on every sampled frame:
  - the same lift start;
  - the same peak speed;
  - the top within 3 px from f55 to f67 in both clips (13 frames);
  - the same lowering profile;
  - the same soft bottom (0.12 px/f at f128, with no dead stop).
- The rise is 222 px against r15's 219. The body is unchanged. It feels the same: same tempo, same creep at the top, same breath and sway.

### Near forearm over the biceps at the top
- At 960, from f50 to f70 the near biceps shows as a thin red sliver between the vertical forearm and the chest, while the far biceps reads as a full red belly.
- At 384x256, both arms still show red at the top. r15's near biceps is also small at f60, so the difference at app size is minor.
- **It reads acceptably.** The red is visible on both arms through the whole rep, and it is honest rigid-bar mechanics. Keep the one-line callout on the watch page as round 2 asked. Do not change the hinge.

### W at app size
- **960x640:** the W is clear from about f20 to f110 and faint at f0.
- **384x256:** f0 shows only two small wiggles by the fists and reads as "a curl with small plates". At f30 the W is legible, and by f45-60 the bends read above the hands. In motion, the viewer sees the EZ shape within the first second of the loop.

### Worse than r15?
Nothing is worse beyond the accepted near-biceps occlusion. Two presentation nits on the side-by-side, neither a blocker:
- r15's right sleeve runs to the panel edge.
- There is a tonal step at the join (background luma 227 against 242) with no divider line. A 2 px divider would tidy it.

### Poster: f30
- **Recommend f30.** It is the only frame that says "EZ bar" as a thumbnail. The W is clear and the biceps are at their brightest. f0 reads as a barbell curl with small plates.
- It departs from figure-rules ("poster: jpg of f000"), so Omar has to approve it. Show both on the watch page and ask; if he declines, use f0.
- If f30 is approved:
  - Make the poster a **jpg** (the rules ask for jpg; the files here are PNG).
  - Either start playback at f30 (`currentTime = 1.0`) or rotate the encode so it starts at f30. The loop is seamless, so either costs nothing. Otherwise the picture jumps from mid-lift to the bottom when play starts.

## Can the watch page go to Omar? (Clip 1)

**Yes.** Publish it with the r15 vs EZ side-by-side and slow motion. Call out two things on the page: the near biceps is partly hidden at the top (level hinge, by design), and the poster choice (f30 recommended, f0 is the current rule). Ship only on Omar's yes.
