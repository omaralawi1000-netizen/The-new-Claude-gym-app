R=../bpyenv/bin/python
until [ -f rope34.done ]; do sleep 20; done
for H in l r; do env FRAMES_SUB=0,20,36,48,64,72 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 MOTION=pushdown PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/pf_${H}a - 16 480 480 clipref > pf_${H}a.log 2>&1 & done
wait; echo DONE > rope35.done
