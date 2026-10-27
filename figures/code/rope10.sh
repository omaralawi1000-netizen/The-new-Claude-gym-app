# hammer round 4b: in-fist bend 6 mm (12 mm cut the hand once the heel handle shortened), fist tilt up to 14 deg (8 left 2 mm of slack at the bottom)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 ROPE_STRAND=0.33 UNDER_ARM_IN=0.014 ROPE_INSET=0.006 ROPE_TILT=14
R=../bpyenv/bin/python
HM="MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43"
HF=$( (seq 0 5 125; seq 48 70) | sort -n -u | paste -sd,)
env $HM GRIPDIAG=1 FRAMES_SUB=$HF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP|^ROPETILT|^ROPEMONO' > hm11_contact.txt &
env $HM FRAMES_SUB=$(seq 0 1 129 | paste -sd,) CAMDIAG=1 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > hm13_framing.txt
rm -rf hm14k h10_rc h10_rb h10_lc h10_lb
env $HM FRAMES_SUB=0,30,55 $R run5.py scene12.blend render8.py -- anim $PWD/hm14k - 16 960 640 clipref > hm14k.log 2>&1
for H in r l; do
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=-3.49,-1.46,0.4 $R run5.py scene12.blend render8.py -- anim $PWD/h10_${H}c - 16 480 480 clipref > /dev/null 2>&1
  env $HM FRAMES_SUB=0,30,55,70 HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 $R run5.py scene12.blend render8.py -- anim $PWD/h10_${H}b - 16 480 480 clipref > /dev/null 2>&1
done
wait
echo DONE > rope10.done
