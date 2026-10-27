import sys, re
for mv in sys.argv[1:]:
    L = [l for f in (mv + '_a.txt', mv + '_b.txt') for l in open(f) if l.startswith('EZGRIP f')]
    fr = sorted(int(re.match(r'EZGRIP f(\d+)', l)[1]) for l in L)
    ins = sum(int(x) for l in L for x in re.findall(r'inside (\d+)', l))
    mc = min(float(x) for l in L for x in re.findall(r'minclear ([\d.]+)mm', l))
    st = max(float(x) for l in L for x in re.findall(r'ROPESTRAIGHT r ([\d.]+)mm, l ([\d.]+)mm', l) for x in x)
    mono = max(float(x) for l in L for x in re.findall(r'ROPEMONO r back ([\d.]+)mm, l back ([\d.]+)mm', l) for x in x)
    body = min((float(m[0]), m[1], int(re.match(r'EZGRIP f(\d+)', l)[1])) for l in L for m in re.findall(r'min clearance ([\d.]+)mm \(([^)]*)\)', l))
    cr = sum(int(x) for l in L for x in re.findall(r'crossings (\d+)', l))
    head = [x for l in L for x in re.findall(r'rope to head ([>\d]+)mm', l)]
    hmin = min(int(h) for h in head if h.isdigit()) if any(h.isdigit() for h in head) else '>300'
    cl = [(int(a), int(b), int(re.match(r'EZGRIP f(\d+)', l)[1])) for l in L for a, b in re.findall(r'clip above exits (-?\d+)mm, above fists (-?\d+)mm', l)]
    print(f'{mv}: {len(fr)} frames ({fr[0]}..{fr[-1]}), hand skin inside rope {ins}, worst hand clearance {mc} mm, ROPESTRAIGHT worst {st} mm, '
          f'ROPEMONO worst back-step {mono} mm, rope-body min {body[0]} mm ({body[1]}, f{body[2]}), crossings {cr}, rope-head min {hmin} mm, '
          f'clip above exits min {min(cl)[0]} mm (f{min(cl)[2]}), above fists min {min(cl, key=lambda t: t[1])[1]} mm')
