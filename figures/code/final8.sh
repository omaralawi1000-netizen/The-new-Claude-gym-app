# round 6 finals: full still (ref cam) + head close-up from the same direction
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|scene saved"
GLOW_STRENGTH=8 GLOW_SIZE=0.72 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/final8.png 82 128 2100 1575 ref > final8.log 2>&1
GLOW_STRENGTH=8 GLOW_SIZE=0.72 ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/head8.png 82 128 900 1000 headref > head8.log 2>&1
grep -E "Error|Trace|Saved" final8.log head8.log | tail -4
