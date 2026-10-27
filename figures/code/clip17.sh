# r15 curl clip: 130 f (4.3 s): slower lift (~1.5 s, bar <= 9 px/f), bottom settle ~0.5 s, squeeze, lowering a touch slower (make_r14.py)
# wrist blend + skin tucked under tendons, neck sculpt v7 (neck6.py), head lag 4 f, r11 motion. scene11f.blend
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip17 - 16 960 640 clipref > clip17.log 2>&1
echo CLIPDONE >> clip17.log
