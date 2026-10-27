# judge r7 pushdown: fingertip-glute specks. Variants: W (wrist return f60-74), G6/G10 (+ far finger curl f42-70).
R=../bpyenv/bin/python; WR=33:0,41:-6,60:-6.3,74:0
declare -A GR=([W]="0:0" [G6]="36:0,42:0.06,70:0.06,76:0" [G10]="36:0,42:0.10,70:0.10,76:0")
for v in W G6 G10; do
  env MOTION=pushdown PD_WRLKEYS=$WR PD_GRLKEYS=${GR[$v]} PERSIST=1 FRAMES_SUB=42,62,64,66,67 $R run5.py scene12.blend render8.py -- anim $PWD/pv_$v - 16 960 640 clipref > pv_$v.log 2>&1 &
done
wait
for v in W G6 G10; do
  env MOTION=pushdown PD_WRLKEYS=$WR PD_GRLKEYS=${GR[$v]} FARDIAG=1 FAR_FIST_MIN=150 FRAMES_SUB=$(seq -s, 36 80) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^FARDIAG' > pv_${v}_far.txt &
  env MOTION=pushdown PD_WRLKEYS=$WR PD_GRLKEYS=${GR[$v]} GRIPDIAG=1 FRAMES_SUB=42,56,62,66 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP|TOTAL' > pv_${v}_grip.txt &
done
wait; echo DONE > rope37.done
