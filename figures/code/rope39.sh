# Hammer r8 (rope realism): pulley at his toes on a floor arm, fists close at the bottom. Clip + every-frame checks.
R=../bpyenv/bin/python; ALL=$(seq -s, 0 129); G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
env MOTION=hammer PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm4 - 16 960 640 clipref > clip_hm4.log 2>&1 &
env MOTION=hammer FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > hm39_far.txt
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > hm39_tilt.txt
env MOTION=hammer CABLEDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > hm39_cable.txt
bash capall.sh hammer 25 95
bash slv.sh hammer 20 100 330,110,480,340
for k in 0 1; do env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm39_contact_$k.txt & done
wait; echo DONE > rope39.done
