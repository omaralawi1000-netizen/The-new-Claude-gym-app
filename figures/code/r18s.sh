# barbell r18 stills: A = r17 + anti-aliased AOV mask + clay core from 0.03; B = A + squash ramp from 38 deg
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl PERSIST=1 ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75
R=../bpyenv/bin/python
rm -rf r18a r18b
FRAMES_SUB=40,44,52,60,70,76,80 SQ_FILL_T0=0.03 $R run5.py scene11f.blend render8.py -- anim $PWD/r18a - 16 960 640 clipref > r18a.log 2>&1
FRAMES_SUB=40,44,76,80 SQ_FILL_T0=0.03 SQ_ON=38 $R run5.py scene11f.blend render8.py -- anim $PWD/r18b - 16 960 640 clipref > r18b.log 2>&1
TRUNKDIAG=1 FRAMES_SUB=$( (seq 0 20; seq 110 129) | paste -sd,) SQ_FILL_T0=0.03 $R run5.py scene11f.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^TRUNK" > trunk_r18.txt
echo DONE > r18s.done
