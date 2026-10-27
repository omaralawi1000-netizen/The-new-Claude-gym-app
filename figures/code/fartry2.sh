# far cap pokes out sideways because the turn-out lays the grip axis horizontal while the fist is still behind the glute.
# Keep the grip neutral (cap below the fist, hidden) until the fist is out, then turn; turn back before the fist goes behind.
R=../bpyenv/bin/python
FR=$(seq -s, 26 1 86)
run() { env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$FR "$@" $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG'; }
AB=16:2,32:10,48:11,60:12,82:10,102:2
run PD_ABKEYS=$AB PD_TWKEYS=36:90,54:116,62:120,76:90 > far_T1.txt &
run PD_ABKEYS=$AB PD_TWKEYS=38:90,55:116,62:120,72:90 > far_T2.txt &
run PD_ABKEYS=$AB PD_TWKEYS=40:90,56:116,62:120,70:90 > far_T3.txt &
wait; echo DONE > fartry2.done
