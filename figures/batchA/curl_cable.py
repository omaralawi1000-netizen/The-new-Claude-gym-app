# Barbell curl, one rep that loops: 120 frames @ 30 fps (4.0 s). r14 (Omar 13:30): calmer teaching tempo + a settle at the bottom.
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
# Batch A cable curl: the r14 barbell-curl choreography (lift, squeeze, lower, body motion) on a straight cable bar at a low pulley.
ENV = {'GLOW_STRENGTH': 16, 'GLOW_SIZE': 0.95, 'HALO_R': 0.03, 'HALO_K': 12, 'CAM_LENS': 43, 'FORE_NOLIGHT': 1, 'UNDER_ARM_IN': 0.014,
       'PROP': 'bar_low', 'LOW_Y': 0.36, 'COL_LOW_Y': 0.72, 'CAM_TZ': 0.80, 'CAM_PAN': 0.43, 'BLOOM_FORE': 1, 'GLOW_OUTLINE': 0.45, 'OUTLINE_T': 0.4,
       'LOCKW_SEP': 150, 'ELBOW_AXIS': 'forearm'}
FRAMES = 120
CH = {
    # r13 (Omar 14 Oct 12:26 "more natural at the top and the bottom, better to watch on a loop"): the elbow follows the timing
    # of his MoveKit reference, traced frame by frame (bar height -> elbow angle, 2 reps averaged, smoothed 3 frames):
    # no dead stops; it eases into the squeeze, creeps there ~17 frames, eases out, lowers a touch slower than the lift and
    # turns softly at the bottom. Same range 8-124 deg and same top time (f47) as r12, so the body keys still line up.
    'elbow':        ('table', [8.3, 8.7, 9.1, 9.6, 10.3, 11.1, 11.9, 12.9, 13.9, 15.1, 16.4, 17.7, 19.2, 20.9, 22.6, 24.6, 26.8, 29.2, 31.9, 34.9, 38.1, 41.5, 45.1, 48.8, 52.7, 56.6, 60.5, 64.4, 68.2, 72.1, 75.9, 79.7, 83.4, 87.2, 90.8, 94.4, 97.9, 101.2, 104.3, 107.1, 109.8, 112.2, 114.4, 116.4, 118.2, 119.7, 121.1, 122.2, 123.0, 123.7, 124.3, 124.7, 125.0, 125.3, 125.4, 125.5, 125.4, 125.1, 124.6, 123.9, 122.9, 121.7, 120.2, 118.6, 116.7, 114.7, 112.5, 110.2, 107.8, 105.2, 102.4, 99.6, 96.7, 93.8, 90.8, 87.8, 84.8, 81.7, 78.7, 75.6, 72.4, 69.3, 66.1, 63.0, 59.9, 56.9, 53.9, 51.0, 48.2, 45.4, 42.7, 40.0, 37.4, 34.9, 32.4, 30.0, 27.8, 25.6, 23.6, 21.7, 20.0, 18.5, 17.1, 15.9, 14.9, 13.9, 13.0, 12.3, 11.6, 10.9, 10.3, 9.8, 9.3, 8.9, 8.5, 8.3, 8.1, 8.0, 8.0, 8.1]),
    'wrist':        ('table', [4.0, 4.0, 4.1, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.0, 5.1, 5.3, 5.5, 5.6, 5.9, 6.1, 6.3, 6.6, 6.8, 7.1, 7.3, 7.6, 7.9, 8.2, 8.4, 8.7, 8.9, 9.2, 9.5, 9.7, 10.0, 10.2, 10.4, 10.6, 10.8, 11.0, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.9, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 12.0, 11.9, 11.8, 11.7, 11.6, 11.5, 11.4, 11.2, 11.1, 10.9, 10.7, 10.5, 10.3, 10.1, 9.9, 9.7, 9.5, 9.3, 9.1, 8.9, 8.7, 8.4, 8.2, 8.0, 7.8, 7.6, 7.4, 7.2, 7.0, 6.8, 6.6, 6.4, 6.2, 6.0, 5.9, 5.7, 5.5, 5.4, 5.2, 5.1, 4.9, 4.8, 4.7, 4.6, 4.5, 4.5, 4.4, 4.3, 4.3, 4.2, 4.2, 4.2, 4.1, 4.1, 4.1, 4.0, 4.0, 4.0, 4.0, 4.0, 4.0]),
    'grip':         [(0, 1.0)],
    'shoulder':     [(17, 0), (46, 6), (57, 6), (100, 0)],               # elbows drift forward, peak with the bar
    'scap':         [(15, 0.85), (49, 1.0), (96, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(9, 1.0), (46, 0.15), (58, 0.15), (102, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze, breathe in on the slow lowering
    'brace':        [(4, 0.6), (17, 1.0), (57, 1.0), (83, 0.7), (105, 0.6)],
    'pelvis_pitch': [(17, 0), (44, 1.3), (58, 1.2), (100, 0)],           # backward lean, deg; peaks as the bar arrives (f40)
    'lumbar_pitch': [(18, 0), (46, 2.2), (59, 1.9), (102, 0)],
    'chest_pitch':  [(20, 0), (47, 2.5), (61, 2.1), (105, 0)],
    'chest_lift':   [(21, 0), (47, 2.4), (58, 2.1), (96, 0)],            # extra thoracic extension at the top: chest up
    'hips_fwd':     [(17, 0), (44, 0.018), (58, 0.016), (100, 0)],
    'knee':         [(12, 4.0), (57, 4.0), (83, 9.0)],                   # knee flex of the straighter leg, deg: unlocks with the lowering (f56), long soft return through the loop seam
    'sway_x':       ('sine', 0.009, 0),
    'roll':         ('sine', -0.6, 15),                                   # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, -30.0)],                                          # no drift (back-and-forth read as wobble)
    'cam_lift':     [(0, 0.0)],
}
