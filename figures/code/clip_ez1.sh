# EZ-bar curl clip 1: r15 choreography (130 f, 4.3 s) + forearms turned 22 deg, EZ bar fitted to the hands, level elbow hinge
# with abduction solve (grip width exact), wrist roll in the forearm twist. scene12.blend (twist bones).
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=ez PROP=ez TWSIGN=1 RESUME=1 PERSIST=1
../bpyenv/bin/python run5.py scene12.blend render8.py -- anim $PWD/clip_ez1 - 16 960 640 clipref > clip_ez1.log 2>&1
echo CLIPDONE >> clip_ez1.log
