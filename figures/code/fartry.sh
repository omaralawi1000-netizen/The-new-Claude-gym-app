# pushdown far-cap timing trials (judge r4 must-fix 1): FARDIAG every frame f26-86
R=../bpyenv/bin/python
FR=$(seq -s, 26 1 86)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
run PD_ABKEYS=16:2,32:10,48:11,60:12,80:10,100:2 > far_A1.txt &
run PD_ABKEYS=16:2,32:10,48:11,60:12,80:10,100:2 PD_TWKEYS=28:90,50:116,60:120,86:90 > far_A1B.txt &
run PD_ABKEYS=12:2,28:10,48:11,60:12,84:10,104:2 PD_TWKEYS=28:90,50:116,60:120,86:90 > far_A2B.txt &
wait; echo DONE > fartry.done
