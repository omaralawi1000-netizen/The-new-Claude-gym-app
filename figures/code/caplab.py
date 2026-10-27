import sys, numpy as np
from PIL import Image
d, out, *fr = sys.argv[1:]
col = np.array([[235,235,235],[220,40,40],[60,120,220],[90,90,90]], np.uint8)
ims = [Image.fromarray(col[np.load('%s/cap_f%03d.npy' % (d, int(f)))]) for f in fr]
ims = [i.resize((i.width * 6, i.height * 6), Image.NEAREST) for i in ims]
W = Image.new('RGB', (sum(i.width + 6 for i in ims), max(i.height for i in ims)), 'black'); x = 0
for i in ims: W.paste(i, (x, 0)); x += i.width + 6
W.save(out)
