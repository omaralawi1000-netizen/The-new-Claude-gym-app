# r14 curl clip: r13 retimed to 120 f (4.0 s): bottom settle ~0.5 s, slower lowering, squeeze peak before leaving the top (make_r14.py)
# wrist blend + skin tucked under tendons, neck sculpt v7 (neck6.py), head lag 4 f, r11 motion. scene11f.blend
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip16 - 16 960 640 clipref > clip16.log 2>&1
echo CLIPDONE >> clip16.log
