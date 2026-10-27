import os
# which light specks (luma > LO, <= 16 px, dark < 90 within 2 px) are background seen through the figure (ray mask), per frame
import sys, re, numpy as np
from PIL import Image
d, md, LO = sys.argv[1], sys.argv[2], int(sys.argv[3]); bx0, by0, bx1, by1 = [int(x) for x in os.environ.get('BOX', '300,100,500,420').split(',')]; tot = 0   # gate: BOX env
import glob as _gl
for f in range(len(_gl.glob(d + '/f*.png'))):
    g = np.asarray(Image.open('%s/f%03d.png' % (d, f)).convert('RGB')).astype(float) @ [0.299, 0.587, 0.114]
    Fg = np.load('%s/fg_f%03d.npy' % (md, f)); H, W = Fg.shape[0] // 2, Fg.shape[1] // 2
    B = np.zeros(g.shape, bool); B[by0:by1, bx0:bx1] = (1 - Fg.reshape(H, 2, W, 2).mean((1, 3))) > 0.24
    light = g > LO; seen = np.zeros_like(light); out = []
    for y0 in range(by0, by1):
        for x0 in range(bx0, bx1):
            if not light[y0, x0] or seen[y0, x0]: continue
            st = [(y0, x0)]; seen[y0, x0] = True; c = []; big = False
            while st:
                y, x = st.pop(); c.append((y, x))
                if len(c) > 16: big = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < g.shape[0] and 0 <= xx < g.shape[1] and light[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
            if big or not any(B[p] for p in c): continue
            if not any((g[y - 2:y + 3, x - 2:x + 3] < 90).any() for y, x in c): continue
            out.append('%d,%d(%dpx max %d)' % (np.mean([p[1] for p in c]), np.mean([p[0] for p in c]), len(c), max(g[p] for p in c)))
    tot += bool(out)
    if out: print('BGSPECK f%d: %s' % (f, ' '.join(out)))
print('BGSPECK TOTAL frames %d' % tot)
