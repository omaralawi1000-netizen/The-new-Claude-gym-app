import json, numpy as np, sys
from PIL import Image
m = json.load(open('idmap.json')); keys = np.array([list(map(int, k.split(','))) for k in m]); names = list(m.values())
a = np.array(Image.open('id.png').convert('RGB')).astype(int)
r = np.array(Image.open(sys.argv[1]).convert('L')).astype(int); H,W=r.shape
for spec in sys.argv[2:]:
    nm,x0,y0,x1,y1,th=spec.split(':'); x0,y0,x1,y1=float(x0),float(y0),float(x1),float(y1)
    X0,Y0,X1,Y1=int(x0*W),int(y0*H),int(x1*W),int(y1*H)
    mask=r[Y0:Y1,X0:X1]<int(th); reg=a[Y0:Y1,X0:X1][mask]
    if not len(reg): print(nm,'none'); continue
    d=((reg[:,None,:]-keys[None])**2).sum(-1); idx=d.argmin(1); ok=d.min(1)<30
    u,c=np.unique(idx[ok],return_counts=True)
    print(nm, mask.sum(), [(int(cc),names[i]) for cc,i in sorted(zip(c,u),reverse=True)[:10]])
