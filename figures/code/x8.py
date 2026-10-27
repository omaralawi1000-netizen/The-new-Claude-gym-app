# python3 x8.py OUT.png FRAMES label1=dir1 label2=dir2 ... : native-pixel x8 (nearest) crops of the near elbow, rows = frames
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
out, frames, cols = sys.argv[1], [int(x) for x in sys.argv[2].split(',')], [a.split('=') for a in sys.argv[3:]]
CW, CH, Z = 64, 48, 8
try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: F = ImageFont.load_default()
rows = []
for f in frames:
    ref = np.asarray(Image.open('%s/f%03d.png' % (cols[0][1], f)).convert('RGB')).astype(int)
    red = (ref[..., 0] > 180) & (ref[..., 1] < 110) & (ref[..., 2] < 110); red[:, 480:] = False
    ys, xs = np.nonzero(red); cx, cy = int(xs.mean()), int(ys.max()) - 6   # the lower edge of the near biceps, where the forearm meets it
    box = (cx - CW // 2, cy - CH // 2, cx + CW // 2, cy + CH // 2)
    rows.append((f, [Image.open('%s/f%03d.png' % (d, f)).convert('RGB').crop(box).resize((CW * Z, CH * Z), Image.NEAREST) for _, d in cols]))
g = 10; S = Image.new('RGB', (len(cols) * (CW * Z + g) + 90, 40 + len(rows) * (CH * Z + g)), (246, 246, 246)); d = ImageDraw.Draw(S)
for i, (lab, _) in enumerate(cols): d.text((90 + i * (CW * Z + g), 8), lab, fill=(20, 20, 20), font=F)
for r, (f, ims) in enumerate(rows):
    y = 40 + r * (CH * Z + g); d.text((8, y + 10), 'f%d' % f, fill=(20, 20, 20), font=F)
    for i, im in enumerate(ims): S.paste(im, (90 + i * (CW * Z + g), y))
S.save(out); print(out, S.size)
