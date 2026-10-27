export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl PERSIST=1 ELBOW_MIX=0.8 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03 FORE_NOLIGHT=1
R=../bpyenv/bin/python
rm -rf r18f190 r18f200
FRAMES_SUB=0,44,52,60,70,76 LOCKW_SEP=190 $R run5.py scene11f.blend render8.py -- anim $PWD/r18f190 - 16 960 640 clipref > r18f190.log 2>&1
FRAMES_SUB=0,52,60,70 LOCKW_SEP=200 $R run5.py scene11f.blend render8.py -- anim $PWD/r18f200 - 16 960 640 clipref > r18f200.log 2>&1
echo DONE > r18w.done
