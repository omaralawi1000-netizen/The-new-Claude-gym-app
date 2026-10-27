import bpy, numpy as np, json
J = json.load(open('joints.json'))
for o in bpy.data.objects:
    if 'biceps brachii' in o.name or o.name.startswith('Acromial part of deltoid') or o.name.startswith('Clavicular part of deltoid'):
        s = o.get('rig_side', 'r' if '.r' in o.name else 'l'); S = np.array(J[s]['S']); E = np.array(J[s]['E'])
        P = np.array([v.co for v in o.data.vertices]); t = ((P - E) @ (S - E)) / ((S - E) @ (S - E))
        print(o.name, 't range %.2f..%.2f' % (t.min(), t.max()), 'pct10/50/90', np.percentile(t, [10, 50, 90]).round(2))
