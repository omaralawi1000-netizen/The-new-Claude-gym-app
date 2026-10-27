# round 4 keys (draft): 0.33 m strands, FORE_NOLIGHT, centred (CAM_PAN), pushdown at -105 with the column on a boom 1.0 m out
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 ROPE_STRAND=0.33
R=../bpyenv/bin/python
rm -rf hm11k pd12k
FRAMES_SUB=0,30,55 MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43 $R run5.py scene12.blend render8.py -- anim $PWD/hm11k - 16 960 640 clipref > hm11k.log 2>&1
FRAMES_SUB=0,20,48 MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_TZ=0.90 CAM_ORBIT=-105 CAM_PAN=0.33 HIGH_Y=0.44 COL_HIGH_Y=1.0 $R run5.py scene12.blend render8.py -- anim $PWD/pd12k - 16 960 640 clipref > pd12k.log 2>&1
echo DONE > rope7.done
