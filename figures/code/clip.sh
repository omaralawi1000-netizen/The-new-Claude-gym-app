export GLOW_STRENGTH=8 GLOW_SIZE=0.95
../bpyenv/bin/python run5.py scene.blend render.py -- anim clipframes 84 40 840 560 clip > clip.log 2>&1
echo CLIPDONE
