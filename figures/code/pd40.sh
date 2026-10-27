# Pushdown r8 (rope realism): key stills + every-frame checks
R=../bpyenv/bin/python; ALL=$(seq -s, 0 129); G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
mkdir -p pd8k
env MOTION=pushdown PERSIST=1 FRAMES_SUB=0,20,36,48,60,72,90,110 $R run5.py scene12.blend render8.py -- anim $PWD/pd8k - 16 960 640 clipref > pd8k.log 2>&1 &
env MOTION=pushdown TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > pd40_tilt.txt
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd40_far.txt
env MOTION=pushdown CABLEDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > pd40_cable.txt
env MOTION=pushdown CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 5 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > pd40_cam.txt
wait
for k in 0 1 2; do env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd40_contact_$k.txt & done
wait; echo DONE > pd40.done
