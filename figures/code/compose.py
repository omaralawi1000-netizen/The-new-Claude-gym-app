# python3 compose.py ours.png ref.jpg out.jpg "ox0,oy0,ox1,oy1" "rx0,ry0,rx1,ry1" "ax0..." "bx0..."   (crop boxes in 0..1 of each image)
import sys
from PIL import Image, ImageDraw, ImageFont
ours, ref, out = sys.argv[1:4]
ot, rt, oa, ra = [tuple(map(float, s.split(','))) for s in sys.argv[4:8]]
O = Image.open(ours).convert('RGB'); R = Image.open(ref).convert('RGB')
W, H = 1200, 900
def fit(im): return im.resize((W, H), Image.LANCZOS)
def crop(im, b, size=600):
    w, h = im.size; c = im.crop((int(b[0] * w), int(b[1] * h), int(b[2] * w), int(b[3] * h)))
    return c.resize((size, int(size * c.size[1] / c.size[0])), Image.LANCZOS)
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
except Exception:
    F = ImageFont.load_default()
tiles = [crop(O, ot), crop(R, rt), crop(O, oa), crop(R, ra)]
th = max(t.size[1] for t in tiles)
canvas = Image.new('RGB', (2 * W, H + th + 70), (250, 250, 250))
canvas.paste(fit(O), (0, 0)); canvas.paste(fit(R), (W, 0))
for i, t in enumerate(tiles): canvas.paste(t, (i * 600, H + 70))
d = ImageDraw.Draw(canvas)
def label(x, y, s): d.rectangle((x, y, x + len(s) * 18 + 20, y + 44), fill=(20, 20, 20)); d.text((x + 10, y + 6), s, fill=(255, 255, 255), font=F)
label(16, 16, 'Aven (our render)'); label(W + 16, 16, 'MoveKit reference')
d.text((16, H + 18), 'Same crops, zoomed:  torso (ours | reference)    arm and grip (ours | reference)', fill=(30, 30, 30), font=F)
for i, s in enumerate(['ours', 'reference', 'ours', 'reference']): label(i * 600 + 10, H + 80, s)
canvas.save(out, quality=90)
print(canvas.size)
