# fast-mode test: 3 frames (f0 f41 f85) in one process, timing per frame. usage: bash fast.sh NAME SAMPLES [ENV=...]
NAME=$1; SPP=$2; shift 2
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=${FRAMES_SUB:-0,41,85} "$@"
../bpyenv/bin/python run5.py scene8.blend render8.py -- anim $PWD/fast_$NAME - $SPP 960 640 clipref > fast_$NAME.log 2>&1
echo FASTDONE >> fast_$NAME.log
