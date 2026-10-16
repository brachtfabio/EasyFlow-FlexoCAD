# Guia para colaboradores (pessoas e IAs)

EasyFlow FlexoCAD: mockup 3D de caixas de papelão a partir da ficha em PDF (faca + arte), 100% no navegador.

- **Dono do projeto não programa**: explique as mudanças em português simples, sem jargão. Ele testa pelo site publicado.
- **Idioma**: código comentado e textos da interface em português do Brasil.
- **Sem servidor**: só HTML/JS. Bibliotecas por CDN com versão fixa (pdf.js 3.11.174, three.js r128). Não adicione dependências de runtime sem necessidade.

## Fluxo de trabalho
1. Edite `src/*.js` (motor) ou `app/*` (interface). Nunca edite `public/`, `dist/` à mão.
2. `python3 build.py` (gera `public/index.html`, `dist/worker.js`, `dist/index.html`, `dev/app-local.html`).
3. Teste: `test/par.sh out/lote amostras/*.pdf` + imagens com `python3 test/shots_batch.py`. Compare com a tabela de [docs/TESTES.md](docs/TESTES.md).
4. Commit **incluindo** `public/` e `dist/` (a Cloudflare publica o que está no Git; não roda build). Push na `main` = publicação automática (Worker `cria3d`).
5. Atualize [docs/HISTORICO.md](docs/HISTORICO.md) (o que mudou e por quê) e, se mexeu em estilo, [docs/ESTILOS.md](docs/ESTILOS.md).

## Regras importantes
- **PDFs de clientes nunca vão para o Git** (`amostras/` está no `.gitignore`). Só a caixa padrão do EasyFlow (`app/caixa-padrao.pdf`).
- Não quebre o que já funciona: o lote de testes é a referência. Uma mudança que conserta um arquivo e quebra outro não entra.
- Heurísticas novas sempre com comentário dizendo **qual caso real** motivou.
- O `wrangler.jsonc` usa o nome `cria3d` (nome do Worker na Cloudflare). Não troque.

## Mapa rápido
| Preciso mexer em… | Arquivo |
|---|---|
| Como o PDF é lido (traços, textos) | `src/pdfvec.js` |
| Como a faca vira painéis/vincos | `src/dieline.js` (+ `src/outline.js` para facas em contorno) |
| Campos da ficha e escala | `src/sheet.js` |
| Ângulos, etapas, empilhamento | `src/fold.js` |
| Reconhecer um tipo de caixa | `src/styles.js` |
| Arte e materiais | `src/texture.js`, `src/viewer.js` |
| Interface | `app/template.html`, `app/app.js` |

Documentação completa em [docs/](docs/).
