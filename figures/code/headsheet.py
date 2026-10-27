# python3 headsheet.py final.png headclose.png ref.jpg out.jpg : head close-up next to the reference head
import sys
from PIL import Image, ImageDraw, ImageFont
O = Image.open(sys.argv[1]).convert('RGB'); C = Image.open(sys.argv[2]).convert('RGB'); R = Image.open(sys.argv[3]).convert('RGB')
def crop(im, b, w=600):
    W, H = im.size; c = im.crop((int(b[0] * W), int(b[1] * H), int(b[2] * W), int(b[3] * H)))
    return c.resize((w, int(w * c.size[1] / c.size[0])), Image.LANCZOS)
tiles = [('ours, same zoom as reference', crop(O, (0.445, 0.07, 0.555, 0.25))),
         ('MoveKit reference', crop(R, (0.452, 0.05, 0.562, 0.23))),
         ('ours, close-up render (same angle)', C.resize((600, int(600 * C.size[1] / C.size[0])), Image.LANCZOS))]
try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 24)
except Exception: F = ImageFont.load_default()
H = max(t.size[1] for _, t in tiles) + 60
S = Image.new('RGB', (3 * 600 + 4 * 16, H + 16), (246, 246, 246)); d = ImageDraw.Draw(S)
for i, (lab, t) in enumerate(tiles):
    x = 16 + i * 616; d.text((x, 16), lab, fill=(20, 20, 20), font=F); S.paste(t, (x, 60))
S.save(sys.argv[4], quality=92); print(S.size)
