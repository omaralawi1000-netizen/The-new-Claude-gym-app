R=../bpyenv/bin/python
for v in hpP1 hpP2; do env MOTION=$v LOW_Y=0.30 COL_LOW_Y=0.45 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_$v - 16 960 640 clipref > pul_$v.log 2>&1 & done
for v in hpP1 hpP2; do env MOTION=$v LOW_Y=0.30 COL_LOW_Y=0.45 GRIPDIAG=1 FRAMES_SUB=0,10,30,55,80,110 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E 'TOTAL|rope vs|hands|HANDGAP|gap' > pul_${v}_grip.txt & done
wait; echo DONE > pul2.done
