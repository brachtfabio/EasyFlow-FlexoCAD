# Estilos de caixa (receitas de dobra)

Como no ArtiosCAD, cada família de caixa tem uma **receita**: para cada vinco, o ângulo (`angle`, graus) e a etapa (`stage`) em que ele dobra. O motor de dobra é genérico; o estilo só decide a receita.

```js
recipe = {
  style: 'rsc',                 // identificador
  label: 'Caixa maleta (FEFCO 0201)',   // nome mostrado no app
  root: 4,                      // índice do painel base (fica parado)
  orient: 'front' | 'base',     // em pé (frente para a câmera) ou deitada pelo fundo
  prog: { [hingeId]: { angle, stage } },
  notes: ['texto mostrado no editor'],
  copy: { L, W, x0, sideRight } // opcional: meia caixa, desenha a outra metade
}
```

Convenções:
- **Ângulo positivo** dobra para dentro (a arte fica por fora). Negativo dobra ao contrário. 180 = dobra completa sobre o painel vizinho. 0 = não dobra.
- **Etapas** podem ser fracionárias (2,5). Mesma etapa = dobram juntos. Quem dobra depois fica por cima no empilhamento.
- `orient: 'base'` deita o modelo (rotação de 90° em x) para bandejas montadas a partir do fundo.

## Detecção (`Styles.detect`)

Ordem de tentativa:

1. **Caixa maleta / RSC** (`detectRSC`): procura a maior **cadeia de painéis** ligados por vincos verticais, com a mesma faixa de altura (`bodyChain`). Precisa de 4 painéis largos, opostos com larguras parecidas (±12%), e no máximo uma tira estreita nas pontas (aba de cola).
   - Se as abas de cima formam cadeias de 3 níveis ou mais e não há abas embaixo → **mala com alça**.
2. **Meia caixa** (`detectHalf`): 2 painéis largos + aba de cola, com abas em cima e embaixo (caixas grandes feitas de duas peças iguais).
3. **Montagem pelo fundo** (`recipeTray`): o maior painel tem vincos nos dois sentidos → bandeja, cartucho de correio ou suporte.
4. **Genérico**: montagem pelo fundo a partir do maior painel; o usuário ajusta no editor.

`Styles.auto` ainda tenta a faca **girada 90°** quando o resultado não é caixa maleta (fichas com os painéis empilhados na vertical, ex.: tubos longos).

## Receitas

### `rsc` — Caixa maleta (FEFCO 0201) e variações
- Base: o painel comprido que não encosta na aba de cola (frente).
- Corpo: 90°, etapa 1. Aba de cola segue o corpo.
- Abas nível 1: 90°; abas menores antes das maiores; **fundo primeiro** (etapas 2–3), **tampa depois** (4–5).
- Orelhas da aba de cola dobram junto com as abas.
- Abas com mais de um nível (lvl ≥ 2):
  - vinco **diagonal** → 180°, logo antes da aba mãe (**fundo automático**: o gusset fica colado por baixo);
  - vinco **paralelo**: a cadeia de abas (nível 1 → 2 → 3…) é classificada pelo tamanho comparado com o **vão** que ela atravessa (largura do painel vizinho):
    - **colarinho** (`rsc-colar`): a 1ª faixa tem **vinco duplo** estreito (< 5 espessuras ou 15 mm) ou **furo de alça** dos dois lados da dobra → dobra 180° para dentro (parede dupla com a alça vazada) e a aba seguinte fecha a tampa por dentro (−90°), abaixo do colarinho. Faixas do mesmo lado com a mesma altura seguem a mesma regra. Caso: 3D Abrasivos (lingueta de uma aba entra na fenda da faixa do outro lado).
    - **plana**: a cadeia inteira cabe deitada em até 55% do vão → aba comum com um vinco a mais (trava do fundo), níveis ≥2 a 0°. Caso: caixas de maçã Adair (57 + 93 mm num vão de 310).
    - **divisória incorporada** (`rsc-divisoria`): nível 2 → 90° (sobe por dentro) e nível ≥3 → 0° (continua subindo). Caixas de garrafas (b-3 azeite, b-22, b-39 espumante). **Conferido nesta rodada:** o nível 1 das abas largas tem metade da profundidade (a divisória sobe no meio) e o das abas estreitas tem 1/3 do comprimento (as divisórias transversais ficam a 1/3 e 2/3); as fendas das abas largas ficam exatamente nessas posições, e fenda de cima + fenda de baixo somam a altura da divisória. Grade 3×2 = 6 garrafas.
