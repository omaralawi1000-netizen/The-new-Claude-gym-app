import sys, numpy as np
from PIL import Image
# caplab2.py out dir:frame ... : behind map (cap lifted) with the cap's visible pixels tinted red
out, *items = sys.argv[1:]
col = np.array([[235,235,235],[220,40,40],[60,120,220],[90,90,90]], np.float32)
ims = []
for it in items:
    d, f = it.rsplit(':', 1); f = int(f)
    L = np.load('%s/cap_f%03d.npy' % (d, f)); B = np.load('%s/bh_f%03d.npy' % (d, f))
    im = col[B]; m = L == 1; im[m] = im[m] * 0.45 + np.array([220, 40, 40]) * 0.55
    i = Image.fromarray(im.astype(np.uint8)); ims.append(i.resize((i.width * 6, i.height * 6), Image.NEAREST))
W = Image.new('RGB', (sum(i.width + 6 for i in ims), max(i.height for i in ims)), 'black'); x = 0
for i in ims: W.paste(i, (x, 0)); x += i.width + 6
W.save(out)
