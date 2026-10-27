export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12
blender -b rig.blend --python scene.py -- scene.blend 2>&1 | grep -E "Error|Trace|line [0-9]|scene saved"
for spec in "ank:0.40,0.057,0.586,0.181"; do
  n=${spec%%:*}; b=${spec#*:}
  BORDER=$b ../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/c30_$n.png 82 40 2800 2100 ref > c30_$n.log 2>&1
done
grep -hE "Traceback|Saved" c30_*.log
