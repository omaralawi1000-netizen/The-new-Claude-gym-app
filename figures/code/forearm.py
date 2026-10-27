# hammer forearm colour (judge r4 flaw 1): mean R-G in the judge's boxes, split by what each pixel shows (PICKDIAG ray maps
# pick_f30.txt / pick_f55.txt): the glowing movers (brachioradialis, biceps; red by design) vs every other muscle and clay
import re, sys, numpy as np
from PIL import Image
GL = re.compile(r'^(Long|Short) head of biceps brachii|^Brachialis muscle|^Brachioradialis')
d = sys.argv[1]
for f, box in ((30, (345, 380, 232, 245)), (55, (330, 345, 180, 215))):
    im = np.asarray(Image.open('%s/f%03d.png' % (d, f)).convert('RGB')).astype(float)
    x0, x1, y0, y1 = box; c = im[y0:y1, x0:x1].reshape(-1, 3)
    P = {}
    for l in open('pick_f%d.txt' % f):
        m = re.match(r'PICK f\d+ (\d+),(\d+): (.*)', l); first = m[3].split(' > ')[0].split('(')[0] if m[3] else ''
        P[(int(m[1]), int(m[2]))] = bool(GL.search(first))
    mv = [k for k, v in P.items() if v]
    rg = lambda sel: np.mean([im[y, x][0] - im[y, x][1] for x, y in sel]) if sel else float('nan')
    oth = [k for k, v in P.items() if not v]
    far2 = [k for k in oth if not mv or min(abs(k[0] - a) + abs(k[1] - b) for a, b in mv) > 2]
    print('%s f%d box x%d-%d y%d-%d: all %d px R-G %+.1f | glowing mover px %d R-G %+.1f | other px %d R-G %+.1f | other px >2 px from a mover %d R-G %+.1f'
          % (d, f, x0, x1, y0, y1, len(c), (c[:, 0] - c[:, 1]).mean(), len(mv), rg(mv), len(oth), rg(oth), len(far2), rg(far2)))
im = np.asarray(Image.open('%s/f030.png' % d).convert('RGB')).astype(float); t = im[420:440, 330:360].reshape(-1, 3)
print('%s f30 neutral clay (thigh, x330-360 y420-440) R-G %+.1f' % (d, (t[:, 0] - t[:, 1]).mean()))
