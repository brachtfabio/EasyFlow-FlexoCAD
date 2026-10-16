// ===== Faca exportada como contorno =====
// Alguns programas exportam as linhas da faca como formas preenchidas finas ("contorno do traço").
// Aqui elas viram linhas de novo: faixas abertas → linha central; tracinhos alinhados → vinco.
const Outline = (() => {
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  function stats(pts) {
    let A = 0, P = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; A += a[0] * b[1] - b[0] * a[1]; P += len(a, b); }
    return { A: Math.abs(A) / 2, P };
  }
  function resample(chain, n) {
    const d = [0]; for (let i = 1; i < chain.length; i++) d.push(d[i - 1] + len(chain[i - 1], chain[i]));
    const L = d[d.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const s = L * k / (n - 1); let i = 1; while (i < d.length - 1 && d[i] < s) i++;
      const t = d[i] > d[i - 1] ? (s - d[i - 1]) / (d[i] - d[i - 1]) : 0;
      out.push([chain[i - 1][0] + (chain[i][0] - chain[i - 1][0]) * t, chain[i - 1][1] + (chain[i][1] - chain[i - 1][1]) * t]);
    }
    return out;
  }
  // faixa fina (contorno de um traço aberto) → linha central
  function centerline(pts) {
    // extremos: par de pontos mais distante
    let a = 0, b = 0, best = -1;
    const step = Math.max(1, Math.floor(pts.length / 200));
    for (let i = 0; i < pts.length; i += step) for (let j = i + 1; j < pts.length; j += step) { const l = len(pts[i], pts[j]); if (l > best) { best = l; a = i; b = j; } }
    if (a > b) [a, b] = [b, a];
    const c1 = pts.slice(a, b + 1), c2 = pts.slice(b).concat(pts.slice(0, a + 1)).reverse();
    const n = Math.max(2, Math.min(60, Math.ceil(Math.max(c1.length, c2.length))));
    const r1 = resample(c1, n), r2 = resample(c2, n);
    return r1.map((p, i) => [(p[0] + r2[i][0]) / 2, (p[1] + r2[i][1]) / 2]);
  }

  function convert(vec) {
    // escolhe a cor das formas finas com maior comprimento total
    const byColor = new Map();
    vec.paths.forEach(p => {
      if (!p.fill || p.stroke) return;
      for (const s of p.subs) {
        if (s.pts.length < 3) continue;
        const { A, P } = stats(s.pts); const th = 2 * A / P;
        if (P < 4 || th > 8) continue;
        let g = byColor.get(p.fill); if (!g) byColor.set(p.fill, g = { color: p.fill, items: [], len: 0, th: [] });
        g.items.push({ pts: s.pts, th, P, A }); g.len += P / 2; g.th.push(th);
      }
    });
    const cands = [...byColor.values()].filter(g => !/^#f[0-9a-f]f[0-9a-f]f/.test(g.color) && g.items.length > 10).sort((a, b) => b.len - a.len);
    const results = [];
    for (const g of cands.slice(0, 3)) {
      const th = g.th.sort((a, b) => a - b)[g.th.length >> 1];
      // espessura típica da linha: descarta formas grossas demais para serem linha
      const items = g.items.filter(it => it.th < th * 2.2);
      const pca = pts => {
        let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
        let xx = 0, xy = 0, yy = 0; for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
        const ang = 0.5 * Math.atan2(2 * xy, xx - yy), u = [Math.cos(ang), Math.sin(ang)];
        const pr = pts.map(p => (p[0] - cx) * u[0] + (p[1] - cy) * u[1]); const lo = Math.min(...pr), hi = Math.max(...pr);
        // as pontas da faixa incluem metade da espessura: recua para a linha central
        return [[cx + u[0] * lo, cy + u[1] * lo], [cx + u[0] * hi, cy + u[1] * hi]];
      };
      const lines = items.map(it => {
        const box = pca(it.pts), chord = len(box[0], box[1]);
        // peça reta (retângulo fino): eixo principal; peça curva: linha central
        // retângulo equivalente: largura w e comprimento l com w+l = P/2 e w·l = área
        const hp = it.P / 2, disc = Math.max(0, hp * hp - 4 * it.A), w = (hp - Math.sqrt(disc)) / 2, l = hp - w;
        const straight = chord > l * 0.97;
        return { pts: straight ? box : centerline(it.pts), L: it.P / 2, straight };
      });
      const Ls = lines.map(l => len(l.pts[0], l.pts[l.pts.length - 1]));
      // tracinhos: peças curtas e retas → vinco; o resto → corte
      const diag = Math.hypot(vec.width, vec.height);
      const short = diag * 0.012;
      const paths = [];
      lines.forEach((l, i) => {
        const straight = l.straight;
        const isDash = straight && Ls[i] < short;
        paths.push({ stroke: g.color, fill: null, width: th, dash: isDash ? [-1] : [], subs: [{ pts: l.pts, closed: false }], curved: !straight, synthetic: true, dashPiece: isDash });
      });
      results.push({ color: g.color, paths: joinDashes(paths, th) });
    }
    return results.map(r => ({ width: vec.width, height: vec.height, texts: vec.texts, paths: r.paths, synthetic: true, color: r.color }));
  }

  // une tracinhos alinhados em linhas de vinco contínuas
  function joinDashes(paths, th) {
    const dashes = paths.filter(p => p.dashPiece), rest = paths.filter(p => !p.dashPiece);
    const used = new Set(), out = [];
    const seg = p => { const q = p.subs[0].pts; return [q[0], q[q.length - 1]]; };
    const dir = s => { const d = [s[1][0] - s[0][0], s[1][1] - s[0][1]], L = Math.hypot(d[0], d[1]); return [d[0] / L, d[1] / L]; };
    dashes.forEach((p, i) => {
      if (used.has(i)) return;
      used.add(i);
      const s = seg(p), u = dir(s), pts = [s[0], s[1]];
      let grew = true;
      while (grew) {
        grew = false;
        dashes.forEach((q, j) => {
          if (used.has(j)) return;
          const r = seg(q), v = dir(r);
          if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 0.05) return;
          // colinear e perto de uma das pontas
          const off = Math.abs((r[0][0] - pts[0][0]) * u[1] - (r[0][1] - pts[0][1]) * u[0]);
          if (off > th * 1.5) return;
          const proj = x => (x[0] - pts[0][0]) * u[0] + (x[1] - pts[0][1]) * u[1];
          const lo = Math.min(...pts.map(proj)), hi = Math.max(...pts.map(proj));
          const a = Math.min(proj(r[0]), proj(r[1])), b = Math.max(proj(r[0]), proj(r[1]));
          const gap = Math.max(a - hi, lo - b);
          if (gap > Math.max(th * 6, (b - a) * 2.5)) return;
          pts.push(r[0], r[1]); used.add(j); grew = true;
        });
      }
      const proj = x => (x[0] - s[0][0]) * u[0] + (x[1] - s[0][1]) * u[1];
      const ps = pts.map(proj), lo = Math.min(...ps), hi = Math.max(...ps);
      const A = [s[0][0] + u[0] * lo, s[0][1] + u[1] * lo], B = [s[0][0] + u[0] * hi, s[0][1] + u[1] * hi];
      out.push({ ...p, dash: [3, 3], subs: [{ pts: [A, B], closed: false }], dashPiece: false });
    });
    return rest.concat(out);
  }
  return { convert, centerline, _dbg: {} };
})();
if (typeof module !== 'undefined') module.exports = Outline;
