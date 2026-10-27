# wrist edge check: right hand from below + clip view at the top of the rep (f41). bash wristt.sh NAME   env BLEND
N=$1
export GLOW_STRENGTH=16 GLOW_SIZE=0.95 HALO_R=0.03 HALO_K=12 MOTION=curl FRAMES_SUB=${FRAMES_SUB:-41}
HANDCAM=r HANDDIST=0.45 HANDDIR=0.15,-0.35,-1 ../bpyenv/bin/python run5.py ${BLEND:-scene10t.blend} render8.py -- anim $PWD/wt_${N}_b - 16 500 500 clipref > wt_$N.log 2>&1
HANDCAM=r HANDDIST=0.45 ../bpyenv/bin/python run5.py ${BLEND:-scene10t.blend} render8.py -- anim $PWD/wt_${N}_c - 16 500 500 clipref >> wt_$N.log 2>&1
python3 -c "
from PIL import Image; import glob
fs=sorted(glob.glob('wt_${N}_b/*.png'))+sorted(glob.glob('wt_${N}_c/*.png')); im=Image.new('RGB',(500*len(fs),500))
[im.paste(Image.open(f).convert('RGB'),(i*500,0)) for i,f in enumerate(fs)]; im.save('wt_${N}.jpg',quality=88)"
