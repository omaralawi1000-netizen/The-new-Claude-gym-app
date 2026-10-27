until [ -f rope17.done ]; do sleep 15; done
R=../bpyenv/bin/python
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
HM="MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43 BLOOM_FORE=1"
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 CAM_PAN=0.36 GLOW_OUTLINE=0.45 OUTLINE_T=0.4"
rm -rf hm16k curlref pd16k pd16b pd16m h11_* p11_*
env $HM FRAMES_SUB=0,30,55 $R run5.py scene12.blend render8.py -- anim $PWD/hm16k - 16 960 640 clipref > hm16k.log 2>&1
env -u TWSIGN -u CAM_LENS -u UNDER_ARM_IN GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03 FORE_NOLIGHT=1 FRAMES_SUB=30,55 $R run5.py scene11f.blend render8.py -- anim $PWD/curlref - 16 960 640 clipref > curlref.log 2>&1
env $PD FRAMES_SUB=0,20,48 $R run5.py scene12.blend render8.py -- anim $PWD/pd16k - 16 960 640 clipref > pd16k.log 2>&1
env $PD CAM_ORBIT=-105 CAM_PAN=0.33 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/pd16b - 16 960 640 clipref > pd16b.log 2>&1
env $PD CAM_ORBIT=-65 CAM_PAN=0.63 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/pd16m - 16 960 640 clipref > pd16m.log 2>&1
echo KEYS > rope18.keys
for H in r l; do
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/h11_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 $R run5.py scene12.blend render8.py -- anim $PWD/h11_${H}b - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/p11_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $PD FRAMES_SUB=0,20,48,60 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,1 $R run5.py scene12.blend render8.py -- anim $PWD/p11_${H}a - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope18.done
