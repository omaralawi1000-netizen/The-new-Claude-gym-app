# judge r7 pass test: background specks between the far fingertips and the glute. The glute next to them is lit at 110-143, so a
# luma>120 blob joins it and escapes speckscan.py. Here a speck = an 8-connected component of luma > HI (170; background ~240,
# lit glute <= 145) with <= 16 px, in BOX, that has a dark pixel (< 90, the fist) within 2 px. Open background is one huge component.
# speck2.py DIR first last [x0 y0 x1 y1]
import sys, numpy as np
from PIL import Image
d, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); box = [int(x) for x in sys.argv[4:8]] if len(sys.argv) > 7 else [270, 230, 390, 400]
HI, DARK, NMAX = 200, 90, 16
tot = 0
for f in range(a, b + 1):
    import os
    if not os.path.exists("%s/f%03d.png" % (d, f)): continue
    g = np.asarray(Image.open('%s/f%03d.png' % (d, f)).convert('RGB')).astype(float) @ [0.299, 0.587, 0.114]
    H, W = g.shape; light = g > HI; seen = np.zeros_like(light); out = []
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
            if big: continue
            if not any((g[max(0, y - 2):y + 3, max(0, x - 2):x + 3] < DARK).any() for y, x in comp): continue
            out.append(comp)
    tot += bool(out)
    print('SPECK2 f%d: %d %s' % (f, len(out), ' '.join('%d,%d(%dpx max %d)' % (int(np.mean([p[1] for p in c])), int(np.mean([p[0] for p in c])), len(c), int(max(g[p] for p in c))) for c in out)))
print('SPECK2 TOTAL frames %d' % tot)
