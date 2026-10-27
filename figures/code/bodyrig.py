# scene.blend -> scene8.blend : full-body rig on top of the approved r7 build (geometry untouched).
# blender -b scene.blend --python bodyrig.py -- scene8.blend
#
# Every non-arm mesh gets weights that are smooth fields of REST POSITION only, so all overlapping layers (muscle, bone,
# skin sheet, head, feet) at one spot get the same weights and move together: no new slits between layers.
# Arm objects keep their arm weights; their bones ride the shoulder girdle in pose2.py (transforms are composed there).
# Bones (all unparented, world transforms computed in pose2.py):
#   pelvis lumbar chest breath belly neck head  girdle.l/r  thigh.l/r shin.l/r foot.l/r
import bpy, sys, json, numpy as np
OUT = sys.argv[sys.argv.index('--') + 1:][0]
LJ = json.load(open('legjoints.json'))

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

BODY = {   # name -> (head, tail) rest positions (only used for the bone's rest frame)
    'pelvis': ((0, 0.03, 0.86), (0, 0.03, 1.00)), 'lumbar': ((0, 0.04, 1.00), (0, 0.04, 1.16)),
    'chest': ((0, 0.04, 1.16), (0, 0.03, 1.42)), 'breath': ((0, 0.035, 1.24), (0, 0.035, 1.34)),
    'belly': ((0, 0.03, 1.02), (0, 0.03, 1.10)), 'neck': ((0, 0.01, 1.42), (0, 0.0, 1.52)),
    'head': ((0, 0.0, 1.52), (0, 0.0, 1.70))}
for s in 'lr':
    H, K, A = (np.array(LJ[s][k]) for k in 'HKA')
    sg = 1 if s == 'l' else -1
    BODY['girdle.' + s] = ((0.03 * sg, 0.03, 1.40), (0.17 * sg, 0.03, 1.40))
    BODY['thigh.' + s] = (tuple(H), tuple(K)); BODY['shin.' + s] = (tuple(K), tuple(A))
    BODY['foot.' + s] = (tuple(A), tuple(A + np.array([0, -0.12, -0.05])))

rig = bpy.data.objects['RIG']; bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for nm, (h, t) in BODY.items():
    if nm in rig.data.edit_bones: continue
    eb = rig.data.edit_bones.new(nm); eb.head = h; eb.tail = t; eb.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')

KZ = (LJ['l']['K'][2] + LJ['r']['K'][2]) / 2; AZ = (LJ['l']['A'][2] + LJ['r']['A'][2]) / 2

def fields(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x)
    W = {}
    foot = ss(AZ + 0.015, AZ - 0.025, z)
    below_knee = ss(KZ + 0.035, KZ - 0.035, z)
    thighz = ss(0.93, 0.79, z)                                # thigh -> pelvis across the hip / gluteal fold
    wF = foot; wS = below_knee * (1 - foot); wT = (1 - below_knee) * thighz
    left = ss(-0.02, 0.02, x)
    for s, side in (('l', left), ('r', 1 - left)):
        W['foot.' + s] = wF * side; W['shin.' + s] = wS * side; W['thigh.' + s] = wT * side
    R = 1 - (wF + wS + wT)
    a1 = ss(0.98, 1.08, z); a2 = ss(1.14, 1.24, z); a3 = ss(1.40, 1.47, z); a4 = ss(1.51, 1.57, z)
    pel = R * (1 - a1); lum = R * a1 * (1 - a2); che = R * a2 * (1 - a3); nec = R * a3 * (1 - a4); hea = R * a4
    g = ss(0.075, 0.125, ax) * ss(1.20, 1.30, z)              # shoulder girdle: deltoid, outer pec, armpit, scapula
    gl = g * (che + nec); che = che * (1 - g); nec = nec * (1 - g)
    W['girdle.l'] = gl * left; W['girdle.r'] = gl * (1 - left)
    # breath: ribcage expands (front + sides + lower ribs), taken out of chest/lumbar
    bf = ss(1.02, 1.12, z) * ss(1.44, 1.36, z) * ss(0.21, 0.13, ax)
    br = bf * (che + lum); che = che * (1 - bf); lum = lum * (1 - bf)
    # belly wall: front of the abdomen, between pelvis and ribs
    ef = ss(0.90, 0.98, z) * ss(1.14, 1.06, z) * ss(0.15, 0.09, ax) * ss(0.06, 0.0, y)
    be = ef * (pel + lum); pel = pel * (1 - ef); lum = lum * (1 - ef)
    W.update(pelvis=pel, lumbar=lum, chest=che, breath=br, belly=be, neck=nec, head=hea)
    return W

def add_group(o, name, w):
    w = np.asarray(w); q = np.round(w * 512).astype(int); idx = np.nonzero(q > 0)[0]
    if not len(idx): return
    vg = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
    for val in np.unique(q[idx]):
        sel = idx[q[idx] == val]; vg.add(sel.tolist(), float(val) / 512, 'REPLACE')

n_obj = 0; chk = []
for o in list(bpy.data.objects):
    if o.type != 'MESH' or 'rig_side' in o: continue
    if o.users_collection[0].name not in ('MUS', 'BONE', 'UNDER', 'SKIN'): continue
    n = len(o.data.vertices); P = np.empty(n * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    W = fields(P); tot = sum(W.values()); chk.append(float(np.abs(tot - 1).max()))
    for nm, w in W.items(): add_group(o, nm, w)
    md = o.modifiers.new('body', 'ARMATURE'); md.object = rig; md.use_deform_preserve_volume = False
    if len(o.modifiers) > 1: print('MODS', o.name, [m.type for m in o.modifiers])
    n_obj += 1
print('BODYRIG objects', n_obj, 'max partition error', max(chk))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
