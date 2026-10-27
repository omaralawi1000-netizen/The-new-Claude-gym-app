until [ -f rope18.done ]; do sleep 15; done
# pushdown keys + comparisons + close-ups again with GLOW_EMIT 0.09 (red lightness between the curl's and the hammer's)
R=../bpyenv/bin/python
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 CAM_PAN=0.36 GLOW_OUTLINE=0.45 OUTLINE_T=0.4 GLOW_EMIT=0.09"
rm -rf pd17k pd17b pd17m p12_*
env $PD FRAMES_SUB=0,20,48 $R run5.py scene12.blend render8.py -- anim $PWD/pd17k - 16 960 640 clipref > pd17k.log 2>&1
env $PD CAM_ORBIT=-105 CAM_PAN=0.33 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/pd17b - 16 960 640 clipref > pd17b.log 2>&1
env $PD CAM_ORBIT=-65 CAM_PAN=0.63 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/pd17m - 16 960 640 clipref > pd17m.log 2>&1
for H in r l; do
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/p12_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 $R run5.py scene12.blend render8.py -- anim $PWD/p12_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope19.done
