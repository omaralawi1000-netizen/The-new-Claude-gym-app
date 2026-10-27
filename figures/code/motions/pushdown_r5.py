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
FRAMES = 130
CH = {
    # elbow as a smoothed per-frame table (figure rules: no dead stops): push 0-44, creep into lockout 44-60 (a small extra
    # squeeze), return 60-112 (slower than the push), soft turn at the top 112-130 easing into the stretch; sigma 3 frames
    'elbow':        ('table', [89.3, 89.1, 88.7, 88.2, 87.5, 86.6, 85.6, 84.3, 82.9, 81.3, 79.5, 77.6, 75.6, 73.4, 71.1, 68.7, 66.2, 63.7, 61.0, 58.3, 55.6, 52.8, 50.0, 47.2, 44.4, 41.7, 39.0, 36.3, 33.8, 31.3, 28.9, 26.6, 24.4, 22.4, 20.5, 18.7, 17.1, 15.7, 14.4, 13.3, 12.4, 11.7, 11.1, 10.6, 10.2, 9.9, 9.7, 9.5, 9.3, 9.1, 8.9, 8.7, 8.5, 8.3, 8.1, 8.0, 7.8, 7.7, 7.6, 7.5, 7.5, 7.7, 7.9, 8.3, 8.8, 9.4, 10.2, 11.1, 12.1, 13.2, 14.5, 15.9, 17.4, 19.0, 20.7, 22.5, 24.4, 26.4, 28.4, 30.6, 32.7, 34.9, 37.2, 39.5, 41.8, 44.2, 46.5, 48.8, 51.2, 53.5, 55.8, 58.1, 60.3, 62.4, 64.6, 66.6, 68.6, 70.5, 72.3, 74.0, 75.6, 77.1, 78.5, 79.8, 80.9, 81.9, 82.8, 83.6, 84.3, 84.8, 85.3, 85.6, 85.9, 86.2, 86.4, 86.7, 86.9, 87.1, 87.3, 87.6, 87.8, 88.0, 88.2, 88.4, 88.7, 88.9, 89.1, 89.2, 89.3, 89.4]),
    'wrist':        [(0, 2.0)],
    'grip':         [(0, 1.0)],
    'twist':        [(24, 90.0), (48, 116.0), (60, 120.0), (90, 90.0)],   # push, then turn: palms face back and down at lockout, creeping on
    # ...and split: straight arms angle out, fists finish beside the thighs. r4 judge (camera -115): wide enough that the far fist
    # shows past the hip holding its rope end through f40-68 (FARDIAG), instead of a lone end cap poking out (was 2/6/7 at f26/48/60)
    'abduct':       _ABK or [(20, 2.0), (36, 10.0), (48, 11.0), (60, 12.0), (76, 10.0), (100, 2.0)],
    'shoulder':     [(6, 15.0), (36, 10.6), (56, 10.3), (102, 15.0)],      # = trunk lean + a few deg: elbows just in front of the ribs
    'scap':         [(0, 0.95)],
    'breath':       [(2, 0.95), (38, 0.15), (52, 0.12), (110, 0.95)],        # r4 judge: a small creep through the squeeze, no flat hold
    'brace':        [(4, 0.7), (20, 1.0), (54, 0.97), (96, 0.7)],
    'pelvis_pitch': [(8, -5.6), (40, -6.2), (56, -6.35), (106, -5.6)],     # forward lean from the hips (negative = forward); a hair more on the push
    'lumbar_pitch': [(0, -3.0)],
    'chest_pitch':  [(0, -2.5)],
    'chest_lift':   [(0, 1.0)],                                           # chest stays up
    'hips_fwd':     [(0, -0.025)],                                        # hips back a touch
    'knee':         [(0, 12.0)],
    'sway_x':       ('sine', 0.006, 0),
    'roll':         ('sine', -0.4, 16),
    'head_stab':    [(0, 0.7)],                                           # head stays in line, eyes forward
    'cam_orbit':    [(0, -115.0)],                                        # r4: behind his right side; both triceps face the camera and the cable drops behind the neck-shoulder gap (CABLEDIAG; -105 ran it along the deltoid)
    'cam_lift':     [(0, 0.0)],
}
