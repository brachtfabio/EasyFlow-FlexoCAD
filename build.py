import json, re, sys
mods = ['pdfvec', 'dieline', 'outline', 'sheet', 'fold', 'styles', 'texture', 'viewer']
src = '\n'.join(open(f'src/{m}.js').read() for m in mods)
src = re.sub(r"^if \(typeof module !== 'undefined'\).*$", '', src, flags=re.M)
t = open('app/template.html').read()
html = t.replace('__MODULES__', src).replace('__SAMPLE__', open('app/sample.json').read()).replace('__APP__', open('app/app.js').read())
open('dist/index.html', 'w').write(html)
# worker
i = html.index('<header')
full = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + html[:i] + '</head>\n<body>\n' + html[i:] + '\n</body>\n</html>\n')
worker = f'''// Cloudflare Worker — EasyFlow FlexoCAD (by Flexograv)
// Envie a ficha de impressão e/ou a ficha técnica (PDF) e o app monta a caixa em 3D.
// Tudo roda no navegador de quem usa: os PDFs não saem do computador.
// Cole este arquivo inteiro no editor do Worker e clique em "Deploy".

const HTML = {json.dumps(full)};

export default {{
  async fetch(request) {{
    return new Response(HTML, {{
      headers: {{ "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" }}
    }});
  }}
}};
'''
open('dist/worker.js', 'w').write(worker)
print('html', len(html) // 1024, 'KB; worker', len(worker) // 1024, 'KB')
