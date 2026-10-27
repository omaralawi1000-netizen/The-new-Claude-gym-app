import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); W,H=im.size
crops=[]
for b in [(0.40,0.38,0.58,0.56),(0.36,0.80,0.62,0.99),(0.40,0.12,0.60,0.40)]:
    c=im.crop((int(b[0]*W),int(b[1]*H),int(b[2]*W),int(b[3]*H))); crops.append(c.resize((500,int(500*c.size[1]/c.size[0]))))
S=Image.new('RGB',(1500,max(c.size[1] for c in crops)),(255,255,255)); [S.paste(c,(i*500,0)) for i,c in enumerate(crops)]; S.save(sys.argv[2])
