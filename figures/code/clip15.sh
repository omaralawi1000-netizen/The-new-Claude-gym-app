# r13 curl clip: r12 build + elbow/wrist timing traced from Omar's MoveKit reference (soft turnarounds), motions/curl.py r13
# wrist blend + skin tucked under tendons, neck sculpt v7 (neck6.py), head lag 4 f, r11 motion. scene11f.blend
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip15 - 16 960 640 clipref > clip15.log 2>&1
echo CLIPDONE >> clip15.log
