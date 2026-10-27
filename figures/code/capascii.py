import sys, numpy as np
for it in sys.argv[1:]:
    d, f = it.rsplit(':', 1); f = int(f)
    L = np.load('capd/%s/cap_f%03d.npy' % (d, f)); B = np.load('capd/%s/bh_f%03d.npy' % (d, f))
    C = np.argwhere(L == 1); Bp = np.argwhere(B == 0)
    D = np.sqrt(((C[:, None, :] - Bp[None, :, :]) ** 2).sum(2)); i, j = np.unravel_index(D.argmin(), D.shape)
    print(it, 'closest cap px', C[i], 'bg px', Bp[j], round(float(D.min()), 1))
    y0, x0 = C.min(0) - 4; y1, x1 = C.max(0) + 6
    ch = {0: '.', 1: 'C', 2: 'h', 3: '#'}
    for y in range(y0, y1):
        print(''.join(('c' if L[y, x] == 1 and B[y, x] == 3 else ('C' if L[y, x] == 1 else ch[int(B[y, x])])) for x in range(x0, x1)))
