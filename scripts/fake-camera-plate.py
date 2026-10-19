# A still "camera" picture for films of the camera pop-up: a plate of chicken, rice and greens on a wooden table, written as the
# y4m file Chrome's fake camera plays (python3 scripts/fake-camera-plate.py → shots/fake-camera.y4m, which film-steady.mjs uses).
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W, H = 1280, 720
y, x = np.mgrid[0:H, 0:W]
wood = np.stack([150 - y * 0.05 + np.sin(x / 23.0 + y / 90.0) * 6, 104 - y * 0.04 + np.sin(x / 23.0 + y / 90.0) * 5, 66 - y * 0.03], -1)
im = Image.fromarray(np.clip(wood, 0, 255).astype('uint8'))
d = ImageDraw.Draw(im)
d.ellipse((330, 70, 950, 690), fill=(60, 44, 34))           # shadow
d.ellipse((320, 50, 940, 670), fill=(244, 242, 236))        # plate
d.ellipse((380, 110, 880, 610), fill=(232, 230, 224))
d.ellipse((430, 200, 640, 400), fill=(250, 247, 238))       # rice
d.ellipse((620, 190, 830, 330), fill=(176, 108, 60))        # chicken
d.ellipse((640, 215, 800, 310), fill=(206, 138, 82))
d.ellipse((560, 380, 800, 520), fill=(70, 128, 54))         # greens
d.ellipse((600, 400, 770, 500), fill=(98, 160, 72))
im = im.filter(ImageFilter.GaussianBlur(1.2)).rotate(90, expand=True)  # a phone held upright hands over a portrait frame
W, H = H, W
ycc = np.asarray(im.convert('YCbCr'))
os.makedirs('shots', exist_ok=True)
with open('shots/fake-camera.y4m', 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n'.encode())
    f.write(b'FRAME\n'); f.write(ycc[..., 0].tobytes()); f.write(ycc[::2, ::2, 1].tobytes()); f.write(ycc[::2, ::2, 2].tobytes())
