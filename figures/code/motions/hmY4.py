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
    'elbow':        ('table', [8.3, 8.6, 9.0, 9.5, 10.1, 10.7, 11.5, 12.3, 13.2, 14.3, 15.3, 16.4, 17.6, 18.9, 20.3, 21.8, 23.3, 25.1, 26.9, 29.0, 31.1, 33.3, 35.8, 38.4, 41.0, 43.8, 46.6, 49.5, 52.4, 55.3, 58.2, 61.1, 63.9, 66.8, 69.6, 72.4, 75.3, 78.1, 80.8, 83.6, 86.3, 88.9, 91.5, 94.1, 96.4, 98.7, 100.8, 102.8, 104.7, 106.5, 108.1, 109.7, 111.1, 112.4, 113.6, 114.7, 115.7, 116.4, 117.0, 117.4, 117.8, 118.0, 118.0, 117.8, 117.4, 116.9, 115.9, 114.9, 113.6, 112.1, 110.4, 108.6, 106.7, 104.7, 102.6, 100.3, 98.1, 95.6, 93.2, 90.7, 88.2, 85.5, 83.0, 80.5, 77.9, 75.3, 72.6, 70.0, 67.3, 64.6, 61.9, 59.2, 56.5, 54.0, 51.5, 49.0, 46.5, 44.2, 41.8, 39.5, 37.2, 35.0, 32.9, 30.7, 28.7, 26.7, 24.8, 23.1, 21.4, 19.9, 18.5, 17.3, 16.0, 15.0, 14.2, 13.3, 12.6, 11.8, 11.3, 10.6, 10.1, 9.6, 9.2, 8.7, 8.5, 8.3, 8.1, 8.0, 8.0, 8.1]),
    'wrist':        ('table', [0.0, 0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.8, 0.8, 0.9, 1.0, 1.0, 1.2, 1.2, 1.3, 1.4, 1.5, 1.5, 1.6, 1.7, 1.8, 1.9, 1.9, 2.0, 2.1, 2.2, 2.2, 2.3, 2.4, 2.4, 2.5, 2.6, 2.6, 2.7, 2.7, 2.8, 2.8, 2.8, 2.9, 2.9, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 2.9, 2.9, 2.8, 2.8, 2.7, 2.7, 2.6, 2.6, 2.5, 2.4, 2.4, 2.3, 2.2, 2.1, 2.1, 2.0, 1.9, 1.9, 1.8, 1.7, 1.7, 1.6, 1.5, 1.4, 1.3, 1.3, 1.2, 1.1, 1.0, 1.0, 0.9, 0.9, 0.8, 0.8, 0.7, 0.6, 0.6, 0.5, 0.5, 0.4, 0.4, 0.3, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    'grip':         [(0, 1.0)],
    'twist':        [(20, 90.0), (55, 70.0), (66, 69.5), (105, 90.0)],                                          # rope hammer curl: thumbs up (neutral grip)
    'shoulder':     [(19, 6), (54, 0.5), (66, 0.9), (110, 6)],           # cable pulls forward: arms a touch in front of the thighs; top lowered from 11 (r2: stopper off the jaw)
    'abduct':       [(28, 2.0), (55, 9.0), (66, 9.8), (100, 2.0)],      # the rope ends come apart at the top: fists finish at the front of the shoulders
    'scap':         [(16, 0.85), (57, 1.0), (105, 0.85)],                   # shoulders stay set the whole set (r10 re-set them every rep: a twitch at the loop start)
    'breath':       [(9, 1.0), (54, 0.15), (65, 0.13), (112, 0.95)],     # one breath per rep: breathe out through the lift, hold at the squeeze (a 0.02 creep, judge r4), breathe in on the slow lowering
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
    'cam_orbit':    [(0, -38.0)],                                        # cable moves: camera round to his right so the column stands beside him
    'cam_lift':     [(0, 0.0)],
}
