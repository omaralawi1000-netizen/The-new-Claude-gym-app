import bpy, mathutils, math, sys
sc = bpy.context.scene; cam = sc.camera
loc = mathutils.Vector((-1.85, -3.3, 1.25)); tgt = mathutils.Vector((0.0, 0.0, 0.875))
cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 52
sc.render.resolution_x, sc.render.resolution_y = 1400, 1050; bpy.context.view_layer.update()
fr = cam.data.view_frame(scene=sc)  # tr, br, bl, tl
dg = bpy.context.evaluated_depsgraph_get()
for (px, py) in [(597, 952), (598, 953), (596, 951), (597, 954)]:
    u = px / 1400; v = py / 1050
    p = fr[3] + (fr[0] - fr[3]) * u + (fr[2] - fr[3]) * v
    d = (cam.matrix_world @ p - cam.location).normalized()
    hit, pos, n, i, ob, m = sc.ray_cast(dg, cam.location, d)
    print('HIT', px, py, ob.name if ob else None, tuple(round(c, 4) for c in pos))
