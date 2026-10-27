export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 ROPE_STRAND=0.33
export MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_TZ=0.90 CAM_ORBIT=-105 CAM_PAN=0.33 HIGH_Y=0.44 COL_HIGH_Y=1.0 FRAMES_SUB=48 BORDER=0.30,0.50,0.52,0.78
R=../bpyenv/bin/python
rm -rf tri_d tri_e tri_f
GLOW_FACE_MIN=0.40 $R run5.py scene12.blend render8.py -- anim $PWD/tri_d - 32 960 640 clipref > tri_d.log 2>&1
GLOW_FACE_MIN=0.40 GLOW_AO=0.6 GLOW_AO_D=0.04 $R run5.py scene12.blend render8.py -- anim $PWD/tri_e - 32 960 640 clipref > tri_e.log 2>&1
TRI_T1=0.45 $R run5.py scene12.blend render8.py -- anim $PWD/tri_f - 32 960 640 clipref > tri_f.log 2>&1
echo DONE > tri2.done
