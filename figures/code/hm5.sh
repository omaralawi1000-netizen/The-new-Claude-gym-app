while [ ! -f pd2.done ]; do sleep 20; done
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=hammer PROP=rope_low TWSIGN=1
MOTION=hammer PROP=rope_low TWSIGN=1 GRIPDIAG=1 FRAMES_SUB=$(seq -s, 0 5 125) ../bpyenv/bin/python run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "EZGRIP|ROPEHIT" > hm5_contact.txt
for f in 0 30 55; do ../bpyenv/bin/python run5.py scene12.blend render8.py -- still $PWD/hm5_s$f.png $f 16 960 640 clipref > /dev/null 2>&1; done
for H in r l; do
  FRAMES_SUB=0,30,55 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/h5_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/h5_${H}b - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > hm5.done
