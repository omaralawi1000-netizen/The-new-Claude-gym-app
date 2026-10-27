# Pushdown round 5 (judge r4): far arm turned in + a little wider while its fist passes the hip, 0.44 m strands, GLOW_EMIT 0.085.
# No env exports but MOTION: settings come from motions/pushdown.py ENV. Every-frame logs, then keys and close-ups.
R=../bpyenv/bin/python
ALL=$(seq -s, 0 1 129)
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
env MOTION=pushdown FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd22_far.txt
for k in 0 1 2; do
  env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(seq 0 129 | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd22_contact_$k.txt &
done
env MOTION=pushdown CABLEDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > pd22_cable.txt
env MOTION=pushdown CAMDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > pd22_framing.txt
env MOTION=pushdown TILTDIAG=1 FRAMES_SUB=$ALL $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^ROPETILT' > pd22_tilt.txt
rm -rf pd22k; env MOTION=pushdown FRAMES_SUB=0,20,36,48,72 $R run5.py scene12.blend render8.py -- anim $PWD/pd22k - 16 960 640 clipref > pd22k.log 2>&1
wait
echo LOGS > rope22.logs
rm -rf p22_*
for H in r l; do
  env MOTION=pushdown FRAMES_SUB=0,20,36,48,72 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/p22_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env MOTION=pushdown FRAMES_SUB=0,20,36,48,72 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 $R run5.py scene12.blend render8.py -- anim $PWD/p22_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope22.done
