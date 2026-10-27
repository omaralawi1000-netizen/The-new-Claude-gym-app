# Hammer r8c (after judge r8): fists tilt further into the rope line + tighter wrap at the bottom; floor arm under the return cable.
R=../bpyenv/bin/python; ALL=$(seq -s, 0 129); G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
mkdir -p clip_hm5 bgm5
env MOTION=hammer PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm5 - 16 960 640 clipref > clip_hm5.log 2>&1
env MOTION=hammer FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > hm41_far.txt &
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > hm41_tilt.txt &
env MOTION=hammer CABLEDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > hm41_cable.txt &
wait
for k in 0 1; do env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm41_contact_$k.txt & done
wait
for k in 0 1 2 3; do env MOTION=hammer POCKETDIAG=1 POCKET_OUT=$PWD/bgm5 POCKET_BOX=300,100,500,420 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%4==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^POCKETDIAG|Traceback" > bgm5_$k.txt & done
wait
bash slv.sh hammer 0 129 330,110,480,340 > hm41_slv.log 2>&1
echo DONE > rope41.done
