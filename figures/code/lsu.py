import bpy, numpy as np
for o in bpy.data.objects:
    if not o.name.startswith('U:') or not o.name.endswith('.r'): continue
    P=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',P); P=P.reshape(-1,3)
    z=P[:,2].mean()
    if z<0.25 or 0.75<z<1.05: print(round(z,3), o.name, len(P))
