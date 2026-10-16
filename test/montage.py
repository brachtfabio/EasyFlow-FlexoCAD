from PIL import Image
import sys
out=sys.argv[1]; names=sys.argv[2:]
ims=[Image.open(n+'.png').convert('RGB') for n in names]
W=700
ims=[im.resize((W,int(im.height*W/im.width))) for im in ims]
cols=2;rows=(len(ims)+1)//2
hs=[max(ims[r*2+c].height for c in range(cols) if r*2+c<len(ims)) for r in range(rows)]
cv=Image.new('RGB',(W*2,sum(hs)),'white');y=0
for r in range(rows):
  for c in range(cols):
    if r*2+c<len(ims): cv.paste(ims[r*2+c],(c*W,y))
  y+=hs[r]
cv.save(out)
