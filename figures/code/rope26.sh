# Pushdown clip 1 (judge r6): fist septum (FIST_SEPTUM in motions/pushdown.py ENV). Settings from the move file only.
R=../bpyenv/bin/python
env MOTION=pushdown RESUME=1 PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_pd1 - 16 960 640 clipref > clip_pd1.log 2>&1
echo DONE > rope26.done
