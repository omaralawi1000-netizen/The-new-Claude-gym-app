import json, numpy as np, sys
from PIL import Image
m = json.load(open('idmap.json')); keys = np.array([list(map(int, k.split(','))) for k in m]); names = list(m.values())
a = np.array(Image.open('id.png').convert('RGB')).astype(int)
for spec in sys.argv[1:]:
    name, y0, y1, x0, x1 = spec.split(':'); reg = a[int(y0):int(y1), int(x0):int(x1)].reshape(-1, 3)
    d = ((reg[:, None, :] - keys[None]) ** 2).sum(-1); idx = d.argmin(1); ok = d.min(1) < 30
    u, cnt = np.unique(idx[ok], return_counts=True)
    print(name, [(int(c), names[i]) for c, i in sorted(zip(cnt, u), reverse=True)[:16]])
