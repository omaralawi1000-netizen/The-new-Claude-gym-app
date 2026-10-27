# r8 (hammer, fists close to the body): close the background pinholes the pass test finds (speck2h: 8-connected luma > 200,
# <= 16 px, a dark pixel < 90 within 2 px). Each one grows into its soft edge (luma > 160, at most 30 px, never into the open
# background; where it leaks out through a dim slit only the ring within 2 px of the bright core is taken) and is painted in
# from its rim, outside-in. Nothing else in the frame changes.
# holefill2.py SRC DST first last x0 y0 x1 y1
import sys, os, numpy as np
from PIL import Image
src, dst, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]); box = [int(x) for x in sys.argv[5:9]]
HI, EDGE, DARK, NMAX, GMAX = 200, 160, 90, 16, 30
os.makedirs(dst, exist_ok=True)
def comps(mask, x0, y0, x1, y1, lim):
    H, W = mask.shape; seen = np.zeros_like(mask); out = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not mask[y, x] or seen[y, x]: continue
            st = [(y, x)]; seen[y, x] = True; c = []; big = False
            while st:
                p = st.pop(); c.append(p)
                if len(c) > lim: big = True
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = p[0] + dy, p[1] + dx
                        if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
            out.append((c, big))
    return out
for f in range(a, b + 1):
    im = np.asarray(Image.open('%s/f%03d.png' % (src, f)).convert('RGB')).astype(float); out = im.copy()
    g = im @ [0.299, 0.587, 0.114]; fixed = []
    seeds = [c for c, big in comps(g > HI, *box, NMAX) if not big and any((g[max(0, y - 2):y + 3, max(0, x - 2):x + 3] < DARK).any() for y, x in c)]
    if seeds:
        soft = comps(g > EDGE, *box, GMAX)
        sset = set(p for s_ in seeds for p in s_); regions = []
        for c, big in soft:
            cs = set(c)
            if not (cs & sset): continue
            if big:   # the soft edge leaks into the open background through a dim slit: take the seed plus its soft ring within 2 px
                c = [p for p in c if min(max(abs(p[0] - q[0]), abs(p[1] - q[1])) for q in sset) <= 2]
            regions.append(c)
        for c in regions:
            hole = set(c); fixed.append((len(c), int(np.mean([p[1] for p in c])), int(np.mean([p[0] for p in c])), int(max(g[p] for p in c))))
            while hole:
                ring = {}
                for (y, x) in hole:
                    nb = [out[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (y + dy, x + dx) not in hole]
                    if nb: ring[(y, x)] = np.mean(nb, 0)
                for p, c_ in ring.items(): out[p] = c_
                hole -= set(ring)
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save('%s/f%03d.png' % (dst, f))
    print('HOLEFILL2 f%d %s' % (f, ' '.join('%dpx@%d,%d(max %d)' % t for t in fixed) if fixed else '-'))
