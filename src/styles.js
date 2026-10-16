// ===== Biblioteca de estilos (receitas de dobra) =====
// Reconhece a família da caixa pela topologia dos painéis e define, para cada vinco,
// o ângulo de dobra e a etapa em que ele dobra — como os estilos do ArtiosCAD.
const Styles = (() => {
  const FoldM = typeof Fold !== "undefined" ? Fold : require("./fold");
  const isHoriz = h => Math.abs(h.dir[0]) > 0.9;
  const isVert = h => Math.abs(h.dir[1]) > 0.9;
  const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const other = (h, f) => h.a === f ? h.b : h.a;

  // ---------- caixa normal (FEFCO 0201 e variações) ----------
  function bodyChain(model) {
    // maior sequência de painéis ligados por vincos verticais, com a mesma faixa de altura
    const F = model.faces, best = { chain: [] };
    for (let s = 0; s < F.length; s++) {
      const vis = new Set([s]); const chain = [s];
      const ext = dir => {
        let cur = s;
        for (;;) {
          const nx = F[cur].hinges.map(id => model.hinges[id]).filter(h => isVert(h))
            .map(h => other(h, cur)).filter(o => !vis.has(o) && (dir > 0 ? F[o].c[0] > F[cur].c[0] : F[o].c[0] < F[cur].c[0]))
            .filter(o => Math.abs(F[o].bbox[1] - F[s].bbox[1]) < F[s].h * 0.12 + 2 && Math.abs(F[o].bbox[3] - F[s].bbox[3]) < F[s].h * 0.12 + 2);
          if (!nx.length) break;
          cur = nx[0]; vis.add(cur); dir > 0 ? chain.push(cur) : chain.unshift(cur);
        }
      };
      ext(1); ext(-1);
      if (chain.length > best.chain.length) best.chain = chain;
    }
    return best.chain;
  }
  function detectRSC(model) {
    const chain = bodyChain(model);
    if (chain.length < 4) return null;
    const F = model.faces, ws = chain.map(f => F[f].w);
    const big = Math.max(...ws);
    // tiras estreitas no meio (parede dupla) => não é caixa normal
    const narrowIdx = chain.map((f, i) => i).filter(i => ws[i] < big * 0.2);
    if (narrowIdx.some(i => i !== 0 && i !== chain.length - 1)) return null;
    const panels = chain.filter((f, i) => !narrowIdx.includes(i));
    if (panels.length !== 4) return null;
    const pw = panels.map(f => F[f].w);
    const ok = Math.abs(pw[0] - pw[2]) / pw[0] < 0.12 && Math.abs(pw[1] - pw[3]) / pw[1] < 0.12;
    if (!ok) return null;
    const glue = narrowIdx.length ? chain[narrowIdx[0]] : null;
    return { chain, panels, glue };
  }
  function recipeRSC(model, det) {
    const F = model.faces, { panels, glue } = det;
    const pw = panels.map(f => F[f].w);
    const longIdx = panels.length === 2 ? [pw[0] >= pw[1] ? 0 : 1] : pw[0] + pw[2] > pw[1] + pw[3] ? [0, 2] : [1, 3];
    // frente = painel comprido que não encosta na aba de cola
    const adjGlue = f => glue != null && F[f].hinges.some(id => other(model.hinges[id], f) === glue);
    const root = panels[longIdx.find(i => !adjGlue(panels[i]))] ?? panels[longIdx[0]];
    const tr = FoldM.tree(model, root);
    const prog = {};
    const isBody = new Set(det.chain);
    const major = new Set(longIdx.map(i => panels[i]));
    const notes = new Set();
    const kidsOf = f => tr.order.filter(g => tr.parent[g] === f);
    const isPar = (f, g) => { const h = model.hinges[tr.via[g]].dir, hp = model.hinges[tr.via[f]].dir; return Math.abs(h[0] * hp[0] + h[1] * hp[1]) > 0.9; };
    const depth = f => isHoriz(model.hinges[tr.via[f]]) ? F[f].h : F[f].w;   // profundidade da aba (perpendicular ao vinco)
    const hasHole = f => F[f].holes && F[f].holes.length > 0;
    // Analisa cada cadeia de abas paralelas presa ao corpo (nível 1 → 2 → 3…) e decide o tipo:
    //  - 'colar': colarinho de parede dupla. A 1ª faixa dobra 180° para dentro (vinco duplo estreito, ou
    //    furo de alça na faixa e no painel) e a aba seguinte fecha a tampa por dentro, abaixo do colarinho.
    //    Caso real: 3D Abrasivos (caixa alta de abrasivo em rolo), furos da alça alinhados pela dobra de 180°.
    //  - 'plana': a cadeia inteira cabe deitada na metade do vão → é uma aba comum com um vinco a mais (trava do fundo).
    //    Caso real: caixas de maçã CAT III (Adair), aba do fundo 57 + 93 mm num vão de 310 mm.
    //  - 'divisoria': a cadeia é bem maior que a metade do vão → sobe por dentro e forma a divisória (b-3, b-22, b-39).
    const chainKind = new Map(), chains = [];
    const panelsCyc = det.panels;
    for (const a of panelsCyc) {
      const i = panelsCyc.indexOf(a), nb = panelsCyc[(i + 1) % panelsCyc.length] ?? panelsCyc[(i + panelsCyc.length - 1) % panelsCyc.length];
      const span = F[nb].w;   // vão que a aba atravessa = largura do painel vizinho
      for (const f1 of kidsOf(a).filter(g => !isBody.has(g) && g !== glue)) {
        const seq = [f1]; for (let g = f1; ; ) { const n = kidsOf(g).find(k => isPar(g, k)); if (n == null) break; seq.push(n); g = n; }
        if (seq.length < 2) continue;
        const t = model.thickness, d = seq.map(depth), total = d.reduce((x, y) => x + y, 0);
        let kind;
        if (d[0] < Math.max(5 * t, 15) && seq.length >= 3) kind = { type: 'colar', fold: 2 };                  // vinco duplo: f1 (90) + f2 (90) = 180°
        else if (hasHole(f1) && hasHole(a) && seq.length >= 2 && d[0] < span * 0.5) kind = { type: 'colar', fold: 1 };   // furo da alça dos dois lados da dobra
        else if (total <= span * 0.55) kind = { type: 'plana' };
        else kind = { type: 'divisoria' };
        chains.push({ seq, kind, d, top: F[f1].c[1] > F[a].c[1] });
      }
    }
    // colarinho vale para o lado todo: faixas do mesmo lado com a mesma altura do colarinho também dobram 180°
    // (3D Abrasivos: a faixa do painel largo não tem furo nem vinco duplo, só um picote)
    for (const c of chains) {
      if (c.kind.type === 'colar') continue;
      const ref = chains.find(o => o.kind.type === 'colar' && o.top === c.top);
      if (!ref) continue;
      const hRef = ref.d.slice(0, ref.kind.fold).reduce((x, y) => x + y, 0);
      if (Math.abs(c.d[0] - hRef) < Math.max(10, hRef * 0.2)) c.kind = { type: 'colar', fold: 1 };
    }
    chains.forEach(c => c.seq.forEach((g, k) => chainKind.set(g, { ...c.kind, pos: k })));
    for (const f of tr.order) {
      if (tr.parent[f] < 0) continue;
      const hid = tr.via[f], par = tr.parent[f], h = model.hinges[hid];
      if (isBody.has(f) && isBody.has(par)) { prog[hid] = { angle: 90, stage: 1 }; continue; }
      if (par === glue) { prog[hid] = { angle: 90, stage: F[f].c[1] > F[par].c[1] ? 4 : 2 }; continue; }   // orelhas da aba de cola dobram com as abas
      // abas: nível 1 (presas ao corpo) e níveis seguintes
      let lvl = 0, a = f; while (a >= 0 && !isBody.has(a)) { a = tr.parent[a]; lvl++; }
      const top = F[f].c[1] > F[a].c[1];
      const base = major.has(a) ? 3 : 2;
      const ck = chainKind.get(f);
      if (ck && ck.type === 'colar') {
        // colarinho: dobra 180° para dentro; a aba seguinte vira para o centro (−90) e fecha a tampa por dentro
        const st = base + (top ? 2 : 0);
        if (ck.pos < ck.fold) prog[hid] = { angle: ck.fold === 2 ? 90 : 180, stage: st - 1 };
        else if (ck.pos === ck.fold) prog[hid] = { angle: -90, stage: st };
        else prog[hid] = { angle: 0, stage: st };
        notes.add('colar');
      } else if (ck && ck.type === 'plana' && lvl >= 2) prog[hid] = { angle: 0, stage: base + (top ? 2 : 0) };
      else if (lvl === 1) prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) };
      else {
        const hp = model.hinges[tr.via[par]], diag = Math.abs(h.dir[0]) > 0.15 && Math.abs(h.dir[1]) > 0.15;
        const parallel = Math.abs(h.dir[0] * hp.dir[0] + h.dir[1] * hp.dir[1]) > 0.9;
        const pk = chainKind.get(par);
        if (pk && pk.type === 'colar') prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) - 0.5 };   // orelhas da tampa do colarinho
        else if (diag) prog[hid] = { angle: 180, stage: base + (top ? 2 : 0) - 0.5 };            // fundo automático: a dobra diagonal fica colada por baixo
        else if (parallel && lvl === 2) prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) + 1 };   // divisória: sobe por dentro da caixa
        else if (parallel) prog[hid] = { angle: 0, stage: base + (top ? 2 : 0) + 1 };      // continuação da divisória (com as fendas de encaixe)
        else prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) + lvl * 2 };
        if (parallel && !diag) notes.add('divisoria');
      }
    }
    // fundo primeiro, tampa depois
    const nl = [];
    if (notes.has('divisoria')) nl.push('As abas de baixo com várias dobras foram montadas como divisória interna (sobem por dentro da caixa). Ajuste no editor se a montagem for diferente.');
    if (notes.has('colar')) nl.push('A faixa com vinco duplo (ou com o furo da alça) dobra 180° para dentro, formando um colarinho de parede dupla; a tampa fecha por dentro, abaixo dele.');
    const style = notes.has('divisoria') ? 'rsc-divisoria' : notes.has('colar') ? 'rsc-colar' : 'rsc';
    // abas só de um lado (caixas de maçã Adair/Adams): caixa sem tampa, FEFCO 0200
    const sides = new Set(det.panels.flatMap(p => kidsOf(p).filter(g => !isBody.has(g) && g !== glue && F[g].area > F[p].area * 0.1).map(g => F[g].c[1] > F[p].c[1])));
    const label = style === 'rsc-divisoria' ? 'Caixa com divisória incorporada' : style === 'rsc-colar' ? 'Caixa com colarinho e alça'
      : sides.size === 1 && det.panels.length === 4 ? 'Caixa sem tampa (FEFCO 0200)' : 'Caixa maleta (FEFCO 0201)';
    return { style, label, root, orient: 'front', prog, notes: nl };
  }

  // ---------- caixa maleta com alça (abas superiores em cadeia, sem fundo de abas) ----------
  function detectMala(model, det) {
    const F = model.faces;
    const tr = FoldM.tree(model, det.panels[0]);
    const isBody = new Set(det.chain);
    let top = 0, bot = 0, deep = 0;
    for (const f of tr.order) {
      if (isBody.has(f) || tr.parent[f] < 0) continue;
      let a = f, lvl = 0; while (!isBody.has(a)) { a = tr.parent[a]; lvl++; }
      if (F[f].c[1] > F[a].c[1]) top++; else bot++;
      if (lvl >= 2) deep++;
    }
    return deep >= 3 && bot === 0;
  }
  function recipeMala(model, det) {
    const r = recipeRSC(model, det);
    const F = model.faces, tr = FoldM.tree(model, r.root), isBody = new Set(det.chain);
    const pw = det.panels.map(f => F[f].w);
    const longP = new Set((pw[0] + pw[2] > pw[1] + pw[3] ? [0, 2] : [1, 3]).map(i => det.panels[i]));
    for (const f of tr.order) {
      if (tr.parent[f] < 0 || isBody.has(f) || tr.parent[f] === det.glue) continue;
      let a = f, lvl = 0; while (!isBody.has(a)) { a = tr.parent[a]; lvl++; }
      const hid = tr.via[f];
      if (longP.has(a)) {
        // aba comprida fecha a tampa; a alça volta para cima e encosta na outra
        r.prog[hid] = lvl === 1 ? { angle: 90, stage: 4 } : lvl === 2 ? { angle: -90, stage: 5 } : { angle: 0, stage: 5 };  // recortes da pega ficam no plano da alça
      } else {
        // aba lateral afunilada: vira um reforço interno em "tubo" (desce, dobra no fundo, sobe e trava sob a tampa)
        let depthMax = lvl; for (let g = f; ; ) { const kids = tr.order.filter(x => tr.parent[x] === g); if (!kids.length) break; g = kids[0]; depthMax++; }
        const tip = lvl === depthMax && lvl >= 4;
        r.prog[hid] = { angle: tip ? -90 : 90, stage: 3 - lvl * 0.2 };
      }
    }
    r.style = 'mala'; r.label = 'Caixa maleta com alça';
    r.notes.push('Abas laterais montadas como reforço interno; ajuste no editor se a montagem for diferente.');
    return r;
  }

  // ---------- bandejas, cartuchos de correio e suportes (montados a partir do fundo) ----------
  function recipeTray(model, opts = {}) {
    const F = model.faces;
    const root = opts.root ?? F.reduce((a, f) => f.area > F[a].area ? f.idx : a, 0);
    const tr = FoldM.tree(model, root);
    const prog = {}, stage = new Array(F.length).fill(0);
    const rel = f => {  // relação do vinco do filho com o vinco do pai: paralelo ou perpendicular
      const p = tr.parent[f]; if (tr.parent[p] < 0) return 'wall';
      const h1 = model.hinges[tr.via[f]].dir, h0 = model.hinges[tr.via[p]].dir;
      return Math.abs(h1[0] * h0[0] + h1[1] * h0[1]) > 0.7 ? 'par' : 'perp';
    };
    const kids = f => tr.order.filter(g => tr.parent[g] === f);
    for (const f of tr.order) {
      if (tr.parent[f] < 0) continue;
      const r = rel(f);
      if (r === 'wall') stage[f] = kids(f).some(g => rel(g) === 'perp') ? 1 : 3;
      else if (r === 'perp') stage[f] = rel(tr.parent[f]) === 'wall' ? stage[tr.parent[f]] + 1 : stage[tr.parent[f]] - 0.5;  // orelhas dobram antes do painel que as leva
      else stage[f] = Math.max(3, stage[tr.parent[f]]) + 1;
      prog[tr.via[f]] = { angle: 90, stage: stage[f] };
    }
    // Orelhas (vinco perpendicular) presas numa parede que já virou 180° (parede dupla) dobram ao contrário:
    // se a orelha termina fora do fundo, inverte o sentido. Caso real: Agropampa caixa única (bandeja com tampa),
    // as abas nas pontas da parede lateral interna forram a frente e o fundo por dentro.
    if (typeof THREE !== 'undefined') {
      const rb = F[root].bbox, mg = Math.max(F[root].w, F[root].h) * 0.05, v = new THREE.Vector3();
      const outside = (M, f) => { v.set(F[f].c[0], F[f].c[1], 0).applyMatrix4(M[f]); return v.x < rb[0] - mg || v.x > rb[2] + mg || v.y < rb[1] - mg || v.y > rb[3] + mg; };
      for (const f of tr.order) {
        if (tr.parent[f] < 0 || rel(f) !== 'perp' || rel(tr.parent[f]) === 'wall') continue;
        const p = prog[tr.via[f]];
        if (!outside(FoldM.poses(model, tr, prog, 1).M, f)) continue;
        p.angle = -p.angle;
        if (outside(FoldM.poses(model, tr, prog, 1).M, f)) p.angle = -p.angle;   // não melhorou: volta
      }
    }
    const hasDouble = tr.order.some(f => tr.parent[f] >= 0 && rel(f) === 'par' && Math.min(F[f].w, F[f].h) < model.thickness * 4);
    // tampa: painel ligado a uma parede, do tamanho do fundo (largura e profundidade parecidas)
    const hasLid = tr.order.some(f => tr.parent[f] >= 0 && rel(f) === 'par' && F[f].area > F[root].area * 0.75 &&
      Math.abs(Math.max(F[f].w, F[f].h) - Math.max(F[root].w, F[root].h)) < Math.max(F[root].w, F[root].h) * 0.12);
    const label = hasLid ? 'Cartucho de correio (tipo FEFCO 0427)' : hasDouble ? 'Bandeja com parede dupla' : 'Bandeja / montagem pelo fundo';
    return { style: hasLid ? 'cartucho' : 'bandeja', label, root, orient: 'base', prog, notes: [] };
  }

  function generic(model) {
    const r = recipeTray(model);
    r.style = 'generico'; r.label = 'Estilo livre (ajuste no editor)';
    return r;
  }

  // ---------- meia caixa: a chapa tem só frente + lateral (+ cola); a caixa usa duas peças iguais ----------
  function detectHalf(model) {
    const chain = bodyChain(model), F = model.faces;
    if (chain.length < 2 || chain.length > 3) return null;
    const ws = chain.map(f => F[f].w), big = Math.max(...ws);
    const glueI = ws.findIndex(w => w < big * 0.2);
    const panels = chain.filter((f, i) => i !== glueI);
    if (panels.length !== 2) return null;
    // abas em cima e embaixo dos dois painéis
    const tr = FoldM.tree(model, panels[0]);
    const flapsOn = p => tr.order.filter(f => tr.parent[f] === p && !chain.includes(f)).length;
    if (flapsOn(panels[0]) < 2 || flapsOn(panels[1]) < 2) return null;
    return { chain, panels, glue: glueI >= 0 ? chain[glueI] : null };
  }
  function recipeHalf(model, det) {
    const F = model.faces;
    const r = recipeRSC(model, { ...det, panels: det.panels });
    // frente = o painel mais largo; a cópia gira 180° em volta do eixo vertical no centro da caixa
    const front = F[det.panels[0]].w >= F[det.panels[1]].w ? det.panels[0] : det.panels[1];
    const side = front === det.panels[0] ? det.panels[1] : det.panels[0];
    r.root = front;
    const tr = FoldM.tree(model, front);
    for (const f of tr.order) { if (tr.parent[f] < 0) continue; const hid = tr.via[f]; if (det.chain.includes(f) && det.chain.includes(tr.parent[f])) r.prog[hid] = { angle: 90, stage: 1 }; }
    const fb = F[front].bbox, sideRight = F[side].c[0] > F[front].c[0];
    r.copy = { L: F[front].w, W: F[side].w, x0: sideRight ? fb[0] : fb[2] - F[front].w, sideRight };
    r.style = 'meia-caixa'; r.label = 'Caixa em duas metades (0201 dividida)';
    r.notes = ['A chapa tem meia caixa; a outra metade igual foi colocada girada para completar a caixa.'];
    return r;
  }

  function detect(model) {
    const rsc = detectRSC(model);
    if (rsc) return detectMala(model, rsc) ? recipeMala(model, rsc) : recipeRSC(model, rsc);
    const half = detectHalf(model);
    if (half) return recipeHalf(model, half);
    // montagem pelo fundo: o maior painel tem vincos dos dois sentidos
    const F = model.faces, base = F.reduce((a, f) => f.area > F[a].area ? f.idx : a, 0);
    const hs = F[base].hinges.map(id => model.hinges[id]);
    if (hs.some(isHoriz) && hs.some(isVert)) return recipeTray(model, { root: base });
    return generic(model);
  }
  // Monta o modelo e escolhe o estilo; se a faca estiver desenhada "em pé", tenta girada 90°.
  function auto(sheet, opts = {}) {
    let model = FoldM.buildModel(sheet, opts), recipe = detect(model);
    if (opts.rot == null && !/^rsc|^mala|^meia/.test(recipe.style)) {
      const m2 = FoldM.buildModel(sheet, { ...opts, rot: 1 }), r2 = detect(m2);
      if (/^rsc|^mala/.test(r2.style)) { model = m2; recipe = r2; }
    }
    return { model, recipe };
  }
  // Confere a medida interna escrita na ficha com o desenho (só caixas de corpo com 4 paredes).
  // Nas 47 caixas normais do lote as paredes passam no máximo 17 mm da medida interna (espessura + folga);
  // a 3D Abrasivos passa 80 mm (ajustes ~1460 × "Med. Interna" 1380): erro da própria ficha → aviso.
  function checkMeasures(sheet, model, recipe) {
    const mi = (sheet.info.interna && sheet.info.interna.match(/\d+(?:[.,]\d+)?/g) || []).map(v => parseFloat(v.replace(',', '.')));
    if (mi.length !== 3 || !/^rsc|^mala/.test(recipe.style)) return [];
    const det = detectRSC(model); if (!det) return [];
    const F = model.faces, pw = det.panels.map(p => F[p].w), H = Math.max(...det.panels.map(p => F[p].h));
    const got = [Math.max(pw[0], pw[1]), Math.min(pw[0], pw[1]), H].sort((a, b) => b - a), exp = mi.slice().sort((a, b) => b - a);
    const d = Math.max(...got.map((g, i) => Math.abs(g - exp[i])));
    if (d <= 40) return [];
    return [`a medida interna escrita na ficha (${exp.join(' x ')}) não bate com o desenho da faca (corpo de ${got.map(Math.round).join(' x ')} mm): diferença de ${Math.round(d)} mm, confira a ficha`];
  }
  return { detect, auto, recipeRSC, recipeTray, generic, detectRSC, checkMeasures };
})();
if (typeof module !== 'undefined') module.exports = Styles;
