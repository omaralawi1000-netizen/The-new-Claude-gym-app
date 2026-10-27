# Curl r12: grip, wrist, neck (14 Oct)

Files: curl-clip-r12.mp4/.webm (960x640, 30 fps, 112 frames, 16 samples + denoise), curl-r10-vs-r12.mp4 (side by side,
r10 = live), grip-r12-before-after.jpg, grip-r12-closeups.jpg (both hands, clip view + from below, bottom f0 + top f41),
neck-r12-before-after.jpg (clip, front, side, back, clip at top of rep). Motion = r11 (unchanged).

## Grip (Omar 04:42 "the hands still doesn't hold the bar properly")
- Cause: fixed finger angles + a guessed bar position put the bar THROUGH the fingers (833 skin points inside the bar).
- Now solved against the real hand skin: bar sits in the palm across the finger roots, each finger joint closes until the
  skin touches the bar, thumb wraps over the bar and its tip rests by the index finger. 0 skin points inside the bar at
  frames 0/20/41/70/100 (closest 13.8 mm from a 13.5 mm bar). The bar is locked in the hand every frame (never slides).
- Wrist: the hand used to twist up to 31 deg at the wrist to keep the bar in the palm (crease). Now <= 11 deg, and the
  forearm-to-hand blend is spread over 43 mm instead of 24 mm.
- Wrist edge: from below, the hand skin ended in an open sleeve round the tendons. Its edge is now tucked under them.
  Known leftover (only from below, not visible from the clip camera): a few small skin tags at that edge.

## Neck (Omar 04:49 "refine the neck to the head so it actually looks good")
- Traps slope from the skull base out to the shoulders (back and side), skull flows into the neck (no ring at the skull base).
- Two SCM ridges from behind the ear to the sternum (path taken from the real SCM muscle), hollow at the jugular notch.
- Neck slimmer just under the jaw so the jaw casts a soft shadow; the body's fibre texture fades along the jaw-to-skull line.
- Hidden: 25 deep neck muscles that lie wholly inside the neck and only showed as tips poking through.
- Limits: the head is still the smooth mannequin egg (no ears/jaw angles); a soft ring remains where the neck base meets
  the collarbones/chest muscles (sinking it deeper opened holes to the bones).

## Checks
- clipcheck: no pops, loop seam 0.21 vs median step 1.09.
- Build: scene8 -> handfix.py (NECK=0) -> scene10t -> neck6.py -> scene11f; grip.json from hm/mkgrip.py 0.008 25,0,20,85.
