# python3 headmesh.py field.npz out.npz : blank mannequin head + neck as ONE implicit surface (marching cubes).
# field.npz: neck radius R[z, theta] about the axis (AX, AY) sampled from the neck muscles (already closed + smoothed).
import sys, numpy as np
from skimage.measure import marching_cubes
F = np.load(sys.argv[1]); R, ZS, AX, AY = F['R'], F['ZS'], float(F['AX']), float(F['AY'])
NA = R.shape[1]
H0 = np.array([0.0, -0.004, 1.572])                 # head origin (between the ears)

def ell(Q, c, r):
    r = np.array(r); return (np.linalg.norm((Q - c) / r, axis=-1) - 1) * r.min()
def cap(Q, a, b, rad):
    a, b = np.array(a), np.array(b); ab = b - a; t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(Q - (a + t[..., None] * ab), axis=-1) - rad
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)

def head(Q):
    q = Q - H0
    d = ell(q, (0, 0.012, 0.030), (0.073, 0.094, 0.080))                      # broad cranium, mass at the back
    d = smin(d, ell(q, (0, -0.030, -0.008), (0.064, 0.062, 0.070)), 0.025)     # face
    d = smin(d, ell(q, (0, -0.036, -0.058), (0.050, 0.048, 0.046)), 0.020)     # lower face
    for s in (-1, 1):                                                          # mandible: ramus + body, clear angle
        G = (s * 0.049, 0.006, -0.070)
        d = smin(d, cap(q, (s * 0.053, 0.016, -0.020), G, 0.013), 0.012)
        d = smin(d, cap(q, G, (s * 0.018, -0.070, -0.100), 0.013), 0.012)
    d = smin(d, cap(q, (-0.016, -0.072, -0.101), (0.016, -0.072, -0.101), 0.015), 0.012)  # chin plane
    return d

def neck(Q):
    x, y, z = Q[..., 0] - AX, Q[..., 1] - AY, Q[..., 2]
    rho = np.hypot(x, y); th = np.mod(np.arctan2(y, x), 2 * np.pi) / (2 * np.pi) * NA
    zi = np.clip((z - ZS[0]) / (ZS[1] - ZS[0]), 0, len(ZS) - 1.001)
    i0 = np.floor(zi).astype(int); fz = zi - i0; j0 = np.floor(th).astype(int) % NA; fj = th - np.floor(th); j1 = (j0 + 1) % NA
    r = (R[i0, j0] * (1 - fz) * (1 - fj) + R[i0 + 1, j0] * fz * (1 - fj) + R[i0, j1] * (1 - fz) * fj + R[i0 + 1, j1] * fz * fj)
    return np.maximum((rho - r) * 0.92, ZS[0] + 0.004 - z)

lo = np.array([-0.115, -0.125, ZS[0] - 0.006]); hi = np.array([0.115, 0.125, H0[2] + 0.13]); h = 0.0014
ax = [np.arange(lo[i], hi[i], h) for i in range(3)]
X, Y, Z = np.meshgrid(*ax, indexing='ij'); Q = np.stack([X, Y, Z], -1)
D = smin(head(Q), neck(Q), 0.016)
v, f, _, _ = marching_cubes(D, 0.0, spacing=(h, h, h))
v += lo
np.savez(sys.argv[2], v=v.astype(np.float64), f=f.astype(np.int32))
print('headmesh', v.shape, f.shape, v.min(0).round(3), v.max(0).round(3))
