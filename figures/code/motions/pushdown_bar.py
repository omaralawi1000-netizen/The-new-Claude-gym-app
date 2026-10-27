# Rope triceps pushdown, one rep that loops. Its own choreography (not the curl's): high pulley, neutral grip on the rope.
# Keys are (frame, value), cosine-eased, wrapping from the last key to the first + FRAMES. Angles deg, distances m.
#
# Real-lifter notes (strict standing rope pushdown):
#  - stance: hips pushed back a touch, trunk leans forward ~10 deg from the hips, chest up, shoulders set down and back,
#    knees soft (~12 deg). The trunk is still: the triceps do the work, the body does not bob.
#  - elbows pinned at his sides; the upper arm stays about vertical (shoulder flex = the trunk lean, so the elbows
#    sit just in front of the ribs). They drift a few degrees forward at the top as the forearms rise, and press back at lockout.
#  - start: forearms a little above level (elbow 90 deg), hands at the lower chest. Push down to full lockout (~8 deg,
#    never hyperextended), split the rope at the bottom: hands move apart past the thighs (arms angle out ~9 deg)
#    and the palms turn slightly down (a little past neutral).
#  - tempo: push ~1.1 s, squeeze ~0.5 s at lockout, controlled return ~2 s (slower than the push), soft turn at the top.
#  - breathe out through the push, hold at the squeeze, breathe in on the way up.
# r2 (judge round 1): turn and split start at the bottom of the push (f24-26), peak at f48 and creep on to f60 (no flat holds);
# turn-out 120 deg (was 104), split 7 deg; pulley 0.45 m in front at 1.90 m (props.py COL_HIGH / HIGH).
import os as _os
_ABK = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_ABKEYS'].split(',')] if _os.environ.get('PD_ABKEYS') else None
_ABL = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_ABLKEYS'].split(',')] if _os.environ.get('PD_ABLKEYS') else None
_WRK = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_WRKEYS'].split(',')] if _os.environ.get('PD_WRKEYS') else None
_TWL = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_TWLKEYS'].split(',')] if _os.environ.get('PD_TWLKEYS') else None
_WRL = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_WRLKEYS'].split(',')] if _os.environ.get('PD_WRLKEYS') else None
_GRL = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_GRLKEYS'].split(',')] if _os.environ.get('PD_GRLKEYS') else None
_TWK = [tuple(map(float, k.split(':'))) for k in _os.environ['PD_TWKEYS'].split(',')] if _os.environ.get('PD_TWKEYS') else None
FRAMES = 130
# render settings for this move (render8.py applies them as defaults; judge r4/r5: never only in a shell script)
ENV = {'GLOW_STRENGTH': 16, 'GLOW_SIZE': 0.95, 'HALO_R': 0.03, 'HALO_K': 12, 'TWSIGN': 1, 'FORE_NOLIGHT': 1, 'UNDER_ARM_IN': 0.014,
       'PROP': 'bar_high', 'LOCKW_SEP': 150, 'CAM_PAN': 0.73, 'GLOW_OUTLINE': 0.45, 'OUTLINE_T': 0.4, 'GLOW_EMIT': 0.08, 
       
       # r12 (side view -55): far arm tucked 10 deg toward the body at the top (with elbow_l) so only a small dark triangle of the far forearm shows behind the near elbow (judge r11 'wisp')
# r8 (rope realism rules, Omar 25 Oct go): seen from behind his right side at -140 both fists show beside the hips, so the
       # far-arm tricks of r4-r7 (far arm 15 deg wider, turned in 55 deg, wrist eased back) are gone: both arms move the same.
       # At lockout the fists tilt into the rope line (radial, up to 18 deg, building with the push), so the rope runs from the thumbs up to the clip and the
       # knobs hang below the little fingers, instead of the rope lying flat through the fists like a bar. The column stands 35 cm
       # to the far side with one swivel arm out to the pulley, which sits higher (1.95 m) so the cable runs almost straight down.
       'COL_HIGH_X': -0.35, 'HIGH_X': -0.08, 'HIGH_Z': 1.95, 'CAM_LENS': 36, 'CAM_TZ': 0.95, 'BASE_H': 0.05}   # judge r6: skin discs inside each fist and a dark core inside each wrist close the see-through pinholes of the turned-in far fist (render8.fist_septum, wrist_core)
