# A still "camera" picture for films of the barcode scanner (a skyr pot's barcode on a kitchen counter), written as the
# y4m file Chrome's fake camera plays: python3 scripts/fake-camera.py → shots/fake-camera.y4m (film-steady.mjs uses it).
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 640, 480
y, x = np.mgrid[0:H, 0:W]
counter = np.stack([200 - y * 0.08 + np.sin(x / 37.0) * 3, 186 - y * 0.09 + np.sin(x / 37.0) * 3, 168 - y * 0.1], -1)
im = Image.fromarray(np.clip(counter, 0, 255).astype('uint8'))
d = ImageDraw.Draw(im)
d.rounded_rectangle((150, 70, 500, 430), 34, fill=(238, 236, 230))
d.rounded_rectangle((150, 70, 500, 150), 34, fill=(44, 92, 160))
d.text((190, 100), "SKYR  NATURAL  0.2%", fill=(255, 255, 255))
d.rectangle((225, 235, 425, 345), fill=(255, 255, 255))
rng = np.random.default_rng(7); xx = 238
while xx < 412:
    w = int(rng.choice([1, 2, 2, 3, 4]))
    if rng.random() < 0.55: d.rectangle((xx, 248, xx + w - 1, 322), fill=(20, 20, 20))
    xx += w
d.text((262, 328), "5 701234 567893", fill=(20, 20, 20))
im = im.filter(ImageFilter.GaussianBlur(0.7))
ycc = np.asarray(im.convert('YCbCr'))
os.makedirs('shots', exist_ok=True)
with open('shots/fake-camera.y4m', 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n'.encode())
    f.write(b'FRAME\n'); f.write(ycc[..., 0].tobytes()); f.write(ycc[::2, ::2, 1].tobytes()); f.write(ycc[::2, ::2, 2].tobytes())
