R=../bpyenv/bin/python
export PD_ABLKEYS=14:0,26:16,40:15,52:7,62:7.4,72:16,84:15.4,98:0 PD_TWLKEYS=20:0,28:-20,36:-19,46:0,64:0,74:-19,84:-20,94:0
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 0 1 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > far_F1.txt &
env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=28,31,34,37,40,48 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP f' > grip_F1a.txt &
env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=70,73,76,79,82,85 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP f' > grip_F1b.txt &
wait; echo DONE > fartry13.done
