# r8 (hammer): close the background pinholes and slits by the hands from the ray-cast truth, not from brightness alone.
# Masks from render8 POCKETDIAG (POCKET_OUT): fg_fNNN.npy = 2x2 subsamples per pixel that hit the figure or the rope in BOX,
# pk_fNNN.npy = background subsamples in a slit (figure within 1.5 px on both sides) or an enclosed pocket, eye_fNNN = clip eye.
# Filled: (a) enclosed background pieces (8-connected pixels with any background subsample, cut off from the box edge,
# <= 40 px, not the clip eye, holding a pixel > 150); (b) only with HF3_SLITS=1: slit pixels that read light (luma > 170) plus
# their light rim. Notches open to the background are left to holefill2.py (bright core > 200, its soft ring within 2 px).
# Each region is painted in from its rim, outside-in; nothing else changes. holefill3.py SRC DST MASKDIR first last x0 y0 x1 y1
import sys, os, numpy as np
from PIL import Image
src, dst, md, a, b = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]); bx0, by0, bx1, by1 = [int(x) for x in sys.argv[6:10]]
os.makedirs(dst, exist_ok=True)
def comps(M):
    H, W = M.shape; seen = np.zeros_like(M); out = []
    for y, x in np.argwhere(M):
        if seen[y, x]: continue
        st = [(y, x)]; seen[y, x] = True; c = []
        while st:
            p = st.pop(); c.append(p)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = p[0] + dy, p[1] + dx
                    if 0 <= yy < H and 0 <= xx < W and M[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
        out.append(c)
    return out
BGC = {}
for f in range(a, b + 1):
    im = np.asarray(Image.open('%s/f%03d.png' % (src, f)).convert('RGB')).astype(float); out = im.copy()
    g = im @ [0.299, 0.587, 0.114]
    Fg = np.load('%s/fg_f%03d.npy' % (md, f)); Pk = np.load('%s/pk_f%03d.npy' % (md, f)); eye = np.load('%s/eye_f%03d.npy' % (md, f))
    H, W = Fg.shape[0] // 2, Fg.shape[1] // 2
    bgc = 1 - Fg.reshape(H, 2, W, 2).mean((1, 3)); B = bgc > 0
    pk = Pk.reshape(H, 2, W, 2).any((1, 3)); gb = g[by0:by1, bx0:bx1]
    fill = np.zeros((H, W), bool); tail = np.zeros((H, W), bool); log = []; TAIL_A = float(os.environ.get('HF3_TAIL_A', 0.6))
    for c in comps(B):
        ys, xs = zip(*c)
        if min(ys) == 0 or min(xs) == 0 or max(ys) == H - 1 or max(xs) == W - 1 or len(c) > 40: continue
        cy, cx = np.mean(ys) + by0, np.mean(xs) + bx0
        if np.hypot(cx - eye[0], cy - eye[1]) < 9: continue
        if max(gb[p] for p in c) <= 150: continue   # dark enough already (a covered pocket: nothing reads)
        # a pocket that is the first or last frame of a gap opening to the background (more background there next door) is left
        # alone: filling it would make the gap pop in or out instead of growing from / shrinking to a point
        ys_, xs_ = np.array([p[0] for p in c]), np.array([p[1] for p in c]); y0w, y1w, x0w, x1w = max(0, ys_.min() - 3), ys_.max() + 4, max(0, xs_.min() - 3), xs_.max() + 4
        # follow the spot through the frames before and after by overlap (its background piece there touching it, dilated 1 px): if
        # the chain ever meets an open or big gap within 10 frames, the spot is the tail of a gap closing / opening and stays as
        # rendered (filling it would make the gap pop); a chain of small closed pockets only (a pinhole that comes and goes) is filled
        grows = None
        for step in (-1, 1):
            cur = set((int(p[0]), int(p[1])) for p in c)
            for k in range(1, 11):
                f2 = (f + step * k) % 130
                if f2 not in BGC: F2 = np.load('%s/fg_f%03d.npy' % (md, f2)); BGC[f2] = comps((1 - F2.reshape(H, 2, W, 2).mean((1, 3))) > 0)
                dil = set((y + dy, x + dx) for y, x in cur for dy in (-1, 0, 1) for dx in (-1, 0, 1)); nxt = set()
                for c2 in BGC[f2]:
                    s2 = set((int(p[0]), int(p[1])) for p in c2)
                    if s2 & dil:
                        ys2 = [p[0] for p in s2]; xs2 = [p[1] for p in s2]
                        if len(s2) > 40 or min(ys2) == 0 or min(xs2) == 0 or max(ys2) == H - 1 or max(xs2) == W - 1: grows = (f2, len(s2)); break
                        nxt |= s2
                if grows or not nxt: break
                cur = nxt
            if grows: break
        if grows:
            # ...but dimmed: blended TAIL_A of the way to the fill, so the closing gap fades as it shrinks instead of ending in a
            # bright speck (a soft tail, no pop)
            for p in c: tail[p] = True
            log.append('tail %dpx@%d,%d(max %d, joins a gap at f%d)' % (len(c), cx, cy, max(gb[p] for p in c), grows[0])); continue
        # the render's light patch is wider than the geometric hole (anti-aliasing, denoise): take the light pixels (luma > 140)
        # connected to it within 2 px as well, so no light rim is left to bleed into the fill
        cs = set(map(tuple, c)); st = list(cs)
        while st:
            y_, x_ = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    q = (y_ + dy, x_ + dx)
                    if q in cs or not (0 <= q[0] < H and 0 <= q[1] < W) or gb[q] <= 140: continue
                    if min(max(abs(q[0] - p[0]), abs(q[1] - p[1])) for p in c) > 2: continue
                    cs.add(q); st.append(q)
        c = list(cs)
        for p in c: fill[p] = True
        log.append('pocket %dpx@%d,%d(max %d)' % (len(c), cx, cy, max(gb[p] for p in c)))
    sl = pk & B & (gb > 170) & (os.environ.get('HF3_SLITS') == '1')   # off by default: thin gaps between fingers or rope and leg read as lines, not specks
    if sl.any():
        from numpy.lib.stride_tricks import sliding_window_view as _sw
        dil = np.pad(sl, 1); dil = _sw(dil, (3, 3)).any((2, 3))
        reg = sl | (dil & B & (gb > 150))
        for c in comps(reg & ~fill):
            cy, cx = np.mean([p[0] for p in c]) + by0, np.mean([p[1] for p in c]) + bx0
            if np.hypot(cx - eye[0], cy - eye[1]) < 9: continue
            for p in c: fill[p] = True
            log.append('slit %dpx@%d,%d(max %d)' % (len(c), cx, cy, max(gb[p] for p in c)))
    _sk = os.environ.get('HF3_SKIP')   # x0,y0,x1,y1,f0,f1: a real open gap between rope and fist (judge r9): leave it as rendered
    if _sk:
        sx0, sy0, sx1, sy1, sf0, sf1 = [int(v) for v in _sk.split(',')]
        if sf0 <= f <= sf1:
            for arr in (fill, tail): arr[max(0, sy0 - by0):max(0, sy1 - by0), max(0, sx0 - bx0):max(0, sx1 - bx0)] = False
    raw = out.copy(); fill_all = fill | tail
    hole = set((int(y) + by0, int(x) + bx0) for y, x in np.argwhere(fill_all))
    while hole:
        ring = {}
        for (y, x) in hole:
            nb = [out[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and (y + dy, x + dx) not in hole]
            if nb: ring[(y, x)] = np.mean(nb, 0)
        if not ring: break
        for p, c_ in ring.items(): out[p] = c_
        hole -= set(ring)
    # then smooth it: 60 Jacobi steps of the 4-neighbour mean inside the filled pixels (a harmonic fill between the two sides,
    # no mottling where a slit runs between a dark and a light part)
    if fill_all.any():
        Fm = np.zeros(g.shape, bool); Fm[by0:by1, bx0:bx1] = fill_all
        for _ in range(60):
            av = (np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 4
            out[Fm] = av[Fm]
        Tm = np.zeros(g.shape, bool); Tm[by0:by1, bx0:bx1] = tail
        out[Tm] = raw[Tm] + TAIL_A * (out[Tm] - raw[Tm])
    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save('%s/f%03d.png' % (dst, f))
    print('HOLEFILL3 f%d %s' % (f, ' '.join(log) if log else '-'))
