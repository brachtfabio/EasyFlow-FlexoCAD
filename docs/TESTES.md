# Testes

## Amostras (PDFs reais)

Os PDFs de teste são fichas reais de clientes e **não vão para o repositório** (a pasta `amostras/` está no `.gitignore`). Quem for testar recebe os arquivos do responsável pelo projeto e coloca em `amostras/`. Convenção usada até agora:

- `a-*.pdf` — 15 primeiras fichas (3 Flexograv "maleta", 6 fichas de impressão Trombini, 6 fichas técnicas Trombini).
- `b-1.pdf` … `b-50.pdf` — lote de 50 (39 fichas de impressão Trombini; 11 de outros fornecedores, com faca em verde/ciano, faca por cor e várias caixas por folha).
- `_padrao.pdf` — a caixa padrão do app (também em `app/caixa-padrao.pdf`).

## Preparar
```
npm install          # pdf.js e three.js para os testes no Node
pip install playwright cairosvg pillow pymupdf   # imagens e testes no navegador (opcional)
python3 build.py
```

## Ferramentas (`test/`)

| Comando | Para que serve |
|---|---|
| `node test/batch.js amostras/*.pdf [--json saida.json]` | Lê, monta e compara a caixa montada com a medida interna da ficha. Uma linha por arquivo. |
| `test/par.sh pasta_saida amostras/*.pdf` | O mesmo, 6 arquivos em paralelo, com tempo limite por arquivo (240 s). |
| `node test/variants.js X.pdf` | Mostra todas as variantes de leitura da faca e a pontuação de cada uma (por que uma venceu). |
| `node test/debug.js X.pdf` | Desenha a faca lida em `out/X.png`: painéis numerados, vincos (vermelho), curvos (laranja), picotes (verde), cortes soltos (azul). |
| `node test/recipe.js X.pdf` | Árvore de dobra e receita (painel, pai, ângulo, etapa). |
| `node test/sheet.js X.pdf` | Tipo de ficha, campos lidos e escala. |
| `node test/fold.js X.pdf` | Estilo e tamanho final da caixa montada. |
| `python3 test/shots_batch.py saida.png X.pdf ...` | Imagens 3D (montada e na metade da dobra) usando `dev/dev.html`. |
| `python3 test/appshot.py saida.png X.pdf [click:seletor] [wait:ms]` | Captura o app completo (`dev/app-local.html`). |
| `python3 test/mksample.py X.pdf` | Gera `app/sample.json` (caixa que abre com o app). |

### Lendo a saída do `batch.js`
```
b-22.pdf  impressao  rsc-divisoria p20 v21  int 320 X 212 X 105  got 325x215x126  OK
```
`p` painéis, `v` vincos, `int` medida interna da ficha, `got` tamanho externo da caixa montada (ordenado). **OK** quando cada dimensão fica entre `interna − 2·espessura − 2` e `interna + 6·espessura + 12` mm. `1:1!` = escala pelo tamanho do PDF (ficha sem medidas). Marcadores: `contorno` (faca reconstruída de formas preenchidas), `girada` (faca em pé), `peças N` (várias caixas na folha).

O "OK" é um teste numérico. Sempre olhe também as imagens (`shots_batch.py`): uma caixa pode ter o tamanho certo com uma aba dobrada errada.

## Resultado atual (66 fichas, incluindo a caixa padrão)

**50 OK numérico**, 9 com diferença (8 explicáveis: alça acima da caixa, parede dupla, tampa sobreposta; 1 real: `b-50`, folha sem marcação de vinco), 7 sem medida para conferir (outros fornecedores; conferidos visualmente). Nenhum erro de leitura.

