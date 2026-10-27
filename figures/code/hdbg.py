import bpy, numpy as np
from mathutils.bvhtree import BVHTree
F=np.array([v.co[:] for v in bpy.data.objects['Foot skin.l'].data.vertices]); fs=bpy.data.objects['Foot skin.l']
bvh=BVHTree.FromPolygons([tuple(v) for v in F],[tuple(p.vertices) for p in fs.data.polygons])
P=np.array([v.co[:] for v in bpy.data.objects['U:body'].data.vertices])
c=np.array([0.125,0.046,0.054]); d=np.linalg.norm(P-c,axis=1); idx=np.argsort(d)[:12]
axy = F[F[:, 2] > 0.08][:, :2].mean(0); print('AXY', axy.round(3))
ang = np.arctan2(F[:, 1] - axy[1], F[:, 0] - axy[0]); NB=72; bi=((ang+np.pi)/(2*np.pi)*NB).astype(int)%NB
for i in idx:
    q,n,_,dd=bvh.find_nearest(P[i]); r=P[i,:2]-axy; a=np.arctan2(r[1],r[0]); b=int((a+np.pi)/(2*np.pi)*NB)%NB
    rz=F[bi==b,2].max() if (bi==b).any() else None
    print('V', P[i].round(4), 'dist', round(dd,4), 'rimz', rz and round(rz,3), 'radial P', round(np.linalg.norm(r),4), 'radial q', round(np.linalg.norm(np.array(q)[:2]-axy),4))
