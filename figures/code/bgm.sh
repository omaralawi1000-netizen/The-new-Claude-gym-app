R=../bpyenv/bin/python
for k in 0 1 2 3; do env MOTION=hammer POCKETDIAG=1 POCKET_OUT=$PWD/bgm POCKET_BOX=300,100,500,420 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%4==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^POCKETDIAG|Traceback" > bgm_$k.txt & done
wait; echo DONE > bgm.done
