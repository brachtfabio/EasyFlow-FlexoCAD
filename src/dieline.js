// ===== Faca → painéis =====
// Recebe os traços do PDF (PDFVec) e devolve a faca como grafo planar:
// painéis (faces), furos, vincos (dobradiças), picotes e cortes soltos.
const Dieline = (() => {
  const CUT = 'cut', CREASE = 'crease', PERF = 'perf', UNK = 'unk';

  // ---------- utilidades geométricas ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const crs = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = a => Math.hypot(a[0], a[1]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function pointInPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function interiorPoint(poly) {
    // ponto garantidamente dentro: varredura horizontal no meio da altura
    let y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (const f of [0.5, 0.37, 0.63, 0.25, 0.75, 0.12, 0.88]) {
      const y = y0 + (y1 - y0) * f, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      let best = null, bw = 0;
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, y]; }
      if (best) return best;
    }
    return poly[0];
  }

  // ---------- classificação de traços ----------
  function dashKind(d) {
    if (!d || !d.length || d.every(v => v === 0)) return CUT;
    const nz = d.filter(v => v > 0);
    if (nz.length >= 2 && Math.max(...nz) / Math.min(...nz) > 1.6) return PERF;  // traço-ponto (traços de tamanhos diferentes)
    return CREASE;
  }
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const isWhite = h => { const [r, g, b] = hexRGB(h); return r > 235 && g > 235 && b > 235; };

  // Agrupa traços por caneta (cor + espessura + tipo) e escolhe quais podem ser faca.
  function pens(vec) {
    const groups = new Map();
    vec.paths.forEach((p, i) => {
      if (!p.stroke || isWhite(p.stroke)) return;
      const kind = dashKind(p.dash);
      const key = `${p.stroke}|${p.width.toFixed(2)}|${kind}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { key, color: p.stroke, width: p.width, kind, paths: [], x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, length: 0 });
      g.paths.push(i);
      for (const s of p.subs) {
        for (let k = 0; k < s.pts.length; k++) {
          const q = s.pts[k];
          g.x0 = Math.min(g.x0, q[0]); g.y0 = Math.min(g.y0, q[1]); g.x1 = Math.max(g.x1, q[0]); g.y1 = Math.max(g.y1, q[1]);
          if (k) g.length += len(sub(q, s.pts[k - 1]));
        }
      }
    });
    return [...groups.values()];
  }

  // ---------- grafo planar ----------
  function buildGraph(segs, tol) {
    // segs: {a, b, kind}
    // 1) pontos de quebra por interseção / encostos
    const cell = Math.max(tol * 8, 1);
    const grid = new Map();
    const keyOf = (i, j) => i + ',' + j;
    segs.forEach((s, idx) => {
      s.t = [0, 1];
      const x0 = Math.min(s.a[0], s.b[0]) - tol, x1 = Math.max(s.a[0], s.b[0]) + tol;
      const y0 = Math.min(s.a[1], s.b[1]) - tol, y1 = Math.max(s.a[1], s.b[1]) + tol;
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
        for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
          const k = keyOf(i, j); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(idx);
        }
    });
    const seen = new Set();
    const projT = (p, s) => { const d = sub(s.b, s.a), L2 = dot(d, d); if (!L2) return null; const t = dot(sub(p, s.a), d) / L2; return { t, dist: len(sub(p, lerp(s.a, s.b, t))) }; };
    for (const list of grid.values()) {
      for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
        const i = list[x], j = list[y];
        const pk = i < j ? i * 1e6 + j : j * 1e6 + i;
        if (seen.has(pk)) continue; seen.add(pk);
        const s = segs[i], r = segs[j];
        const d1 = sub(s.b, s.a), d2 = sub(r.b, r.a);
        const L1 = len(d1), L2 = len(d2);
        if (!L1 || !L2) continue;
        const den = crs(d1, d2);
        if (Math.abs(den) / (L1 * L2) > 1e-3) {
          const w = sub(r.a, s.a);
          const t = crs(w, d2) / den, u = crs(w, d1) / den;
          const et = tol / L1, eu = tol / L2;
          if (t > -et && t < 1 + et && u > -eu && u < 1 + eu) {
            s.t.push(Math.min(1, Math.max(0, t))); r.t.push(Math.min(1, Math.max(0, u)));
          }
        }
        // encostos (T e sobreposição colinear)
        for (const [p, other] of [[s.a, r], [s.b, r], [r.a, s], [r.b, s]]) {
          const q = projT(p, other);
          if (q && q.dist < tol && q.t > 0 && q.t < 1) other.t.push(q.t);
        }
      }
    }
    // 2) nós por aglutinação transitiva (pontos a menos de tol viram o mesmo nó)
    const P = [];
    for (const s of segs) {
      s.ts = [...new Set(s.t.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b);
      s.pid = s.ts.map(t => { P.push(lerp(s.a, s.b, t)); return P.length - 1; });
    }
    const par = P.map((_, i) => i);
    const find = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const box = P.map(p => [p[0], p[1], p[0], p[1]]);
    const pg = new Map();
    P.forEach((p, i) => { const k = keyOf(Math.floor(p[0] / tol), Math.floor(p[1] / tol)); let c = pg.get(k); if (!c) pg.set(k, c = []); c.push(i); });
    P.forEach((p, i) => {
      const ci = Math.floor(p[0] / tol), cj = Math.floor(p[1] / tol);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const c = pg.get(keyOf(ci + di, cj + dj)); if (!c) continue;
        for (const j of c) if (j > i && len(sub(P[j], p)) <= tol) {
          const a = find(i), b = find(j); if (a === b) continue;
          const A = box[a], B = box[b];
          const nb = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3])];
          if (Math.hypot(nb[2] - nb[0], nb[3] - nb[1]) > tol * 2.5) continue;   // não deixa um nó "engolir" uma curva inteira
          par[a] = b; box[b] = nb;
        }
      }
    });
    const nodes = [], nid = new Map();
    P.forEach((p, i) => { const r = find(i); let n = nid.get(r); if (n === undefined) { n = nodes.length; nid.set(r, n); nodes.push({ p: [0, 0], c: 0, out: [] }); } nodes[n].p[0] += p[0]; nodes[n].p[1] += p[1]; nodes[n].c++; });
    nodes.forEach(n => { n.p[0] /= n.c; n.p[1] /= n.c; });
    const edgeMap = new Map(), edges = [];
    const rank = { crease: 3, perf: 1, cut: 2, unk: 0 };
    for (const s of segs) {
      let prev = nid.get(find(s.pid[0]));
      for (let k = 1; k < s.pid.length; k++) {
        const n = nid.get(find(s.pid[k]));
        if (n !== prev) {
          const key = prev < n ? prev + '_' + n : n + '_' + prev;
          const e = edgeMap.get(key);
          if (!e) { const ne = { u: prev, v: n, kind: s.kind, src: s.src }; edgeMap.set(key, ne); edges.push(ne); }
          else if (rank[s.kind] > rank[e.kind]) e.kind = s.kind;
        }
        prev = n;
      }
    }
    return { nodes, edges };
  }

  // Estende pontas soltas de vinco/corte até encostar no traço mais próximo (desenhos com folga).
  function extendDangling(segs, tol, reach) {
    const deg = new Map();
    const k = p => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol);
    for (const s of segs) for (const p of [s.a, s.b]) deg.set(k(p), (deg.get(k(p)) || 0) + 1);
    const near = (p) => {
      for (const s of segs) {
        for (const q of [s.a, s.b]) if (q !== p && len(sub(p, q)) < tol) return true;
        const d = sub(s.b, s.a), L2 = dot(d, d); if (!L2) continue;
        const t = dot(sub(p, s.a), d) / L2;
        if (t > 0 && t < 1 && len(sub(p, lerp(s.a, s.b, t))) < tol) return true;
      }
      return false;
    };
    for (const s of segs) {
      if (s.kind === PERF) continue;
      for (const end of ['a', 'b']) {
        const p = s[end], o = end === 'a' ? s.b : s.a;
        if (deg.get(k(p)) > 1 || near(p)) continue;
        const dir = sub(p, o), L = len(dir); if (!L) continue;
        const u = [dir[0] / L, dir[1] / L];
        let best = Infinity;
        for (const r of segs) {
          if (r === s) continue;
          const d2 = sub(r.b, r.a), den = crs(u, d2);
          if (Math.abs(den) < 1e-9) continue;
          const w = sub(r.a, p);
          const t = crs(w, d2) / den, q = crs(w, u) / den;
          if (t > 0 && t < reach && q >= -0.001 && q <= 1.001) best = Math.min(best, t);
        }
        if (best < Infinity) s[end] = [p[0] + u[0] * best, p[1] + u[1] * best];
      }
    }
    // pontas soltas próximas entre si: liga com um corte curto (desenhos com pequenas falhas)
    const deg2 = new Map();
    for (const s of segs) for (const p of [s.a, s.b]) deg2.set(k(p), (deg2.get(k(p)) || 0) + 1);
    const loose = [];
    for (const s of segs) { if (s.kind === PERF) continue; for (const p of [s.a, s.b]) if (deg2.get(k(p)) === 1 && !near(p)) loose.push(p); }
    const used = new Set();
    loose.forEach((p, i) => {
      if (used.has(i)) return;
      let bj = -1, bd = tol * 6;
      loose.forEach((q, j) => { if (j !== i && !used.has(j)) { const d = len(sub(p, q)); if (d < bd) { bd = d; bj = j; } } });
      if (bj >= 0) { used.add(i); used.add(bj); segs.push({ a: p, b: loose[bj], kind: CUT, src: -1 }); }
    });
  }

  function faces(graph) {
    const { nodes, edges } = graph;
    // poda de pontas soltas (cortes que não fecham região)
    const deg = nodes.map(() => 0);
    const alive = edges.map(() => true);
    edges.forEach(e => { deg[e.u]++; deg[e.v]++; });
    let changed = true;
    const dangling = [];
    while (changed) {
      changed = false;
      edges.forEach((e, i) => {
        if (alive[i] && (deg[e.u] === 1 || deg[e.v] === 1)) { alive[i] = false; deg[e.u]--; deg[e.v]--; changed = true; dangling.push(e); }
      });
    }
    nodes.forEach(n => n.out = []);
    const half = [];
    edges.forEach((e, i) => {
      if (!alive[i]) return;
      const h1 = { from: e.u, to: e.v, edge: i }, h2 = { from: e.v, to: e.u, edge: i };
      h1.twin = h2; h2.twin = h1; half.push(h1, h2);
      nodes[e.u].out.push(h1); nodes[e.v].out.push(h2);
    });
    for (const n of nodes) {
      for (const h of n.out) { const q = nodes[h.to].p; h.ang = Math.atan2(q[1] - n.p[1], q[0] - n.p[0]); }
      n.out.sort((a, b) => a.ang - b.ang);
      n.out.forEach((h, i) => h.idx = i);
    }
    const loops = [];
    for (const h of half) {
      if (h.loop !== undefined) continue;
      const loop = { hs: [], id: loops.length };
      let c = h, guard = 0;
      while (c.loop === undefined && guard++ < 1e6) {
        c.loop = loop.id; loop.hs.push(c);
        const out = nodes[c.to].out, tw = c.twin;
        c = out[(tw.idx - 1 + out.length) % out.length];
      }
      loop.poly = loop.hs.map(x => nodes[x.from].p);
      loop.area = polyArea(loop.poly);
      loops.push(loop);
    }
    return { loops, half, alive, dangling };
  }

  // ---------- leitura de medidas no texto ----------
  function numbersIn(texts) {
    const all = texts.map(t => t.str).join('\n');
    const tuples = [];
    for (const m of all.matchAll(/\d+(?:[.,]\d+)?(?:\s*[xX×\-–]\s*\d+(?:[.,]\d+)?)+/g)) {
      const t = m[0].split(/\s*[xX×\-–]\s*/).filter(Boolean).map(v => parseFloat(v.replace(',', '.')));
      if (t.length >= 2) tuples.push({ t, sep: /[xX×]/.test(m[0]) ? 'x' : '-', str: m[0] });
    }
    return tuples;
  }
  function field(texts, label) {
    // valor à direita de um rótulo (mesma linha)
    const lab = texts.find(t => t.str.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(label.toLowerCase()));
    if (!lab) return null;
    const inline = lab.str.slice(lab.str.indexOf(':') + 1).trim();
    if (inline && inline !== lab.str.trim()) return inline;
    const cand = texts.filter(t => t !== lab && Math.abs(t.y - lab.y) < lab.size * 0.8 && t.x > lab.x).sort((a, b) => a.x - b.x);
    return cand.length ? cand[0].str.trim() : null;
  }

  // ---------- análise principal ----------
  function analyze(vec, opts = {}) {
    const pageDiag = Math.hypot(vec.width, vec.height);
    const all = pens(vec);
    // descarta canetas de moldura/carimbo: traço contínuo cobrindo quase a página toda
    // moldura da folha: retângulos simples cobrindo quase a página toda
    const frameLike = g => g.kind === CUT && (g.x1 - g.x0) > vec.width * 0.8 && (g.y1 - g.y0) > vec.height * 0.8 &&
      g.paths.every(pi => vec.paths[pi].subs.every(sp => sp.pts.length <= 5));
    // canetas candidatas por cor
    const byColor = new Map();
    for (const g of all) { if (frameLike(g)) continue; let c = byColor.get(g.color); if (!c) byColor.set(g.color, c = []); c.push(g); }
    const results = [];
    // Variantes de leitura (cada fornecedor marca o vinco de um jeito):
    //  1) vinco tracejado e corte contínuo, na mesma cor (Trombini, Flexograv, fichas técnicas)
    //  2) só traço-ponto na cor: o traço-ponto é o vinco (exportações tipo ArtiosCAD)
    //  3) mesma cor, linhas contínuas: a mais fina é o vinco
    //  4) cores diferentes: uma cor é o corte e a outra, contínua, é o vinco (ex.: preto = corte, vermelho = vinco)
    const variants = [];
    const as = (g, kind) => ({ ...g, kind });
    const lenOf = gs => gs.reduce((s, g) => s + g.length, 0);
    for (const [color, gs] of byColor) {
      const hasCrease = gs.some(g => g.kind === CREASE && g.length > pageDiag * 0.05);
      const hasPerf = gs.some(g => g.kind === PERF && g.length > pageDiag * 0.05);
      let groups = gs;
      if (!hasCrease && hasPerf) groups = gs.map(g => g.kind === PERF ? as(g, CREASE) : g);
      const creaseW = groups.filter(g => g.kind === CREASE).map(g => g.width);
      // linhas bem mais finas que o vinco são cotas e anotações
      const minW = creaseW.length ? Math.min(...creaseW) * 0.5 : 0;
      // corte: a caneta contínua mais usada; contínuas bem mais finas que ela são cotas, moldura e anotações
      // (escolhe a caneta em que as pontas dos vincos encostam: cota, moldura e "perfil" não encostam nos vincos)
      const cr = groups.filter(g => g.kind === CREASE);
      const ends = [];
      for (const g of cr) for (const pi of g.paths) for (const sp of vec.paths[pi].subs) if (sp.pts.length > 1) ends.push(sp.pts[0], sp.pts[sp.pts.length - 1]);
      const touch = g => {
        if (!ends.length) return g.length;
        const segs = [];
        for (const pi of g.paths) for (const sp of vec.paths[pi].subs) for (let k = 1; k < sp.pts.length; k++) segs.push([sp.pts[k - 1], sp.pts[k]]);
        const tolE = Math.max(g.width * 2, pageDiag * 0.0015);
        const cell = tolE * 4, grid = new Map(), key = (i, j) => i + ',' + j;
        segs.forEach((q, i) => { const x0 = Math.floor((Math.min(q[0][0], q[1][0]) - tolE) / cell), x1 = Math.floor((Math.max(q[0][0], q[1][0]) + tolE) / cell), y0 = Math.floor((Math.min(q[0][1], q[1][1]) - tolE) / cell), y1 = Math.floor((Math.max(q[0][1], q[1][1]) + tolE) / cell);
          if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) return;
          for (let a = x0; a <= x1; a++) for (let c = y0; c <= y1; c++) { const k = key(a, c); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); } });
        let hits = 0;
        for (const p of ends) {
          const l = grid.get(key(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) || [];
          if (l.some(i => { const [a, b] = segs[i], d = sub(b, a), L2 = dot(d, d); const t = L2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0; return len(sub(p, lerp(a, b, t))) <= tolE; })) hits++;
        }
        return hits + g.length * 1e-6;
      };
      const solids = groups.filter(g => g.kind === CUT).map(g => ({ g, L: touch(g) })).sort((a, b) => b.L - a.L).map(x => { if (opts.debugAll) console.log('  caneta', x.g.color, x.g.width.toFixed(2), 'pontas de vinco encostadas', Math.floor(x.L)); return x.g; });
      const cutW = solids.length && (hasCrease || hasPerf) ? solids[0].width : 0;
      const use = groups.filter(g => g.width >= minW && (g.kind !== CUT || g.width >= cutW * 0.6));
      const how = hasCrease ? 'tracejado' : hasPerf ? 'traço-ponto' : 'contínuo';
      if (use.length) variants.push({ color, groups: use, hasCrease: hasCrease || hasPerf, how });
      // às vezes o corte é mais fino que o vinco: tenta também com todas as espessuras (só se a leitura normal falhar)
      if (use.length < groups.length) variants.push({ color, groups, hasCrease: hasCrease || hasPerf, how: how + ' (todas)', fallback: true });
      if (!hasCrease && !hasPerf) {
        const solid = gs.filter(g => g.kind === CUT && g.length > pageDiag * 0.05).sort((a, b) => a.width - b.width);
        if (solid.length >= 2 && solid[solid.length - 1].width > solid[0].width * 1.7) {
          const thin = solid[0];
          variants.push({ color, groups: gs.filter(g => g.width >= thin.width * 0.9).map(g => g === thin ? as(g, CREASE) : g), hasCrease: true, how: 'espessura' });
        }
      }
    }
    const colors = [...byColor.entries()].map(([c, gs]) => ({ c, gs, len: lenOf(gs), box: gs.reduce((b, g) => [Math.min(b[0], g.x0), Math.min(b[1], g.y0), Math.max(b[2], g.x1), Math.max(b[3], g.y1)], [1e9, 1e9, -1e9, -1e9]) }))
      .filter(x => x.len > pageDiag * 0.3).sort((a, b) => b.len - a.len).slice(0, 5);
    for (const A of colors) for (const B of colors) {
      if (A === B) continue;
      const pad = Math.max(A.box[2] - A.box[0], A.box[3] - A.box[1]) * 0.02;
      if (!(B.box[0] >= A.box[0] - pad && B.box[1] >= A.box[1] - pad && B.box[2] <= A.box[2] + pad && B.box[3] <= A.box[3] + pad)) continue;
      const bs = B.gs.filter(g => g.kind === CUT && g.length > pageDiag * 0.05);
      if (!bs.length || A.gs.some(g => g.kind === CREASE) || A.len < B.len * 0.3) continue;
      variants.push({ color: A.c, groups: A.gs.filter(g => g.kind === CUT).concat(bs.map(g => as(g, CREASE))), hasCrease: true, how: 'cor ' + B.c });
    }
    const goodEnough = () => results.some(r => !r.error && r.hinges.length >= 3);
    for (const v of variants.sort((a, b) => !!a.fallback - !!b.fallback)) {
      if (v.fallback && goodEnough()) continue;
      try {
        const r = build(vec, v.groups, v.hasCrease, opts);
        r.color = v.color; r.creaseBy = v.how;
        // sem marcação de vinco, qualquer linha vira dobra: só vale se nada melhor aparecer
        if (!v.hasCrease) r.score *= 0.3;
        results.push(r);
      } catch (e) { results.push({ color: v.color, how: v.how, error: e.message }); }
    }
    if (opts.debugAll) results.forEach(r => console.log('variante', r.color, r.creaseBy || r.how, r.error || `painéis ${r.panels.length} vincos ${r.hinges.length} soltos ${r.slits.length} score ${r.score.toFixed(1)}`));
    // prioridade pela força da evidência: vinco tracejado > vinco por cor/espessura > sem marcação
    const level = r => /^tracejado|^traço-ponto/.test(r.creaseBy || '') ? 3 : /^cor|^espessura/.test(r.creaseBy || '') ? 2 : 1;
    const ok = results.filter(r => !r.error).sort((a, b) => ((b.hinges.length >= 3) - (a.hinges.length >= 3)) || (level(b) - level(a)) || (b.score - a.score));
    if (!ok.length) { const e = new Error('Não encontrei a faca no PDF.'); e.details = results; throw e; }
    return ok[0];
  }

  function build(vec, groups, hasCrease, opts) {
    // segmentos
    let segs = [];
    groups.forEach(g => g.paths.forEach(pi => {
      const p = vec.paths[pi];
      for (const s of p.subs) {
        const pts = s.pts.slice();
        if (s.closed && pts.length > 2) pts.push(pts[0]);
        for (let k = 1; k < pts.length; k++) if (len(sub(pts[k], pts[k - 1])) > 1e-6) segs.push({ a: pts[k - 1], b: pts[k], kind: g.kind, src: pi });
      }
    }));
    if (segs.length < 8) throw new Error('poucos traços');
    // agrupamento em componentes conectadas (para separar o desenho principal do "perfil", cotas soltas etc.)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const s of segs) for (const p of [s.a, s.b]) { bx0 = Math.min(bx0, p[0]); by0 = Math.min(by0, p[1]); bx1 = Math.max(bx1, p[0]); by1 = Math.max(by1, p[1]); }
    const tolC = Math.hypot(bx1 - bx0, by1 - by0) * 0.004;
    const comps = components(segs, tolC);
    // componente principal: maior caixa envolvente que tenha vincos (ou a maior)
    comps.forEach(c => { c.area = (c.x1 - c.x0) * (c.y1 - c.y0); c.creases = c.segs.filter(s => segs[s].kind === CREASE).length; });
    const withC = comps.filter(c => c.creases > 0);
    const main = (withC.length ? withC : comps).sort((a, b) => b.area - a.area)[0];
    const pad = tolC;
    const inside = comps.filter(c => c === main || (c.x0 >= main.x0 - pad && c.x1 <= main.x1 + pad && c.y0 >= main.y0 - pad && c.y1 <= main.y1 + pad));
    segs = inside.flatMap(c => c.segs.map(i => segs[i]));
    const W = main.x1 - main.x0, H = main.y1 - main.y0, D = Math.hypot(W, H);
    const maxW = Math.max(...groups.map(g => g.width));
    const tol = opts.tol || Math.max(D * 0.0008, maxW * 0.8);
    extendDangling(segs, tol, D * 0.012);
    let structural = segs.filter(s => s.kind !== PERF);
    let graph = buildGraph(structural.map(s => ({ ...s })), tol);
    let F = faces(graph);
    // picotes retos que atravessam a estrutura de ponta a ponta são vincos picotados (ex.: parede dupla, "canoa")
    const srcLen = new Map();
    for (const s of structural) srcLen.set(s.src, (srcLen.get(s.src) || 0) + len(sub(s.b, s.a)));
    const aliveSegs = structural.filter(s => srcLen.get(s.src) > D * 0.03);
    const distTo = p => { let m = Infinity; for (const s of aliveSegs) { const d = sub(s.b, s.a), L2 = dot(d, d); const t = L2 ? Math.max(0, Math.min(1, dot(sub(p, s.a), d) / L2)) : 0; m = Math.min(m, len(sub(p, lerp(s.a, s.b, t)))); } return m; };
    const perfBySrc = new Map();
    segs.filter(s => s.kind === PERF).forEach(s => { let a = perfBySrc.get(s.src); if (!a) perfBySrc.set(s.src, a = []); a.push(s); });
    const promoted = [];
    for (const [, ps] of perfBySrc) {
      const pts = ps.flatMap(s => [s.a, s.b]);
      let e0 = pts[0], e1 = pts[0], bl = 0;
      for (const p of pts) for (const q of pts) { const l = len(sub(p, q)); if (l > bl) { bl = l; e0 = p; e1 = q; } }
      if (bl < D * 0.02) continue;
      const dir = sub(e1, e0);
      const straight = pts.every(p => Math.abs(crs(sub(p, e0), dir)) / bl < tol);
      if (straight && distTo(e0) < tol * 2.5 && distTo(e1) < tol * 2.5) promoted.push({ a: e0, b: e1, kind: CREASE, src: ps[0].src, perf: true });
    }
    if (promoted.length) {
      structural = structural.concat(promoted);
      graph = buildGraph(structural.map(s => ({ ...s })), tol);
      F = faces(graph);
    }
    const promotedSrc = new Set(promoted.map(p => p.src));
    // separa faces internas por componente (cada componente tem 1 laço externo)
    const compOfNode = unionNodes(graph);
    const loopsByComp = new Map();
    F.loops.forEach(l => { const c = compOfNode(l.hs[0].from); let a = loopsByComp.get(c); if (!a) loopsByComp.set(c, a = []); a.push(l); });
    // orientação: o laço externo é o de maior |área| da componente; faces internas têm o sinal oposto
    const panelLoops = [], holeLoops = [], outerLoops = [];
    for (const [, ls] of loopsByComp) {
      const outer = ls.reduce((a, b) => Math.abs(b.area) > Math.abs(a.area) ? b : a);
      outerLoops.push(outer);
      for (const l of ls) if (l !== outer && Math.sign(l.area) !== Math.sign(outer.area) && Math.abs(l.area) > tol * tol * 4) panelLoops.push(l);
    }
    // laço externo da componente principal = contorno da faca
    const mainOuter = outerLoops.reduce((a, b) => Math.abs(b.area) > Math.abs(a.area) ? b : a);
    const outline = mainOuter.poly;
    // faces: painéis; componentes internas viram furos se só tiverem corte
    const edgeKind = i => graph.edges[i].kind;
    const panels = [];
    const loopFace = new Map();
    for (const l of panelLoops) {
      const comp = compOfNode(l.hs[0].from);
      const isMain = comp === compOfNode(mainOuter.hs[0].from);
      const allCut = l.hs.every(h => edgeKind(h.edge) !== CREASE);
      const ip = interiorPoint(l.poly);
      if (!isMain) {
        // componente solta dentro da faca: furo (ou janela) — só se estiver dentro do contorno
        if (pointInPoly(ip, outline) && allCut) holeLoops.push(l);
        continue;
      }
      const f = { id: panels.length, poly: l.poly, area: Math.abs(l.area), loop: l, holes: [], ip };
      panels.push(f); loopFace.set(l.id, f);
    }
    // regiões "fechadas só por corte" dentro da componente principal sem vizinho por vinco: recortes (ex.: alça desenhada encostada)
    // atribui furos ao painel que os contém
    for (const h of holeLoops) {
      const ip = interiorPoint(h.poly);
      const host = panels.filter(f => pointInPoly(ip, f.poly)).sort((a, b) => a.area - b.area)[0];
      if (host) host.holes.push(h.poly);
    }
    // vincos entre painéis
    const hingeMap = new Map();
    const noDashInfo = !hasCrease;
    const halfByEdge = new Map();
    for (const h of F.half) { let a = halfByEdge.get(h.edge); if (!a) halfByEdge.set(h.edge, a = []); a.push(h); }
    graph.edges.forEach((e, i) => {
      if (!F.alive[i]) return;
      const isFold = e.kind === CREASE || (noDashInfo && (e.kind === CUT || e.kind === UNK));
      if (!isFold) return;
      // faces dos dois lados
      const hs = halfByEdge.get(i);
      const fa = loopFace.get(hs[0].loop), fb = loopFace.get(hs[1].loop);
      if (!fa || !fb || fa === fb) return;
      const key = fa.id < fb.id ? fa.id + '_' + fb.id : fb.id + '_' + fa.id;
      let hg = hingeMap.get(key);
      if (!hg) hingeMap.set(key, hg = { a: Math.min(fa.id, fb.id), b: Math.max(fa.id, fb.id), segs: [] });
      hg.segs.push([graph.nodes[e.u].p, graph.nodes[e.v].p]);
    });
    const hinges = [...hingeMap.values()].map((h, i) => {
      // linha da dobra: direção principal e extremos
      const pts = h.segs.flat();
      let best = null, bl = -1;
      for (let x = 0; x < pts.length; x++) for (let y = x + 1; y < pts.length; y++) { const l = len(sub(pts[x], pts[y])); if (l > bl) { bl = l; best = [pts[x], pts[y]]; } }
      const total = h.segs.reduce((s, q) => s + len(sub(q[1], q[0])), 0);
      // vinco curvo: soma dos trechos bem maior que a corda
      return { id: i, a: h.a, b: h.b, p0: best[0], p1: best[1], length: bl, curved: total > bl * 1.05, segs: h.segs };
    }).filter(h => h.length > tol * 3);
    // descarta painéis minúsculos isolados (sobras de desenho)
    const linked = new Set(hinges.flatMap(h => [h.a, h.b]));
    const minArea = D * D * 0.01;  // recortes (fendas, janelas) sem vinco não são painéis
    const keep = panels.filter(f => linked.has(f.id) || f.area > minArea);
    // picotes e cortes soltos (para desenhar)
    const perfs = segs.filter(s => s.kind === PERF && !promotedSrc.has(s.src)).map(s => [s.a, s.b]);
    const perfCreases = promoted.map(s => [s.a, s.b]);
    const slits = F.dangling.map(e => [graph.nodes[e.u].p, graph.nodes[e.v].p]);
    if (opts.debug) opts.debug({ graph, F, segs, structural });
    // pontuação
    const score = keep.length * 2 + hinges.length * 5 + (hasCrease ? 10 : 0) + Math.log(D + 1) - F.dangling.length * 0.5;
    if (!hinges.length) throw new Error('nenhum vinco encontrado');
    // peças: grupos de painéis ligados por vincos (uma folha pode ter várias caixas, ou tampa e fundo)
    const hk = hinges.filter(h => keep.includes(panels[h.a]) && keep.includes(panels[h.b]));
    const par = new Map(keep.map(f => [f.id, f.id]));
    const fnd = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    hk.forEach(h => par.set(fnd(h.a), fnd(h.b)));
    const pm = new Map();
    keep.forEach(f => { const r = fnd(f.id); let p = pm.get(r); if (!p) pm.set(r, p = { ids: [], area: 0, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }); p.ids.push(f.id); p.area += f.area; for (const q of f.poly) { p.x0 = Math.min(p.x0, q[0]); p.y0 = Math.min(p.y0, q[1]); p.x1 = Math.max(p.x1, q[0]); p.y1 = Math.max(p.y1, q[1]); } });
    const pieces = [...pm.values()].filter(p => p.ids.length >= 2).sort((a, b) => b.area - a.area);
    // peças iguais (cópias na mesma folha) ficam marcadas para não repetir na escolha
    pieces.forEach((p, i) => { p.copyOf = pieces.slice(0, i).findIndex(q => q.ids.length === p.ids.length && Math.abs(q.area - p.area) / q.area < 0.02); });
    return {
      panels: keep, hinges: hk, pieces,
      allPanels: panels, outline, perfs, perfCreases, slits, hasCrease, tol,
      bbox: { x0: main.x0, y0: main.y0, x1: main.x1, y1: main.y1 },
      score,
    };
  }

  function components(segs, tol) {
    const parent = segs.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const cell = tol * 10, grid = new Map();
    segs.forEach((s, i) => {
      const x0 = Math.min(s.a[0], s.b[0]) - tol, x1 = Math.max(s.a[0], s.b[0]) + tol, y0 = Math.min(s.a[1], s.b[1]) - tol, y1 = Math.max(s.a[1], s.b[1]) + tol;
      for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++) for (let b = Math.floor(y0 / cell); b <= Math.floor(y1 / cell); b++) {
        const k = a + ',' + b; let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(i);
      }
    });
    const segDist = (s, r) => {
      const pd = (p, q) => { const d = sub(q.b, q.a), L2 = dot(d, d); const t = L2 ? Math.max(0, Math.min(1, dot(sub(p, q.a), d) / L2)) : 0; return len(sub(p, lerp(q.a, q.b, t))); };
      const d1 = sub(s.b, s.a), d2 = sub(r.b, r.a), den = crs(d1, d2);
      if (Math.abs(den) > 1e-12) { const w = sub(r.a, s.a), t = crs(w, d2) / den, u = crs(w, d1) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0; }
      return Math.min(pd(s.a, r), pd(s.b, r), pd(r.a, s), pd(r.b, s));
    };
    const tested = new Set();
    for (const list of grid.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const i = list[x], j = list[y];
      if (find(i) === find(j)) continue;
      const k = i < j ? i * 1e6 + j : j * 1e6 + i; if (tested.has(k)) continue; tested.add(k);
      if (segDist(segs[i], segs[j]) <= tol) parent[find(i)] = find(j);
    }
    const m = new Map();
    segs.forEach((s, i) => {
      const r = find(i); let c = m.get(r);
      if (!c) m.set(r, c = { segs: [], x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
      c.segs.push(i);
      for (const p of [s.a, s.b]) { c.x0 = Math.min(c.x0, p[0]); c.y0 = Math.min(c.y0, p[1]); c.x1 = Math.max(c.x1, p[0]); c.y1 = Math.max(c.y1, p[1]); }
    });
    return [...m.values()];
  }
  function unionNodes(graph) {
    const parent = graph.nodes.map((_, i) => i);
    const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    graph.edges.forEach(e => { parent[find(e.u)] = find(e.v); });
    return find;
  }

  return { analyze, numbersIn, field, pointInPoly, polyArea, interiorPoint, dashKind, CUT, CREASE, PERF };
})();
if (typeof module !== 'undefined') module.exports = Dieline;
