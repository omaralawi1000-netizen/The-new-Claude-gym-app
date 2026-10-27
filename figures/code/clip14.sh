# r12 curl clip, 16 samples: solved grip (grip.json = g2a: bar in the palm, thumb over the bar, wrist turn <= 11 deg),
# wrist blend + skin tucked under tendons, neck sculpt v7 (neck6.py), head lag 4 f, r11 motion. scene11f.blend
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip14 - 16 960 640 clipref > clip14.log 2>&1
echo CLIPDONE >> clip14.log
