import bpy, numpy as np
def V(n):
    o=bpy.data.objects[n]; P=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',P); P=P.reshape(-1,3)
    return P @ np.array(o.matrix_world)[:3,:3].T + np.array(o.matrix_world)[:3,3]
m=V('Manubrium of sternum'); t=m[m[:,2]>m[:,2].max()-0.01]; print('MAN top', t.mean(0).round(4), 'zmax', m[:,2].max().round(4), 'ymin', m[:,1].min().round(4))
for s in 'lr':
    c=V('Sternocleidomastoid muscle.'+s); b=c[c[:,2]<c[:,2].min()+0.015]; print('SCM bottom',s,b.mean(0).round(4), 'minz', c[:,2].min().round(4))
    cl=V('Clavicle.'+s); med=cl[np.abs(cl[:,0])<np.abs(cl[:,0]).min()+0.01]; print('CLAV med',s,med.mean(0).round(4))
th=V('Throat'); print('throat', th.min(0).round(3), th.max(0).round(3))
nc=V('NeckCore'); print('neck', nc.min(0).round(3), nc.max(0).round(3))
