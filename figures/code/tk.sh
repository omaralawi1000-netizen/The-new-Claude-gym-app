export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|line [0-9]|scene saved"
BORDER=0.41,0.17,0.62,0.36 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/$1_kc.png 124 32 1920 1280 clipref > tk.log 2>&1
BORDER=0.371,0.181,0.614,0.352 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/$1_kr.png 82 32 2800 2100 ref >> tk.log 2>&1
grep -hE "Traceback" tk.log
