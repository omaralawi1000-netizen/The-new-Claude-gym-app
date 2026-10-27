export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 CAM_TZ=0.90
R=../bpyenv/bin/python
for O in -80 -105 -125; do rm -rf orb$O; FRAMES_SUB=20,48 MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_ORBIT=$O $R run5.py scene12.blend render8.py -- anim $PWD/orb$O - 8 960 640 clipref > orb$O.log 2>&1; done
echo DONE > orb.done
