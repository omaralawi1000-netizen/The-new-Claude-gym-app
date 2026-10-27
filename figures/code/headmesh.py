# python3 headmesh.py field.npz out.npz : blank mannequin head + neck as ONE implicit surface (marching cubes).
# field.npz: neck radius R[z, theta] about the axis (AX, AY) sampled from the neck muscles (already closed + smoothed).
import sys, numpy as np
from skimage.measure import marching_cubes
F = np.load(sys.argv[1]); R, ZS, AX, AY = F['R'], F['ZS'], float(F['AX']), float(F['AY'])
NA = R.shape[1]
H0 = np.array([0.0, -0.004, 1.584])                 # head origin (between the ears)
NECK_K = 0.014

def ell(Q, c, r):
    r = np.array(r); return (np.linalg.norm((Q - c) / r, axis=-1) - 1) * r.min()
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

def head(Q):
    q = Q - H0; x, y, z = q[..., 0], q[..., 1], q[..., 2]
    d = ell(q, (0, 0.012, 0.030), (0.073, 0.090, 0.080))                       # broad cranium, mass at the back
    d = smin(d, ell(q, (0, -0.020, -0.018), (0.066, 0.064, 0.084)), 0.03)      # face
    # jaw: a mass that narrows toward the chin, cut by the jaw-line plane (chin low at the front, angle high at the back)
    taper = 1 + 0.30 * np.clip(-(y + 0.005) / 0.065, 0, 1)
    qj = np.stack([x * taper, y, z], -1)
    j = ell(qj, (0, -0.022, -0.050), (0.062, 0.064, 0.064))
    p0 = np.array([-0.072, -0.100]); p1 = np.array([0.012, -0.072])           # (y, z) chin underside -> jaw angle
    t = p1 - p0; nrm = np.array([t[1], -t[0]]) / np.linalg.norm(t)            # points down/forward
    plane = (y - p0[0]) * nrm[0] + (z - p0[1]) * nrm[1]
    if nrm[1] > 0: plane = -plane
    j = smax(j, plane, 0.007)
    d = smin(d, j, 0.016)
    d = smin(d, ell(q, (0, -0.060, -0.088), (0.022, 0.018, 0.017)), 0.016)     # chin
    return d

def neck(Q):
    x, y, z = Q[..., 0] - AX, Q[..., 1] - AY, Q[..., 2]
    rho = np.hypot(x, y); th = np.mod(np.arctan2(y, x), 2 * np.pi) / (2 * np.pi) * NA
    zi = np.clip((z - ZS[0]) / (ZS[1] - ZS[0]), 0, len(ZS) - 1.001)
    i0 = np.floor(zi).astype(int); fz = zi - i0; j0 = np.floor(th).astype(int) % NA; fj = th - np.floor(th); j1 = (j0 + 1) % NA
    r = (R[i0, j0] * (1 - fz) * (1 - fj) + R[i0 + 1, j0] * fz * (1 - fj) + R[i0, j1] * (1 - fz) * fj + R[i0 + 1, j1] * fz * fj)
    return np.maximum(np.maximum((rho - r) * 0.92, ZS[0] + 0.004 - z), z - 1.60)

lo = np.array([-0.115, -0.125, ZS[0] - 0.006]); hi = np.array([0.115, 0.125, H0[2] + 0.13]); h = 0.0014
ax = [np.arange(lo[i], hi[i], h) for i in range(3)]
X, Y, Z = np.meshgrid(*ax, indexing='ij'); Q = np.stack([X, Y, Z], -1)
D = smin(head(Q), neck(Q), NECK_K)
v, f, _, _ = marching_cubes(D, 0.0, spacing=(h, h, h))
v += lo
np.savez(sys.argv[2], v=v.astype(np.float64), f=f.astype(np.int32))
print('headmesh', v.shape, f.shape, v.min(0).round(3), v.max(0).round(3))
