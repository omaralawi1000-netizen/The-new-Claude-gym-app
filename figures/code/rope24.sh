# hammer close-ups on the clip build (farthest-root clip solve, tilt span 66); no env but MOTION
R=../bpyenv/bin/python
rm -rf h13_*
for H in r l; do
  env MOTION=hammer FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/h13_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env MOTION=hammer FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 $R run5.py scene12.blend render8.py -- anim $PWD/h13_${H}b - 16 480 480 clipref > /dev/null 2>&1
done
echo DONE > rope24.done
