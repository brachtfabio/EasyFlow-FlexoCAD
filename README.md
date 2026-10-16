# EasyFlow FlexoCAD

**by Flexograv** — mockup 3D de caixas de papelão direto da ficha em PDF, no navegador.

Envie a ficha de impressão (faca + arte) e, se tiver, a ficha técnica (forma). O app encontra a faca, separa corte, vinco e picote, monta os painéis, reconhece o estilo da caixa e dobra tudo em 3D com a arte aplicada e a espessura real do papelão. Os PDFs são processados no próprio navegador e não saem do computador.

## O que faz

- **Lê a faca do PDF**: linhas de corte (contínuas), vinco (tracejado) e picote (traço-ponto); também reconstrói facas exportadas como contorno preenchido.
- **Acha a escala real**: pelos "Ajustes" da ficha de impressão, pelas cotas da ficha técnica ou pelas medidas internas.
- **Reconhece o estilo** e aplica a receita de dobra, como os estilos do ArtiosCAD:
  - caixa maleta FEFCO 0201 e variações (fundo travado, furos, orelha na aba de cola)
  - mala com alça
  - bandeja com parede dupla
  - cartucho de correio (FEFCO 0427)
  - suporte com furos / montagem pelo fundo
- **Espessura do papelão** por onda (E, B, C, EB, BC), com a borda ondulada visível e as abas empilhadas sem se atravessar.
- **Conferência**: compara a ficha de impressão com a ficha técnica (chapa, painéis, altura, caixa montada) e sobrepõe os dois desenhos.
- **Editor de dobras**: clique num painel para mudar ângulo, etapa ou painel base; salve o estilo para aplicar sozinho em facas iguais.

## Como publicar

### Cloudflare com atualização automática (recomendado)
O repositório já tem o `wrangler.jsonc`, que publica `public/index.html`.

1. No painel da Cloudflare: **Workers & Pages → Create → Import a repository**.
2. Conecte o GitHub e escolha **easyflow-flexocad**.
3. Deixe o comando de build vazio e o de deploy como `npx wrangler deploy` (padrão). Clique em **Deploy**.

A partir daí, toda atualização na branch `main` publica sozinha.

### Cloudflare Worker colando o código
1. **Workers & Pages → Create → Create Worker**.
2. **Edit code**, apague o conteúdo e cole o arquivo [`dist/worker.js`](dist/worker.js).
3. **Deploy**. (Nesse modo não atualiza sozinho.)

### Outras hospedagens
[`public/index.html`](public/index.html) funciona sozinho em qualquer hospedagem de arquivos (GitHub Pages, por exemplo).

## Estrutura

| Pasta / arquivo | Conteúdo |
|---|---|
| `src/pdfvec.js` | leitura vetorial do PDF (traços, tracejados, textos) via pdf.js |
| `src/dieline.js` | faca → grafo planar: painéis, furos, vincos, picotes |
| `src/outline.js` | reconstrução de facas exportadas como contorno preenchido |
| `src/sheet.js` | tipo de ficha, campos, escala real e vista (interna/externa) |
| `src/fold.js` | modelo de dobra, árvore de dobradiças, poses e camadas |
| `src/styles.js` | biblioteca de estilos (receitas de dobra) |
| `src/texture.js` | arte renderizada sem os traços técnicos, kraft e borda ondulada |
| `src/viewer.js` | visualizador 3D (three.js) |
| `app/` | interface, caixa padrão e o app |
| `build.py` | junta tudo em `public/index.html` (site), `dist/index.html` e `dist/worker.js` |
| `wrangler.jsonc` | configuração da Cloudflare |

Para gerar de novo depois de mudar o código: `python3 build.py`.

Bibliotecas usadas (carregadas por CDN): three.js r128, pdf.js 3.11.174.
