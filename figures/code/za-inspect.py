import bpy, sys, mathutils
argv = sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
for f in argv[:-1]:
    bpy.ops.import_scene.fbx(filepath=f)
out = open(argv[-1], 'w')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
out.write(f"objects {len(bpy.data.objects)} meshes {len(meshes)}\n")
tv = 0
lo = mathutils.Vector((1e9,)*3); hi = -lo
for o in meshes:
    n = len(o.data.vertices); tv += n
    bb = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    for v in bb:
        lo = mathutils.Vector(map(min, lo, v)); hi = mathutils.Vector(map(max, hi, v))
    c = sum(bb, mathutils.Vector()) / 8
    out.write(f"{o.name}\t{n}\t{c.x:.3f},{c.y:.3f},{c.z:.3f}\n")
out.write(f"total verts {tv} bbox {tuple(round(x,3) for x in lo)} {tuple(round(x,3) for x in hi)}\n")
bpy.ops.wm.save_as_mainfile(filepath=argv[-1].replace('.txt','.blend'))
