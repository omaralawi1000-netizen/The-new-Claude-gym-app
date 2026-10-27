# Rope hammer curl (low pulley), one rep that loops: r15 curl choreography with a neutral grip. First pass: tune after stills.
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
# r2 (judge round 1): elbow peak scaled 125.6 -> 118 deg (same table shape), wrist 0-3 deg (a hammer curl keeps a straight
# wrist; the curl's 4-12 deg flexion folded the turned fists toward each other), shoulder top 8 deg, split 2 -> 6.8 deg at the top.
FRAMES = 130
# render settings for this move (render8.py applies them as defaults; judge r4/r5: never only in a shell script)
ENV = {'GLOW_STRENGTH': 16, 'GLOW_SIZE': 0.95, 'HALO_R': 0.03, 'HALO_K': 12, 'TWSIGN': 1, 'CAM_LENS': 43, 'FORE_NOLIGHT': 1, 'UNDER_ARM_IN': 0.014,
       'PROP': 'rope_low', 'CAM_TZ': 0.80, 'CAM_PAN': 0.43, 'BLOOM_FORE': 1, 'GLOW_OUTLINE': 0.45, 'OUTLINE_T': 0.4}
CH = {
    # r13 (Omar 14 Oct 12:26 "more natural at the top and the bottom, better to watch on a loop"): the elbow follows the timing
    # of his MoveKit reference, traced frame by frame (bar height -> elbow angle, 2 reps averaged, smoothed 3 frames):
    # no dead stops; it eases into the squeeze, creeps there ~17 frames, eases out, lowers a touch slower than the lift and
    # turns softly at the bottom. Same range 8-124 deg and same top time (f47) as r12, so the body keys still line up.
    'elbow':        ('table', [8.31, 8.61, 9.02, 9.53, 10.14, 10.75, 11.56, 12.38, 13.29, 14.41, 15.43, 16.55, 17.77, 19.10, 20.52, 22.05, 23.58, 25.41, 27.24, 29.38, 31.52, 33.76, 36.30, 38.95, 41.59, 44.44, 47.29, 50.25, 53.20, 56.15, 59.10, 62.06, 64.91, 67.86, 70.71, 73.56, 76.51, 79.36, 82.11, 84.96, 87.71, 90.36, 93.00, 95.65, 97.99, 100.33, 102.47, 104.51, 106.44, 108.27, 109.90, 111.53, 112.96, 114.28, 115.50, 116.62, 117.64, 118.35, 118.96, 119.37, 119.78, 119.98, 119.98, 119.78, 119.37, 118.86, 117.84, 116.82, 115.50, 113.97, 112.24, 110.41, 108.48, 106.44, 104.30, 101.96, 99.72, 97.18, 94.73, 92.19, 89.64, 86.89, 84.35, 81.81, 79.16, 76.51, 73.76, 71.12, 68.37, 65.62, 62.87, 60.12, 57.37, 54.83, 52.28, 49.74, 47.19, 44.85, 42.41, 40.07, 37.73, 35.49, 33.35, 31.11, 29.07, 27.04, 25.10, 23.37, 21.64, 20.11, 18.69, 17.47, 16.14, 15.13, 14.31, 13.40, 12.68, 11.87, 11.36, 10.65, 10.14, 9.63, 9.22, 8.71, 8.51, 8.31, 8.10, 8.00, 8.00, 8.10]),
    'wrist':        [(10, 0.0), (44, 7.5), (56, 8.0), (70, 7.8), (108, 0.0)],
    'grip':         [(0, 1.0)],
    'twist':        [(20, 90.0), (44, 77.0), (55, 76.0), (70, 75.6), (105, 90.0)],                                          # rope hammer curl: thumbs up (neutral grip)
    'shoulder':     [(19, 6), (44, -2.6), (55, -3.0), (70, -2.8), (110, 6)],           # cable pulls forward: arms a touch in front of the thighs; top lowered from 11 (r2: stopper off the jaw)
    'abduct':       [(28, 2.0), (55, 6.0), (66, 6.8), (100, 2.0)],      # the rope ends come apart at the top: fists finish at the front of the shoulders
    'scap':         [(16, 0.85), (57, 1.0), (105, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(9, 1.0), (54, 0.15), (65, 0.13), (112, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze (a 0.02 creep, judge r4), breathe in on the slow lowering
    'brace':        [(5, 0.6), (19, 1.0), (64, 1.0), (91, 0.7), (115, 0.6)],
    'pelvis_pitch': [(19, 0), (52, 1.3), (65, 1.2), (110, 0)],           # backward lean, deg; peaks as the bar arrives (f40)
    'lumbar_pitch': [(20, 0), (54, 2.2), (66, 1.9), (112, 0)],
    'chest_pitch':  [(21, 0), (56, 2.5), (67, 2.1), (115, 0)],
    'chest_lift':   [(24, 0), (56, 1.0), (65, 0.9), (105, 0)],            # extra thoracic extension at the top: chest up
    'hips_fwd':     [(19, 0), (52, 0.018), (65, 0.016), (110, 0)],
    'knee':         [(13, 4.0), (64, 4.0), (91, 9.0)],                   # knee flex of the straighter leg, deg: unlocks with the lowering (f56), long soft return through the loop seam
    'sway_x':       ('sine', 0.009, 0),
    'roll':         ('sine', -0.6, 16),                                   # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, -38.0)],                                        # cable moves: camera round to his right so the column stands beside him
    'cam_lift':     [(0, 0.0)],
}
