export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1
R=../bpyenv/bin/python
rm -rf camt2_h camt2_p
FRAMES_SUB=0,30,55 MOTION=hammer PROP=rope_low CAM_LENS=43 CAM_TZ=0.80 $R run5.py scene12.blend render8.py -- anim $PWD/camt2_h - 4 960 640 clipref > /dev/null 2>&1
FRAMES_SUB=0,20,48 MOTION=pushdown PROP=rope_high ROPE_INSET=0 HIGH_Z=2.05 $R run5.py scene12.blend render8.py -- anim $PWD/camt2_p - 4 960 640 clipref > /dev/null 2>&1
echo DONE > camt2.done