| Arquivo | Ficha | Estilo | Medida | Obs. |
|---|---|---|---|---|
| a-95701.pdf | tecnica | bandeja | OK |  |
| a-756529.pdf | impressao | rsc | OK |  |
| a-788754.pdf | impressao | cartucho | OK |  |
| a-811117.pdf | impressao | rsc | OK |  |
| a-830664.pdf | impressao | mala | diferença | contorno |
| a-850780.pdf | tecnica | bandeja | OK |  |
| a-851688.pdf | impressao | rsc | OK |  |
| a-852574.pdf | tecnica | bandeja | OK |  |
| a-852731.pdf | tecnica | bandeja | diferença |  |
| a-853121.pdf | tecnica | rsc | diferença |  |
| a-853690.pdf | tecnica | mala | diferença |  |
| a-853797.pdf | impressao | rsc | OK |  |
| a-flexo-3L.pdf | impressao | rsc | OK |  |
| a-flexo-4_5L.pdf | impressao | rsc | OK |  |
| a-flexo-7L.pdf | impressao | rsc | OK |  |
| a-_padrao.pdf | impressao | rsc | OK |  |
| b-1.pdf | impressao | bandeja | OK |  |
| b-2.pdf | impressao | rsc | OK |  |
| b-3.pdf | impressao | rsc-divisoria | OK |  |
| b-4.pdf | impressao | rsc | OK | contorno |
| b-5.pdf | impressao | rsc | OK |  |
| b-6.pdf | impressao | rsc | OK | contorno |
| b-7.pdf | impressao | bandeja | diferença | contorno |
| b-8.pdf | impressao | bandeja | OK | contorno |
| b-9.pdf | impressao | rsc | OK |  |
| b-10.pdf | impressao | rsc | OK |  |
| b-11.pdf | impressao | rsc | OK |  |
| b-12.pdf | impressao | rsc | OK |  |
| b-13.pdf | impressao | rsc | OK |  |
| b-14.pdf | impressao | rsc | OK |  |
| b-15.pdf | impressao | cartucho | OK |  |
| b-16.pdf | impressao | rsc | OK | contorno |
| b-17.pdf | impressao | rsc | diferença |  |
| b-18.pdf | impressao | rsc | OK |  |
| b-19.pdf | impressao | rsc | OK |  |
| b-20.pdf | impressao | rsc | OK | girada |
| b-21.pdf | impressao | bandeja | OK |  |
| b-22.pdf | impressao | rsc-divisoria | OK |  |
| b-23.pdf | impressao | rsc | OK |  |
| b-24.pdf | impressao | rsc | OK |  |
| b-25.pdf | impressao | rsc | OK |  |
| b-26.pdf | impressao | meia-caixa | OK |  |
| b-27.pdf | impressao | rsc | OK |  |
| b-28.pdf | impressao | bandeja | OK |  |
| b-29.pdf | impressao | rsc | OK |  |
| b-30.pdf | impressao | rsc | OK |  |
| b-31.pdf | impressao | cartucho | diferença |  |
| b-32.pdf | impressao | rsc | OK |  |
| b-33.pdf | impressao | bandeja | diferença |  |
| b-34.pdf | impressao | rsc | OK |  |
| b-35.pdf | impressao | bandeja | OK | contorno |
| b-36.pdf | impressao | rsc | OK | contorno |
| b-37.pdf | impressao | rsc | OK |  |
| b-38.pdf | impressao | rsc | OK |  |
| b-39.pdf | impressao | rsc-divisoria | OK |  |
| b-40.pdf | desconhecida | bandeja | sem medida | escala 1:1 |
| b-41.pdf | desconhecida | cartucho | sem medida | escala 1:1 |
| b-42.pdf | desconhecida | rsc | sem medida | girada, escala 1:1 |
| b-43.pdf | desconhecida | cartucho | sem medida | escala 1:1 |
| b-44.pdf | desconhecida | cartucho | sem medida | escala 1:1 |
| b-45.pdf | desconhecida | bandeja | sem medida | escala 1:1 |
| b-46.pdf | desconhecida | rsc | OK | escala 1:1 |
| b-47.pdf | desconhecida | rsc-divisoria | OK | girada |
| b-48.pdf | desconhecida | cartucho | sem medida | escala 1:1 |
| b-49.pdf | desconhecida | cartucho | OK |  |
| b-50.pdf | desconhecida | cartucho | diferença |  |

## Antes de publicar
1. `python3 build.py`
2. `test/par.sh out/lote amostras/*.pdf` e comparar com a tabela acima (nenhum OK pode virar diferença/erro).
3. Imagens das famílias mexidas (`shots_batch.py`).
4. Commit dos arquivos gerados (`public/`, `dist/`) junto com o código.
