# scaletab.py BASE NAME channel mode k : scale a table channel. mode 'mul' v*k ; mode 'elbow' 8+(v-8)*k
import sys, re
base, name, ch, mode, k = sys.argv[1:]; k = float(k)
s = open('motions/%s.py' % base).read()
m = re.search(r"'%s':\s*\('table', \[([^\]]*)\]\)" % ch, s); v = [float(x) for x in m.group(1).split(',')]
nv = [x * k for x in v] if mode == 'mul' else [8 + (x - 8) * k if x > 8 else x for x in v]
open('motions/%s.py' % name, 'w').write(s.replace(m.group(1), ', '.join('%.2f' % x for x in nv)))
