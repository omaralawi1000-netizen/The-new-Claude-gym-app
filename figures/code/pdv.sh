export TWSIGN=1 GRIPDIAG=1 MOTION=pushdown PROP=rope_high FRAMES_SUB=20,25,28,30,33,80
R=../bpyenv/bin/python
for V in "ROPE_INSET=0" "ROPE_EXIT=0.010" "ROPE_EXIT=0.014" "ROPE_HEEL=0.065" "ROPE_EXIT=0.010 ROPE_HEEL=0.06"; do
  env $V $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP f" | sed "s/^/[$V] /" | cut -c1-150 >> pdv.txt
done
echo DONE > pdv.done
