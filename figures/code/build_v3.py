# Build base.blend: Z-Anatomy muscles + key bones + skin hands/feet, cleaned. Run: blender -b --python build.py -- MODELDIR out.blend
import bpy, sys, re, mathutils, numpy as np
argv = sys.argv[sys.argv.index('--')+1:]
M, OUT = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(fn, coll):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f"{M}/{fn}")
    new = [o for o in bpy.data.objects if o not in before]
    c = bpy.data.collections.new(coll); bpy.context.scene.collection.children.link(c)
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
    return new

def centre(o):
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return sum(bb, mathutils.Vector()) / 8

SIDE = re.compile(r'\.(l|r)$')
DROP_TISSUE = re.compile(r'anguli oris|labii|Zygomaticus|Buccinator|masseter|Nasalis|Orbicularis|Procerus|Corrugator|Depressor|Temporalis|pterygoid|Platysma|Risorius|Mentalis|pharyn|hyoid|thyro|glossus|Palat|digastric|Longus colli|Longus capitis|Cremaster|fascia|sheath|retinac|septum|bursa|aponeuro|Cross Section|Pyramidalis|Pectineus|tarsus|trochlea|tendinous ring|ligament', re.I)
in_hand = lambda c: abs(c.x) > 0.19 and c.z < 0.865
in_foot = lambda c: c.z < 0.075

kill = []
mus = imp('MuscularSystem100.fbx', 'MUS')
for o in mus:
    if o.type != 'MESH': kill.append(o); continue
    c = centre(o); n = o.name
    if not (SIDE.search(n) or n.count('.') == 0) or DROP_TISSUE.search(n) or c.z > 1.53 or in_hand(c) or in_foot(c):
        kill.append(o)

BONES = re.compile(r'^(?!Atlas|Axis)(Clavicle|Scapula|Humerus|Radius|Ulna|Body of sternum|Manubrium|Xiphoid|Rib|Hip bone|Ilium|Sacrum|Femur|Patella|Tibia|Fibula|Costal cartilage|\w+ costal cartilage|.* rib|Thoracic vertebra|Lumbar vertebra|Cervical vertebra|Axis|Atlas)', re.I)
bone = imp('SkeletalSystem100.fbx', 'BONE')
for o in bone:
    if o.type != 'MESH': kill.append(o); continue
    n = o.name
    if not (SIDE.search(n) or '.' not in n) or not BONES.search(n): kill.append(o)

skin = imp('Regions of human body100.fbx', 'SKIN')
for o in skin:
    if o.type != 'MESH' or not SIDE.search(o.name): kill.append(o); continue
    c = centre(o)
    if not (in_hand(c) or in_foot(c) or re.search(r'nail', o.name, re.I) and (in_hand(c) or c.z < 0.1)): kill.append(o)

under = imp('Regions of human body100.fbx', 'UNDER')
for o in under:
    if o.type != 'MESH': kill.append(o); continue
    base = re.sub(r'\.\d{3}$', '', o.name); c = centre(o)
    if not SIDE.search(base) or c.z > 1.42 or in_hand(c) or (in_foot(c) and not re.search(r'ankle|malleol', base, re.I)) or re.search(r'nail|perionyx|hair|auric|eye|helix|tragus|concha', base, re.I):
        kill.append(o); continue
    o.name = 'U:' + base

# flatten parenting: keep world transforms, clear parents
for o in list(bpy.data.objects):
    if o.parent:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
bpy.context.view_layer.update()
for o in set(kill): bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    o.parent and None
for c in ('MUS', 'BONE', 'SKIN'):
    objs = bpy.data.collections[c].objects
    print(c, len(objs), sum(len(o.data.vertices) for o in objs))
print('kept skin:', sorted(o.name for o in bpy.data.collections['SKIN'].objects if o.name.endswith('.r')))
print('kept bones:', sorted(o.name for o in bpy.data.collections['BONE'].objects if not o.name.endswith('.l')))
# bake transforms: unique mesh per object, world coordinates, identity matrix (mirrored .l objects share data otherwise)
import bmesh
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    M = o.matrix_world.copy(); o.data = o.data.copy(); o.data.transform(M)
    if M.determinant() < 0:
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
    o.matrix_world = mathutils.Matrix.Identity(4)
