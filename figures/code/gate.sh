#!/bin/bash
# gate.sh MOTION RAWDIR [BOX x0,y0,x1,y1] [PROCS]
# One red/green gate for a rendered figure clip: every check on every frame, then the pinhole pass, then one report.
# Out: gate/<MOTION>/gate-report.md (+ logs, crops), final frames in gate/<MOTION>_final/. Exit 1 if anything is red.
# Nothing reaches a judge while this is red.
set -u
M=$1; RAW=$2; BOX=${3:-300,100,500,420}; P=${4:-3}
R=../bpyenv/bin/python; O=gate/$M; FIN=gate/${M}_final; [ "${GATE_RESUME:-0}" = 1 ] || rm -rf $O $FIN; mkdir -p $O/jobs $O/masks   # GATE_RESUME=1: keep finished jobs (.ok files) after a machine restart
N=$(ls $RAW/f*.png | wc -l); LAST=$((N-1))
PROP=$(grep -o "'PROP': '[a-z_]*'" motions/$M.py | head -1 | cut -d"'" -f4); PROP=${PROP:-barbell}
read X0 Y0 X1 Y1 <<< "${BOX//,/ }"
chunks(){ seq 0 $LAST | awk -v k=$1 -v n=$2 'NR%n==k' | paste -sd,; }
J=$O/jobs.txt; : > $J
job(){ name=$1; shift; [ "${GATE_RESUME:-0}" = 1 ] && [ -f $O/jobs/$name.ok ] && return; rm -f $O/jobs/$name.ok; echo "env MOTION=$M $* $R run5.py scene12.blend render8.py -- still /dev/null 0 > $O/jobs/$name.log 2>&1 && touch $O/jobs/$name.ok" >> $J; }
NG=$(( (N+4)/5 )); for k in $(seq 0 $((NG-1))); do job grip_$k GRIPDIAG=1 FRAMES_SUB=$(chunks $k $NG); done   # small jobs so a machine restart loses little
NP=$(( (N+7)/8 )); for k in $(seq 0 $((NP-1))); do job pocket_$k POCKETDIAG=1 POCKET_OUT=$PWD/$O/masks POCKET_BOX=$BOX FRAMES_SUB=$(chunks $k $NP); done
NS=$(( (N+6)/7 )); for k in $(seq 0 $((NS-1))); do job sliver_$k SLIVERDIAG=1 SLV_BOX=${SLV_BOX:-$BOX} FRAMES_SUB=$(chunks $k $NS); done
if [[ $PROP == bar_* ]]; then
  job cable CABLEDIAG=1 FRAMES_SUB=$(chunks 0 1); job cam CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 5 $LAST)
fi
if [[ $PROP == rope* ]]; then
  job tilt TILTDIAG=1 FRAMES_SUB=$(chunks 0 1); job far FARDIAG=1 FAR_FIST_MIN=150 FAR_CAP_TOL=${FAR_CAP_TOL:-8} FRAMES_SUB=$(chunks 0 1)
  job cable CABLEDIAG=1 FRAMES_SUB=$(chunks 0 1); job cam CAMDIAG=1 FRAMES_SUB=$(seq -s, 0 5 $LAST)
