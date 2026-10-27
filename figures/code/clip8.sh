# r6 curl clip: one seamless rep, 96 frames @ 30 fps, 960x640 (3:2 like the app's figure stage), reference camera angle
export GLOW_STRENGTH=20 GLOW_SIZE=0.9 HALO_R=0.022 HALO_K=14
rm -rf clip8; ../bpyenv/bin/python run5.py scene.blend render.py -- anim $PWD/clip8 96 48 960 640 clipref > clip8.log 2>&1
echo CLIPDONE >> clip8.log
