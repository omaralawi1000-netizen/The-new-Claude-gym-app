import bpy, numpy as np
o=bpy.data.objects['Rectus femoris muscle.r']; P=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',P); P=P.reshape(-1,3)
for z in np.arange(0.37,0.50,0.01):
    k=P[(P[:,2]>=z)&(P[:,2]<z+0.01)]
    if len(k): print('RF z',round(z,2),len(k),k.min(0).round(3),k.max(0).round(3))
