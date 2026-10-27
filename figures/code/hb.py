import bpy, bmesh, numpy as np
o = bpy.data.objects['Foot skin.l']; bm = bmesh.new(); bm.from_mesh(o.data)
c0 = np.array([0.128, 0.067, 0.047])
b = [v for v in bm.verts if v.is_boundary]
print('FS boundary verts', len(b))
near = [v for v in b if np.linalg.norm(np.array(v.co) - c0) < 0.03]
print('FS near tick boundary', len(near), [tuple(round(x,3) for x in v.co) for v in near[:8]])
allv = np.array([v.co[:] for v in bm.verts]); d = np.linalg.norm(allv - c0, axis=1); print('FS min dist', d.min().round(4))
nm = [v for v in bm.verts if not v.is_manifold]; print('nonmanifold', len(nm))
# components
bm.verts.ensure_lookup_table()
nmp = np.array([v.co[:] for v in nm]); dd = np.linalg.norm(nmp - c0, axis=1)
print('FS nonmanifold near', (dd < 0.02).sum(), 'closest', dd.min().round(4), nmp[dd.argsort()[:5]].round(3).tolist())
print('FS nm z range', nmp[:,2].min().round(3), nmp[:,2].max().round(3))
