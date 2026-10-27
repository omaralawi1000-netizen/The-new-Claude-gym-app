# speckcrops.py OUT DIR f:x,y ... : 40x40 crops x8 round each point, labelled
import sys
from PIL import Image, ImageDraw
out, d, *items = sys.argv[1:]
k = 6; S = 40
W = Image.new('RGB', (len(items) * (S * k + 6), S * k + 20), 'black'); dr = ImageDraw.Draw(W)
for i, it in enumerate(items):
    f, xy = it.split(':'); x, y = map(int, xy.split(','))
    im = Image.open('%s/f%03d.png' % (d, int(f))).convert('RGB').crop((x - S // 2, y - S // 2, x + S // 2, y + S // 2)).resize((S * k, S * k), Image.NEAREST)
    W.paste(im, (i * (S * k + 6), 20)); dr.text((i * (S * k + 6) + 3, 3), it, fill='yellow')
W.save(out)
