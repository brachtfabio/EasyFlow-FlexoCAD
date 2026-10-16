# Renderiza cada PDF no app de desenvolvimento (vista 3/4 montada + meio da dobra) e monta uma grade.
# uso: python3 test/shots_batch.py saida.png arquivo.pdf ...
import sys, os, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
tiles = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'])
    for f in files:
        pg = b.new_page(viewport={'width': 520, 'height': 400})
        name = os.path.basename(f)
        try:
            pg.goto('file://' + os.path.abspath('dev/dev.html'))
            pg.set_input_files('#file', f)
            pg.wait_for_function('window.ready === true', timeout=150000)
            ims = []
            for spec in ['1:iso', '0.55:iso']:
                T, v = spec.split(':'); pg.evaluate(f'setT({T}); view("{v}")'); pg.wait_for_timeout(350)
                fn = os.path.join(tempfile.gettempdir(), 'sb.png'); pg.screenshot(path=fn); ims.append(Image.open(fn).copy())
            label = pg.evaluate("document.getElementById('info').textContent")
        except Exception as e:
            ims = [Image.new('RGB', (520, 400), (255, 230, 230))] * 2; label = 'ERRO ' + str(e)[:60]
        t = Image.new('RGB', (1040, 400), 'white'); t.paste(ims[0], (0, 0)); t.paste(ims[1], (520, 0))
        d = ImageDraw.Draw(t); d.rectangle([0, 0, 1040, 22], fill='white'); d.text((6, 5), f'{name}  {label}', fill='black')
        tiles.append(t); pg.close()
    b.close()
cols = 2; rows = (len(tiles) + cols - 1) // cols
cv = Image.new('RGB', (1040 * cols, 400 * rows), 'white')
for i, t in enumerate(tiles): cv.paste(t, ((i % cols) * 1040, (i // cols) * 400))
cv.save(out)
