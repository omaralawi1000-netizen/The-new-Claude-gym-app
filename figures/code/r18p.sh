export MOTION=curl ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03 FORE_NOLIGHT=1
R=../bpyenv/bin/python
SLIDEDIAG=1 $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^SLIDE" > slide_r18.txt
GRIPDIAG=1 FRAMES_SUB=$(seq 0 5 125 | paste -sd,) $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^GRIP|^ABDUCT|^WRIST" > grip_r18.txt
echo DONE > r18p.done
