R=../bpyenv/bin/python
FR=$(seq -s, 24 1 88)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
T=20:0,30:-55,38:-55,50:0,60:0,72:-55,80:-55,92:0
run PD_ABLKEYS=16:0,30:10,80:10,96:0 PD_TWLKEYS=$T > far_V1.txt &
run PD_ABLKEYS=16:0,30:10,40:10,52:4,62:4,72:10,82:10,96:0 PD_TWLKEYS=$T > far_V2.txt &
run PD_ABLKEYS=16:0,30:12,40:12,52:5,62:5,72:12,82:12,96:0 PD_TWLKEYS=20:0,30:-45,38:-45,50:0,60:0,72:-45,80:-45,92:0 > far_V3.txt &
run PD_ABLKEYS=16:0,30:12,80:12,96:0 PD_TWLKEYS=20:0,30:-50,40:-50,52:0,58:0,70:-50,80:-50,92:0 > far_V4.txt &
wait; echo DONE > fartry9.done
