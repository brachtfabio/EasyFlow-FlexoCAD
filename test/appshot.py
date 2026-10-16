import sys, os
from playwright.sync_api import sync_playwright
# appshot.py out.png [pdf ...] -- ações
out = sys.argv[1]; args = sys.argv[2:]
pdfs = [a for a in args if a.endswith('.pdf')]; acts = [a for a in args if not a.endswith('.pdf')]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': int(os.environ.get('W', 1280)), 'height': int(os.environ.get('H', 800))})
    pg.on('pageerror', lambda e: print('E:', e))
    pg.on('console', lambda m: m.type == 'error' and print('C:', m.text))
    pg.goto('file://' + os.path.abspath('dev/app-local.html'))
    pg.wait_for_timeout(2500)
    if pdfs:
        pg.set_input_files('#file', pdfs)
        pg.wait_for_function("document.getElementById('busy').hidden && window.__montador.cur", timeout=180000)
        pg.wait_for_timeout(1500)
    for a in acts:
        if a.startswith('click:'): pg.click(a[6:]); pg.wait_for_timeout(900)
        elif a.startswith('fold:'): pg.evaluate(f'window.__montador.setFold({a[5:]})'); pg.wait_for_timeout(500)
        elif a.startswith('eval:'): pg.evaluate(a[5:]); pg.wait_for_timeout(700)
        elif a.startswith('wait:'): pg.wait_for_timeout(int(a[5:]))
    pg.screenshot(path=out)
    b.close()
