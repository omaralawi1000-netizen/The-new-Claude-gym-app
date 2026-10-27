# r13 (112 f) -> r14 (120 f, 4.0 s): retime the rep for a calmer teaching tempo with a real settle at the bottom.
# Time warp old->new with smooth speed changes; elbow/wrist tables resampled through it, every body key mapped through it.
import numpy as np, re, sys, importlib
sys.path.insert(0, '.')
OLD, NEW = 112, int(sys.argv[1]) if len(sys.argv) > 1 else 144
m = importlib.import_module('motions.curl_r13')
E13 = np.array(m.CH['elbow'][1])
# knots: old frame -> new frame (bottom middle stays at f0)
K_old = [0, 4, 40, 64, 104, 112]
K_new = [0, 14, 57, 70, 116, 130]          # r15 4.3 s: bottom settle 28 f, lift 43 f, squeeze 13 f, lower 46 f (lift ~1.5 s, lowering a touch slower)
K_new = [k * NEW / 130 for k in K_new]
# speed (d new / d old) per old frame, piecewise constant, smoothed periodically, renormalised to sum NEW
sp = np.zeros(OLD)
for (a, b), (c, d) in zip(zip(K_old, K_old[1:]), zip(K_new, K_new[1:])): sp[a:b] = (d - c) / (b - a)
def psmooth(x, sg):
    r = int(4 * sg); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sg) ** 2); k /= k.sum(); n = len(x)
    return np.array([sum(k[j] * x[(i + j - r) % n] for j in range(2 * r + 1)) for i in range(n)])
sp = psmooth(sp, 4.0); sp *= NEW / sp.sum()
Wn = np.r_[0, np.cumsum(sp)]                       # new time of old frame 0..112
def o2n(f): f = f % OLD; return float(np.interp(f, np.arange(OLD + 1), Wn))
def n2o(g): return float(np.interp(g % NEW, Wn, np.arange(OLD + 1)))
def e13(f):                                         # periodic linear sample of the r13 table
    f = f % OLD; i = int(np.floor(f)); u = f - i; return E13[i] * (1 - u) + E13[(i + 1) % OLD] * u
E = np.array([e13(n2o(g)) for g in range(NEW)])
# top: the squeeze peaks just before the lowering (a 3 deg lift = ~3 px at the bar), so leaving the top is a motion, not a fade
tc = o2n(58); E += float(sys.argv[2] if len(sys.argv) > 2 else 3.0) * np.exp(-0.5 * ((((np.arange(NEW) - tc + NEW / 2) % NEW) - NEW / 2) / 4.5) ** 2)
E = psmooth(E, 2.0)
E = 8 + (E - E.min()) * (np.clip(E.max(), 0, 1e9) - 8) / (E.max() - E.min())   # keep the bottom at 8
W = 4 + 8 * (np.minimum(E, 124) - 8) / 116
src = open('motions/curl_r13.py').read()
fmt = lambda A: '[' + ', '.join('%.1f' % x for x in A) + ']'
src = re.sub(r"'elbow':\s+\('table', \[[^\]]*\]\)", "'elbow':        ('table', " + fmt(E) + ")", src)
src = re.sub(r"'wrist':\s+\('table', \[[^\]]*\]\)", "'wrist':        ('table', " + fmt(W) + ")", src)
def mapkeys(mo):
    keys = eval(mo.group(2)); out = sorted((round(o2n(f)), v) for f, v in keys)
    return mo.group(1) + '[' + ', '.join('(%d, %s)' % (f, repr(v)) for f, v in out) + ']'
src = re.sub(r"('(?:shoulder|scap|breath|brace|pelvis_pitch|lumbar_pitch|chest_pitch|chest_lift|hips_fwd|knee)':\s+)(\[[^\]]*\])", mapkeys, src)
src = re.sub(r"\('sine', (-?[\d.]+), (\d+)\)", lambda mo: "('sine', %s, %d)" % (mo.group(1), round(o2n(int(mo.group(2))))), src)
src = src.replace('FRAMES = 112', 'FRAMES = %d' % NEW)
src = src.replace("# Barbell curl, one rep that loops: 112 frames @ 30 fps (3.7 s).", "# Barbell curl, one rep that loops: %d frames @ 30 fps (%.1f s). r14 (Omar 13:30): calmer teaching tempo + a settle at the bottom." % (NEW, NEW / 30))
open('motions/curl.py', 'w').write(src)
v = np.diff(np.r_[E, E[0]]); a = np.diff(np.r_[v, v[0]])
print('elbow min %.1f max %.1f | max speed %.2f deg/f | max accel %.2f | frames within 2 deg of bottom %d, of top %d' % (E.min(), E.max(), abs(v).max(), abs(a).max(), (E < 10).sum(), (E > E.max() - 2).sum()))
for g in range(0, NEW, 6): print(g, '%.1f' % E[g])
