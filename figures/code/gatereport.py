# gatereport.py OUTDIR MOTION PROP : one red/green report from the gate logs (gate.sh)
import sys, re, os, glob
O, M, PROP = sys.argv[1:4]; rope = PROP.startswith('rope'); barp = PROP.startswith('bar_'); bar = PROP in ('barbell', 'ez') or barp
L = lambda n: open(os.path.join(O, n)).read() if os.path.exists(os.path.join(O, n)) else ''
rows = []
def add(name, ok, msg): rows.append(('PASS' if ok is True else 'FAIL' if ok is False else 'INFO', name, msg))
t = L('grip.log')
pc = L('pixel_counts.txt').split(); NRAW, NFIN = (int(pc[0]), int(pc[1])) if len(pc) == 2 else (0, 0)
add('Pixel stage ran on every frame (holefill3 made all final frames)', NRAW > 0 and NRAW == NFIN, 'raw %d, final %d' % (NRAW, NFIN))
cr = L('crashed.txt').split(); add('No diagnostic job crashed', not cr, ', '.join(cr) if cr else 'none')
m = re.findall(r'EZGRIP TOTAL inside (\d+)\s+worst clearance r ([\d.]+)mm l ([\d.]+)mm', t)
if m: add('Hands on the prop (contact)', all(int(a) == 0 for a, _, _ in m), 'inside %s, worst clearance %s mm' % (sum(int(a) for a, _, _ in m), min(min(float(b), float(c)) for _, b, c in m)))
else: add('Hands on the prop (contact)', False, 'no GRIPDIAG result')
if rope:
    for key, nm in (('ROPEMONO', 'Rope strands run only toward the clip'), ('ROPESTRAIGHT', 'Rope straight past the fist')):
        v = [int(x) for x in re.findall(key + r' TOTAL violations (\d+)', t)]; add(nm, bool(v) and sum(v) == 0, '%s strand-frames' % sum(v) if v else 'missing')
    f = re.findall(r'FARDIAG TOTAL floating frames (\d+)', L('far.log')); add('Far rope end held (nothing floating)', bool(f) and int(f[-1]) == 0, '%s floating frames' % (f[-1] if f else 'missing'))
    c = re.findall(r'CABLEDIAG TOTAL tangent runs (\d+), longest near-outline run (\d+) px', L('cable.log')); add('Cable clear of outlines', bool(c) and int(c[-1][0]) == 0, 'tangent runs %s, longest %s px' % c[-1] if c else 'missing')
    tl = re.findall(r'max \|2nd diff\| ([\d.]+) deg/f\^2', L('tiltcheck.log')); add('Fist tilt smooth (<= 0.15 deg/f^2)', bool(tl) and max(map(float, tl)) <= 0.15, 'max %s' % (max(map(float, tl)) if tl else 'missing'))
    cm = re.findall(r'CAMDIAG worst near-fist gap (-?\d+)px at f(\d+)', L('cam.log')); add('Near fist clear of the machine', bool(cm) and int(cm[-1][0]) >= 6 if cm else None, 'worst gap %s px at f%s' % cm[-1] if cm else 'not run')
if barp:
    c = re.findall(r'CABLEDIAG TOTAL tangent runs (\d+), longest near-outline run (\d+) px', L('cable.log')); add('Cable clear of outlines', bool(c) and int(c[-1][0]) == 0, 'tangent runs %s, longest %s px' % c[-1] if c else 'missing')
if bar:
    S = {}
    for l in L('slide.log').splitlines():
        for sd, x, y, z in re.findall(r'(\w) x ([+-][\d.]+) y ([+-][\d.]+) z ([+-][\d.]+) mm', l): S.setdefault(sd, []).append((float(x), float(y), float(z)))
    rg = max((max(v[i] for v in vv) - min(v[i] for v in vv)) for vv in S.values() for i in range(3)) if S else None
    add('Hands never slide on the bar (SLIDEDIAG)', rg is not None and rg <= 0.5, 'max range %s mm' % (('%.2f' % rg) if rg is not None else 'missing'))
sv = re.findall(r'SLIVERDIAG f(\d+): .*-> SLIVER', L('sliver.log')); add('Far-limb slivers (judge decides size)', None if sv else True, ('frames ' + ','.join(sv)) if sv else '0 frames')
sp = re.findall(r'SPECK2 TOTAL frames (\d+)', L('speck_final.log')); add('Background specks after the fill (speck2h)', bool(sp) and int(sp[-1]) == 0, '%s frames' % (sp[-1] if sp else 'missing'))
bg = re.findall(r'BGSPECK f(\d+)', L('bgspeck.log')); add('Dimmed gap ends (check in sequence)', None, ('frames ' + ','.join(bg)) if bg else 'none')
cc = L('clipcheck.log'); spk = re.findall(r'spikes \(step, change, local mean\): (.*)', cc); add('No pops or flicker (clipcheck)', bool(spk) and spk[-1].strip() == '[]', spk[-1] if spk else 'missing')
sm = re.findall(r'spikes (.*)$', L('smooth.log'), re.M); add('Motion smooth, no hitch (blurred steps)', bool(sm) and sm[-1].strip() == 'none', L('smooth.log').strip() or 'missing')
def nframes(txt, pat): return len(re.findall(pat, txt, re.M))
add('Pixel scans saw every frame', NRAW > 0 and nframes(L('speck_final.log'), r'^SPECK2 f\d+:') == NRAW and nframes(cc, r'^frames %d$' % NRAW) == 1, 'speck2h %d frames, clipcheck "frames N" %s' % (nframes(L('speck_final.log'), r'^SPECK2 f\d+:'), 'ok' if nframes(cc, r'^frames %d$' % NRAW) else 'wrong or missing'))
fails = [r for r in rows if r[0] == 'FAIL']
out = ['# Gate report: %s' % M, '', '**%s** (%d fail, %d pass, %d for a human eye)' % ('RED: fix before any judge' if fails else 'GREEN: ready for the judge', len(fails), sum(r[0] == 'PASS' for r in rows), sum(r[0] == 'INFO' for r in rows)), '']
out += ['- %s  %s: %s' % r for r in rows] + ['', 'Logs and crops: this folder. Final frames: ../%s_final/' % M]
open(os.path.join(O, 'gate-report.md'), 'w').write('\n'.join(out) + '\n'); print('\n'.join(out)); sys.exit(1 if fails else 0)
