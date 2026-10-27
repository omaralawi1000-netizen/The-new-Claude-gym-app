# small isolated pink blobs (R-G > 22) away from the main glow: 8-connected components of R-G > 22 with <= NMAX px.
# pinkscan.py DIR f1,f2,... [x0 y0 x1 y1]
import sys, numpy as np
from PIL import Image
d, fr = sys.argv[1], [int(x) for x in sys.argv[2].split(',')]; box = [int(x) for x in sys.argv[3:7]] if len(sys.argv) > 6 else [0, 0, 960, 640]
NMAX = 12; tot = 0
for f in fr:
    im = np.asarray(Image.open('%s/f%03d.png' % (d, f)).convert('RGB')).astype(int)
    rg = im[..., 0] - im[..., 1]; pk = rg > 22; seen = np.zeros_like(pk); out = []
    H, W = pk.shape
    for y0 in range(box[1], box[3]):
        for x0 in range(box[0], box[2]):
            if not pk[y0, x0] or seen[y0, x0]: continue
            st = [(y0, x0)]; seen[y0, x0] = True; comp = []
            while st:
                y, x = st.pop(); comp.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and pk[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
            if len(comp) <= NMAX: out.append(comp)
    tot += len(out) > 0
    print('PINK f%d: %d %s' % (f, len(out), ' '.join('%d,%d(%dpx R-G %d)' % (int(np.mean([p[1] for p in c])), int(np.mean([p[0] for p in c])), len(c), max(rg[p] for p in c)) for c in out)))
print('PINK TOTAL frames %d' % tot)
