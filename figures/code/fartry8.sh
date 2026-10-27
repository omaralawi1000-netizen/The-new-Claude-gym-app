R=../bpyenv/bin/python
FR=$(seq -s, 24 1 88)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
T55=20:0,30:-55,38:-55,48:0,62:0,70:-55,80:-55,92:0
run PD_ABLKEYS=16:0,30:6,80:6,96:0 PD_TWLKEYS=$T55 > far_U1.txt &
run PD_ABLKEYS=16:0,30:8,80:8,96:0 PD_TWLKEYS=$T55 > far_U2.txt &
run PD_ABLKEYS=16:0,30:10,80:10,96:0 PD_TWLKEYS=20:0,30:-50,38:-50,48:0,62:0,70:-50,80:-50,92:0 > far_U3.txt &
run PD_ABLKEYS=16:0,30:8,80:8,96:0 PD_TWLKEYS=20:0,30:-65,38:-65,48:0,62:0,70:-65,80:-65,92:0 > far_U4.txt &
wait; echo DONE > fartry8.done
