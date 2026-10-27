# Curl pose: world-space rigid transforms per bone, applied to unparented bones. Import inside Blender.
import bpy, json, numpy as np, mathutils
from mathutils import Matrix, Vector

JS = json.load(open('joints.json'))
import os as _os
# solved barbell grip (grip.json from hm/solve.py): per-finger joint angles and the bar centre in the rest hand frame
_GF = _os.environ.get('GRIP_FILE', 'grip.json')
GRIP = json.load(open(_GF)) if _os.path.exists(_GF) and _os.environ.get('GRIP_SOLVED', '1') != '0' else None
FWD = np.array([0, -1.0, 0])
TWSIGN = float(_os.environ.get('TWSIGN', 1.0))
ELBOW_LEVEL = _os.environ.get('ELBOW_AXIS', 'level' if _os.environ.get('PROP', 'barbell') != 'barbell' else 'forearm') == 'level'

def nrm(v): return v / np.linalg.norm(v)

def rot_about(p, axis, ang):
    p = Vector(p); return Matrix.Translation(p) @ Matrix.Rotation(ang, 4, Vector(axis)) @ Matrix.Translation(-p)

def flex_axis(d, n=FWD):
    n = n - (n @ d) * d; return nrm(np.cross(d, nrm(n)))

def grip_angles(g):
    """g in [0,1]: 0 = relaxed, 1 = full grip. Returns per-finger joint angles (rad)."""
    r = np.radians
    k = float(__import__('os').environ.get('THUMB_OPP', 0.0))   # thumb opposition (metacarpal swing); 0 since r11: the swing folded the skin at the thumb root into a flap
    return {'mcp': r(62) * g, 'pip': r(92) * g, 'dip': r(48) * g,
            't0a': r(38) * g * k, 't0b': r(30) * g * k, 't1': r(30) * g, 't2': r(35) * g}

def transforms(side, elbow, wrist=0.0, grip=1.0, shoulder=0.0, twist=0.0, abduct=0.0):
    """twist: forearm pronation (rad, + = palm turns toward the body; needs scene12+ foretw bones). abduct: arm out to the side (rad)."""
    J = {k: np.array(v) for k, v in JS[side].items()}
    sgn = -1 if side == 'r' else 1
    G = {}
    aU = nrm(J['E'] - J['S'])
    G['upper'] = rot_about(J['S'], (0, 1.0, 0), -sgn * abduct) @ rot_about(J['S'], flex_axis(aU), shoulder)
    aF = nrm(J['W'] - J['E'])
    # elbow hinge: the r15 curl (approved) hinges about an axis set by the forearm, so its hands come ~18 cm closer at the top
    # (fine on a straight bar: the hands slide along it). New moves hinge about a level axis, the way a lifter holds a rigid
    # EZ bar or a rope: the upper arm turns out a touch so the forearms rise straight up and the hands keep their width.
    G['fore'] = G['upper'] @ rot_about(J['E'], flex_axis(np.array([0, 0, -1.0])) if ELBOW_LEVEL else flex_axis(aF), elbow)
    aH = nrm(J['f2'][1] - J['W'])
    G['foretw'] = G['fore'] @ rot_about(J['E'], aF, TWSIGN * sgn * twist)
    G['hand'] = G['foretw'] @ rot_about(J['W'], flex_axis(aH), wrist)
    A = grip_angles(grip)
    S = GRIP.get(side) if GRIP else None      # solved grip (gripsolve: each finger closed onto the bar's own surface)
    for i in range(1, 5):
        c = J['f%d' % i]; prev = G['hand']
        for j, key in enumerate(['mcp', 'pip', 'dip']):
            d = nrm(c[j + 2] - c[j + 1])
            prev = prev @ rot_about(c[j + 1], flex_axis(d), S['A']['f%d' % i][j] * grip if S else A[key]); G[f'f{i}{j}'] = prev
    if S: A = dict(A, t0a=S['A']['t'][0] * grip, t0b=S['A']['t'][1] * grip, t1=S['A']['t'][2] * grip, t2=S['A']['t'][3] * grip)
    c = J['f0']
    d0 = nrm(c[1] - c[0])
    # thumb: swing the metacarpal forward (opposition) then medially, then flex MCP and IP across the bar
    med = np.array([-sgn * 1.0, 0, 0])   # towards the body midline from this hand
    t0 = G['hand'] @ rot_about(c[0], flex_axis(d0), A['t0a']) @ rot_about(c[0], flex_axis(d0, med), A['t0b'])
    G['t0'] = t0
    d1 = nrm(c[2] - c[1]); G['t1'] = t0 @ rot_about(c[1], flex_axis(d1, med), A['t1'])
    d2 = nrm(c[3] - c[2]); G['t2'] = G['t1'] @ rot_about(c[2], flex_axis(d2, med), A['t2'])
    return G, J

def apply(G_by_side):
    rig = bpy.data.objects['RIG']
    for side, G in G_by_side.items():
        for nm, g in G.items():
            pb = rig.pose.bones.get(f'{nm}.{side}')
            if pb is None: continue
            L = pb.bone.matrix_local
            pb.matrix_basis = L.inverted() @ g @ L

def ease(x):  # smooth in/out
    return 0.5 - 0.5 * np.cos(np.pi * np.clip(x, 0, 1))
