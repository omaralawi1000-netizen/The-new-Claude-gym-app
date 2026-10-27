# Rope moves round 2 package: contact logs (every 5th frame + every frame of the holds), keys, camera A/B, hand close-ups
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
MOTION=pushdown PROP=rope_high GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS" > pd7_contact.txt
for f in 0 20 48; do MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- still $PWD/pd7_s$f.png $f 16 960 640 clipref > /dev/null 2>&1; done
for C in -38 -80; do CAM_ORBIT=$C MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- still $PWD/pd7_cam$C.png 48 16 960 640 clipref > /dev/null 2>&1; done
rm -rf p7_*
for H in r l; do
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- anim $PWD/p7_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- anim $PWD/p7_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > pd7.done
