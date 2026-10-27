# r16 curl clip = r15 exactly, plus hands locked to the bar: level elbow hinge + per-frame width hold (render8 LOCKW).
# r15's forearm-axis hinge slid each hand ~8 cm along the bar over the rep (Omar 18 Oct: "the hands slide on the bar").
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl RESUME=1 PERSIST=1 ELBOW_AXIS=level LOCKW=1
../bpyenv/bin/python run5.py scene11f.blend render8.py -- anim $PWD/clip18 - 16 960 640 clipref > clip18.log 2>&1
echo CLIPDONE >> clip18.log
