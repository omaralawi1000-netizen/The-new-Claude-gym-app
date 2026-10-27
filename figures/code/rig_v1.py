# base.blend + joints.json -> rig.blend : armature (unparented bones), per-vertex weights for arms/hands, reshape, egg head.
# blender -b base.blend --python rig.py -- rig.blend
import bpy, sys, re, json, numpy as np, mathutils
OUT = sys.argv[sys.argv.index('--')+1:][0]
JS = json.load(open('joints.json'))

ARM = re.compile(r'biceps brachii|triceps brachii|Brachialis|Brachioradialis|carpi|pronator|Supinator|Palmaris|Flexor digitorum (superficialis|profundus)|superficialis|Extensor digitorum\.|Extensor digiti minimi\.|indicis|pollicis|Anconeus|^Humerus|^Radius|^Ulna', re.I)

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def nrm(v): return v / np.linalg.norm(v)

def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)

FWD = np.array([0, -1.0, 0])

def bones_for(side):
    J = {k: np.array(v) for k, v in JS[side].items()}
    B = {}  # name -> (head, tail)
    B['upper'] = (J['S'], J['E']); B['fore'] = (J['E'], J['W']); B['hand'] = (J['W'], J['f2'][1])
    for i in range(1, 5):
        c = J['f%d' % i]
        for j in range(3): B[f'f{i}{j}'] = (c[j + 1], c[j + 2])
    c = J['f0']
    for j in range(3): B[f't{j}'] = (c[j], c[j + 1])
    return J, B

def weights(P, J):
    """P: (n,3) rest positions of arm vertices -> dict bone -> weight array"""
    W = {}
    aU = nrm(J['E'] - J['S']); aF = nrm(J['W'] - J['E']); aH = nrm(J['f2'][1] - J['W'])
    tF = ss(-0.03, 0.03, (P - J['E']) @ nrm(aU + aF))
    tH = ss(-0.012, 0.012, (P - J['W']) @ nrm(aF + aH))
    W['upper'] = 1 - tF; W['fore'] = tF * (1 - tH)
    hand = tF * tH
    # finger membership by soft-min distance to each finger polyline (base..tip)
    D = []
    for i in range(5):
        c = J['f%d' % i]
        D.append(np.min([seg_dist(P, c[k], c[k + 1]) for k in range(len(c) - 1)], axis=0))
    D = np.array(D); m = np.exp(-(D - D.min(0)) / 0.0025); m /= m.sum(0)
    W['hand'] = np.zeros(len(P))
    for i in range(5):
        c = J['f%d' % i]
        if i == 0:
            names = ['hand', 't0', 't1', 't2']; joints = c[0:3]; bw = [0.012, 0.008, 0.006]
        else:
            names = ['hand', f'f{i}0', f'f{i}1', f'f{i}2']; joints = c[1:4]; bw = [0.008, 0.006, 0.005]
        s = []
        for k, jp in enumerate(joints):
            pi = k if i == 0 else k + 1
            dprev = nrm(c[pi] - c[pi - 1]) if pi > 0 else nrm(c[1] - c[0]); dnext = nrm(c[pi + 1] - c[pi])
            s.append(ss(-bw[k], bw[k], (P - jp) @ nrm(dprev + dnext)))
        part = [1 - s[0], s[0] * (1 - s[1]), s[1] * (1 - s[2]), s[2]]
        for nm, w in zip(names, part):
            W[nm] = W.get(nm, 0) + hand * m[i] * w
    return W

sc = bpy.context.scene
arm = bpy.data.armatures.new('RIG'); ao = bpy.data.objects.new('RIG', arm); sc.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
ALL = {}
for side in 'rl':
    J, B = bones_for(side); ALL[side] = (J, B)
    for nm, (h, t) in B.items():
        eb = arm.edit_bones.new(f'{nm}.{side}'); eb.head = h; eb.tail = t; eb.use_deform = True
bpy.ops.object.mode_set(mode='OBJECT')

for o in list(bpy.data.objects):
    if o.type != 'MESH': continue
    coll = o.users_collection[0].name
    n = len(o.data.vertices); P = np.empty(n * 3); o.data.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    M = np.array(o.matrix_world); P = P @ M[:3, :3].T + M[:3, 3]
    cx = P[:, 0].mean()
    isarm = (coll == 'MUS' or coll == 'BONE') and ARM.search(o.name) and 'foot' not in o.name.lower() and 'femoris' not in o.name.lower()
    ishand = coll == 'SKIN' and abs(cx) > 0.19 and P[:, 2].mean() > 0.4
    if not (isarm or ishand): continue
    side = 'l' if cx > 0 else 'r'
    W = weights(P, ALL[side][0])
    for nm, w in W.items():
        w = np.asarray(w)
        idx = np.nonzero(w > 1e-3)[0]
        if not len(idx): continue
        vg = o.vertex_groups.new(name=f'{nm}.{side}')
        for v in idx: vg.add([int(v)], float(w[v]), 'REPLACE')
    md = o.modifiers.new('arm', 'ARMATURE'); md.object = ao; md.use_deform_preserve_volume = True
    o['rig_side'] = side
print('rigged', sum(1 for o in bpy.data.objects if 'rig_side' in o))
bpy.ops.wm.save_as_mainfile(filepath=OUT)
