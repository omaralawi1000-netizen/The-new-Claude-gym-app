# Pushdown clip 2 (judge r7): far arm +5 wider, wrist return f60-74. Every-frame checks in parallel with the clip render.
R=../bpyenv/bin/python; ALL=$(seq -s, 0 129); G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
env MOTION=pushdown PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_pd3 - 16 960 640 clipref > clip_pd3.log 2>&1 &
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd38_far.txt
env MOTION=pushdown TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > pd38_tilt.txt
env MOTION=pushdown CABLEDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > pd38_cable.txt
env MOTION=pushdown NOTCHDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^NOTCHDIAG' > pd38_notch.txt
for k in 0 1; do env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd38_contact_$k.txt & done
wait; echo DONE > rope38.done
