export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 HIGH_Y=0.44"
for c in "-125 1.0" "-125 1.3" "-120 1.0" "-120 1.3"; do set -- $c
  echo "== orbit $1 colY $2"
  env $PD CAM_ORBIT=$1 COL_HIGH_Y=$2 CAM_PAN=0.28 CAMDIAG=1 FRAMES_SUB=0,10,20,30,48,60,80,96,110,120 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "CAMDIAG"
done
env $PD CAM_ORBIT=-120 COL_HIGH_Y=1.0 CAM_PAN=0.28 CABLEDIAG=1 FRAMES_SUB=36,44,48,56,64,70 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep CABLEDIAG
