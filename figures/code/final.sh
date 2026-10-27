set -x
export GLOW_STRENGTH=5 GLOW_SIZE=0.85
P=../bpyenv/bin/python
$P run5.py scene.blend render.py -- still final_still.png 82 128 2100 1575 ref > final_still.log 2>&1
$P run5.py scene.blend render.py -- anim clipframes 84 40 840 560 clip > clip.log 2>&1
echo ALLDONE
