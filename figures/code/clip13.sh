# r11 curl clip, 16 samples (fast mode test): hand + neck fix (scene9.blend, thumb opposition 0, head lag 4 f) + naturalness pass (motions/curl.py r11)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene9.blend render8.py -- anim $PWD/clip13 - 16 960 640 clipref > clip13.log 2>&1
echo CLIPDONE >> clip13.log
