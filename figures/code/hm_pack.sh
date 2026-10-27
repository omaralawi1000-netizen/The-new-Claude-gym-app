# Rope hammer curl round 1 package: contact test on the final build + hand close-ups from below at f0/30/55/70
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=hammer PROP=rope_low TWSIGN=1
GRIPDIAG=1 FRAMES_SUB=$(seq -s, 0 5 125) ../bpyenv/bin/python run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "EZGRIP|ROPEHIT|TOTAL|GRIP" > hm_contact.txt
rm -rf hb_*
for H in r l; do
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 ../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/hb_${H}b - 16 480 480 clipref > /dev/null 2>&1
done
echo PACKDONE > hm_pack.done
