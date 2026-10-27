import sys
from PIL import Image, ImageDraw
out, frames, *dirs = sys.argv[1:]; fr = [int(x) for x in frames.split(',')]
W = Image.new('RGB', (len(fr) * 490 + 10, len(dirs) * 510 + 10), 'white'); d = ImageDraw.Draw(W)
for j, dd in enumerate(dirs):
    for i, f in enumerate(fr):
        W.paste(Image.open('%s/f%03d.png' % (dd, f)).convert('RGB'), (10 + i * 490, 30 + j * 510)); d.text((14 + i * 490, 14 + j * 510), '%s f%d' % (dd, f), fill=(0, 0, 0))
W.save(out, quality=92)
