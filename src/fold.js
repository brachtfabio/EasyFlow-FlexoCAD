// ===== Modelo de dobra =====
// Converte a faca (coordenadas da página) em painéis em milímetros e calcula a pose 3D de cada painel
// para um dado instante da animação. Lado impresso = +z local de cada painel; o papelão tem
// espessura para dentro (-z). Cada vinco gira o painel filho em torno da linha do vinco.
const Fold = (() => {
  const THREE_ = typeof THREE !== 'undefined' ? THREE : require('three');
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  // ---------- montagem do modelo ----------
  function buildModel(sheet, opts = {}) {
    const dl = sheet.dieline, b = dl.bbox;
    const SX = sheet.SX, SY = sheet.SY, mir = !!sheet.mirror;
    const W = (b.x1 - b.x0) / SX, H = (b.y1 - b.y0) / SY;
    // página -> mm (origem no centro do desenho, y para cima, vista pelo lado impresso)
    const toMM0 = p => [((mir ? (b.x1 - p[0]) : (p[0] - b.x0)) / SX) - W / 2, -((p[1] - b.y0) / SY) + H / 2];
    // opts.rot = 1: gira o desenho 90° (faca desenhada "em pé", com os painéis empilhados na vertical)
    const rot = opts.rot ? 1 : 0;
    const R = q => rot ? [-q[1], q[0]] : q, Rinv = q => rot ? [q[1], -q[0]] : q;
    const toMM = p => R(toMM0(p));
    const fromMM = q => [mir ? b.x1 - (q[0] + W / 2) * SX : b.x0 + (q[0] + W / 2) * SX, b.y0 + (H / 2 - q[1]) * SY];
    // várias peças na folha: monta só a escolhida (padrão: a maior)
    const pieces = dl.pieces || [];
    const pick = pieces.length ? pieces[Math.min(opts.piece || 0, pieces.length - 1)] : null;
    const allow = pick ? new Set(pick.ids) : null;
    const panelsSel = allow ? dl.panels.filter(p => allow.has(p.id)) : dl.panels;
    const faces = panelsSel.map((p, i) => {
      const poly = p.poly.map(toMM), holes = p.holes.map(h => h.map(toMM));
      let cx = 0, cy = 0;
      const ip = toMM(p.ip);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const q of poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); cx += q[0]; cy += q[1]; }
      return { id: p.id, idx: i, poly, holes, ip, area: p.area / (SX * SY), bbox: [x0, y0, x1, y1], w: x1 - x0, h: y1 - y0, c: [cx / poly.length, cy / poly.length] };
    });
    const byId = new Map(faces.map(f => [f.id, f]));
    const hinges = dl.hinges.filter(h => byId.has(h.a) && byId.has(h.b)).map((h, i) => {
      const p0 = toMM(h.p0), p1 = toMM(h.p1);
      const d = [p1[0] - p0[0], p1[1] - p0[1]], L = Math.hypot(d[0], d[1]);
      return { id: i, a: byId.get(h.a).idx, b: byId.get(h.b).idx, p0, p1, len: L, dir: [d[0] / L, d[1] / L], curved: h.curved };
    });
    faces.forEach(f => f.hinges = []);
    hinges.forEach(h => { faces[h.a].hinges.push(h.id); faces[h.b].hinges.push(h.id); });
    const t = opts.thickness || (sheet.flute && sheet.flute.esp) || 3;
    return {
      rot, piece: opts.piece || 0, faces, hinges, W: rot ? H : W, H: rot ? W : H, W0: W, H0: H, thickness: t, toMM, fromMM,
      // coordenadas da arte na vista do lado impresso (vale também para geometria vinda da ficha técnica espelhada)
      uvOf: q => { const o = Rinv(q); return [(o[0] + W / 2) / W, (o[1] + H / 2) / H]; },
      perfs: (dl.perfs || []).map(s => s.map(toMM)), slits: (dl.slits || []).map(s => s.map(toMM)),
      sheet,
    };
  }

  // ---------- árvore de dobra a partir do painel raiz ----------
  function tree(model, root) {
    const n = model.faces.length;
    const parent = new Array(n).fill(-1), via = new Array(n).fill(-1), depth = new Array(n).fill(-1), order = [];
    depth[root] = 0; const q = [root];
    while (q.length) {
      const f = q.shift(); order.push(f);
      for (const hid of model.faces[f].hinges) {
        const h = model.hinges[hid], o = h.a === f ? h.b : h.a;
        if (depth[o] >= 0) continue;
        depth[o] = depth[f] + 1; parent[o] = f; via[o] = hid; q.push(o);
      }
    }
    // eixo de cada filho, orientado para que ângulo positivo leve o painel para trás do lado impresso (-z)
    const axis = new Array(n).fill(null);
    for (const f of order) {
      if (parent[f] < 0) continue;
      const h = model.hinges[via[f]];
      let d = h.dir.slice();
      const c = model.faces[f].ip;
      const r = [c[0] - h.p0[0], c[1] - h.p0[1]];
      if (d[0] * r[1] - d[1] * r[0] > 0) d = [-d[0], -d[1]];   // (d × r)_z < 0 → rotação positiva vai para -z
      axis[f] = { p: h.p0, d };
    }
    return { root, parent, via, depth, order, axis };
  }

  // ---------- linha do tempo ----------
  // prog: { hingeId: {angle(graus), stage} } ; T em [0,1]
  function timeline(prog) {
    const stages = [...new Set(Object.values(prog).map(p => p.stage))].sort((a, b) => a - b);
    const idx = new Map(stages.map((s, i) => [s, i]));
    return { stages, n: Math.max(1, stages.length), k: (hid, T) => { const p = prog[hid]; if (!p) return 0; const i = idx.get(p.stage); return ease(clamp01((T * stages.length - i))); } };
  }

  // matrizes locais e globais
  function poses(model, tr, prog, T, offsets) {
    const tl = timeline(prog);
    const M = new Array(model.faces.length);
    const tmp = new THREE_.Matrix4(), rot = new THREE_.Matrix4(), off = new THREE_.Matrix4();
    const ks = new Array(model.faces.length).fill(0);
    for (const f of tr.order) {
      const m = new THREE_.Matrix4();
      if (tr.parent[f] >= 0) {
        const ax = tr.axis[f], hid = tr.via[f], p = prog[hid] || { angle: 0 };
        const k = tl.k(hid, T); ks[f] = k;
        const ang = THREE_.MathUtils.degToRad(p.angle || 0) * k;
        m.copy(M[tr.parent[f]]);
        tmp.makeTranslation(ax.p[0], ax.p[1], 0); m.multiply(tmp);
        rot.makeRotationAxis(new THREE_.Vector3(ax.d[0], ax.d[1], 0), ang); m.multiply(rot);
        tmp.makeTranslation(-ax.p[0], -ax.p[1], 0); m.multiply(tmp);
      }
      if (offsets && offsets[f]) { off.makeTranslation(0, 0, offsets[f] * (tr.parent[f] >= 0 ? ks[f] : 1)); m.multiply(off); }
      M[f] = m;
    }
    return { M, ks };
  }

  // ---------- camadas: painéis que acabam no mesmo plano não podem se atravessar ----------
  function layerOffsets(model, tr, prog) {
    const n = model.faces.length, t = model.thickness;
    const offsets = new Array(n).fill(0);
    const tl = timeline(prog);
    const stageOf = f => tr.parent[f] < 0 ? -1 : (prog[tr.via[f]] || { stage: 0 }).stage;
    const sorted = [...tr.order].sort((a, b) => (stageOf(a) - stageOf(b)) || (tr.depth[a] - tr.depth[b]));
    const placed = [];
    const samplePts = f => {
      const F = model.faces[f], pts = [];
      const [x0, y0, x1, y1] = F.bbox, N = 15;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const p = [x0 + (x1 - x0) * (i + .5) / N, y0 + (y1 - y0) * (j + .5) / N];
        if (inPoly(p, F.poly) && !F.holes.some(h => inPoly(p, h))) pts.push(p);
      }
      if (!pts.length) pts.push(F.ip);
      return pts;
    };
    const samples = model.faces.map((_, f) => samplePts(f));
    const center = (() => { const { M } = poses(model, tr, prog, 1, null); const c = new THREE_.Vector3(); let w = 0; model.faces.forEach((F, f) => { if (!M[f]) return; c.add(new THREE_.Vector3(F.ip[0], F.ip[1], 0).applyMatrix4(M[f]).multiplyScalar(F.area)); w += F.area; }); return c.multiplyScalar(1 / w); })();
    for (let pass = 0; pass < 1; pass++) {
      for (const f of sorted) {
        const { M } = poses(model, tr, prog, 1, offsets);
        const nf = new THREE_.Vector3(0, 0, 1).transformDirection(M[f]);
        const of = new THREE_.Vector3().setFromMatrixPosition(M[f]);
        const myPts = samples[f].map(p => new THREE_.Vector3(p[0], p[1], 0).applyMatrix4(M[f]));
        let shift = 0;
        for (const g of placed) {
          const ng = new THREE_.Vector3(0, 0, 1).transformDirection(M[g]);
          if (Math.abs(nf.dot(ng)) < 0.995) continue;
          // distância entre os planos impressos ao longo de nf
          const og = new THREE_.Vector3(0, 0, 0).applyMatrix4(M[g]);
          const dist = og.clone().sub(myPts[0]).dot(nf);
          // intervalos de material ao longo de nf (meu: [-t,0]; dele: depende da orientação)
          const gLo = ng.dot(nf) > 0 ? dist - t : dist, gHi = ng.dot(nf) > 0 ? dist : dist + t;
          const mLo = -t + shift, mHi = shift;
          if (mHi <= gLo + t * 0.05 || mLo >= gHi - t * 0.05) continue;
          // sobreposição no plano?
          const inv = new THREE_.Matrix4().copy(M[g]).invert();
          let hits = 0;
          for (const P of myPts) { const q = P.clone().applyMatrix4(inv); const p2 = [q.x, q.y]; if (inPoly(p2, model.faces[g].poly) && !model.faces[g].holes.some(h => inPoly(p2, h))) hits++; }
          if (hits < 1) continue;
          // fica do lado de onde o painel chega durante a dobra (quem dobra depois fica por cima)
          const up = gHi - mLo, down = mHi - gLo;
          let dirSign = 0;
          if (tr.parent[f] >= 0) {
            // último movimento que leva este painel (dele mesmo ou de um painel acima na árvore)
            let st = -Infinity;
            for (let a = f; tr.parent[a] >= 0; a = tr.parent[a]) { const p = prog[tr.via[a]]; if (p && p.angle) st = Math.max(st, p.stage); }
            const i = Math.max(0, tl.stages.indexOf(st));
            const Tpre = (i + 0.85) / tl.stages.length;
            const pre = poses(model, tr, prog, Tpre, offsets).M[f];
            const cF = new THREE_.Vector3(model.faces[f].ip[0], model.faces[f].ip[1], 0);
            const a1 = cF.clone().applyMatrix4(pre), a2 = cF.clone().applyMatrix4(M[f]);
            const dd = a1.sub(a2).dot(nf);
            if (Math.abs(dd) > t * 0.3) dirSign = Math.sign(dd);
          }
          if (!dirSign) { const dc = center.clone().sub(myPts[0]).dot(nf); dirSign = dc >= 0 ? 1 : -1; }   // sem aproximação clara: para dentro da caixa
          // sobreposição pequena de um lado só (ex.: alças encostadas): menor deslocamento; senão, lado de chegada
          if (ng.dot(nf) < 0) shift += dist <= t * 0.05 ? up : -down;   // faces opostas: costas com costas se afastam pelo lado de fora de cada uma
          else shift += dirSign > 0 ? up : dirSign < 0 ? -down : (up <= down ? up : -down);
        }
        if (shift) offsets[f] = shift;
        placed.push(f);
      }
    }
    return offsets;
  }
  function inPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  return { buildModel, tree, poses, timeline, layerOffsets, inPoly, ease };
})();
if (typeof module !== 'undefined') module.exports = Fold;
