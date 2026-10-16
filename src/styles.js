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
    const longIdx = pw[0] + pw[2] > pw[1] + pw[3] ? [0, 2] : [1, 3];
    // frente = painel comprido que não encosta na aba de cola
    const adjGlue = f => glue != null && F[f].hinges.some(id => other(model.hinges[id], f) === glue);
    const root = panels[longIdx.find(i => !adjGlue(panels[i]))] ?? panels[longIdx[0]];
    const tr = FoldM.tree(model, root);
    const prog = {};
    const isBody = new Set(det.chain);
    const major = new Set(longIdx.map(i => panels[i]));
    const notes = [];
    for (const f of tr.order) {
      if (tr.parent[f] < 0) continue;
      const hid = tr.via[f], par = tr.parent[f], h = model.hinges[hid];
      if (isBody.has(f) && isBody.has(par)) { prog[hid] = { angle: 90, stage: 1 }; continue; }
      if (par === glue) { prog[hid] = { angle: 90, stage: F[f].c[1] > F[par].c[1] ? 4 : 2 }; continue; }   // orelhas da aba de cola dobram com as abas
      // abas: nível 1 (presas ao corpo) e níveis seguintes
      let lvl = 0, a = f; while (a >= 0 && !isBody.has(a)) { a = tr.parent[a]; lvl++; }
      const top = F[f].c[1] > F[a].c[1];
      const base = major.has(a) ? 3 : 2;
      if (lvl === 1) prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) };
      else prog[hid] = { angle: 90, stage: base + (top ? 2 : 0) + lvl * 2 };
    }
    // fundo primeiro, tampa depois
    return { style: 'rsc', label: 'Caixa maleta (FEFCO 0201)', root, orient: 'front', prog, notes };
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
    const hasDouble = tr.order.some(f => tr.parent[f] >= 0 && rel(f) === 'par' && Math.min(F[f].w, F[f].h) < model.thickness * 4);
    const hasLid = tr.order.some(f => tr.parent[f] >= 0 && rel(f) === 'par' && F[f].area > F[root].area * 0.5);
    const label = hasLid ? 'Cartucho de correio (tipo FEFCO 0427)' : hasDouble ? 'Bandeja com parede dupla' : 'Bandeja / montagem pelo fundo';
    return { style: hasLid ? 'cartucho' : 'bandeja', label, root, orient: 'base', prog, notes: [] };
  }

  function generic(model) {
    const r = recipeTray(model);
    r.style = 'generico'; r.label = 'Estilo livre (ajuste no editor)';
    return r;
  }

  function detect(model) {
    const rsc = detectRSC(model);
    if (rsc) return detectMala(model, rsc) ? recipeMala(model, rsc) : recipeRSC(model, rsc);
    // montagem pelo fundo: o maior painel tem vincos dos dois sentidos
    const F = model.faces, base = F.reduce((a, f) => f.area > F[a].area ? f.idx : a, 0);
    const hs = F[base].hinges.map(id => model.hinges[id]);
    if (hs.some(isHoriz) && hs.some(isVert)) return recipeTray(model, { root: base });
    return generic(model);
  }
  return { detect, recipeRSC, recipeTray, generic, detectRSC };
})();
if (typeof module !== 'undefined') module.exports = Styles;
