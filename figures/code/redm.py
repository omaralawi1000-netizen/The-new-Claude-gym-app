# Red accent metric (judge's): mask R-G>60 over an optional box; mean, core (lowest 30% of G), HLS lightness of mean.
import sys, colorsys, numpy as np
from PIL import Image
for a in sys.argv[1:]:
    p, *box = a.split('@')
    im = np.asarray(Image.open(p).convert('RGB')).astype(float)
    if box:
        x0, x1, y0, y1 = map(int, box[0].split(',')); im = im[y0:y1, x0:x1]
    px = im.reshape(-1, 3); m = px[(px[:, 0] - px[:, 1]) > 60]
    if not len(m): print(a, 'no red'); continue
    mean = m.mean(0); core = m[m[:, 1] <= np.percentile(m[:, 1], 30)].mean(0)
    L = colorsys.rgb_to_hls(*(mean / 255))[1]
    print(f"{a}: n {len(m)} mean {mean.round().astype(int).tolist()} core {core.round().astype(int).tolist()} L {L:.3f}")
