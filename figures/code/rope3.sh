# Rope moves round 3 package: contact logs, keys, close-ups (hammer + pushdown), after judge r2 (braid, smooth strand, caps, open pulley)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
MOTION=hammer PROP=rope_low GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 48 70) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > hm7_contact.txt
MOTION=pushdown PROP=rope_high GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > pd8_contact.txt
rm -rf hm7k pd8k; FRAMES_SUB=0,30,55 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/hm7k - 16 960 640 clipref > /dev/null 2>&1
FRAMES_SUB=0,20,48 MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- anim $PWD/pd8k - 16 960 640 clipref > /dev/null 2>&1
rm -rf h7_rc h7_rb h7_lc h7_lb p8_rc p8_ra p8_lc p8_la
for H in r l; do
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/h7_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 MOTION=hammer PROP=rope_low $R run5.py scene12.blend render8.py -- anim $PWD/h7_${H}b - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- anim $PWD/p8_${H}c - 16 480 480 clipref > /dev/null 2>&1
  FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 MOTION=pushdown PROP=rope_high $R run5.py scene12.blend render8.py -- anim $PWD/p8_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope3.done
