import os, json, sys
from playwright.sync_api import sync_playwright
pdf = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 900, 'height': 640})
    pg.goto('file://' + os.path.abspath('dev/dev.html'))
    pg.set_input_files('#file', pdf)
    pg.wait_for_function('window.ready === true', timeout=120000)
    data = pg.evaluate('''() => {
      const sh = window.__sh, d = sh.dieline;
      const r = v => Math.round(v * 100) / 100;
      const P = a => a.map(q => [r(q[0]), r(q[1])]);
      const c = document.createElement('canvas'); const W = 2600, s = W / window.__art.width;
      c.width = W; c.height = Math.round(window.__art.height * s); c.getContext('2d').drawImage(window.__art, 0, 0, c.width, c.height);
      return { sheet: { kind: sh.kind, info: sh.info, SX: sh.SX, SY: sh.SY, mirror: sh.mirror, flute: sh.flute, scaleSource: sh.scaleSource,
        dieline: { color: d.color, bbox: d.bbox, panels: d.panels.map(f => ({ id: f.id, poly: P(f.poly), holes: f.holes.map(P), ip: P([f.ip])[0], area: r(f.area) })),
          hinges: d.hinges.map(h => ({ a: h.a, b: h.b, p0: P([h.p0])[0], p1: P([h.p1])[0], curved: h.curved })), perfs: d.perfs.map(P), slits: d.slits.map(P) } },
        art: c.toDataURL('image/jpeg', 0.85) };
    }''')
    b.close()
data['name'] = os.path.basename(pdf)
open('app/sample.json', 'w').write(json.dumps(data))
print(len(json.dumps(data)) // 1024, 'KB')
