export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|line [0-9]|scene saved"
../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/p15.png 82 64 1400 1050 ref > p15.log 2>&1
../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/top15.png 124 32 960 640 clipref > top15.log 2>&1
grep -hE "Traceback|Saved" p15.log top15.log