def V(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)
# under-body: each skin vertex is pushed straight inwards to the first muscle/bone it meets (deep muscles ignored),
# then the depth is low-pass filtered so rays that fall through a gap take their neighbours' depth: gaps are bridged
# by smooth clay at the level of the surrounding muscles instead of showing dark slits.
from mathutils.bvhtree import BVHTree
DEEP = re.compile(r'Iliacus|Psoas|Coccygeus|Transversus abdominis|Internal abdominal oblique|intercostal|Quadratus|Obturator|Levator ani|Pectineus|Gemell|Piriformis|Flexor hallucis longus|Tibialis posterior|Plantaris|Flexor digitorum longus|Rotatores|Levatores|Multifidus|coccygeus|Puborectalis|sphincter|Bulbo|Ischiocavernosus|perine', re.I)
VS, FS, off = [], [], 0
for cn in ('MUS', 'BONE'):
    for o in bpy.data.collections[cn].objects:
        if DEEP.search(o.name): continue
        P = V(o); VS.append(P)
        for p in o.data.polygons: FS.append([off + k for k in p.vertices])
        off += len(P)
bvh = BVHTree.FromPolygons(np.concatenate(VS).tolist(), FS)
pv, pf, off = [], [], 0
for o in bpy.data.collections['MUS'].objects:
    if 'ectoralis major' not in o.name: continue
    P = V(o); pv.append(P); pf += [[off + k for k in p.vertices] for p in o.data.polygons]; off += len(P)
pecbvh = BVHTree.FromPolygons(np.concatenate(pv).tolist(), pf)
DEPTH = float(__import__('os').environ.get('UNDER_DEPTH', 0.002))
SOFT = re.compile(r'Inguinal|Hypogastric|ankle|malleol|Femoral triangle|Pubic|Urogenital', re.I)
# one continuous skin sheet per group, so neighbouring regions cannot pull apart into cracks
ARMREG = re.compile(r'arm|elbow|cubital|bicipital|wrist|olecran', re.I)
groups = {}
for o in list(bpy.data.collections['UNDER'].objects):
    P = V(o); cx = P[:, 0].mean()
    g = ('U:arm region.' + ('l' if cx > 0 else 'r')) if ARMREG.search(o.name) and abs(cx) > 0.12 else 'U:body'
    groups.setdefault(g, []).append(o)
for g, objs in groups.items():
    bm = bmesh.new()
    for o in objs: bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    me = bpy.data.meshes.new(g); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(g, me); bpy.data.collections['UNDER'].objects.link(ob)
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)
print('under groups', {g: len(v) for g, v in groups.items()})
def sst(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def nbmean(A, nb):
    return np.array([A[k].mean(0) if len(k) else A[i] for i, k in enumerate(nb)])
for o in bpy.data.collections['UNDER'].objects:
    P = V(o)
    # inward direction = towards the nearest muscle/bone surface (region meshes have mixed winding, so no normals)
    D = np.zeros_like(P); T = np.zeros(len(P))
    for i in range(len(P)):
        loc, _, _, d = bvh.find_nearest(mathutils.Vector(P[i]))
        if loc is not None and d > 1e-6: D[i] = (np.array(loc) - P[i]) / d; T[i] = d
    nb = [[] for _ in range(len(P))]
    for e in o.data.edges:
        a, c = e.vertices; nb[a].append(c); nb[c].append(a)
    nb = [np.array(x, int) for x in nb]
    for _ in range(4): D = nbmean(D, nb); D /= np.maximum(np.linalg.norm(D, axis=1), 1e-9)[:, None]
    # between the pecs the sheet rises to the pec edges: a soft groove instead of a toothed crack down the sternum
    wst = sst(0.04, 0.012, np.abs(P[:, 0])) * sst(1.16, 1.20, P[:, 2]) * sst(1.44, 1.40, P[:, 2]) * (P[:, 1] < -0.03)
    for i in np.nonzero(wst > 0)[0]:
        d = pecbvh.find_nearest(mathutils.Vector(P[i]))[3]
        if d is not None: T[i] = (1 - wst[i]) * T[i] + wst[i] * min(T[i], d + 0.0015)
    for _ in range(10):        # lower envelope: no vertex sits much deeper than its neighbours
        T = np.minimum(T, nbmean(T, nb) + 0.0015)
    for _ in range(3): T = 0.5 * T + 0.5 * nbmean(T, nb)
    # over the sternum itself the sheet rides just above the bone, hiding its bumpy cartilage joints
    wsb = sst(0.03, 0.012, np.abs(P[:, 0])) * sst(1.17, 1.21, P[:, 2]) * sst(1.43, 1.40, P[:, 2]) * (P[:, 1] < -0.03)
    OFF = DEPTH * (1 - wsb) - 0.0035 * wsb
    o.data.vertices.foreach_set('co', (P + D * (T + OFF)[:, None]).ravel()); o.data.update()
    bm = bmesh.new(); bm.from_mesh(o.data)
    for _ in range(3): bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons: p.use_smooth = True
# feet: keep the skin only below the ankle so leg tendons and malleoli show, like an ecorche
for o in bpy.data.collections['SKIN'].objects:
    P = V(o)
    if P[:, 2].mean() > 0.3 or P[:, 2].max() <= 0.11: continue
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(P[:, 2] > 0.11)[0]], context='VERTS')
    nf = bmesh.ops.holes_fill(bm, edges=bm.edges, sides=400)['faces']
    bmesh.ops.triangulate(bm, faces=nf); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(o.data); bm.free()
