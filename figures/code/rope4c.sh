# rope round 3b contact logs after the continuous fist tilt
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
MOTION=hammer PROP=rope_low GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 48 70) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > hm8_contact.txt
MOTION=pushdown PROP=rope_high GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > pd9_contact.txt
echo DONE > rope4c.done