- Abas só de um lado (sem tampa ou sem fundo de abas) → rótulo *Caixa sem tampa (FEFCO 0200)*, mesma montagem.

### `mala` — Caixa maleta com alça
Corpo e abas compridas como a RSC; na aba comprida, a alça (nível 2) volta −90° para encostar na outra alça, recortes da pega ficam no plano (0°). As abas laterais afuniladas viram reforço interno: dobras a 90°, a última a −90°.
**Conferido (Tonin, a-853690):** a aba lateral tem 20 | 82 | 6 (vinco duplo) | 77 | 15 mm. A faixa de 20 mm deita sob a tampa, a de 82 desce por dentro, o vinco duplo de 6 mm (= 2 espessuras) faz a volta, a de 77 sobe (82 − 6 ≈ 77, chega na altura da tampa) e a lingueta de 15 mm fecha contra a parede de cabeceira (que está a ~14 mm). As medidas fecham com o "tubo"; as larguras afunilam (260 → 210) para entrar entre as paredes.

### `meia-caixa` — Caixa em duas metades
Receita da RSC sobre a meia chapa; `copy` faz o viewer desenhar a segunda metade girada 180° em volta do eixo vertical do centro da caixa (aparece quando as paredes já estão em pé).

### `bandeja` / `cartucho` — Montagem pelo fundo
A partir do fundo (maior painel):
- **parede** (filho direto do fundo): etapa 1 se tem abas perpendiculares (orelhas de canto), senão etapa 3;
- **perpendicular** ao vinco do pai (orelhas de canto): meia etapa antes do painel que as leva, para entrar por dentro;
- **paralelo** (parede dupla, tampa, aba de encaixe): etapa seguinte, ≥ 4.
- Orelha presa numa parede que já virou 180° (parede dupla) dobra ao contrário: se terminar fora do fundo, o sentido é invertido. Caso: Agropampa caixa única (abas nas pontas da parede interna forram frente e fundo).
- Colunas de canto (agroserra): aba trapezoidal no topo da lateral + duas abas que descem pela cabeceira e voltam pela lateral formam uma coluna oca; as linguetas no topo encaixam nas fendas do fundo da caixa de cima. Monta certo com as regras acima.
- Rótulo: tem tampa do tamanho do fundo (área ≥75% e mesmo comprimento) → *Cartucho de correio (tipo FEFCO 0427)*; tem tira estreita paralela → *Bandeja com parede dupla*; senão *Bandeja / montagem pelo fundo*.

## Como adicionar um estilo novo

1. Separe uma ou mais fichas da família na pasta `amostras/` (fica fora do Git).
2. Veja a faca lida: `node test/debug.js amostras/X.pdf` → `out/X.png` (painéis numerados, vincos em vermelho, picotes em verde, cortes soltos em azul).
3. Veja a árvore e a receita atual: `node test/recipe.js amostras/X.pdf`.
4. Escreva `detectXxx(model)` (topologia: quantos painéis, cadeias, larguras, vincos paralelos/perpendiculares, diagonais) e `recipeXxx(model, det)` em `src/styles.js`, e chame no `detect()` **na ordem certa** (do mais específico para o mais genérico).
5. Confira no 3D: `python3 build.py && python3 test/shots_batch.py out/x.png amostras/X.pdf`.
6. Rode o lote inteiro (`test/par.sh`) e compare com o resultado anterior para não quebrar outras famílias.
7. Documente aqui a regra e o motivo.

Alternativa sem código: o usuário monta a caixa no **editor de dobras** do app e usa **Copiar estilo**. O texto copiado (`{sig, root, orient, prog}`) pode virar uma receita fixa.
