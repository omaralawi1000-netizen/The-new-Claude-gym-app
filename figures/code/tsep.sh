export MOTION=curl ELBOW_MIX=0.8 SQUASH=1 SQ_FILL=0.75 SQ_FILL_T0=0.03 TRUNKDIAG=1 GRIPDIAG=1 FRAMES_SUB=0,60
R=../bpyenv/bin/python
for S in 196 200 205 210; do
  LOCKW_SEP=$S $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^TRUNK f|^ABDUCT" | sed "s/^/SEP$S /" >> tsep.txt
done
echo DONE > tsep.done
