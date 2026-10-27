until [ -f r18s.done ]; do sleep 5; done
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl PERSIST=1 ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03
R=../bpyenv/bin/python
rm -rf r18k r18n
FRAMES_SUB=44,76 MASK_K=1.0 $R run5.py scene11f.blend render8.py -- anim $PWD/r18k - 16 960 640 clipref > r18k.log 2>&1
FRAMES_SUB=44,76 MASK_K=1.0 FORE_NOLIGHT=1 $R run5.py scene11f.blend render8.py -- anim $PWD/r18n - 16 960 640 clipref > r18n.log 2>&1
echo DONE > r18t.done
