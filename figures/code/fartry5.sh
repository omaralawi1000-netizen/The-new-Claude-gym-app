R=../bpyenv/bin/python
FR=$(seq -s, 28 2 44)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
run PD_TWKEYS=0:60 > far_X60.txt &
run PD_TWKEYS=0:140 > far_X140.txt &
wait; echo DONE > fartry5.done
