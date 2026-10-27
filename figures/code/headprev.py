# quick numpy sphere-trace preview of the head+neck SDF from headmesh.py: python3 headprev.py out.png
import sys, numpy as np, importlib.util
from PIL import Image
sys.argv = ['x', 'neckfield.npz', '/dev/null']
spec = importlib.util.spec_from_file_location('hm', 'headmesh.py'); src = open('headmesh.py').read().split('lo = np.array')[0]
g = {}; exec(src, g)
def sdf(Q): return g['smin'](g['head'](Q), g['neck'](Q), g['NECK_K'] if 'NECK_K' in g else 0.016)
def view(eye_dir, W=260, H=340, ctr=(0, 0, 1.53), span=0.30):
    f = np.array(eye_dir, float); f /= np.linalg.norm(f)
    r = np.cross(f, [0, 0, 1]); r /= np.linalg.norm(r); u = np.cross(r, f)
    xs = (np.arange(W) - W / 2) / H * span; ys = (H / 2 - np.arange(H)) / H * span
    X, Y = np.meshgrid(xs, ys); O = np.array(ctr) + X[..., None] * r + Y[..., None] * u - f * 0.4
    t = np.zeros((H, W)); hit = np.zeros((H, W), bool)
    for _ in range(160):
        P = O + t[..., None] * f; d = sdf(P); hit |= d < 0.0004; t = np.where(hit, t, t + np.maximum(d, 0.0008))
    P = O + t[..., None] * f; e = 0.0007
    n = np.stack([sdf(P + np.array(v) * e) - sdf(P - np.array(v) * e) for v in np.eye(3)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
    L = np.array([-0.35, -0.45, 0.82]); L /= np.linalg.norm(L)
    c = 0.25 + 0.75 * np.clip((n * L).sum(-1), 0, 1); c = np.where(hit & (t < 0.8), c, 0.95)
    return (np.clip(c, 0, 1) * 255).astype(np.uint8)
cams = [(1.85, 3.3, -0.375), (0, 1, 0), (1, 0, 0), (1.0, 3.0, 0.8)]
im = np.concatenate([view(c) for c in cams], 1)
Image.fromarray(im).save(sys.argv[-1] if len(sys.argv) > 2 else 'hp.png')