fi
[[ $PROP == barbell || $PROP == ez || $PROP == bar_* ]] && job slide SLIDEDIAG=1 FRAMES_SUB=$(chunks 0 1)
echo "GATE $M: $(wc -l < $J) jobs on $P processes ($N frames, prop $PROP, box $BOX)"
xargs -P $P -I{} bash -c '{}' < $J
cat $O/jobs/grip_*.log | grep -E '^EZGRIP|^ROPE|TOTAL|Traceback' > $O/grip.log
cat $O/jobs/sliver_*.log > $O/jobs/sliver.log
for n in sliver tilt far cable cam slide; do [ -f $O/jobs/$n.log ] && grep -E "^(SLIVERDIAG|ROPETILT|FARDIAG|CABLEDIAG|CAMDIAG|SLIDE)|Traceback" $O/jobs/$n.log > $O/$n.log; done
[ -f $O/tilt.log ] && python3 tiltcheck.py $O/tilt.log > $O/tiltcheck.log
grep -l Traceback $O/jobs/*.log > $O/crashed.txt && echo "GATE: crashed jobs: $(cat $O/crashed.txt)"
# pixels: closed pockets (ray masks) -> notches (2 passes on the frames still hit) -> final scan
python3 holefill3.py $RAW $O/hf3 $O/masks 0 $LAST $X0 $Y0 $X1 $Y1 > $O/holefill3.log 2>&1
rm -rf $FIN; cp -r $O/hf3 $FIN
if [ -n "${FLECK_BOX:-}" ]; then   # slit fill (HF3_SLITS=1) only inside FLECK_BOX (x0,y0,x1,y1) on frames FLECK_A..FLECK_B: the slit fill paints a fuzzy rim if used on the whole hands box
  HF3_SLITS=1 python3 holefill3.py $RAW $O/hf3s $O/masks 0 $LAST $X0 $Y0 $X1 $Y1 > $O/holefill3s.log 2>&1
  python3 - $O/hf3s $FIN ${FLECK_A:-0} ${FLECK_B:-$LAST} $FLECK_BOX <<'PY'
import sys; from PIL import Image
src, dst, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); box = tuple(int(v) for v in sys.argv[5].split(','))
for f in range(a, b + 1):
    d = Image.open('%s/f%03d.png' % (dst, f)).convert('RGB'); d.paste(Image.open('%s/f%03d.png' % (src, f)).convert('RGB').crop(box), box[:2]); d.save('%s/f%03d.png' % (dst, f))
PY
fi
echo "$N $(ls $FIN/f*.png 2>/dev/null | wc -l)" > $O/pixel_counts.txt
for pass in 1 2; do
  python3 speck2h.py $FIN 0 $LAST $X0 $Y0 $X1 $Y1 > $O/speck_pass$pass.log 2>&1
  for f in $(grep -oP '^SPECK2 f\K\d+(?=: [1-9])' $O/speck_pass$pass.log); do
    python3 holefill2.py $FIN $O/tmpfill $f $f $X0 $Y0 $X1 $Y1 >> $O/holefill2.log 2>&1; cp $O/tmpfill/f$(printf %03d $f).png $FIN/
  done
done
python3 speck2h.py $FIN 0 $LAST $X0 $Y0 $X1 $Y1 > $O/speck_final.log 2>&1
BOX=$BOX python3 bgspeck.py $FIN $O/masks 160 > $O/bgspeck.log 2>&1
python3 clipcheck.py $FIN > $O/clipcheck.log 2>&1
python3 smooth.py $FIN $BOX > $O/smooth.log 2>&1
# crops of the hands box at the keys, x1.5, raw (top) and final (bottom)
python3 - "$RAW" "$FIN" "$O/crops-raw-vs-final-x1.5.png" $X0 $Y0 $X1 $Y1 $LAST <<'PY'
import sys; from PIL import Image
raw, fin, out = sys.argv[1:4]; x0, y0, x1, y1, last = map(int, sys.argv[4:9]); ks = [round(last * k / 6) for k in range(6)]
w, h = (x1 - x0) * 3 // 2, (y1 - y0) * 3 // 2; W = Image.new('RGB', (w * len(ks), h * 2), 'white')
for i, f in enumerate(ks):
    for j, d in enumerate((raw, fin)): W.paste(Image.open('%s/f%03d.png' % (d, f)).convert('RGB').crop((x0, y0, x1, y1)).resize((w, h), Image.LANCZOS), (i * w, j * h))
W.save(out)
PY
rm -rf $O/hf3 $O/hf3s $O/tmpfill
python3 gatereport.py $O $M $PROP
