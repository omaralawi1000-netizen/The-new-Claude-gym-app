import bpy, numpy as np
from collections import Counter
c = Counter(); nv = 0; rigged = 0; others = []
for o in bpy.data.objects:
    if o.type != 'MESH': others.append((o.name, o.type)); continue
    cn = o.users_collection[0].name if o.users_collection else '-'
    c[cn] += 1; nv += len(o.data.vertices)
    if 'rig_side' in o: rigged += 1
    if cn not in ('MUS', 'BONE', 'UNDER', 'SKIN'): others.append((o.name, cn))
    if o.matrix_world != o.matrix_world.Identity(4): print('NONID', o.name)
print('COLL', dict(c), 'verts', nv, 'rigged', rigged)
print('OTHER', others)
for o in bpy.data.objects:
    if o.type == 'MESH' and 'rig_side' in o: print('RIGMOD', o.name, [m.type for m in o.modifiers]); break
for n in ['Femur.r', 'Tibia.r', 'Hip bone.r']:
    o = bpy.data.objects.get(n)
    if o: P = np.array([v.co[:] for v in o.data.vertices]); print('B', n, P.min(0).round(3), P.max(0).round(3))
