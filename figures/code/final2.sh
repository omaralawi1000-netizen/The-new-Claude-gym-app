export GLOW_STRENGTH=8 GLOW_SIZE=0.95
P=../bpyenv/bin/python
$P run5.py scene.blend render.py -- still final3.png 82 128 2100 1575 ref > final3.log 2>&1
echo STILLDONE
