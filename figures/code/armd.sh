export MOTION=curl ELBOW_MIX=0.8 LOCKW_SEP=190 ARMDIAG=1 ARMSIDE=rl FRAMES_SUB=26,30,34,36,38,40,42,44,46,48,52,60,70,76,80,84,86,88,92,96
../bpyenv/bin/python run5.py scene11f.blend render8.py -- still /dev/null 0 > armd_nosq.log 2>&1
export SQUASH=1 SQ_ON=38 SQ_FILL=0.75 SQ_FILL_T0=0.03
../bpyenv/bin/python run5.py scene11f.blend render8.py -- still /dev/null 0 > armd_sq38.log 2>&1
echo DONE >> armd_sq38.log
