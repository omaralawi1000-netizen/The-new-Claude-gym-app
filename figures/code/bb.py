import bpy, numpy as np
for n in ['Rectus femoris muscle.r','Patella.r','Tibialis anterior muscle.r','Vastus lateralis muscle.r','Vastus medialis muscle.r']:
    o=bpy.data.objects[n]; P=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',P); P=P.reshape(-1,3)
    print(n, P.min(0).round(3), P.max(0).round(3), len(P))
