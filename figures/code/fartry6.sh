R=../bpyenv/bin/python
FR=$(seq -s, 20 1 92)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
AL=16:0,30:8,80:8,96:0
run PD_ABLKEYS=$AL PD_TWLKEYS=20:0,28:-30,34:-30,42:0,66:0,74:-30,80:-30,90:0 > far_S1.txt &
run PD_ABLKEYS=$AL PD_TWLKEYS=20:0,28:-30,36:-30,46:0,64:0,72:-30,82:-30,92:0 > far_S2.txt &
run PD_ABLKEYS=$AL PD_TWLKEYS=20:0,30:-40,36:-40,46:0,64:0,72:-40,80:-40,92:0 > far_S3.txt &
run PD_ABLKEYS=16:0,30:12,80:12,96:0 PD_TWLKEYS=20:0,28:-30,34:-30,42:0,66:0,74:-30,80:-30,90:0 > far_S4.txt &
wait; echo DONE > fartry6.done
