# pushdown pocket frames with current keys + hammer earlier cap entry tests
R=../bpyenv/bin/python
env MOTION=pushdown PERSIST=1 FRAMES_SUB=40,41,42,43,44,45,46,47,48 $R run5.py scene12.blend render8.py -- anim $PWD/pdT - 16 960 640 clipref > pdT_a.log 2>&1 &
env MOTION=pushdown PERSIST=1 FRAMES_SUB=58,59,60,61,62,63,64,65,66,67,68 $R run5.py scene12.blend render8.py -- anim $PWD/pdT - 16 960 640 clipref > pdT_b.log 2>&1 &
FR=38,40,41,42,43,44,45,46 bash capt.sh e hmE1 hmE2
wait
echo DONE > rope29.done
