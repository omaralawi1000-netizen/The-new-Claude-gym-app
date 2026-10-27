R=../bpyenv/bin/python
FR=$(seq -s, 24 1 88)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
tw() { echo 20:0,28:$1,36:$1,46:0,64:0,72:$1,80:$1,92:0; }
run PD_ABLKEYS=16:0,28:14,82:14,96:0 PD_TWLKEYS=$(tw -15) > far_P1.txt &
run PD_ABLKEYS=16:0,28:14,82:14,96:0 PD_TWLKEYS=$(tw -20) > far_P2.txt &
run PD_ABLKEYS=16:0,28:17,82:17,96:0 PD_TWLKEYS=$(tw -15) > far_P3.txt &
wait; echo DONE > fartry11.done
