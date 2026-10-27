R=../bpyenv/bin/python
for v in hpP2o46 hpP2o54; do env MOTION=$v LOW_Y=0.30 COL_LOW_Y=0.45 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_$v - 16 960 640 clipref > pul_$v.log 2>&1 & done
for v in hpP2o46 hpP2o54; do env MOTION=$v LOW_Y=0.30 COL_LOW_Y=0.45 FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 0 10 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pul_${v}_far.txt & done
wait; echo DONE > pul3.done
