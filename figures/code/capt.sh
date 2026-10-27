# capt.sh tag motion... : CAPDIAG f46,55,62,70 per motion in parallel
R=../bpyenv/bin/python; tag=$1; shift
for m in "$@"; do env MOTION=$m CAPDIAG=2 CAPDIAG_OUT=$PWD/capd/$m FRAMES_SUB=${FR:-46,55,62,70} $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^CAPDIAG|Traceback|Error:" > capd/${tag}_$m.txt & mkdir -p capd/$m; done
wait
