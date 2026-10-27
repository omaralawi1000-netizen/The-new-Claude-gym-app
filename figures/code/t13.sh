export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|line [0-9]|scene saved"
../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/s20.png 82 128 2100 1575 ref > s20.log 2>&1
../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/m20.png 124 64 1920 1280 clipref > m20.log 2>&1
grep -hE "Traceback|Saved" s20.log m20.log
