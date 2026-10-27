# halo test without rebuilding: gt2.sh NAME GLOW_STRENGTH GLOW_SIZE HALO_R HALO_K
BORDER=0.36,0.58,0.64,0.82 HALO_R=$4 HALO_K=$5 GLOW_STRENGTH=$2 GLOW_SIZE=$3 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/$1.png 82 48 2100 1575 ref > $1.log 2>&1
grep -E "Error|Trace" $1.log | head -3
python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('$1.png').convert('RGB')).astype(int)
m=(a[...,0]-a[...,2]>60); s=(a[...,0]-a[...,2]>110); print('$1 px%',round(100*m.mean(),2),'mean',a[m].mean(0).round(0),'core',a[s].mean(0).round(0))
Image.open('$1.png').convert('RGB').save('$1.jpg')"
