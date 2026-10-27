# Pushdown round 4 logs (strand 0.40, split 2/10/11/12/10/2 at f20/36/48/60/76/100, camera -115, column 1.3 m)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 CAM_PAN=0.36 GLOW_OUTLINE=0.45 OUTLINE_T=0.4"
PF=$( (seq 0 2 129; seq 30 1 80) | sort -n -u)
G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL'
rm -f pd15_contact_a.txt pd15_contact_b.txt
env $PD GRIPDIAG=1 FRAMES_SUB=$(echo "$PF" | awk 'NR%2==1' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd15_contact_a.txt &
env $PD GRIPDIAG=1 FRAMES_SUB=$(echo "$PF" | awk 'NR%2==0' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd15_contact_b.txt &
env $PD CABLEDIAG=1 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > pd15_cable.txt &
env $PD FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd15_far.txt &
wait
env $PD CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > pd15_framing.txt
echo DONE > rope17.done
