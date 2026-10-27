# grip close-ups: each hand, clip camera direction and from below, bottom (f0) and top (f41) of the rep. bash gripshots.sh NAME
N=$1; shift
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=0,41 "$@"
for H in r l; do
  HANDCAM=$H HANDDIST=0.45 ../bpyenv/bin/python run5.py ${BLEND:-scene9.blend} render8.py -- anim $PWD/gs_${N}_${H}c - 24 600 600 clipref > gs_$N.log 2>&1
  HANDCAM=$H HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 ../bpyenv/bin/python run5.py ${BLEND:-scene9.blend} render8.py -- anim $PWD/gs_${N}_${H}b - 24 600 600 clipref >> gs_$N.log 2>&1
done
python3 - "$N" <<'PY'
import sys; from PIL import Image, ImageDraw
n=sys.argv[1]; S=600; FR=tuple(int(x) for x in __import__("os").environ.get("FRAMES_SUB","0,41").split(",")); im=Image.new("RGB",(S*4,S*len(FR)+40),(255,255,255)); d=ImageDraw.Draw(im)
cols=[('rc','right hand, clip view'),('rb','right hand, from below'),('lc','left hand, clip view'),('lb','left hand, from below')]
for i,(k,lab) in enumerate(cols):
    for j,f in enumerate(tuple(int(x) for x in __import__("os").environ.get("FRAMES_SUB","0,41").split(","))):
        im.paste(Image.open(f'gs_{n}_{k}/f{f:03d}.png').convert('RGB'),(i*S,40+j*S))
    d.text((i*S+8,12),lab+'  (top row: bottom of rep f0, bottom row: top)' if i==0 else lab,fill=(0,0,0))
im.save(f'gs_{n}.jpg',quality=88)
PY
