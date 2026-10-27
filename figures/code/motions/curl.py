# Barbell curl, one rep that loops: 130 frames @ 30 fps (4.3 s). r14 (Omar 13:30): calmer teaching tempo + a settle at the bottom.
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
FRAMES = 130
CH = {
    # r13 (Omar 14 Oct 12:26 "more natural at the top and the bottom, better to watch on a loop"): the elbow follows the timing
    # of his MoveKit reference, traced frame by frame (bar height -> elbow angle, 2 reps averaged, smoothed 3 frames):
    # no dead stops; it eases into the squeeze, creeps there ~17 frames, eases out, lowers a touch slower than the lift and
    # turns softly at the bottom. Same range 8-124 deg and same top time (f47) as r12, so the body keys still line up.
    'elbow':        ('table', [8.3, 8.6, 9.1, 9.6, 10.2, 10.9, 11.7, 12.6, 13.6, 14.7, 15.8, 17.0, 18.3, 19.7, 21.2, 22.8, 24.4, 26.3, 28.2, 30.4, 32.7, 35.1, 37.7, 40.5, 43.3, 46.3, 49.3, 52.4, 55.5, 58.6, 61.7, 64.8, 67.8, 70.9, 73.9, 76.9, 79.9, 82.9, 85.8, 88.8, 91.7, 94.5, 97.3, 100.0, 102.5, 105.0, 107.2, 109.4, 111.4, 113.3, 115.0, 116.7, 118.2, 119.6, 120.9, 122.1, 123.1, 123.9, 124.5, 125.0, 125.4, 125.6, 125.6, 125.4, 125.0, 124.4, 123.4, 122.3, 120.9, 119.3, 117.5, 115.6, 113.5, 111.4, 109.1, 106.7, 104.3, 101.7, 99.1, 96.4, 93.7, 90.9, 88.2, 85.5, 82.7, 79.9, 77.1, 74.3, 71.4, 68.5, 65.6, 62.7, 59.9, 57.2, 54.5, 51.8, 49.2, 46.7, 44.1, 41.7, 39.2, 36.9, 34.6, 32.3, 30.1, 28.0, 26.0, 24.1, 22.3, 20.7, 19.2, 17.9, 16.6, 15.5, 14.6, 13.7, 12.9, 12.1, 11.5, 10.8, 10.2, 9.7, 9.3, 8.8, 8.5, 8.3, 8.1, 8.0, 8.0, 8.1]),
    'wrist':        ('table', [4.0, 4.0, 4.1, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4, 4.5, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0, 5.1, 5.3, 5.4, 5.5, 5.7, 5.9, 6.1, 6.2, 6.4, 6.6, 6.8, 7.1, 7.3, 7.5, 7.7, 7.9, 8.1, 8.3, 8.5, 8.8, 9.0, 9.2, 9.4, 9.6, 9.8, 10.0, 10.2, 10.3, 10.5, 10.7, 10.8, 11.0, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.9, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 11.9, 11.8, 11.7, 11.5, 11.4, 11.3, 11.1, 11.0, 10.8, 10.6, 10.5, 10.3, 10.1, 9.9, 9.7, 9.5, 9.3, 9.2, 9.0, 8.8, 8.6, 8.4, 8.2, 8.0, 7.8, 7.6, 7.4, 7.2, 7.0, 6.8, 6.7, 6.5, 6.3, 6.2, 6.0, 5.8, 5.7, 5.5, 5.4, 5.2, 5.1, 5.0, 4.9, 4.8, 4.7, 4.6, 4.5, 4.5, 4.4, 4.3, 4.3, 4.2, 4.2, 4.2, 4.1, 4.1, 4.1, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0]),
    'grip':         [(0, 1.0)],
    'shoulder':     [(19, 0), (54, 6), (64, 6), (110, 0)],               # elbows drift forward, peak with the bar
    'scap':         [(16, 0.85), (57, 1.0), (105, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(9, 1.0), (54, 0.15), (65, 0.15), (112, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze, breathe in on the slow lowering
    'brace':        [(5, 0.6), (19, 1.0), (64, 1.0), (91, 0.7), (115, 0.6)],
    'pelvis_pitch': [(19, 0), (52, 1.3), (65, 1.2), (110, 0)],           # backward lean, deg; peaks as the bar arrives (f40)
    'lumbar_pitch': [(20, 0), (54, 2.2), (66, 1.9), (112, 0)],
    'chest_pitch':  [(21, 0), (56, 2.5), (67, 2.1), (115, 0)],
    'chest_lift':   [(24, 0), (56, 2.4), (65, 2.1), (105, 0)],            # extra thoracic extension at the top: chest up
    'hips_fwd':     [(19, 0), (52, 0.018), (65, 0.016), (110, 0)],
    'knee':         [(13, 4.0), (64, 4.0), (91, 9.0)],                   # knee flex of the straighter leg, deg: unlocks with the lowering (f56), long soft return through the loop seam
    'sway_x':       ('sine', 0.009, 0),
    'roll':         ('sine', -0.6, 16),                                   # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, 0.0)],                                          # no drift (back-and-forth read as wobble)
    'cam_lift':     [(0, 0.0)],
}
