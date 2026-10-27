import bpy, sys, os, numpy as np
sys.path.insert(0, os.getcwd()); import pose
Gs = {s: pose.transforms(s, 0.0, 0.0, 1.0)[0] for s in 'rl'}; pose.apply(Gs)
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if 'rig_side' not in o: continue
    e = o.evaluated_get(dg); me = e.to_mesh()
    a = np.empty(len(me.vertices)*3); me.vertices.foreach_get('co', a); a = a.reshape(-1,3)
    b = np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co', b); b = b.reshape(-1,3)
    d = np.linalg.norm(a-b, axis=1)
    if d.max() > 0.08: print(o.name, round(d.max(),3), int(d.argmax()), [vg.name for vg in o.vertex_groups][:8], o.matrix_world.translation[:], o.rotation_euler[:], o.scale[:])
    e.to_mesh_clear()
