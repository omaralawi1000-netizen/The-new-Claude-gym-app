import bpy, numpy as np
for cn in ('MUS','BONE','SKIN'):
    zs=[]
    for o in bpy.data.collections[cn].objects:
        a=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',a); zs.append((a[2::3].min(), o.name))
    zs.sort(); print(cn, [(round(z,4),n) for z,n in zs[:3]])
