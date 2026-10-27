export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 COL_HIGH_Y=1.0 CAM_PAN=0.33 HIGH_Y=0.44"
for hx in 0.08 -0.08; do
  echo "== HIGH_X $hx"
  env $PD HIGH_X=$hx CABLEDIAG=1 FRAMES_SUB=0,20,36,44,48,56,64,70 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "CABLEDIAG"
done
