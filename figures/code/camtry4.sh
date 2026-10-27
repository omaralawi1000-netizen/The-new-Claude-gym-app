export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014 GLOW_OUTLINE=0.45 OUTLINE_T=0.4
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 COL_HIGH_Y=1.0 HIGH_Y=0.44"
env $PD CAM_ORBIT=-115 CAM_PAN=0.30 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/ct_115 - 16 960 640 clipref > ct_115.log 2>&1
env $PD CAM_ORBIT=-110 CAM_LIFT=0.20 CAM_PAN=0.33 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/ct_110l - 16 960 640 clipref > ct_110l.log 2>&1
env $PD CAM_ORBIT=-125 CAM_PAN=0.28 FRAMES_SUB=48 $R run5.py scene12.blend render8.py -- anim $PWD/ct_125 - 16 960 640 clipref > ct_125.log 2>&1
env $PD CAM_ORBIT=-125 CAM_PAN=0.28 CABLEDIAG=1 FRAMES_SUB=36,44,48,56,64,70 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep CABLEDIAG