def sst(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
# wrap the top of the foot skin tightly under the ankle tendons (no slipper lip): same pull as the under-body,
# fading in from the instep upwards
for o in bpy.data.collections['SKIN'].objects:
    P = V(o)
    if P[:, 2].mean() > 0.3: continue
    w = sst(0.03, 0.068, P[:, 2])
    if w.max() <= 0: continue
    D = np.zeros_like(P); T = np.zeros(len(P))
    for i in np.nonzero(w > 0)[0]:
        loc, _, _, d = bvh.find_nearest(mathutils.Vector(P[i]))
        if loc is not None and d > 1e-6: D[i] = (np.array(loc) - P[i]) / d; T[i] = d
    nb = [[] for _ in range(len(P))]
    for e in o.data.edges:
        a, c = e.vertices; nb[a].append(c); nb[c].append(a)
    nb = [np.array(x, int) for x in nb]
    for _ in range(4): D = nbmean(D, nb); D /= np.maximum(np.linalg.norm(D, axis=1), 1e-9)[:, None]
    for _ in range(6): T = np.minimum(T, nbmean(T, nb) + 0.0015)
    for _ in range(2): T = 0.5 * T + 0.5 * nbmean(T, nb)
    print('FOOT', o.name, 'n', len(P), 'zmax %.3f' % P[:,2].max(), 'w>0', int((w>0).sum()), 'T %.4f' % T[w>0.5].mean() if (w>0.5).any() else '-')
    o.data.vertices.foreach_set('co', (P + D * ((T + 0.003) * w)[:, None]).ravel()); o.data.update()
# merge neck muscle tops smoothly into the neck column under the head
for o in bpy.data.collections['MUS'].objects:
    P = V(o)
    if P[:, 2].max() <= 1.46 or abs(P[:, 0].mean()) > 0.12: continue
    z = P[:, 2]; s = sst(1.46, 1.53, z)
    tt = np.clip((z - 1.42) / 0.19, 0, 1); f = tt * tt * (3 - 2 * tt)
    rx = 0.037 + 0.015 * f; ry = 0.041 + 0.017 * f
    dx, dy = P[:, 0], P[:, 1] - 0.012
    r = np.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    k = np.where(r > 1, 1 + (r - 1) * (1 - s), r) / np.maximum(r, 1e-6)
    P[:, 0] = dx * k; P[:, 1] = 0.012 + dy * k
    o.data.vertices.foreach_set('co', P.ravel()); o.data.update()
# trim muscle tops under the egg head so no shards poke out beside it
for o in bpy.data.collections['MUS'].objects:
    P = V(o)
    if P[:, 2].max() <= 1.535: continue
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(P[:, 2] > 1.535)[0]], context='VERTS'); bm.to_mesh(o.data); bm.free()
# open the abs: cut the obliques' aponeurosis where it lies in front of rectus abdominis
def V(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)
for sd in 'lr':
    ra = V(bpy.data.objects['Rectus abdominis muscle.' + sd])
    zb = np.linspace(ra[:, 2].min(), ra[:, 2].max(), 40)
    xb = np.array([np.abs(ra[(ra[:, 2] >= zb[max(i - 1, 0)]) & (ra[:, 2] <= zb[min(i + 1, 39)]), 0]).max() for i in range(40)])
    for nm in ('External abdominal oblique muscle.', 'Internal abdominal oblique muscle.'):
        o = bpy.data.objects[nm + sd]; P = V(o)
        lim = np.interp(P[:, 2], zb, xb, left=0, right=0)
        t = np.clip((lim + 0.012 - np.abs(P[:, 0])) / 0.016, 0, 1); t = t * t * (3 - 2 * t)
        t *= (P[:, 1] < -0.02)
        P[:, 1] += 0.03 * t                       # tuck the sheet behind the rectus with a smooth fold
        o.data.vertices.foreach_set('co', P.ravel()); o.data.update(); cut = t > 0.5
        print('cut', o.name, int(cut.sum()))
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT)
