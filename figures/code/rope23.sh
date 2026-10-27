# Hammer clip 1, take 2: tilt span 66 (the clip build's bottom phi is 108.2, so span 63 held -14.0 for 7 frames).
# No env exports but MOTION (motions/hammer.py ENV). Every-frame contact, then the clip.
until [ -f rope22.logs ]; do sleep 20; done
R=../bpyenv/bin/python
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
for k in 0 1 2; do
  env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm23_contact_$k.txt &
done
env MOTION=hammer CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > hm23_framing.txt
env MOTION=hammer RESUME=1 PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm1 - 16 960 640 clipref > clip_hm1.log 2>&1
wait
echo DONE > rope23.done
