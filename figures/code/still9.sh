until grep -q CLIPDONE clip8.log 2>/dev/null; do sleep 20; done
export GLOW_STRENGTH=20 GLOW_SIZE=0.9 HALO_R=0.022 HALO_K=14
../bpyenv/bin/python run5.py scene.blend render.py -- still $PWD/final9.png 82 128 2100 1575 ref > final9.log 2>&1
echo STILLDONE >> final9.log
