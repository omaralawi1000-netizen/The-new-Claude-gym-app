# Hammer clip 2 (judge r6): near cap inside the outline (shoulder top -5, twist 70). Every-frame contact, tilt, framing.
R=../bpyenv/bin/python
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
ALL=$(seq -s, 0 129)
for k in 0 1 2; do
  env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm25_contact_$k.txt &
done
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > hm25_tilt.txt
env MOTION=hammer CAMDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > hm25_framing.txt
wait
echo DONE > rope25.done
