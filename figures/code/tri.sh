export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 ROPE_STRAND=0.33
export MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_TZ=0.90 CAM_ORBIT=-105 CAM_PAN=0.33 HIGH_Y=0.44 COL_HIGH_Y=1.0 FRAMES_SUB=20,48 BORDER=0.30,0.50,0.52,0.78
R=../bpyenv/bin/python
rm -rf tri_a tri_b tri_c
$R run5.py scene12.blend render8.py -- anim $PWD/tri_a - 32 960 640 clipref > tri_a.log 2>&1
TRI_T1=0.62 $R run5.py scene12.blend render8.py -- anim $PWD/tri_b - 32 960 640 clipref > tri_b.log 2>&1
TRI_T1=0.62 GLOW_AO=0.35 $R run5.py scene12.blend render8.py -- anim $PWD/tri_c - 32 960 640 clipref > tri_c.log 2>&1
echo DONE > tri.done
