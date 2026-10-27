R=../bpyenv/bin/python
FR=$(seq -s, 20 2 96)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR PD_TWLKEYS=0:0 "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
run PD_ABLKEYS=0:-8 > far_H8.txt &
run PD_ABLKEYS=0:-12 > far_H12.txt &
run PD_ABLKEYS=0:-16 > far_H16.txt &
wait; echo DONE > fartry10.done
