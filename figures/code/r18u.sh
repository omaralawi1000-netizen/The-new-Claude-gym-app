export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl PERSIST=1 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03
R=../bpyenv/bin/python
rm -rf r18n r18n9
FRAMES_SUB=44,76 ELBOW_MIX=0.8 LOCKW_SEP=190 MASK_K=1.0 FORE_NOLIGHT=1 $R run5.py scene11f.blend render8.py -- anim $PWD/r18n - 16 960 640 clipref > r18n.log 2>&1
FRAMES_SUB=44,76 ELBOW_MIX=0.8 LOCKW_SEP=190 FORE_NOLIGHT=1 $R run5.py scene11f.blend render8.py -- anim $PWD/r18n9 - 16 960 640 clipref > r18n9.log 2>&1
TRUNKDIAG=1 FRAMES_SUB=0,10 ELBOW_MIX=0.8 LOCKW_SEP=190 $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^TRUNK f" > trunk_h_r18.txt
TRUNKDIAG=1 FRAMES_SUB=0,10 LOCKW=0 SQUASH=0 $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^TRUNK f" > trunk_h_r15.txt
echo DONE > r18u.done
