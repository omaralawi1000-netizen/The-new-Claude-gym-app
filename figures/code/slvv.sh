# slvv.sh frames motions... : SLIVERDIAG per motion in parallel -> slv/<m>.txt
R=../bpyenv/bin/python; fr=$1; shift; mkdir -p slv
for m in "$@"; do env MOTION=$m SLIVERDIAG=1 SLV_BOX=360,170,450,245 FRAMES_SUB=$fr $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^SLIVERDIAG f|Traceback" > slv/$m.txt & done
wait
