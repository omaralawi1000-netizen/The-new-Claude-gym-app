# rope round 3b keys with framing fix (lens 43: hammer target z 0.80, pushdown 0.90) + full pushdown contact (INSET 0)
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 TWSIGN=1 CAM_LENS=43
R=../bpyenv/bin/python
rm -rf hm9k pd10k
FRAMES_SUB=0,30,55 MOTION=hammer PROP=rope_low CAM_TZ=0.80 $R run5.py scene12.blend render8.py -- anim $PWD/hm9k - 16 960 640 clipref > /dev/null 2>&1
FRAMES_SUB=0,20,48 MOTION=pushdown PROP=rope_high ROPE_INSET=0 CAM_TZ=0.90 $R run5.py scene12.blend render8.py -- anim $PWD/pd10k - 16 960 640 clipref > /dev/null 2>&1
echo KEYS > rope5.keys
MOTION=pushdown PROP=rope_high ROPE_INSET=0 GRIPDIAG=1 FRAMES_SUB=$( (seq 0 5 125; seq 0 5; seq 44 62; seq 112 129) | sort -n -u | paste -sd,) $R run5.py scene12.blend render8.py -- still /dev/null 0 2>&1 | grep -E "^EZGRIP|^GLOWS|^ROPETILT" > pd10_contact.txt
echo DONE > rope5.done
