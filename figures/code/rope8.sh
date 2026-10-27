# Rope moves round 4 package (judge r3 hammer / r2 pushdown): taut strands (0.33 m, heel by the turn, fan 0.15), FORE_NOLIGHT,
# centred (CAM_PAN), upper-arm under-layer pulled in (UNDER_ARM_IN), pushdown at -105 with the column 1.0 m out on a boom,
# triceps glow with facing + groove shading (two heads)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 ROPE_STRAND=0.33 UNDER_ARM_IN=0.006
R=../bpyenv/bin/python
HM="MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43"
PD="MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_TZ=0.90 HIGH_Y=0.44 COL_HIGH_Y=1.0 GLOW_FACE_MIN=0.35 GLOW_EMIT=0.055 GLOW_AO=0.5 GLOW_AO_D=0.03"
rm -rf hm12k pd13k pd13m h9_rc h9_rb h9_lc h9_lb p10_rc p10_ra p10_lc p10_la
env $HM FRAMES_SUB=0,30,55 $R run5.py scene12.blend render8.py -- anim $PWD/hm12k - 16 960 640 clipref > hm12k.log 2>&1
env $PD CAM_ORBIT=-105 CAM_PAN=0.33 FRAMES_SUB=0,20,48 $R run5.py scene12.blend render8.py -- anim $PWD/pd13k - 16 960 640 clipref > pd13k.log 2>&1
env $PD CAM_ORBIT=-65 CAM_PAN=0.63 FRAMES_SUB=20,48 $R run5.py scene12.blend render8.py -- anim $PWD/pd13m - 16 960 640 clipref > pd13m.log 2>&1
echo KEYS > rope8.keys
for H in r l; do
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/h9_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 $R run5.py scene12.blend render8.py -- anim $PWD/h9_${H}b - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/p10_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 $R run5.py scene12.blend render8.py -- anim $PWD/p10_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope8.done
