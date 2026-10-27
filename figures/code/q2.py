import bpy, bmesh, numpy as np
from mathutils import kdtree
def V(o):
    a=np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co',a); return a.reshape(-1,3)
f=bpy.data.objects['Foot skin.r']; u=bpy.data.objects['U:body']
U=V(u); kd=kdtree.KDTree(len(U)); [kd.insert(p,i) for i,p in enumerate(U)]; kd.balance()
bm=bmesh.new(); bm.from_mesh(f.data); B=[v.co.copy() for v in bm.verts if v.is_boundary]
z=np.array([b.z for b in B]); print('foot boundary z range', z.min(), z.max(), len(B))
d=np.array([kd.find(b)[2] for b in B]); print('dist to U:body: median %.4f max %.4f' % (np.median(d), d.max()))
bm2=bmesh.new(); bm2.from_mesh(u.data); UB=np.array([tuple(v.co) for v in bm2.verts if v.is_boundary and v.co.z<0.2 and v.co.x<0])
print('U:body boundary near ankle r: n', len(UB), 'z', UB[:,2].min() if len(UB) else None, UB[:,2].max() if len(UB) else None)
FK=kdtree.KDTree(len(f.data.vertices)); [FK.insert(p,i) for i,p in enumerate(V(f))]; FK.balance()
if len(UB): dd=np.array([FK.find(p)[2] for p in UB]); print('U boundary -> foot: median %.4f max %.4f' % (np.median(dd), dd.max()))
