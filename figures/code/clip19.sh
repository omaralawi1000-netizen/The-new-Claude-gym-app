# r17 curl clip = r15 motion, hands locked to the bar at a shoulder-width 38 cm grip (LOCKW_SEP 190 mm per side), elbow hinge
# 80% forearm-axis (ELBOW_MIX 0.8) so the forearms keep r15's inward lean at the top; forearm presses into the biceps (SQUASH)
# instead of passing through it; no bloom over the forearm muscles (BLOOM_FORE). Judge r16 FIX items 1-2.
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1 ELBOW_MIX=0.8 LOCKW_SEP=190 SQUASH=1 BLOOM_FORE=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip19 - 16 960 640 clipref > clip19.log 2>&1
echo CLIPDONE >> clip19.log
