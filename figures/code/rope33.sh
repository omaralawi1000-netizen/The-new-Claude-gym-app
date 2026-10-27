# Hammer final 2 (far elbow +2 held f40-70): contact f46-81, then re-render f46-81 into clip_hm3.
R=../bpyenv/bin/python; G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
for k in 0 1; do env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 46 81 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm33_contact_$k.txt & done
env MOTION=hammer CAPDIAG=1 FRAMES_SUB=$(seq -s, 46 81) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^CAPDIAG|Traceback' > hm33_cap.txt &
wait
env MOTION=hammer PERSIST=1 FRAMES_SUB=$(seq -s, 46 81) $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm3 - 16 960 640 clipref > clip_hm3c.log 2>&1
echo DONE > rope33.done
