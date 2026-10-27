R=../bpyenv/bin/python
FR=$(seq -s, 24 1 88)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
A12=16:0,30:12,80:12,96:0
run PD_ABLKEYS=$A12 PD_TWLKEYS=20:0,28:-40,36:-40,46:0,64:0,72:-40,80:-40,92:0 > far_S5.txt &
run PD_ABLKEYS=$A12 PD_TWLKEYS=20:0,28:-45,38:-45,48:0,62:0,70:-45,82:-45,92:0 > far_S6.txt &
run PD_ABLKEYS=16:0,28:14,82:14,96:0 PD_TWLKEYS=20:0,28:-40,36:-40,46:0,64:0,72:-40,80:-40,92:0 > far_S7.txt &
run PD_ABLKEYS=$A12 PD_TWLKEYS=20:0,30:-50,38:-50,48:0,62:0,70:-50,80:-50,92:0 > far_S8.txt &
wait; echo DONE > fartry7.done
