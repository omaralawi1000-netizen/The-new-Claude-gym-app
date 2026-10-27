until [ -f rope13.done ]; do sleep 15; done
# hand close-ups, both moves (clip side + below/above), round 5 settings
R=../bpyenv/bin/python
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
HM="MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43 BLOOM_FORE=1"
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 CAM_PAN=0.36 GLOW_OUTLINE=0.45 OUTLINE_T=0.4"
rm -rf h11_* p11_*
for H in r l; do
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/h11_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 $R run5.py scene12.blend render8.py -- anim $PWD/h11_${H}b - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/p11_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 $R run5.py scene12.blend render8.py -- anim $PWD/p11_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope14.done
