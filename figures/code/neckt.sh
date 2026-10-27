# neck close-ups: bash neckt.sh NAME [ENV=..] ; f0,f41 from the clip direction (NECKCAM) and the front
N=$1; shift
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=${FRAMES_SUB:-0,41} "$@"
NECKCAM=1 ../bpyenv/bin/python run5.py ${BLEND:-scene9.blend} render8.py -- anim $PWD/nk_${N}_c - 16 600 600 clipref > nk_$N.log 2>&1
NECKCAM=1 NECKDIR=0,-1,0.1 ../bpyenv/bin/python run5.py ${BLEND:-scene9.blend} render8.py -- anim $PWD/nk_${N}_f - 16 600 600 clipref >> nk_$N.log 2>&1
python3 - "$N" <<'PY'
import sys, glob; from PIL import Image
n=sys.argv[1]; fs=sorted(glob.glob(f'nk_{n}_c/*.png'))+sorted(glob.glob(f'nk_{n}_f/*.png'))
im=Image.new('RGB',(600*len(fs),600)); [im.paste(Image.open(f).convert('RGB'),(i*600,0)) for i,f in enumerate(fs)]; im.save(f'nk_{n}.jpg',quality=88)
PY
