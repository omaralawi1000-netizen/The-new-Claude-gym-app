# Full-body pose from a motion file: forward kinematics for the trunk, girdle and arms, 2-bone IK for planted legs.
# All bones are unparented; every world transform is composed here and written as matrix_basis.
import bpy, json, math, importlib, numpy as np
from mathutils import Matrix, Vector
import pose

LJ = json.load(open('legjoints.json'))
HC = (np.array(LJ['l']['H']) + np.array(LJ['r']['H'])) / 2

def channel(spec, f, N):
    if isinstance(spec, tuple) and spec[0] == 'sine':
        return spec[1] * math.sin(2 * math.pi * (f - spec[2]) / N)
    if isinstance(spec, tuple) and spec[0] == 'table':   # one value per frame, periodic, Catmull-Rom between frames
        T = spec[1]; n = len(T); i = math.floor(f); u = f - i
        p0, p1, p2, p3 = (T[(i - 1) % n], T[i % n], T[(i + 1) % n], T[(i + 2) % n])
        return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    keys = sorted(spec)
    if len(keys) == 1: return keys[0][1]
    ext = keys + [(keys[0][0] + N, keys[0][1])]
    f = f % N
    if f < keys[0][0]: f += N
    for (f0, v0), (f1, v1) in zip(ext, ext[1:]):
        if f0 <= f <= f1:
            u = (f - f0) / (f1 - f0) if f1 > f0 else 0
            return v0 + (v1 - v0) * (0.5 - 0.5 * math.cos(math.pi * u))
    return keys[-1][1]

def load(name):
    m = importlib.import_module('motions.' + name)
    return m

BODY_CH = ('shoulder', 'pelvis_pitch', 'lumbar_pitch', 'chest_pitch', 'chest_lift', 'hips_fwd', 'settle', 'sway_x', 'roll')
def values(m, f):
    v = {k: channel(spec, f, m.FRAMES) for k, spec in m.CH.items()}
    if __import__('os').environ.get('GRIP_G'): v['grip'] = float(__import__('os').environ['GRIP_G'])   # test override
    if __import__('os').environ.get('CAM_ORBIT'): v['cam_orbit'] = float(__import__('os').environ['CAM_ORBIT'])   # camera A/B
    gain = float(__import__('os').environ.get('BODY_GAIN', 1.0))   # stress test only: exaggerate the body motion
    for k in BODY_CH:
        if k in v: v[k] *= gain
    # the head is carried, not bolted on: it counters the trunk's lean a few frames late, so it lags a touch and settles
    lag = float(__import__('os').environ.get('HEAD_LAG', 4))
    if lag:
        vl = {k: channel(m.CH[k], f - lag, m.FRAMES) * gain for k in ('pelvis_pitch', 'lumbar_pitch', 'chest_pitch', 'chest_lift') if k in m.CH}
        v['lean_lag'] = sum(vl.values())
    return v

def T(v): return Matrix.Translation(Vector(v))
def R(p, axis, deg): return pose.rot_about(p, axis, math.radians(deg))
def S(p, s):
    M = Matrix.Diagonal(Vector((s[0], s[1], s[2], 1.0))); return T(p) @ M @ T(-np.array(p))

def rot_between(a, b):
    a = Vector(a).normalized(); b = Vector(b).normalized()
    return a.rotation_difference(b).to_matrix().to_4x4()

def leg_ik(s, Gp):
    H0, K0, A = (np.array(LJ[s][k]) for k in 'HKA')
    H1 = np.array(Gp @ Vector(H0))
    l1 = np.linalg.norm(K0 - H0); l2 = np.linalg.norm(A - K0)
    n0 = (K0 - H0) - ((K0 - H0) @ (A - H0)) / ((A - H0) @ (A - H0)) * (A - H0)
    if np.linalg.norm(n0) < 1e-6: n0 = np.array([0, -1.0, 0])
    n0 = n0 / np.linalg.norm(n0)
    d = min(np.linalg.norm(A - H1), l1 + l2 - 1e-6); u = (A - H1) / np.linalg.norm(A - H1)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = math.sqrt(max(l1 * l1 - a * a, 0))
    n = n0 - (n0 @ u) * u; n = n / np.linalg.norm(n)
    K1 = H1 + a * u + h * n
    Gt = T(H1) @ rot_between(K0 - H0, K1 - H1) @ T(-H0)
    Gs = T(K1) @ rot_between(A - K0, A - K1) @ T(-K0)
    return Gt, Gs