CH = {
    # elbow as a smoothed per-frame table (figure rules: no dead stops): push 0-44, creep into lockout 44-60 (a small extra
    # squeeze), return 60-112 (slower than the push), soft turn at the top 112-130 easing into the stretch; sigma 3 frames
    'elbow':        ('table', [89.3, 89.1, 88.7, 88.2, 87.5, 86.6, 85.6, 84.3, 82.9, 81.3, 79.5, 77.6, 75.6, 73.4, 71.1, 68.7, 66.2, 63.7, 61.0, 58.3, 55.4, 52.2, 48.9, 45.5, 42.0, 38.6, 35.2, 31.8, 28.7, 25.7, 22.8, 20.1, 17.6, 15.5, 13.5, 11.7, 10.1, 8.7, 7.4, 6.3, 5.4, 4.7, 4.1, 3.6, 3.2, 2.9, 2.7, 2.5, 2.3, 2.1, 1.9, 1.7, 1.5, 1.3, 1.1, 1.0, 0.8, 0.7, 0.6, 0.5, 0.5, 0.7, 0.9, 1.3, 1.8, 2.4, 3.2, 4.1, 5.1, 6.2, 7.5, 8.9, 10.4, 12.0, 13.7, 15.6, 17.6, 19.9, 22.2, 24.8, 27.4, 30.1, 33.0, 35.9, 38.8, 41.8, 44.6, 47.5, 50.3, 53.0, 55.6, 58.1, 60.3, 62.4, 64.6, 66.6, 68.6, 70.5, 72.3, 74.0, 75.6, 77.1, 78.5, 79.8, 80.9, 81.9, 82.8, 83.6, 84.3, 84.8, 85.3, 85.6, 85.9, 86.2, 86.4, 86.7, 86.9, 87.1, 87.3, 87.6, 87.8, 88.0, 88.2, 88.4, 88.7, 88.9, 89.1, 89.2, 89.3, 89.4]),
    'wrist':        [(0, 0.0)],
    'grip':         [(0, 1.0)],
    # r8: the fists tilt into the rope line (radial deviation, deg) on their own eased keys: 28-frame ramps keep the 2nd difference
    # <= 0.11 deg/f^2 (the phi-driven ramp was 0.30); full tilt from the end of the push through the squeeze
    'twist':        [(0, 170.0)],   # push, then turn: palms face back and down at lockout, creeping on
    # ...and split: straight arms angle out, fists finish beside the thighs. r4 judge (camera -115): wide enough that the far fist
    # shows past the hip holding its rope end through f40-68 (FARDIAG), instead of a lone end cap poking out (was 2/6/7 at f26/48/60)
    'abduct':       [(0, 0.0)],
    # far (left) arm only, judge r4 must-fix 1: the far rope end showed beside the hip before the fist did (f34-38) and after
    # it (f70-76). Seen from behind (-115) the cap is the outer end of the grip, so it led the fist out past the glute.
    # While the far fist comes out from behind the hip it stays turned in (twist -55: the rope end hangs below the fist) and
    # the arm sits a little wider, then it turns out with the near hand for the lockout. Small creeps, no flat holds. The turn-in ramps are long
    # (f8-30, f52-68, f82-106) and TILT_SPAN is 90, so the far fist's rope-line tilt stays smooth (TILTDIAG <= 0.15 deg/f^2). FARDIAG every frame: 0 floating.
    # Timing alone (split earlier, turn later) did not help: 14-17 floating frames in every trial (far-end-log.txt).
    # judge r7: the far fist ran 1-3 px from the glute outline (f42-67) and background showed through the slit. 5 deg wider clears
    # it by >= 4 px (NOTCHDIAG 0 on f38-70).
                                                                             # turned-in fist does not open a background crack at f42-47 / f60-63 (HOLEDIAG)
    # r11 judge: at the top the far forearm showed as a dark wisp above the near forearm (f11, f95-101): it sits a little lower there, ramps of 18+ frames
    'shoulder':     [(6, 15.0), (36, 10.6), (56, 10.3), (102, 15.0)],      # = trunk lean + a few deg: elbows just in front of the ribs
    'scap':         [(0, 0.95)],
    'breath':       [(2, 0.95), (38, 0.15), (52, 0.12), (110, 0.95)],        # r4 judge: a small creep through the squeeze, no flat hold
    'brace':        [(4, 0.7), (20, 1.0), (54, 0.97), (96, 0.7)],
    'pelvis_pitch': [(6, -2.5), (58, -6.8), (104, -2.5)],     # forward lean from the hips (negative = forward); a hair more on the push
    'lumbar_pitch': [(6, -2.0), (58, -4.0), (104, -2.0)],
    'chest_pitch':  [(6, -0.5), (58, -3.4), (104, -0.5)],
    'chest_lift':   [(0, 1.0)],                                           # chest stays up
    'hips_fwd':     [(6, -0.005), (58, -0.035), (104, -0.005)],                                        # hips back a touch
    'knee':         [(6, 7.0), (58, 14.0), (104, 7.0)],
    'sway_x':       ('sine', 0.006, 0),
    'roll':         ('sine', -0.4, 16),
    'head_stab':    [(0, 0.7)],                                           # head stays in line, eyes forward
    'cam_orbit':    [(0, -30.0)],                                        # r4: behind his right side; both triceps face the camera and the cable drops behind the neck-shoulder gap (CABLEDIAG; -105 ran it along the deltoid)
    'cam_lift':     [(0, 0.0)],
}
