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
#  - on the lowering the body settles: knees soften a few mm, then straighten in the bottom hold
#  - head stays level, eyes forward: neck and head counter most of the trunk lean
#  - a slow side-to-side weight shift on its own rhythm; camera drifts a few degrees round him and back
FRAMES = 112
CH = {
    'elbow':        [(6, 8), (40, 124), (54, 124), (105, 8)],
    'wrist':        [(6, 4), (40, 12), (54, 12), (105, 4)],
    'grip':         [(0, 1.0)],
    'shoulder':     [(10, 0), (44, 6), (56, 6), (100, 0)],              # elbows drift forward at the top
    'scap':         [(0, 0.35), (5, 1.0), (58, 1.0), (98, 0.35)],        # shoulder set: depress + retract
    'breath':       [(5, 1.0), (50, 0.0), (62, 0.0)],                    # inhale peaks just before the lift
    'brace':        [(2, 0.4), (10, 1.0), (56, 1.0), (80, 0.5), (100, 0.4)],
    'pelvis_pitch': [(12, 0), (46, 1.6), (62, 1.5), (104, 0)],           # backward lean, deg
    'lumbar_pitch': [(14, 0), (48, 2.6), (64, 2.3), (106, 0)],
    'chest_pitch':  [(16, 0), (50, 3.0), (66, 2.5), (108, 0)],
    'hips_fwd':     [(12, 0), (46, 0.022), (62, 0.020), (104, 0)],
    'settle':       [(0, 0), (56, 0), (82, 0.0035), (110, 0)],           # pelvis drop on the lowering (knees soften)
    'sway_x':       ('sine', 0.012, 0),
    'roll':         ('sine', -0.8, 8),                                  # trunk counter-tilts: head stays over the feet
    'head_stab':    [(0, 0.9)],
    'cam_orbit':    [(0, 0.0)],                                          # r9: no drift (back-and-forth read as wobble)
    'cam_lift':     [(0, 0.0)],
}
