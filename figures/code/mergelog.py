# merge the parallel GRIPDIAG chunks into one log in frame order (per-frame lines, then the chunk TOTAL lines)
import sys, re
out, hdr, *ins = sys.argv[1:]
rows, tot = [], []
for f in ins:
    for l in open(f):
        m = re.match(r'(EZGRIP|ROPETILT|ROPEMONO|ROPESTRAIGHT) f(\d+)', l)
        if m: rows.append((int(m[2]), ['EZGRIP', 'ROPETILT', 'ROPEMONO', 'ROPESTRAIGHT'].index(m[1]), l))
        elif 'TOTAL' in l: tot.append('[%s] %s' % (f, l))
with open(out, 'w') as o:
    o.write(hdr.replace('\\n', '\n') + '\n')
    for r in sorted(rows, key=lambda r: (r[0], r[1])): o.write(r[2])
    o.write(''.join(tot))
