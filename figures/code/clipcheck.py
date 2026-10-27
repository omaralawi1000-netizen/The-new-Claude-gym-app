# python3 clipcheck.py DIR : frame-to-frame checks for flicker (static areas), pops (spikes) and the loop seam
import sys, glob, numpy as np
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/f*.png')); A = [np.asarray(Image.open(f).convert('RGB')).astype(np.float32) for f in fs]
H, W, _ = A[0].shape
static = np.zeros((H, W), bool); static[int(0.62 * H):, :] = True          # legs, feet, floor: never move
static[:, :int(0.15 * W)] = True; static[:, int(0.85 * W):] = True        # far background
d_all, d_static, d_max = [], [], []
for i in range(len(A)):
    j = (i + 1) % len(A); D = np.abs(A[j] - A[i]).mean(-1)
    d_all.append(D.mean()); d_static.append(D[static].mean()); d_max.append(np.percentile(D[static], 99.9))
d_all = np.array(d_all); d_static = np.array(d_static)
print('frames', len(A))
print('static-area change per step: mean %.3f max %.3f (99.9th pct max %.1f levels)' % (d_static.mean(), d_static.max(), max(d_max)))
print('whole-frame change per step: median %.3f max %.3f' % (np.median(d_all), d_all.max()))
med = np.convolve(np.pad(d_all, 2, mode='wrap'), np.ones(5) / 5, 'valid')
spikes = [(i, round(float(d_all[i]), 3), round(float(med[i]), 3)) for i in range(len(A)) if d_all[i] > 2.2 * med[i] + 0.05]
print('spikes (step, change, local mean):', spikes)
print('loop seam (last->first) change %.3f vs median %.3f' % (d_all[-1], np.median(d_all)))
