R=../bpyenv/bin/python
for m in hsE4 hsB1 hsB2; do env MOTION=$m SLIVERDIAG=1 SLV_BOX=330,110,480,340 FRAMES_SUB=$(seq -s, 40 90) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^SLIVERDIAG f|Traceback" > slv_$m.txt & done
wait; echo DONE > slvv2.done
