R=../bpyenv/bin/python
FR=$(seq -s, 26 1 86)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
run PD_WRKEYS=0:-15 > far_W-15.txt &
run PD_WRKEYS=0:-25 > far_W-25.txt &
run PD_WRKEYS=0:25 > far_W25.txt &
run PD_WRKEYS=0:-15 PD_ABLKEYS=0:6 > far_W-15L6.txt &
wait; echo DONE > fartry4.done
