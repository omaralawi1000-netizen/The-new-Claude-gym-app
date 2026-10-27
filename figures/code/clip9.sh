# r7f curl clip: one seamless rep, 112 frames @ 30 fps (hold 6, lift 34, squeeze 14, lower 51, hold 7), 960x640, clip framing
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12
rm -rf clip9; ../bpyenv/bin/python run5.py scene.blend render.py -- anim $PWD/clip9 112 48 960 640 clipref > clip9.log 2>&1
echo CLIPDONE >> clip9.log
