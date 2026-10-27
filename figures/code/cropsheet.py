# python3 cropsheet.py ours.png ref.jpg out.jpg : six feature pairs at identical zoom (ours | MoveKit reference)
import sys
from PIL import Image, ImageDraw, ImageFont
O = Image.open(sys.argv[1]).convert('RGB'); R = Image.open(sys.argv[2]).convert('RGB').resize(O.size, Image.LANCZOS)
# (label, ours box, reference box) as fractions of each frame; same box size per pair = same zoom
PAIRS = [('Head', (0.45, 0.09, 0.55, 0.24), (0.457, 0.07, 0.557, 0.22)),
         ('Neck', (0.445, 0.08, 0.555, 0.27), (0.452, 0.06, 0.562, 0.25)),
         ('Sternum', (0.45, 0.17, 0.55, 0.32), (0.457, 0.17, 0.557, 0.32)),
         ('Pelvis and groin', (0.43, 0.45, 0.57, 0.61), (0.444, 0.40, 0.584, 0.56)),
         ('Ankles', (0.40, 0.78, 0.60, 0.92), (0.425, 0.79, 0.625, 0.93)),
         ('Forearm fibres', (0.39, 0.27, 0.51, 0.41), (0.41, 0.31, 0.53, 0.45)),
         ('Glow on biceps', (0.38, 0.20, 0.62, 0.40), (0.40, 0.21, 0.64, 0.41)),
         ('Feet and floor shadow', (0.36, 0.84, 0.66, 0.98), (0.38, 0.85, 0.68, 0.99))]
TW = 520
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26); f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
except Exception:
    F = f = ImageFont.load_default()
def crop(im, b):
    w, h = im.size; c = im.crop((int(b[0] * w), int(b[1] * h), int(b[2] * w), int(b[3] * h)))
    return c.resize((TW, int(TW * c.size[1] / c.size[0])), Image.LANCZOS)
rows = [(lab, crop(O, a), crop(R, b)) for lab, a, b in PAIRS]
cols = 2; gap = 16; head = 44
cw = 2 * TW + gap
rh = [max(r[1].size[1], r[2].size[1]) + head for r in rows]
H = 60 + sum(max(rh[i], rh[i + 1]) + gap for i in range(0, len(rows), 2))
S = Image.new('RGB', (cols * cw + 3 * gap, H), (246, 246, 246)); d = ImageDraw.Draw(S)
d.text((gap, 16), 'Same zoom, same spot: Aven render (left of each pair) vs MoveKit reference (right)', fill=(20, 20, 20), font=F)
y = 60
for i in range(0, len(rows), 2):
    for j in range(2):
        lab, a, b = rows[i + j]; x = gap + j * (cw + gap)
        d.text((x, y + 8), lab, fill=(20, 20, 20), font=F)
        S.paste(a, (x, y + head)); S.paste(b, (x + TW + gap, y + head))
        d.text((x + 8, y + head + 6), 'ours', fill=(200, 30, 20), font=f); d.text((x + TW + gap + 8, y + head + 6), 'reference', fill=(200, 30, 20), font=f)
    y += max(rh[i], rh[i + 1]) + gap
S.save(sys.argv[3], quality=90); print(S.size)
