import bpy, numpy as np
o = bpy.data.objects['U:body']; me = o.data
n = len(me.polygons); C = np.empty(n*3); N = np.empty(n*3)
me.polygons.foreach_get('center', C); me.polygons.foreach_get('normal', N); C = C.reshape(-1,3); N = N.reshape(-1,3)
for sd, sg in (('r', -1), ('l', 1)):
    fs = bpy.data.objects['Foot skin.' + sd]; F = np.empty(len(fs.data.vertices)*3); fs.data.vertices.foreach_get('co', F); F = F.reshape(-1,3)
    print(sd, 'foot skin z', F[:,2].min().round(3), F[:,2].max().round(3), 'top ring xy', F[F[:,2] > F[:,2].max()-0.01].mean(0).round(3))
    m = (C[:,2] < 0.18) & (np.sign(C[:,0]) == sg)
    ax = C[m & (C[:,2] > 0.10) & (C[:,2] < 0.14)][:, :2].mean(0)
    r = C[m][:, :2] - ax; d = (N[m][:, :2] * r).sum(1)
    print(sd, 'faces', m.sum(), 'inward', (d < 0).sum(), 'U:body z min', C[m][:,2].min().round(3))
    inw = C[m][d < 0]
    if len(inw): 
        for zb in np.arange(0.04, 0.18, 0.02):
            k = inw[(inw[:,2] >= zb) & (inw[:,2] < zb+0.02)]
            if len(k): print('  z', round(zb,2), len(k), 'mean', k.mean(0).round(3))
