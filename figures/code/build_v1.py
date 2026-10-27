# Build base.blend: Z-Anatomy muscles + key bones + skin hands/feet, cleaned. Run: blender -b --python build.py -- MODELDIR out.blend
import bpy, sys, re, mathutils
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
DROP_TISSUE = re.compile(r'Platysma|Risorius|Mentalis|pharyn|hyoid|thyro|glossus|Palat|digastric|Longus colli|Longus capitis|Cremaster|fascia|sheath|retinac|septum|bursa|aponeuro|Cross Section|tarsus|trochlea|tendinous ring|ligament', re.I)
in_hand = lambda c: abs(c.x) > 0.19 and c.z < 0.865
in_foot = lambda c: c.z < 0.075

kill = []
mus = imp('MuscularSystem100.fbx', 'MUS')
for o in mus:
    if o.type != 'MESH': kill.append(o); continue
    c = centre(o); n = o.name
    if not (SIDE.search(n) or n.count('.') == 0) or DROP_TISSUE.search(n) or c.z > 1.53 or in_hand(c) or in_foot(c):
        kill.append(o)

BONES = re.compile(r'^(Clavicle|Scapula|Humerus|Radius|Ulna|Body of sternum|Manubrium|Xiphoid|Rib|Hip bone|Ilium|Sacrum|Femur|Patella|Tibia|Fibula|Costal cartilage|\w+ costal cartilage|.* rib|Thoracic vertebra|Lumbar vertebra|Cervical vertebra|Axis|Atlas)', re.I)
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
# open the abs: cut the obliques' aponeurosis where it lies in front of rectus abdominis
import numpy as np
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
