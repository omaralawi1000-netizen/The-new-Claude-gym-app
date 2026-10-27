# slv.sh motion first last [box] : SLIVERDIAG every frame, 2 chunks -> slv_<motion>.txt
R=../bpyenv/bin/python; m=$1
for k in 0 1; do env MOTION=$m SLIVERDIAG=1 SLV_BOX=${4:-360,170,450,245} FRAMES_SUB=$(seq $2 $3 | awk -v k=$k 'NR%2==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^SLIVERDIAG f|Traceback" > slv_${m}_$k.txt & done
wait; cat slv_${m}_?.txt | sort -t f -k2 -n > slv_$m.txt
