# make a hammer variant: python3 mkvar.py NAME 'channel=[(f,v),...]' ...
import sys, re
name, *subs = sys.argv[1:]
s = open('motions/hammer.py').read()
for sub in subs:
    ch, val = sub.split('=', 1)
    s, n = re.subn(r"(\n    '%s':\s*)\[[^\]]*\]" % ch, lambda m: m.group(1) + val, s)
    assert n == 1, ch
open('motions/%s.py' % name, 'w').write(s)
