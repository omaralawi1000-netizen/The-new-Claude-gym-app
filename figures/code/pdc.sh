export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
MOTION=pushdown PROP=rope_high ROPE_INSET=0 GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > pd9_contact.txt
echo DONE > pdc.done
