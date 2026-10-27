export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 HIGH_Y=0.44"
for c in "-105 1.0 0.33" "-115 1.3 0.30" "-112 1.3 0.30"; do set -- $c
  echo "== orbit $1 colY $2 pan $3"
  env $PD CAM_ORBIT=$1 COL_HIGH_Y=$2 CAM_PAN=$3 CABLEDIAG=1 FRAMES_SUB=$(seq -s, 36 4 72) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "CABLEDIAG" | cut -c1-230
  env $PD CAM_ORBIT=$1 COL_HIGH_Y=$2 CAM_PAN=$3 CAMDIAG=1 FRAMES_SUB=0,20,48,96,110 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "CAMDIAG worst|CAMDIAG f48"
done
