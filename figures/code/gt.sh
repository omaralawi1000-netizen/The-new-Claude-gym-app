# glow test: gt.sh NAME GLOW_E GLOW_STRENGTH GLOW_SIZE
GLOW_E=$2 blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace"
BORDER=0.36,0.58,0.64,0.82 GLOW_STRENGTH=$3 GLOW_SIZE=$4 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/$1.png 82 48 2100 1575 ref > $1.log 2>&1
python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('$1.png').convert('RGB')).astype(int)
m=(a[...,0]-a[...,2]>60); s=(a[...,0]-a[...,2]>110); print('$1 px%',round(100*m.mean(),2),'mean',a[m].mean(0).round(0),'core',a[s].mean(0).round(0))
Image.open('$1.png').convert('RGB').save('$1.jpg')"