X, Y = (1, 0, 0), (0, 1, 0)
import os as _os
BREATH_UP = float(_os.environ.get('BREATH_UP', 0.008)); GIRD_UP = float(_os.environ.get('GIRD_UP', 0.010))

NECK_UP = float(_os.environ.get('NECK_UP', 0.003))
def flex_dist(s, deg):
    H0, K0, A = (np.array(LJ[s][k]) for k in 'HKA'); l1 = np.linalg.norm(K0 - H0); l2 = np.linalg.norm(A - K0)
    return math.sqrt(l1 * l1 + l2 * l2 + 2 * l1 * l2 * math.cos(math.radians(deg)))
def pelvis_drop(v, Gp0):
    """pelvis drop so the straighter leg has exactly the authored knee flex (smooth, never locks straight)"""
    tgt = {s: flex_dist(s, v['knee']) for s in 'lr'}
    def excess(dz):
        out = -1e9
        for s in 'lr':
            H1 = np.array(Gp0 @ Vector(LJ[s]['H'])) + np.array((v['sway_x'], -v['hips_fwd'], -dz))
            out = max(out, np.linalg.norm(np.array(LJ[s]['A']) - H1) - tgt[s])
        return out
    lo, hi = -0.08, 0.15
    for _ in range(60):
        m = (lo + hi) / 2
        if excess(m) > 0: lo = m
        else: hi = m
    return (lo + hi) / 2

def solve(v):
    """channel values -> {bone name: world matrix}"""
    G = {}
    Gp0 = R(HC, X, -v['pelvis_pitch']) @ R(HC, Y, v['roll'])
    dz = pelvis_drop(v, Gp0) if 'knee' in v else v.get('settle', 0.0)   # knees authored in degrees -> pelvis height solved
    Gp = T((v['sway_x'], -v['hips_fwd'], -dz)) @ Gp0
    Gl = Gp @ R((0, 0.04, 1.00), X, -v['lumbar_pitch'])
    lift = v.get('chest_lift', 0.0)                                   # thoracic extension at the top: chest up and proud
    Gc = Gl @ R((0, 0.04, 1.16), X, -(v['chest_pitch'] + lift)) @ T((0, 0, 0.0015 * lift))
    lean = v.get('lean_lag', v['pelvis_pitch'] + v['lumbar_pitch'] + v['chest_pitch'] + lift)
    Gn = Gc @ T((0, 0, NECK_UP * v['breath'])) @ R((0, 0.01, 1.42), X, 0.6 * v['head_stab'] * lean)
    Gh = Gn @ R((0, 0.0, 1.52), X, 0.4 * v['head_stab'] * lean)
    b = v['breath']
    Gb = Gc @ T((0, 0, BREATH_UP * (b - 0.4))) @ S((0, 0.035, 1.24), (1 + 0.025 * (b - 0.4), 1 + 0.04 * (b - 0.4), 1 + 0.025 * (b - 0.4)))
    Gbe = Gl @ S((0, 0.03, 1.02), (1, 1 + 0.012 * (b - 0.4) - 0.010 * (v['brace'] - 0.5), 1))
    G.update(pelvis=Gp, lumbar=Gl, chest=Gc, breath=Gb, belly=Gbe, neck=Gn, head=Gh)
    Ggird = {}
    for s in 'lr':
        Ggird[s] = Gc @ T((0, 0.003 * v['scap'], -0.004 * v['scap'] + GIRD_UP * b))
        G['girdle.' + s] = Ggird[s]
        Garm, _ = pose.transforms(s, math.radians(v['elbow']), math.radians(v['wrist']), v['grip'], math.radians(v['shoulder']), math.radians(v.get('twist', 0.0) + v.get('twist_' + s, 0.0)), math.radians(v.get('abduct', 0.0) + v.get('abduct_' + s, 0.0)))   # abduct_l / abduct_r: one arm only (pushdown far arm)
        for nm, g in Garm.items(): G[f'{nm}.{s}'] = Ggird[s] @ g
        Gt, Gs = leg_ik(s, Gp)
        G['thigh.' + s] = Gt; G['shin.' + s] = Gs; G['foot.' + s] = Matrix.Identity(4)
    return G

def apply(G):
    rig = bpy.data.objects['RIG']
    for nm, g in G.items():
        pb = rig.pose.bones.get(nm)
        if pb is None: continue
        L = pb.bone.matrix_local; pb.matrix_basis = L.inverted() @ g @ L
