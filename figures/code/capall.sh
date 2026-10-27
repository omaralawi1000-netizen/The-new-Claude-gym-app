# capall.sh motion first last : CAPDIAG on every frame first..last, 4 chunks
R=../bpyenv/bin/python; m=$1; mkdir -p capd/$m
for k in 0 1 2 3; do env MOTION=$m CAPDIAG=2 CAPDIAG_OUT=$PWD/capd/$m FRAMES_SUB=$(seq $2 $3 | awk -v k=$k 'NR%4==k' | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^CAPDIAG f|Traceback" > capd/all_${m}_$k.txt & done
wait; cat capd/all_${m}_?.txt | sort -t f -k2 -n > capd/all_$m.txt
