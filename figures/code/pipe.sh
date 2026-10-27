# build -> rig -> scene -> preview render + crops.  usage: sh pipe.sh OUT.png
M="/home/user/lluisv/z-anatomy/Z-Anatomy PC/Assets/Models/1.0 Models"
blender -b --python build.py -- "$M" base.blend 2>&1 | grep -E "Error|Trace|line [0-9]"
blender -b base.blend --python rig.py -- rig.blend 2>&1 | grep -E "Error"
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|line [0-9]"
GLOW_STRENGTH=8 GLOW_SIZE=0.72 ../bpyenv/bin/python run5.py scene.blend render.py -- still $1 82 64 1400 1050 ref 2>&1 | grep -E "Error|Trace"
python3 crops.py $1 ${1%.png}q.jpg
