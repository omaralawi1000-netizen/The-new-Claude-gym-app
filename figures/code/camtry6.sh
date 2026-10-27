export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014 GLOW_OUTLINE=0.45 OUTLINE_T=0.4
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 HIGH_Y=0.44 COL_HIGH_Y=1.3 CAM_ORBIT=-120 CAM_PAN=0.28"
env $PD CABLEDIAG=1 FRAMES_SUB=$(seq -s, 30 2 76) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep CABLEDIAG > ct120_cable.txt
env $PD FRAMES_SUB=0,20,48 $R run5.py scene12.blend render8.py -- anim $PWD/ct_120 - 16 960 640 clipref > ct_120.log 2>&1
