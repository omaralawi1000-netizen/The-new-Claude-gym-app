# smooth.py DIR [x0,y0,x1,y1] : the judge's motion test. Blur each frame (box 5 px), mean |change| per step inside the box,
# flag a step > 1.6x the mean of its 4 neighbours (a pop or hitch) and report the loop seam against its neighbours.
import sys, glob, numpy as np
from PIL import Image, ImageFilter
fs = sorted(glob.glob(sys.argv[1] + '/f*.png')); box = [int(x) for x in (sys.argv[2] if len(sys.argv) > 2 else '0,0,960,640').split(',')]
A = [np.asarray(Image.open(f).convert('L').crop(box).filter(ImageFilter.BoxBlur(5))).astype(np.float32) for f in fs]
n = len(A); d = np.array([np.abs(A[(i + 1) % n] - A[i]).mean() for i in range(n)])   # d[i] = step i -> i+1 (last = seam)
bad = []
for i in range(n):
    nb = np.mean([d[(i + k) % n] for k in (-2, -1, 1, 2)])
    if d[i] > 1.6 * nb and d[i] > 0.15: bad.append((i, round(float(d[i]), 3), round(float(nb), 3)))
print('SMOOTH steps %d median %.3f max %.3f | seam %.3f vs neighbours %.3f | spikes %s' % (n, np.median(d), d.max(), d[-1], np.mean([d[-3], d[-2], d[0], d[1]]), bad or 'none'))
