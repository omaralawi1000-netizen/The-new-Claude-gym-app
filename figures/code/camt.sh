export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
rm -rf camt_*
for L in 48 45 43; do
FRAMES_SUB=0 MOTION=hammer PROP=rope_low CAM_LENS=$L $R run5.py scene12.blend render8.py -- anim $PWD/camt_h$L - 4 960 640 clipref > /dev/null 2>&1
FRAMES_SUB=0 MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_LENS=$L $R run5.py scene12.blend render8.py -- anim $PWD/camt_p$L - 4 960 640 clipref > /dev/null 2>&1
done
echo DONE > camt.done
