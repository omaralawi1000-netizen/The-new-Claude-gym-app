# judge r14/r16: dotted lattice / pale blob on the rope at the near-fist junction. Start from the RAW frame in the box, fill only small enclosed
# bright pinholes with the plain median of their dark ring (no dithering, no dimming), leave the open gap as rendered.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
raw, fin, out = sys.argv[1:4]; frames = [int(x) for x in sys.argv[4].split(',')]
X0, Y0, X1, Y1 = 318, 342, 352, 362
import os; os.makedirs(out, exist_ok=True)
for f in frames:
    r = np.array(Image.open(f'{raw}/f{f:03d}.png').convert('RGB')).astype(float)
    n = np.array(Image.open(f'{fin}/f{f:03d}.png').convert('RGB')).astype(float)
    box = r[Y0:Y1, X0:X1].copy(); g = box @ [0.299, 0.587, 0.114]
    bright = g > 175
    lab, k = ndi.label(bright)
    fill = np.zeros_like(bright); wgt = np.zeros(bright.shape)
    for i in range(1, k + 1):
        m = lab == i; ys, xs = np.nonzero(m)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == bright.shape[0]-1 or xs.max() == bright.shape[1]-1: continue   # open to the background
        if m.sum() > 18: continue
        fill |= ndi.binary_dilation(m, iterations=1)
        wgt[ndi.binary_dilation(m, iterations=1)] = 1.0 if m.sum() <= 8 else 0.7
    ring = ndi.binary_dilation(fill, iterations=3) & ~fill & ~bright
    if fill.any() and ring.any():
        col = np.median(box[ring], axis=0); w3 = wgt[..., None]; box = box * (1 - w3) + col * w3
        # soften: blend 1px
        soft = ndi.gaussian_filter(fill.astype(float), 0.7)[..., None]
        box = r[Y0:Y1, X0:X1] * (1 - soft) + box * soft if False else box
    res = n.copy(); res[Y0:Y1, X0:X1] = box
    Image.fromarray(np.clip(res + 0.5, 0, 255).astype(np.uint8)).save(f'{out}/f{f:03d}.png')
    print(f, int(fill.sum()))
