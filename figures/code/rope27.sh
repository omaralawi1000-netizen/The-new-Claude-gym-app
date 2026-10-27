# Hammer clip 2 (judge r6): CAPDIAG every frame, then the clip after the pushdown clip is done.
R=../bpyenv/bin/python
bash capall.sh hammer 0 129
until [ -f rope26.done ]; do sleep 30; done
env MOTION=hammer RESUME=1 PERSIST=1 $R run5.py scene12.blend render8.py -- anim $PWD/clip_hm2 - 16 960 640 clipref > clip_hm2.log 2>&1
echo DONE > rope27.done
