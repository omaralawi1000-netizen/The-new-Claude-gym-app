# Hammer final (far elbow +2, long ramp f20-54): checks on f20-54, then re-render f21-53 into clip_hm3.
R=../bpyenv/bin/python
F=$(seq -s, 20 54)
env MOTION=hammer SLIVERDIAG=1 SLV_BOX=360,170,450,245 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^SLIVERDIAG|Traceback' > hm32_slv.txt &
env MOTION=hammer CAPDIAG=1 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^CAPDIAG|Traceback' > hm32_cap.txt &
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^ROPETILT|Traceback' > hm32_tilt.txt &
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
for k in 0 1; do env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 21 53 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm32_contact_$k.txt & done
wait
env MOTION=hammer PERSIST=1 FRAMES_SUB=$(seq -s, 21 53) $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm3 - 16 960 640 clipref > clip_hm3b.log 2>&1
echo DONE > rope32.done
