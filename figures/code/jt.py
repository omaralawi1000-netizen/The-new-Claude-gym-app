import bpy, numpy as np, json
def P(n): o = bpy.data.objects[n]; return np.array([v.co[:] for v in o.data.vertices])
out = {}
for s in 'lr':
    F = P('Femur.' + s); T = P('Tibia.' + s)
    top = F[F[:, 2] > 0.80]; med = top[np.abs(top[:, 0]) < np.median(np.abs(top[:, 0]))]
    hip = med[med[:, 2] > med[:, 2].max() - 0.045].mean(0)
    kn = (F[F[:, 2] < F[:, 2].min() + 0.03].mean(0) + T[T[:, 2] > T[:, 2].max() - 0.03].mean(0)) / 2
    an = T[T[:, 2] < T[:, 2].min() + 0.02].mean(0); an[2] -= 0.012
    out[s] = {'H': hip.tolist(), 'K': kn.tolist(), 'A': an.tolist()}
    print('J', s, hip.round(3), kn.round(3), an.round(3))
S = P('Sacrum') if 'Sacrum' in bpy.data.objects else None
for n in ['Sacrum', 'Manubrium of sternum', 'Body of sternum']:
    if n in bpy.data.objects: Q = P(n); print('B', n, Q.min(0).round(3), Q.max(0).round(3))
print([o.name for o in bpy.data.objects if 'ertebra' in o.name][:10])
json.dump(out, open('legjoints.json', 'w'))
