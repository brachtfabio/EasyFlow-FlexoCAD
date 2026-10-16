"""Gera os arquivos publicados a partir do código-fonte.

  public/index.html  -> site publicado pela Cloudflare (wrangler.jsonc)
  dist/index.html    -> o mesmo app sem <html>/<head> (formato de artefato)
  dist/worker.js     -> Worker para colar no painel da Cloudflare (sem Git)
  dev/app-local.html -> cópia para testes locais, com three.js e pdf.js de node_modules (não vai para o Git)

Uso: python3 build.py
"""
import json, re, os

MODS = ['pdfvec', 'dieline', 'outline', 'sheet', 'fold', 'styles', 'texture', 'viewer']  # ordem importa

src = '\n'.join(open(f'src/{m}.js', encoding='utf-8').read() for m in MODS)
src = re.sub(r"^if \(typeof module !== 'undefined'\).*$", '', src, flags=re.M)   # tira os exports do Node
t = open('app/template.html', encoding='utf-8').read()
html = (t.replace('__MODULES__', src)
         .replace('__SAMPLE__', open('app/sample.json', encoding='utf-8').read())
         .replace('__APP__', open('app/app.js', encoding='utf-8').read()))

os.makedirs('dist', exist_ok=True); os.makedirs('public', exist_ok=True)
open('dist/index.html', 'w', encoding='utf-8').write(html)

i = html.index('<header')
full = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + html[:i] + '</head>\n<body>\n' + html[i:] + '\n</body>\n</html>\n')
open('public/index.html', 'w', encoding='utf-8').write(full)

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
open('dist/worker.js', 'w', encoding='utf-8').write(worker)

# cópia local para testes (Playwright), usando as bibliotecas de node_modules em vez da CDN
loc = (html.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', '../node_modules/three/build/three.min.js')
  .replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', '../node_modules/three/examples/js/controls/OrbitControls.js')
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js">', '<script src="../node_modules/pdfjs-dist/build/pdf.min.js">')
  .replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js">', '<script src="../node_modules/pdfjs-dist/build/pdf.worker.min.js">'))
os.makedirs('dev', exist_ok=True)
open('dev/app-local.html', 'w', encoding='utf-8').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + loc + '</body></html>')

print(f'public/index.html {len(full)//1024} KB · dist/worker.js {len(worker)//1024} KB')
