# Hammer r8b: far elbow +4 f40-75 (sliver fix). Re-render the changed frames f20-92 and re-check them.
R=../bpyenv/bin/python; SUB=$(seq -s, 20 92); G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
env MOTION=hammer PERSIST=1 FRAMES_SUB=$SUB $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm4 - 16 960 640 clipref > clip_hm4b.log 2>&1 &
env MOTION=hammer FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$SUB $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > hm40_far.txt
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > hm40_tilt.txt
rm -rf capd/hammer; bash capall.sh hammer 25 95
for k in 0 1; do env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 20 92 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm40_contact_$k.txt & done
wait; echo DONE > rope40.done
