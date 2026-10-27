# Pushdown final keys (wrist_l 33-41-62-70, septum, wrist core): every-frame far end + tilt, contact f28-72, then the clip if far end is clean.
R=../bpyenv/bin/python
ALL=$(seq -s, 0 129)
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd30_far.txt &
env MOTION=pushdown TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > pd30_tilt.txt &
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
for k in 0 1; do
  env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(seq 28 72 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd30_contact_$k.txt &
done
wait
echo CHECKS > rope30.checks
if grep -q FLOAT pd30_far.txt; then echo FAR-FAIL > rope30.done; exit; fi
env MOTION=pushdown PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_pd2 - 16 960 640 clipref > clip_pd2.log 2>&1
echo DONE > rope30.done
