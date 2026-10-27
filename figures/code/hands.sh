export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=0,41,85
for H in r l; do
  HANDCAM=$H ../bpyenv/bin/python run5.py scene8.blend render8.py -- anim $PWD/hands_$H - 24 800 800 clipref > hands_$H.log 2>&1
  HANDCAM=$H HANDDIR=0,-1,0.25 ../bpyenv/bin/python run5.py scene8.blend render8.py -- anim $PWD/handsF_$H - 24 800 800 clipref > handsF_$H.log 2>&1
done
echo HANDSDONE >> hands_r.log
