# Rope pushdown round 1 package (waits for the hammer stills so the clip keeps most of the cores)
while [ ! -f hm4.done ]; do sleep 20; done
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=pushdown PROP=rope_high TWSIGN=1
GRIPDIAG=1 FRAMES_SUB=$(seq -s, 0 5 125) ../bpyenv/bin/python run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "EZGRIP|ROPEHIT" > pd_contact.txt
for f in 0 20 45; do ../bpyenv/bin/python run5.py scene12.blend render8.py -- still $PWD/pd2_s$f.png $f 16 960 640 clipref > /dev/null 2>&1; done
rm -rf p2_*
for H in r l; do
  FRAMES_SUB=0,20,45 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/p2_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,45 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/p2_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > pd2.done
