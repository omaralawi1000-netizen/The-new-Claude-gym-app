# judge r4 pass: |second difference| <= 0.15 deg/f^2 on every frame (loop wraps), no run of 3+ identical values outside the top creep
import sys, re, numpy as np
T = {}
for l in open(sys.argv[1]):
    m = re.match(r'ROPETILT f(\d+) (\w) phi ([\d.]+) tilt (-?[\d.]+)', l)
    if m: T.setdefault(m[2], {})[int(m[1])] = (float(m[3]), float(m[4]))
for s, d in T.items():
    F = sorted(d); t = np.array([d[f][1] for f in F]); n = len(t)
    d2 = np.array([t[(i + 1) % n] - 2 * t[i] + t[i - 1] for i in range(n)])
    w = int(np.argmax(np.abs(d2)))
    runs = []; i = 0
    while i < n:
        j = i
        while j + 1 < n and t[j + 1] == t[i]: j += 1
        if j - i + 1 >= 3: runs.append((F[i], F[j], t[i]))
        i = j + 1
    print('%s: %d frames, tilt %.1f..%.1f, max |2nd diff| %.3f deg/f^2 at f%d (pass <= 0.15: %s), identical runs >= 3: %s'
          % (s, n, t.min(), t.max(), abs(d2[w]), F[w], abs(d2[w]) <= 0.15, runs or 'none'))
