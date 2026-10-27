R=../bpyenv/bin/python
FR=$(seq -s, 26 1 86)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
run PD_ABLKEYS=0:4 > far_L4.txt &
run PD_ABLKEYS=0:8 > far_L8.txt &
run PD_ABLKEYS=0:12 > far_L12.txt &
wait; echo DONE > fartry3.done
