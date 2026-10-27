# Hammer clip 1 (judge r5: stills passed 9.0). No env exports but MOTION: the render settings come from motions/hammer.py ENV
# (= the rope20.sh HM line + shared env). Every-frame contact (GRIPDIAG, 3 chunks) and tilt (TILTDIAG), then the clip.
until [ -f fartry.done ]; do sleep 15; done
R=../bpyenv/bin/python
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
for k in 0 1 2; do
  env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm21_contact_$k.txt &
done
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > hm21_tilt.txt
env MOTION=hammer CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > hm21_framing.txt
wait
echo LOGS > rope21.logs
env MOTION=hammer RESUME=1 PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm1 - 16 960 640 clipref > clip_hm1.log 2>&1
echo DONE > rope21.done
