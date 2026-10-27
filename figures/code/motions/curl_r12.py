# Barbell curl, one rep that loops: 112 frames @ 30 fps (3.7 s).
# Each exercise gets its OWN file like this one: the channels are the same, the choreography is authored per movement.
# Keys are (frame, value); values ease (cosine) from key to key and wrap from the last key to the first + FRAMES.
# ('sine', amplitude, phase_frames) is a smooth one-cycle-per-loop wave.
# Angles in degrees, distances in metres, factors 0..1.
#
# Real-lifter notes (strict standing curl):
#  - bottom hold 0-6: last of the inhale, brace and shoulder set land just before the bar moves
#  - lift 6-40 (1.1 s), squeeze 40-54 (0.47 s), lower 54-105 (1.7 s = 1.5x the lift), hold 105-112
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
    'elbow':        [(6, 8), (40, 124), (54, 124), (105, 8)],
    'wrist':        [(6, 4), (40, 12), (54, 12), (105, 4)],
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
