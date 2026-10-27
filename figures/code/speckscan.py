# judge r6 pass test: no pinhole of background through the figure. A pinhole = a small isolated light blob: an 8-connected
# component of luma > LO (120) with <= 16 px that holds a pixel > T (150), i.e. not joined to the open background.
# speckscan.py DIR first last [x0 y0 x1 y1]
import sys, numpy as np
from PIL import Image
d, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); box = [int(x) for x in sys.argv[4:8]] if len(sys.argv) > 7 else [0, 0, 960, 640]
T, LO, NMAX = 150, 120, 16
tot = 0
for f in range(a, b + 1):
    im = np.asarray(Image.open('%s/f%03d.png' % (d, f)).convert('RGB')).astype(float)
    g = im @ [0.299, 0.587, 0.114]
    light = g > LO; seen = np.zeros_like(light); blobs = []
    H, W = g.shape
    for y0 in range(box[1], box[3]):
        for x0 in range(box[0], box[2]):
            if not light[y0, x0] or seen[y0, x0]: continue
            st = [(y0, x0)]; seen[y0, x0] = True; comp = []; big = False
            while st:
                y, x = st.pop(); comp.append((y, x))
                if len(comp) > NMAX: big = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and light[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
            if not big and max(g[p] for p in comp) > T: blobs.append(comp)
    tot += len(blobs) > 0
    print('SPECK f%d: %d %s' % (f, len(blobs), ' '.join('%d,%d(%dpx max %d)' % (int(np.mean([p[1] for p in c])), int(np.mean([p[0] for p in c])), len(c), int(max(g[p] for p in c))) for c in blobs)))
print('SPECK TOTAL frames with pinholes %d' % tot)
