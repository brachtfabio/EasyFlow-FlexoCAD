# Arquitetura

O EasyFlow FlexoCAD é uma página única (HTML + JavaScript, sem servidor) que recebe a ficha da caixa em PDF e mostra a caixa dobrada em 3D. Todo o processamento acontece no navegador de quem usa.

```
PDF ─► pdfvec ─► dieline ─► sheet ─► fold.buildModel ─► styles.auto ─► viewer (three.js)
        (traços)  (painéis)  (escala,    (painéis em mm,    (receita de     (malhas com
                             campos)      dobradiças)        dobra)          espessura e arte)
                                                                 ▲
                                                 texture (arte do PDF sem a faca)
```

Bibliotecas externas (CDN, versões fixas): **pdf.js 3.11.174** (lê o PDF) e **three.js r128** + OrbitControls (3D). Nada mais.

## Módulos (`src/`)

Cada arquivo define um objeto global (`PDFVec`, `Dieline`, …) e também exporta para o Node (`module.exports`), assim o mesmo código roda no navegador e nos testes. O `build.py` concatena os módulos **nesta ordem**: `pdfvec, dieline, outline, sheet, fold, styles, texture, viewer`.

### `pdfvec.js` — leitura vetorial
`PDFVec.read(pdfjsLib, page)` percorre a lista de operações do pdf.js e devolve:

- `paths[]`: `{ stroke, fill, width, dash, subs: [{pts, closed}], curved }` em coordenadas da página (pt, y para baixo). Curvas Bézier viram polilinhas. A espessura e o tracejado já vêm multiplicados pela escala da matriz.
- `texts[]`: `{ str, x, y, size, angle }`.

### `dieline.js` — faca → painéis
`Dieline.analyze(vec, opts)` é o coração da leitura:

1. **Canetas**: agrupa traços por cor + espessura + tipo (`dashKind`): contínuo = corte, tracejado uniforme = vinco, traço-ponto (traços de tamanhos diferentes) = picote.
2. **Variantes de leitura** (cada fornecedor marca o vinco de um jeito). Para cada cor:
   - *tracejado*: vinco tracejado, corte contínuo (Trombini, Flexograv, fichas técnicas);
   - *traço-ponto*: a cor não tem tracejado uniforme, então o traço-ponto é o vinco (exportações tipo ArtiosCAD, verde/ciano);
   - *espessura*: tudo contínuo, a linha bem mais fina (≥1,7×) é o vinco;
   - *cor*: uma cor é o corte e outra cor contínua, dentro dela, é o vinco (ex.: Saft, preto = corte, vermelho = vinco);
   - *contínuo*: sem marcação; toda linha entre dois painéis vira dobra (Flexograv desenha só retângulos; funciona porque não há cortes internos).
   - *(todas)*: inclui linhas finas que normalmente são cotas; só se nada mais deu certo.
   
   Escolha: primeiro as que acharam ≥3 vincos, depois a força da evidência (tracejado/traço-ponto > cor/espessura > contínuo), depois a pontuação (`painéis×2 + vincos×5 − pontas soltas×0,5`).
3. **Caneta do corte**: entre as canetas contínuas da cor, vence a que **encosta nas pontas dos vincos** (`touch`). Cotas, moldura e o desenho do "perfil" não encostam nos vincos. Contínuas com menos de 60% da espessura dela são descartadas.
4. **Componentes**: separa o desenho principal (maior área com vincos) de cotas soltas e do "perfil".
5. **Limpeza**: estende pontas soltas até a linha mais próxima (`extendDangling`) e liga pontas soltas próximas (falhas do desenho).
6. **Grafo planar** (`buildGraph`): quebra os segmentos nas interseções, junta pontos próximos em nós (aglomeração transitiva limitada a 2,5×tol, para não "engolir" curvas) e monta as arestas com o tipo mais forte.
7. **Faces** (`faces`): remove pontas soltas (cortes que não fecham região) e percorre as semifaces. Cada componente tem um laço externo; os laços internos são **painéis**. Componentes soltos só de corte, dentro da faca, são **furos**.
8. **Picotes promovidos**: picote reto que atravessa a estrutura de ponta a ponta vira vinco picotado (parede dupla, "canoa"), e o grafo é refeito.
9. **Vincos** (`hinges`): arestas de vinco entre dois painéis diferentes, com a linha de dobra (`p0`, `p1`) e se é curvo.
10. **Peças** (`pieces`): grupos de painéis ligados por vincos. Uma folha pode ter várias caixas (cópias, ou tampa + fundo); cópias iguais recebem `copyOf`.

Tolerância: `max(0,08% da diagonal, 0,8 × maior espessura)`; pode ser forçada com `opts.tol`.

### `outline.js` — faca exportada como contorno
Alguns programas exportam as linhas da faca como formas preenchidas finas ("contorno do traço"). `Outline.convert(vec)` transforma de novo em linhas: retângulos finos viram o eixo principal (PCA), curvas viram a linha central, e tracinhos alinhados são unidos em vincos. Só cores com vincos reconstruídos são devolvidas, das mais simples para as mais complexas (desempenho: as cores da arte também geram formas finas).

