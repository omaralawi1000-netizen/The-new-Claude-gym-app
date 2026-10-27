# r8 curl clip: full-body motion from motions/curl.py, 112 frames @ 30 fps, 960x640, clip framing, camera drift
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1
../bpyenv/bin/python run5.py scene8.blend render8.py -- anim $PWD/clip10 - 48 960 640 clipref > clip10.log 2>&1
echo CLIPDONE >> clip10.log
