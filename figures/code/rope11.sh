# Rope hammer curl round 5 (judge r4): BLOOM_FORE (bloom kept off the forearm, the brachioradialis still glows), smoothstep
# fist tilt, arc + straight strands (ROPESTRAIGHT), pulley with a visible cable run into the carriage, breath creep
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43 FORE_NOLIGHT=1 BLOOM_FORE=1 UNDER_ARM_IN=0.014
R=../bpyenv/bin/python
HM="MOTION=hammer PROP=rope_low CAM_TZ=0.80 CAM_PAN=0.43"
HF=$( (seq 0 1 30; seq 35 5 45; seq 48 1 70; seq 75 5 90; seq 95 1 129) | sort -n -u | paste -sd,)
env $HM GRIPDIAG=1 FRAMES_SUB=$HF $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^EZGRIP|^ROPETILT|^ROPEMONO|^ROPESTRAIGHT|TOTAL' > hm15_contact.txt
env $HM GRIPDIAG=1 FRAMES_SUB=$(seq -s, 0 1 129) ROPE_STRAND_ONLY=1 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E '^ROPETILT' > hm15_tilt.txt
env $HM FRAMES_SUB=$(seq -s, 0 1 129) CAMDIAG=1 $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep '^CAMDIAG' > hm15_framing.txt
rm -rf hm16k; env $HM FRAMES_SUB=0,30,55 $R run5.py scene12.blend render8.py -- anim $PWD/hm16k - 16 960 640 clipref > hm16k.log 2>&1
echo DONE > rope11.done
