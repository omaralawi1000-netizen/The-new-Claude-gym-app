# Barbell curl, one rep that loops: 112 frames @ 30 fps (3.7 s).
# Each exercise gets its OWN file like this one: the channels are the same, the choreography is authored per movement.
# Keys are (frame, value); values ease (cosine) from key to key and wrap from the last key to the first + FRAMES.
# ('sine', amplitude, phase_frames) is a smooth one-cycle-per-loop wave.
# Angles in degrees, distances in metres, factors 0..1.
#
# Real-lifter notes (strict standing curl):
#  - bottom hold 0-6: last of the inhale, brace and shoulder set land just before the bar moves
#  - r12: lift 6-40, squeeze 40-54, lower 54-105, hold 105-112 (cosine keys: dead stops at both ends read as a machine)
#  - r13: lift 0-40, squeeze creeps 40-62, lower 62-108 (1.1x the lift), soft turn at the bottom (see elbow below)
#  - exhale through the lift / sticking point, inhale on the slow lowering
#  - as the bar swings out in front, the lifter counterbalances: hips ease forward, torso leans back a touch,
#    most at mid-to-top; elbows drift forward a few degrees at the top; the lean lags the arms (pelvis, then lumbar,
#    then chest, a couple of frames apart) so nothing moves in lockstep
#  - on the lowering the body settles: knees unlock to ~9 deg with the lowering (f56), re-straighten to 4 deg (never locked)
#  - r11 naturalness pass: lean ~8 deg total (was ~10, read a touch like cheating), sway 0.9 cm, one breath per rep,
#    shoulders stay set (no re-set twitch every rep)
#  - head stays level, eyes forward: neck and head counter most of the trunk lean
#  - a slow side-to-side weight shift on its own rhythm; camera drifts a few degrees round him and back
FRAMES = 112
CH = {
    # r13 (Omar 14 Oct 12:26 "more natural at the top and the bottom, better to watch on a loop"): the elbow follows the timing
    # of his MoveKit reference, traced frame by frame (bar height -> elbow angle, 2 reps averaged, smoothed 3 frames):
    # no dead stops; it eases into the squeeze, creeps there ~17 frames, eases out, lowers a touch slower than the lift and
    # turns softly at the bottom. Same range 8-124 deg and same top time (f47) as r12, so the body keys still line up.
    'elbow':        ('table', [8.3, 9.2, 10.6, 12.4, 14.6, 16.9, 19.4, 21.9, 24.4, 27.1, 29.9, 32.9, 36.1, 39.5, 43.0, 46.6, 50.2, 54.0, 57.7, 61.5, 65.2, 68.8, 72.4, 76.0, 79.5, 83.1, 86.6, 90.2, 93.7, 97.1, 100.3, 103.4, 106.2, 108.8, 111.1, 113.3, 115.2, 117.0, 118.5, 119.8, 121.0, 121.9, 122.6, 123.2, 123.5, 123.8, 123.9, 124.0, 124.0, 123.9, 123.9, 123.7, 123.6, 123.5, 123.3, 123.1, 122.8, 122.5, 122.1, 121.7, 121.1, 120.5, 119.7, 118.8, 117.8, 116.5, 115.1, 113.4, 111.5, 109.4, 106.9, 104.3, 101.4, 98.3, 95.2, 92.1, 88.9, 85.8, 82.7, 79.6, 76.3, 73.0, 69.6, 66.2, 62.9, 59.6, 56.5, 53.4, 50.4, 47.5, 44.6, 41.7, 38.9, 36.2, 33.6, 31.0, 28.5, 26.1, 23.8, 21.7, 19.8, 18.0, 16.4, 15.0, 13.8, 12.6, 11.5, 10.5, 9.5, 8.7, 8.2, 8.0]),
    'wrist':        ('table', [4.0, 4.1, 4.2, 4.3, 4.5, 4.6, 4.8, 5.0, 5.1, 5.3, 5.5, 5.7, 5.9, 6.2, 6.4, 6.7, 6.9, 7.2, 7.4, 7.7, 7.9, 8.2, 8.4, 8.7, 8.9, 9.2, 9.4, 9.7, 9.9, 10.1, 10.4, 10.6, 10.8, 10.9, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.9, 11.9, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 11.9, 11.9, 11.9, 11.9, 11.9, 11.8, 11.8, 11.8, 11.7, 11.6, 11.6, 11.5, 11.4, 11.3, 11.1, 11.0, 10.8, 10.6, 10.4, 10.2, 10.0, 9.8, 9.6, 9.4, 9.2, 8.9, 8.7, 8.5, 8.3, 8.0, 7.8, 7.6, 7.3, 7.1, 6.9, 6.7, 6.5, 6.3, 6.1, 5.9, 5.8, 5.6, 5.4, 5.2, 5.1, 4.9, 4.8, 4.7, 4.6, 4.5, 4.4, 4.3, 4.2, 4.2, 4.1, 4.0, 4.0, 4.0]),
    'grip':         [(0, 1.0)],
    'shoulder':     [(10, 0), (40, 6), (56, 6), (100, 0)],               # elbows drift forward, peak with the bar
    'scap':         [(8, 0.85), (44, 1.0), (96, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(4, 1.0), (40, 0.15), (58, 0.15), (102, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze, breathe in on the slow lowering
    'brace':        [(2, 0.6), (10, 1.0), (56, 1.0), (84, 0.7), (104, 0.6)],
    'pelvis_pitch': [(10, 0), (38, 1.3), (58, 1.2), (100, 0)],           # backward lean, deg; peaks as the bar arrives (f40)
    'lumbar_pitch': [(11, 0), (40, 2.2), (60, 1.9), (102, 0)],
    'chest_pitch':  [(12, 0), (42, 2.5), (62, 2.1), (104, 0)],
    'chest_lift':   [(14, 0), (42, 2.4), (58, 2.1), (96, 0)],            # extra thoracic extension at the top: chest up
    'hips_fwd':     [(10, 0), (38, 0.018), (58, 0.016), (100, 0)],
    'knee':         [(6, 4.0), (56, 4.0), (84, 9.0)],                   # knee flex of the straighter leg, deg: unlocks with the lowering (f56), long soft return through the loop seam
    'sway_x':       ('sine', 0.009, 0),
    'roll':         ('sine', -0.6, 8),                                   # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, 0.0)],                                          # no drift (back-and-forth read as wobble)
    'cam_lift':     [(0, 0.0)],
}
