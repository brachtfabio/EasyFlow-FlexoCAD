# Histórico e decisões

Registro do que foi feito, por quê, e o que falta. Mantenha atualizado a cada rodada.

## Rodada 1 — prova de conceito (Flexograv)
- Pedido: gerar a caixa 3D a partir da ficha de aprovação Flexograv (faca em retângulos azuis + arte), como o Esko Studio faz.
- Feito: leitura dos retângulos azuis, escala pelos "Ajustes Imp./Ond.", arte renderizada sem a faca, dobra FEFCO 0201 fixa, Worker da Cloudflare com o HTML embutido.
- Decisão: tudo no navegador (sem servidor); os PDFs nunca saem do computador.

## Rodada 2 — app com envio de PDF
- O primeiro app aceitava qualquer faca de 4 painéis com abas (0201), achando a faca pela geometria e as medidas pelo texto.

## Rodada 3 — motor genérico e biblioteca de estilos (12 fichas especiais Trombini)
- Pedido: suportar caixas especiais "como no ArtiosCAD, por tipo", com o máximo de fidelidade, e conferir com a ficha técnica quando houver.
- Decisões:
  - Trocar a leitura por **grafo planar** (qualquer faca vira painéis + vincos + furos), e a dobra por **árvore de dobradiças** com receitas por estilo.
  - **Espessura real** do papelão por onda e **empilhamento** das abas (quem dobra por último fica por cima).
  - Ficha técnica: escala pelas cotas, vista interna espelhada; **conferência** lado a lado com a ficha de impressão.
  - **Editor de dobras** no app (ângulo, etapa, painel base) com estilos salvos no navegador e copiar/colar.
  - Faca exportada como contorno preenchido → `outline.js`.
- Estilos criados: caixa maleta, mala com alça, bandeja/parede dupla, cartucho de correio (0427), suporte com furos.

## Rodada 4 — nome e publicação
- Nome **EasyFlow FlexoCAD** (EasyFlow + Flexograv + CAD, inspirado no ArtiosCAD). Caixa padrão kraft com o nome.
- Repositório `brachtfabio/easyflow-flexocad`; Cloudflare ligada ao Git (Worker `cria3d`), publica a cada push na `main`.

## Rodada 5 — lote de 50 fichas
Diagnóstico inicial (`test/batch.js`): 27 montavam certo, 7 travavam por lentidão, 8 montavam errado, 10 de outros fornecedores não eram lidas.

Mudanças:
1. **Desempenho** (7 travavam): eram facas em contorno preenchido; as cores da arte também geravam milhares de "linhas". `Outline` agora descarta cores sem vincos e tenta primeiro as mais simples; a análise para quando acha uma faca boa.
2. **Outros fornecedores**: variantes de leitura do vinco (*traço-ponto*, *espessura*, *cor*), escolha pela força da evidência; moldura da página só é descartada se for retângulo simples.
3. **Caneta do corte pelas pontas dos vincos** (em vez da espessura): resolveu cotas e "perfil" desenhados na mesma cor da faca, inclusive numa ficha técnica antiga que tinha regredido.
4. **Várias caixas na folha** (`pieces`): o app mostra "Peça 1, 2…" para escolher; cópias iguais aparecem uma vez.
5. **Faca em pé** (`rot`): tubos longos e caixas desenhadas na vertical.
6. **Fundo automático** (vinco diagonal → 180°) e **divisória incorporada** (abas de baixo com vários níveis sobem por dentro).
7. **Meia caixa** (chapa com só 2 painéis): o viewer completa com a segunda metade.
8. **Ajuste com número único** ("1912"): confere com a medida interna (pode ser a chapa com várias caixas).
9. Cotas vetorizadas na cor da faca (verde/ciano) somem da arte.

10. Medida solta no texto ("400x235x180") usada como medida interna em fichas de outros fornecedores.

Resultado: **50 de 66 OK numérico**, nenhum erro de leitura; os demais conferidos visualmente. Ver [TESTES.md](TESTES.md).

## Pendências conhecidas (backlog)

| Prioridade | Item | Exemplo |
|---|---|---|
| Alta | Confirmar com o usuário a montagem das **divisórias incorporadas** (hoje: abas de baixo nível 2 sobem a 90°, nível ≥3 continuam a 0°) | b-3, b-22, b-39, b-47 |
| Alta | Confirmar a montagem das **abas laterais da mala** (hoje: reforço interno em "tubo") | a-853690, a-830664 |
| Média | **Mailer com orelhas laterais duplas** (estilo tipo FEFCO 0427 com paredes duplas e orelhas arredondadas) monta errado | b-41 |
| Média | Folha com **tampa + fundo**: ler as duas peças e montar uma sobre a outra (telescópica) | b-43, b-45 |
| Média | Folha **sem marcação de vinco** e com várias cópias encostadas: as cópias se unem numa peça só | b-50 |
| Média | **Bandejas com tampa / abas de encaixe** que não fecham totalmente | b-7, b-8, b-21 |
| Baixa | Vincos curvos dobram como retos | a-852574 |
| Baixa | Travas por encaixe sem simulação física (lingueta na fenda, fundo 1-2-3) | — |
| Baixa | "OK numérico" largo demais para caixas com alça/parede dupla: medir por dimensão interna real | — |

## Como continuar (para quem pegar o projeto)
1. Leia [ARQUITETURA.md](ARQUITETURA.md) e [ESTILOS.md](ESTILOS.md).
2. Peça as amostras e rode `test/par.sh` para ter a linha de base.
3. Escolha um item do backlog, siga "Como adicionar um estilo novo" e registre aqui a decisão.
