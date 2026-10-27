# Barbell curl, one rep that loops: 150 frames @ 30 fps (5.0 s). r14 (Omar 13:30): calmer teaching tempo + a settle at the bottom.
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
FRAMES = 150
CH = {
    # r13 (Omar 14 Oct 12:26 "more natural at the top and the bottom, better to watch on a loop"): the elbow follows the timing
    # of his MoveKit reference, traced frame by frame (bar height -> elbow angle, 2 reps averaged, smoothed 3 frames):
    # no dead stops; it eases into the squeeze, creeps there ~17 frames, eases out, lowers a touch slower than the lift and
    # turns softly at the bottom. Same range 8-124 deg and same top time (f47) as r12, so the body keys still line up.
    'elbow':        ('table', [8.3, 8.6, 9.0, 9.4, 9.9, 10.5, 11.2, 12.0, 12.8, 13.7, 14.7, 15.7, 16.8, 18.0, 19.3, 20.7, 22.1, 23.7, 25.4, 27.2, 29.2, 31.4, 33.8, 36.4, 39.1, 41.9, 44.9, 48.0, 51.1, 54.2, 57.4, 60.6, 63.7, 66.9, 70.0, 73.1, 76.2, 79.2, 82.3, 85.3, 88.3, 91.3, 94.3, 97.1, 99.8, 102.4, 104.9, 107.2, 109.4, 111.4, 113.2, 114.9, 116.5, 117.9, 119.2, 120.3, 121.2, 122.0, 122.7, 123.2, 123.6, 123.9, 124.1, 124.3, 124.5, 124.7, 124.9, 125.1, 125.2, 125.3, 125.3, 125.1, 124.8, 124.3, 123.6, 122.8, 121.8, 120.6, 119.3, 118.0, 116.6, 115.1, 113.5, 111.9, 110.2, 108.4, 106.5, 104.5, 102.4, 100.2, 98.0, 95.7, 93.4, 91.0, 88.7, 86.4, 84.1, 81.7, 79.4, 77.0, 74.5, 72.1, 69.6, 67.1, 64.7, 62.2, 59.8, 57.5, 55.2, 52.9, 50.7, 48.5, 46.3, 44.1, 42.0, 40.0, 37.9, 35.9, 34.0, 32.1, 30.2, 28.4, 26.7, 25.0, 23.4, 21.9, 20.5, 19.3, 18.1, 17.0, 16.0, 15.1, 14.3, 13.6, 12.9, 12.3, 11.7, 11.1, 10.6, 10.1, 9.6, 9.2, 8.9, 8.6, 8.3, 8.2, 8.0, 8.0, 8.0, 8.1]),
    'wrist':        ('table', [4.0, 4.0, 4.1, 4.1, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4, 4.5, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8, 6.0, 6.1, 6.3, 6.5, 6.8, 7.0, 7.2, 7.4, 7.6, 7.8, 8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3, 10.5, 10.7, 10.8, 11.0, 11.1, 11.3, 11.4, 11.5, 11.6, 11.7, 11.7, 11.8, 11.9, 11.9, 11.9, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 11.9, 11.8, 11.8, 11.7, 11.6, 11.5, 11.4, 11.3, 11.2, 11.0, 10.9, 10.8, 10.7, 10.5, 10.4, 10.2, 10.0, 9.9, 9.7, 9.6, 9.4, 9.2, 9.1, 8.9, 8.8, 8.6, 8.4, 8.2, 8.1, 7.9, 7.7, 7.6, 7.4, 7.3, 7.1, 6.9, 6.8, 6.6, 6.5, 6.3, 6.2, 6.1, 5.9, 5.8, 5.7, 5.5, 5.4, 5.3, 5.2, 5.1, 5.0, 4.9, 4.8, 4.7, 4.6, 4.6, 4.5, 4.4, 4.4, 4.3, 4.3, 4.3, 4.2, 4.2, 4.1, 4.1, 4.1, 4.1, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0]),
    'grip':         [(0, 1.0)],
    'shoulder':     [(20, 0), (55, 6), (70, 6), (127, 0)],               # elbows drift forward, peak with the bar
    'scap':         [(18, 0.85), (59, 1.0), (121, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(10, 1.0), (55, 0.15), (72, 0.15), (130, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze, breathe in on the slow lowering
    'brace':        [(5, 0.6), (20, 1.0), (70, 1.0), (105, 0.7), (133, 0.6)],
    'pelvis_pitch': [(20, 0), (53, 1.3), (72, 1.2), (127, 0)],           # backward lean, deg; peaks as the bar arrives (f40)
    'lumbar_pitch': [(22, 0), (55, 2.2), (74, 1.9), (130, 0)],
    'chest_pitch':  [(23, 0), (57, 2.5), (76, 2.1), (133, 0)],
    'chest_lift':   [(25, 0), (57, 2.4), (72, 2.1), (121, 0)],            # extra thoracic extension at the top: chest up
    'hips_fwd':     [(20, 0), (53, 0.018), (72, 0.016), (127, 0)],
    'knee':         [(14, 4.0), (70, 4.0), (105, 9.0)],                   # knee flex of the straighter leg, deg: unlocks with the lowering (f56), long soft return through the loop seam
    'sway_x':       ('sine', 0.009, 0),
    'roll':         ('sine', -0.6, 18),                                   # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, 0.0)],                                          # no drift (back-and-forth read as wobble)
    'cam_lift':     [(0, 0.0)],
}
