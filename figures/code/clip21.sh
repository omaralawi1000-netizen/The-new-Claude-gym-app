# r18 curl clip = r17 + anti-aliased AOV bloom mask + glow does not light the forearm (light linking) + clay core from 0.03
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1 ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1 SQ_FILL=0.75 SQ_FILL_T0=0.03 FORE_NOLIGHT=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip21 - 16 960 640 clipref > clip21.log 2>&1
echo CLIPDONE >> clip21.log
