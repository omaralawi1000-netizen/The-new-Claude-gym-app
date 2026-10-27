# Pushdown clip 1 checks: far-hand pinhole scan f20-90 (raw), fill, re-scan; close-ups of both hands on the final build.
R=../bpyenv/bin/python
for H in l r; do env FRAMES_SUB=0,20,36,48,64,72 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 MOTION=pushdown PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/pf_${H}c - 16 480 480 clipref > pf_$H.log 2>&1 & done
python3 speckscan.py clip_pd2 20 90 270 230 390 400 > pd34_speck_raw.txt
python3 holefill.py clip_pd2 clip_pd2f 0 129 270 230 390 400 > pd34_fill.txt
python3 speckscan.py clip_pd2f 20 90 270 230 390 400 > pd34_speck_fill.txt
wait
echo DONE > rope34.done
