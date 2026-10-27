import bpy, mathutils, math, sys
sc = bpy.context.scene; cam = sc.camera
loc = mathutils.Vector((-1.85, -3.3, 1.25)); tgt = mathutils.Vector((0.0, 0.0, 0.85))
cam.location = loc; cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 48
sc.render.resolution_x, sc.render.resolution_y = 1920, 1280; bpy.context.view_layer.update()
fr = cam.data.view_frame(scene=sc)  # tr, br, bl, tl
dg = bpy.context.evaluated_depsgraph_get()
for (px, py) in [(890, 954), (890, 945), (891, 962), (888, 950), (893, 950)]:
    u = px / 1920; v = py / 1280
    p = fr[3] + (fr[0] - fr[3]) * u + (fr[2] - fr[3]) * v
    d = (cam.matrix_world @ p - cam.location).normalized()
    hit, pos, n, i, ob, m = sc.ray_cast(dg, cam.location, d)
    print('HIT', px, py, ob.name if ob else None, tuple(round(c, 4) for c in pos))
