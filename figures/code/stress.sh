export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=stress GRIP_SOLVED=0
for f in 0 1 2 3; do ../bpyenv/bin/python run5.py scene11f.blend render8.py -- still $PWD/st_$f.png $f 16 960 640 clipref > st_$f.log 2>&1; done
for f in 0 2 3; do ../bpyenv/bin/python run5.py scene11f.blend render8.py -- still $PWD/sts_$f.png $f 16 960 640 side > sts_$f.log 2>&1; done
echo STRESSDONE >> st_3.log
