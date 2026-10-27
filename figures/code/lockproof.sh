# hand-on-bar proof: camera locked on the right hand's grip, r15 (old hinge) vs r16 (locked), every 15 frames
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl
R=../bpyenv/bin/python; FR=0,15,30,45,60,75,90,105,120
FRAMES_SUB=$FR HANDCAM=r HANDDIST=0.9 ELBOW_AXIS=forearm LOCKW=0 $R run5.py scene11f.blend render8.py -- anim $PWD/lk_r15 - 16 480 480 clipref > /dev/null 2>&1
FRAMES_SUB=$FR HANDCAM=r HANDDIST=0.9 ELBOW_AXIS=level LOCKW=1 $R run5.py scene11f.blend render8.py -- anim $PWD/lk_r16 - 16 480 480 clipref > /dev/null 2>&1
echo DONE > lockproof.done
