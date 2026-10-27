# Rope moves round 3b package (continuous tilt, pushdown INSET 0): contact logs, keys, close-ups (hammer + pushdown), after judge r2 (braid, smooth strand, caps, open pulley)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
rm -rf hm8k pd9k; FRAMES_SUB=0,30,55 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/hm8k - 16 960 640 clipref > /dev/null 2>&1
FRAMES_SUB=0,20,48 MOTION=pushdown PROP=rope_high ROPE_INSET=0 $R run5.py scene12.blend render8.py -- anim $PWD/pd9k - 16 960 640 clipref > /dev/null 2>&1
rm -rf h8_rc h8_rb h8_lc h8_lb p9_rc p9_ra p9_lc p9_la
for H in r l; do
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/h8_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/h8_${H}b - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=pushdown PROP=rope_high ROPE_INSET=0 $R run5.py scene12.blend render8.py -- anim $PWD/p9_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 MOTION=pushdown PROP=rope_high ROPE_INSET=0 $R run5.py scene12.blend render8.py -- anim $PWD/p9_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope4.done
