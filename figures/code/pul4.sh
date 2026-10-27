R=../bpyenv/bin/python
env MOTION=hpP2 LOW_Y=0.36 COL_LOW_Y=0.72 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_C38 - 16 960 640 clipref > pul_C38.log 2>&1 &
env MOTION=hpP2o46 LOW_Y=0.36 COL_LOW_Y=0.72 FRAMES_SUB=0,30,55,80 $R run5.py scene12.blend render8.py -- anim $PWD/pul_C46 - 16 960 640 clipref > pul_C46.log 2>&1 &
wait; echo DONE > pul4.done
