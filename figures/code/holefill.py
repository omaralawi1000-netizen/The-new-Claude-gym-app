# Close tiny background pinholes between the far fingertips and the hip (pushdown, judge r6): the speckscan blobs (8-connected
# luma > 120, <= 16 px, holding a pixel > 150, cut off from the open background) inside BOX are painted in from their dark rim,
# outside-in. Nothing else in the frame changes. holefill.py SRC DST first last x0 y0 x1 y1
import sys, os, numpy as np
from PIL import Image
src, dst, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); box = [int(x) for x in sys.argv[5:9]]
T, LO, NMAX = 150, 120, 16
os.makedirs(dst, exist_ok=True)
for f in range(a, b + 1):
    im = np.asarray(Image.open('%s/f%03d.png' % (src, f)).convert('RGB')).astype(float); out = im.copy()
    g = im @ [0.299, 0.587, 0.114]; light = g > LO; seen = np.zeros_like(light); H, W = g.shape; fixed = []
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
            if big or max(g[p] for p in comp) <= T: continue
            hole = set(comp); fixed.append((len(comp), int(np.mean([p[1] for p in comp])), int(np.mean([p[0] for p in comp]))))
            while hole:   # outside-in: each pass fills the hole pixels that touch known pixels with their mean
                ring = {}
                for (y, x) in hole:
                    nb = [out[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (y + dy, x + dx) not in hole]
                    if nb: ring[(y, x)] = np.mean(nb, 0)
                for p, c in ring.items(): out[p] = c
                hole -= set(ring)
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save('%s/f%03d.png' % (dst, f))
    if fixed: print('HOLEFILL f%d %s' % (f, ' '.join('%dpx@%d,%d' % t for t in fixed)))