### `sheet.js` — ficha → medidas
`Sheet.analyze(vec)`:

- Tipo de ficha: `impressao` (tem "Ajustes Imp.", "Ficha de Aprovação/Impressão"), `tecnica` (tem "Faca de Corte", "Item da Forma") ou `desconhecida`.
- Campos: cliente, produto, item, medida interna, ajustes de impressão/onda, vista, PO, onda, observações (`field()` lê o valor à direita do rótulo).
- Faca: `Dieline.analyze`; se der menos de 3 vincos, tenta `Outline` (contorno) com 3 tolerâncias.
- **Escala real (mm)**, em ordem:
  1. *ajustes da ficha*: soma de "Ajustes Imp." = largura da chapa; soma de "Ajustes Ond." = altura. Se o ajuste tem um número só, confere com a medida interna (pode ser a chapa com várias caixas).
  2. *cotas do desenho* (ficha técnica): o maior par de números horizontal × vertical coerente com o tamanho do desenho.
  3. *medidas internas*: o maior painel cujas proporções batem com duas das três medidas.
  4. *tamanho real do PDF* (1 pt = 0,3528 mm), com aviso.
- `mirror`: ficha técnica em "Vista: Interna" é espelhada em relação ao lado impresso.
- `flute`: espessura do papelão pela onda (E 1,6 · B 3 · C 4 · EB 4,5 · BC 6,5 mm), lida em "Onda:" ou no fim do PO.

### `fold.js` — modelo de dobra
- `Fold.buildModel(sheet, {piece, rot, thickness})`: converte a peça escolhida para mm, origem no centro, **vista pelo lado impresso** (+z). `rot: 1` gira 90° (faca desenhada "em pé"). `uvOf(q)` sempre devolve a coordenada da arte no desenho original.
- `Fold.tree(model, root)`: árvore de dobra (BFS pelos vincos) a partir do painel base. O eixo de cada vinco é orientado para que **ângulo positivo leve o painel para trás do lado impresso** (a arte fica por fora).
- `Fold.timeline(prog)`: as etapas (`stage`) viram fatias da animação; `T ∈ [0,1]`.
- `Fold.poses(model, tree, prog, T, offsets)`: matriz de cada painel.
- `Fold.layerOffsets`: empilhamento. Painéis que terminam no mesmo plano e se sobrepõem são afastados pela espessura: fica por cima quem chega por último, e faces costas com costas (alças) se afastam pelo lado de fora.

### `styles.js` — biblioteca de estilos
Ver [ESTILOS.md](ESTILOS.md). `Styles.auto(sheet, opts)` monta o modelo, detecta o estilo e, se não for caixa maleta, tenta a faca girada 90°.

### `texture.js` — arte
- `renderArt(page, região, ocultar, tamanho)`: renderiza só a área da faca com o pdf.js, **sem** os traços técnicos. O filtro é aplicado no protótipo do `CanvasRenderingContext2D` durante a renderização, porque o pdf.js desenha também em telas auxiliares. `ocultar = {stroke, fill, text}` (cores).
- `kraft(model)`: textura kraft para ficha técnica sem arte.
- `overlayCuts`: desenha picotes e cortes soltos por cima da arte.
- `flute()`: textura da borda (miolo ondulado).
- Cores de anotação (ciano e magenta de cotas) são escondidas por padrão; o app também esconde preenchimentos/textos da cor da faca quando ela não é escura (cotas vetorizadas de outros fornecedores).

### `viewer.js` — 3D
Cada painel é um `ExtrudeGeometry` com a espessura do papelão, com três materiais: lado impresso (arte), lado de dentro (kraft) e borda (ondulado). Furos entram como `holes` do Shape. `setT(T)` aplica as poses; a caixa desliza do centro da chapa para o centro da caixa durante a dobra e fica apoiada no chão. Meia caixa (`recipe.copy`): a mesma peça é desenhada de novo, girada 180° em volta do eixo vertical do centro da caixa.

## App (`app/`)
- `template.html`: interface (HTML/CSS). `__MODULES__`, `__SAMPLE__` e `__APP__` são preenchidos pelo `build.py`.
- `app.js`: envio dos PDFs (uma ficha de cada tipo), escolha da faca (impressão ou técnica), conferência entre fichas, editor de dobras, estilos salvos no navegador (`localStorage`, por assinatura da faca), escolha de peça, painel de arte/papelão.
- `sample.json` + `caixa-padrao.pdf`: a caixa padrão "EasyFlow FlexoCAD" que aparece ao abrir. Gerada com `python3 test/mksample.py app/caixa-padrao.pdf`.

## Publicação
`build.py` gera `public/index.html` (site), `dist/worker.js` e `dist/index.html`. A Cloudflare está ligada ao repositório (`wrangler.jsonc`, Worker **cria3d**): todo push na `main` publica sozinho. **Sempre rode `python3 build.py` e faça commit dos arquivos gerados**, porque a Cloudflare não roda o build (comando de build vazio).
