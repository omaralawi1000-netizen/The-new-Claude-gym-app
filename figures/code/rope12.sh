# Rope pushdown round 4 (judge r3): camera -115 (pushdown.py) with the column 1.3 m out on a boom, so the cable drops behind the
# neck-shoulder gap at lockout (CABLEDIAG); wider split so the far fist holds its end in view (FARDIAG); breath/brace creep;
# triceps two heads by a per-head outline (GLOW_OUTLINE) with the curl's glow (no facing/AO/emit changes); arc + straight strands
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 UNDER_ARM_IN=0.014 GLOW_OUTLINE=0.45 OUTLINE_T=0.4
R=../bpyenv/bin/python
PD="MOTION=pushdown PROP=rope_high CAM_TZ=0.90 CAM_PAN=0.36"
PF=$( (seq 0 2 129; seq 36 1 72) | sort -n -u | paste -sd,)
env $PD GRIPDIAG=1 FRAMES_SUB=$PF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|CLIP' > pd15_contact.txt
env $PD CABLEDIAG=1 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CABLEDIAG' > pd15_cable.txt
env $PD FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pd15_far.txt
env $PD CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 2 128) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > pd15_framing.txt
echo DONE > rope12.done
