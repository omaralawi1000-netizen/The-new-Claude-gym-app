# round 4 contact + ROPEMONO, all frames used in round 3
export TWSIGN=1 FORE_NOLIGHT=1
R=../bpyenv/bin/python
PF=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,)
HF=$( (seq 0 5 125; seq 48 70) | sort -n -u | paste -sd,)
G='^EZGRIP|^ROPETILT|^ROPEMONO'
ROPE_STRAND=0.33 MOTION=pushdown PROP=rope_high ROPE_INSET=0 GRIPDIAG=1 FRAMES_SUB=$PF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd11_contact.txt &
ROPE_STRAND=0.33 MOTION=hammer PROP=rope_low GRIPDIAG=1 FRAMES_SUB=$HF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm10_contact_33.txt &
ROPE_STRAND=0.27 MOTION=hammer PROP=rope_low GRIPDIAG=1 FRAMES_SUB=$HF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > hm10_contact_27.txt &
wait
echo DONE > rope6.done
