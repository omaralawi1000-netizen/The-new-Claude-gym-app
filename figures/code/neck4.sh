# neck close-ups from 4 sides at f0 (+ clip view at f41): bash neck4.sh NAME [SPP]   env BLEND, HIDE ...
N=$1; SPP=${2:-12}
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl NECKCAM=1 NECKDIST=${NECKDIST:-0.75}
i=0
for D in clip 0,-1,0.12 -1,-0.15,0.1 0,1,0.12 clip41; do
  case $D in clip) DD=""; FS=0;; clip41) DD=""; FS=41;; *) DD=$D; FS=0;; esac
  NECKDIR=$DD FRAMES_SUB=$FS ../bpyenv/bin/python run5.py ${BLEND:-scene10.blend} render8.py -- anim $PWD/n4_${N}_$i - $SPP 480 480 clipref >> n4_$N.log 2>&1
  i=$((i+1))
done
python3 - "$N" <<'PY'
import sys, glob; from PIL import Image
n=sys.argv[1]; fs=[sorted(glob.glob(f'n4_{n}_{i}/*.png'))[0] for i in range(5)]
im=Image.new('RGB',(480*5,480)); [im.paste(Image.open(f).convert('RGB'),(i*480,0)) for i,f in enumerate(fs)]; im.save(f'n4_{n}.jpg',quality=88)
PY
