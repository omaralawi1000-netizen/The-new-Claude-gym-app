# pixel travel of body landmarks over the loop (960x640 clip camera), plus knee angle — no rendering
import bpy, sys, os, math, numpy as np
sys.path.insert(0, os.getcwd())
import pose2
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 960, 640
cam = sc.camera; loc, tgt, lens = (-1.85, -3.3, 1.25), (0.0, 0.0, 0.85), 48; cam.data.lens = lens
M = pose2.load(os.environ.get('MOTION', 'curl'))
def setcam(o=0.0, l=0.0):
    c, s = math.cos(math.radians(o)), math.sin(math.radians(o)); dx, dy = loc[0] - tgt[0], loc[1] - tgt[1]
    L = Vector((tgt[0] + dx * c - dy * s, tgt[1] + dx * s + dy * c, loc[2] + l)); cam.location = L
    cam.rotation_euler = (Vector(tgt) - L).to_track_quat('-Z', 'Y').to_euler(); bpy.context.view_layer.update()
LM = {'head top': ('head', (0, 0, 1.70)), 'sternum': ('breath', (0, -0.075, 1.40)), 'trap/shoulder L': ('girdle.l', (0.15, 0.02, 1.47)),
      'shoulder R': ('girdle.r', (-0.19, 0.02, 1.40)), 'pelvis front': ('pelvis', (0, -0.09, 0.92)),
      'bar R': ('hand.r', tuple(__import__('pose').GRIP['r']['c'])),
      'knee L': ('thigh.l', None), 'knee R': ('thigh.r', None), 'foot L': ('foot.l', (0.15, -0.08, 0.02))}
cammove = os.environ.get('CAMMEAS') == '1'
P = {k: [] for k in LM}; KA = []
for f in range(M.FRAMES):
    v = pose2.values(M, f)
    if os.environ.get('ONLY'):
        keep = os.environ['ONLY'].split(',')
        for k in ('shoulder', 'scap', 'breath', 'brace', 'pelvis_pitch', 'lumbar_pitch', 'chest_pitch', 'hips_fwd', 'settle', 'sway_x', 'roll'):
            if k not in keep: v[k] = 0.4 if k == 'breath' else 0.0
    G = pose2.solve(v)
    setcam(v.get('cam_orbit', 0) if cammove else 0, v.get('cam_lift', 0) if cammove else 0)
    for k, (b, p) in LM.items():
        if p is None: p = pose2.LJ[k[-1].lower()]['K']
        w = G[b] @ Vector(p); q = world_to_camera_view(sc, cam, w); P[k].append((q.x * 960, (1 - q.y) * 640))
    K0 = np.array(pose2.LJ['l']['K']); H0 = np.array(pose2.LJ['l']['H']); A = np.array(pose2.LJ['l']['A'])
    K1 = np.array(G['thigh.l'] @ Vector(K0)); H1 = np.array(G['thigh.l'] @ Vector(H0))
    a = H1 - K1; b = A - K1; KA.append(180 - math.degrees(math.acos(a @ b / np.linalg.norm(a) / np.linalg.norm(b))))
for k, xs in P.items():
    xs = np.array(xs); r = xs.max(0) - xs.min(0); st = np.linalg.norm(np.diff(np.vstack([xs, xs[:1]]), axis=0), axis=1)
    acc = np.linalg.norm(np.diff(np.vstack([xs, xs[:2]]), 2, axis=0), axis=1)
    print('%-16s travel x %5.1f px  y %5.1f px | path span %5.1f | max step %.2f px/f at f%d | max accel %.3f at f%d' % (k, r[0], r[1], np.linalg.norm(r), st.max(), st.argmax(), acc.max(), acc.argmax()))
KA = np.array(KA); print('knee flex deg: min %.1f max %.1f' % (KA.min(), KA.max()))
