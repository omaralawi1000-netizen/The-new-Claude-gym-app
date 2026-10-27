# Pushdown clip 1: contact on the frames rope30 left out (0-27, 73-129) + cable every frame.
R=../bpyenv/bin/python; G='^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL|Traceback'
FR=$( (seq 0 27; seq 73 129) )
for k in 0 1 2; do env MOTION=pushdown GRIPDIAG=1 FRAMES_SUB=$(echo "$FR" | awk -v k=$k 'NR%3==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "$G" > pd36_contact_$k.txt & done
env MOTION=pushdown CABLEDIAG=1 FRAMES_SUB=$(seq -s, 0 129) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^CABLEDIAG|Traceback' > pd36_cable.txt &
wait; echo DONE > rope36.done
