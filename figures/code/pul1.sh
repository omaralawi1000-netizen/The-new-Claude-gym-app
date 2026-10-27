R=../bpyenv/bin/python
env MOTION=hammer LOW_Y=0.30 COL_LOW_Y=0.45 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_A - 16 960 640 clipref > pul_A.log 2>&1 &
env MOTION=hammer LOW_Y=0.40 COL_LOW_Y=0.55 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_B - 16 960 640 clipref > pul_B.log 2>&1 &
wait; echo DONE > pul1.done
