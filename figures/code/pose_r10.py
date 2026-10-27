# Curl pose: world-space rigid transforms per bone, applied to unparented bones. Import inside Blender.
import bpy, json, numpy as np, mathutils
from mathutils import Matrix, Vector

JS = json.load(open('joints.json'))
FWD = np.array([0, -1.0, 0])

def nrm(v): return v / np.linalg.norm(v)

def rot_about(p, axis, ang):
    p = Vector(p); return Matrix.Translation(p) @ Matrix.Rotation(ang, 4, Vector(axis)) @ Matrix.Translation(-p)

def flex_axis(d, n=FWD):
    n = n - (n @ d) * d; return nrm(np.cross(d, nrm(n)))

def grip_angles(g):
    """g in [0,1]: 0 = relaxed, 1 = full grip. Returns per-finger joint angles (rad)."""
    r = np.radians
    return {'mcp': r(62) * g, 'pip': r(92) * g, 'dip': r(48) * g,
            't0a': r(38) * g, 't0b': r(30) * g, 't1': r(30) * g, 't2': r(35) * g}

def transforms(side, elbow, wrist=0.0, grip=1.0, shoulder=0.0):
    J = {k: np.array(v) for k, v in JS[side].items()}
    sgn = -1 if side == 'r' else 1
    G = {}
    aU = nrm(J['E'] - J['S'])
    G['upper'] = rot_about(J['S'], flex_axis(aU), shoulder)
    aF = nrm(J['W'] - J['E'])
    G['fore'] = G['upper'] @ rot_about(J['E'], flex_axis(aF), elbow)
    aH = nrm(J['f2'][1] - J['W'])
    G['hand'] = G['fore'] @ rot_about(J['W'], flex_axis(aH), wrist)
    A = grip_angles(grip)
    for i in range(1, 5):
        c = J['f%d' % i]; prev = G['hand']
        for j, key in enumerate(['mcp', 'pip', 'dip']):
            d = nrm(c[j + 2] - c[j + 1])
            prev = prev @ rot_about(c[j + 1], flex_axis(d), A[key]); G[f'f{i}{j}'] = prev
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
