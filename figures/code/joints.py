# Joint finder shared by rig.py. Returns dict of joints per side ('r','l') from bone meshes in base.blend.
import bpy, numpy as np

def verts(name):
    o = bpy.data.objects[name]
    n = len(o.data.vertices); a = np.empty(n * 3); o.data.vertices.foreach_get('co', a)
    a = a.reshape(-1, 3); M = np.array(o.matrix_world)
    return a @ M[:3, :3].T + M[:3, 3]

def ends(name, prox_hint, frac=0.04):
    """centroid of the vertex caps at both ends of a long bone along its PCA axis; returns (proximal, distal)"""
    v = verts(name); c = v.mean(0)
    _, _, vt = np.linalg.svd(v - c, full_matrices=False); ax = vt[0]
    t = (v - c) @ ax; L = t.max() - t.min()
    a = v[t > t.max() - frac * L].mean(0); b = v[t < t.min() + frac * L].mean(0)
    return (a, b) if np.linalg.norm(a - prox_hint) < np.linalg.norm(b - prox_hint) else (b, a)

FING = ['first', 'second', 'third', 'fourth', 'fifth']

def find(side):
    s = '.' + side
    J = {}
    hp, hd = ends('Humerus' + s, np.array([0, 0, 2.0]), 0.03)
    J['S'] = hp; J['E'] = hd
    rp, rd = ends('Radius' + s, hd, 0.03); up_, ud = ends('Ulna' + s, hd, 0.03)
    J['W'] = (rd + ud) / 2 + (rd + ud - rp - up_) / np.linalg.norm(rd + ud - rp - up_) * 0.012
    for i, f in enumerate(FING):
        chain = []
        mp, md = ends(f'{["First","Second","Third","Fourth","Fifth"][i]} metacarpal bone' + s, J['W'], 0.06)
        chain.append(mp)
        prev = md
        names = ['Proximal', 'Distal'] if i == 0 else ['Proximal', 'Middle', 'Distal']
        for k, nm in enumerate(names):
            p, d = ends(f'{nm} phalanx of {f} finger of hand' + s, prev, 0.06)
            chain.append((prev + p) / 2)   # joint between previous bone end and this bone start
            prev = d
        chain.append(prev)                 # fingertip (bone end)
        J['f%d' % i] = np.array(chain)     # base(carpal), MCP, (PIP), DIP/IP, tip
    return J

if __name__ == '__main__':
    for sd in 'rl':
        J = find(sd)
        for k, v in J.items(): print(sd, k, np.round(v, 3).tolist())
    import json
    json.dump({sd: {k: np.asarray(v).tolist() for k, v in find(sd).items()} for sd in 'rl'}, open('joints.json', 'w'))
