# EasyFlow FlexoCAD

**by Flexograv** — mockup 3D de caixas de papelão direto da ficha em PDF, no navegador.

Envie a ficha de impressão (faca + arte) e, se tiver, a ficha técnica (forma). O app encontra a faca, separa corte, vinco e picote, monta os painéis, reconhece o estilo da caixa e dobra tudo em 3D com a arte aplicada e a espessura real do papelão. Os PDFs são processados no próprio navegador e não saem do computador.

## O que faz

- **Lê a faca do PDF** de vários fornecedores: vinco tracejado, traço-ponto, por cor (ex.: vermelho) ou por espessura; também reconstrói facas exportadas como contorno preenchido.
- **Acha a escala real**: pelos "Ajustes" da ficha de impressão, pelas cotas da ficha técnica ou pelas medidas internas.
- **Reconhece o estilo** e aplica a receita de dobra, como os estilos do ArtiosCAD:
  - caixa maleta FEFCO 0201 e variações (fundo automático, divisória incorporada, furos, orelha na aba de cola)
  - meia caixa (caixas grandes feitas de duas peças)
  - mala com alça
  - bandeja e bandeja com parede dupla
  - cartucho de correio (FEFCO 0427)
  - suporte com furos / montagem pelo fundo
- **Folhas com várias caixas**: escolha a peça (tampa, fundo…); cópias iguais aparecem uma vez.
- **Espessura do papelão** por onda (E, B, C, EB, BC), com a borda ondulada visível e as abas empilhadas sem se atravessar.
- **Conferência**: compara a ficha de impressão com a ficha técnica (chapa, painéis, altura, caixa montada) e sobrepõe os dois desenhos.
- **Editor de dobras**: clique num painel para mudar ângulo, etapa ou painel base; salve o estilo para aplicar sozinho em facas iguais.

Testado com 65 fichas reais (50 OK na conferência automática): ver [docs/TESTES.md](docs/TESTES.md).

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

## Documentação

| Documento | Conteúdo |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Guia rápido para quem for continuar o projeto (pessoas ou IAs) |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Como o app funciona por dentro, módulo a módulo |
| [docs/ESTILOS.md](docs/ESTILOS.md) | Biblioteca de estilos de caixa e como criar um novo |
| [docs/TESTES.md](docs/TESTES.md) | Ferramentas de teste, amostras e resultado atual |
| [docs/HISTORICO.md](docs/HISTORICO.md) | O que foi feito, decisões e pendências |

## Estrutura

| Pasta / arquivo | Conteúdo |
|---|---|
| `src/` | motor: leitura do PDF, faca, ficha, dobra, estilos, arte, 3D |
| `app/` | interface, caixa padrão |
| `test/` | ferramentas de teste e diagnóstico |
| `dev/dev.html` | página mínima para testar o motor no navegador |
| `build.py` | gera `public/index.html` (site), `dist/worker.js` e `dist/index.html` |
| `wrangler.jsonc` | configuração da Cloudflare (Worker `cria3d`) |

Para gerar de novo depois de mudar o código: `python3 build.py`.

Bibliotecas usadas (carregadas por CDN): three.js r128, pdf.js 3.11.174.
