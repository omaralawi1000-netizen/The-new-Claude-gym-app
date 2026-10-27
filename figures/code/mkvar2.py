# like mkvar.py but from a given base: python3 mkvar2.py BASE NAME 'ch=[...]' ...
import sys, re
base, name, *subs = sys.argv[1:]
s = open('motions/%s.py' % base).read()
for sub in subs:
    ch, val = sub.split('=', 1)
    s, n = re.subn(r"(\n    '%s':\s*)\[[^\]]*\]" % ch, lambda m: m.group(1) + val, s)
    assert n == 1, ch
open('motions/%s.py' % name, 'w').write(s)
