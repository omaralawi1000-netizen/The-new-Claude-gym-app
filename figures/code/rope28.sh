# Pushdown judge r6: far wrist -6 over the lockout + fist septum. Every-frame far end, holes f20-90, contact f20-90, tilt.
R=../bpyenv/bin/python
ALL=$(seq -s, 0 129)
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd28_far.txt &
env MOTION=pushdown TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > pd28_tilt.txt &
for k in 0 1; do
  env MOTION=pushdown HOLEDIAG=1 HOLE_SIDES=l,r HOLE_SS=3 HOLE_PAD=10 FRAMES_SUB=$(seq 20 90 | awk -v k=$k "NR%2==k" | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^HOLEDIAG' > pd28_holes_$k.txt &
done
wait
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
for k in 0 1 2; do
  env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(seq 28 72 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd28_contact_$k.txt &
done
wait
echo DONE > rope28.done
