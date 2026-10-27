import bpy, numpy as np
def V(n):
    o=bpy.data.objects[n]; P=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',P); return P.reshape(-1,3)
for n in ('Hip bone.r','Adductor longus.r','Gracilis muscle.r'):
    P=V(n); m=P[np.abs(P[:,0])<0.04]
    if len(m): print('Q', n, 'near-mid zmin %.3f zmax %.3f ymin %.3f ymax %.3f xmin %.3f' % (m[:,2].min(), m[:,2].max(), m[:,1].min(), m[:,1].max(), np.abs(m[:,0]).min()))
P=V('U:body'); m=P[(np.abs(P[:,0])<0.03)&(P[:,2]<0.95)&(P[:,2]>0.6)]; print('Q sheet front mid z range', m[:,2].min(), 'y at low', m[m[:,2].argmin()])
