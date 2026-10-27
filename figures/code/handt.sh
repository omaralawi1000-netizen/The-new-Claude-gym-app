# hand close-up test: bash handt.sh NAME [ENV=..]; renders f0,f41 from the clip direction and from the front, right hand
N=$1; shift
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=${FRAMES_SUB:-0,41} "$@"
HANDCAM=r ../bpyenv/bin/python run5.py ${BLEND:-scene8.blend} render8.py -- anim $PWD/ht_${N}_c - 16 600 600 clipref > ht_$N.log 2>&1
HANDCAM=r HANDDIR=0,-1,0.25 ../bpyenv/bin/python run5.py ${BLEND:-scene8.blend} render8.py -- anim $PWD/ht_${N}_f - 16 600 600 clipref >> ht_$N.log 2>&1
python3 - "$N" <<'PY'
import sys; from PIL import Image
n=sys.argv[1]; fs=sorted(__import__('glob').glob(f'ht_{n}_c/*.png'))+sorted(__import__('glob').glob(f'ht_{n}_f/*.png'))
im=Image.new('RGB',(600*len(fs),600)); [im.paste(Image.open(f).convert('RGB'),(i*600,0)) for i,f in enumerate(fs)]; im.save(f'ht_{n}.jpg',quality=88)
PY
echo HTDONE >> ht_$N.log
