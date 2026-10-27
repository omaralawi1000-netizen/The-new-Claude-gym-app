# r17b curl clip = clip19 (r17) + clay core filling the forearm muscle gaps (SQ_FILL 0.75, t 0.12-0.72): no red lines through the forearm
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1 ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.12
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip20 - 16 960 640 clipref > clip20.log 2>&1
echo CLIPDONE >> clip20.log
