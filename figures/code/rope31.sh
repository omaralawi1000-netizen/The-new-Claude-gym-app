# Hammer final (far elbow +2 through the lift): checks on f30-50, then re-render f31-49 into clip_hm3 (rest copied from clip_hm2).
R=../bpyenv/bin/python
F=$(seq -s, 30 50)
env MOTION=hammer SLIVERDIAG=1 SLV_BOX=360,170,450,245 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^SLIVERDIAG|Traceback' > hm31_slv.txt &
env MOTION=hammer CAPDIAG=1 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^CAPDIAG|Traceback' > hm31_cap.txt &
env MOTION=hammer TILTDIAG=1 FRAMES_SUB=$F $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^ROPETILT|Traceback' > hm31_tilt.txt &
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
env MOTION=hammer GRIPDIAG=1 FRAMES_SUB=30,33,36,39,42,45,48 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm31_contact.txt &
wait
mkdir -p clip_hm3 && cp -n clip_hm2/*.png clip_hm3/
env MOTION=hammer PERSIST=1 FRAMES_SUB=$(seq -s, 31 49) $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm3 - 16 960 640 clipref > clip_hm3.log 2>&1
echo DONE > rope31.done
