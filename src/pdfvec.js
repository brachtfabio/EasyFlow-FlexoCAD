// ===== Leitor vetorial =====
// Lê a lista de operações do pdf.js e devolve todos os traços (com cor, espessura, tracejado)
// e preenchimentos como polilinhas em coordenadas da página (pt, origem no canto superior esquerdo),
// além dos textos com posição. Funciona no navegador e no Node (pdfjs-dist).
const PDFVec = (() => {
  const IDENT = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const toHex = a => {
    if (!a) return null;
    if (typeof a === 'string') return a.toLowerCase();
    if (typeof a[0] === 'string') return a[0].toLowerCase();
    return '#' + [a[0], a[1], a[2]].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  };
  function bez(p0, p1, p2, p3, out) {
    const n = Math.max(4, Math.min(24, Math.ceil((Math.hypot(p1[0]-p0[0], p1[1]-p0[1]) + Math.hypot(p2[0]-p1[0], p2[1]-p1[1]) + Math.hypot(p3[0]-p2[0], p3[1]-p2[1])) / 3)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]);
    }
  }

  async function read(pdfjsLib, page) {
    const OPS = pdfjsLib.OPS;
    const vp = page.getViewport({ scale: 1 });
    const V = vp.transform;                // PDF -> página (y para baixo)
    const ol = await page.getOperatorList();
    const st = { ctm: IDENT, stroke: '#000000', fill: '#000000', lw: 1, dash: [] };
    const stack = [];
    let subs = [], cur = null, curved = false;
    const paths = [];
    const P = (x, y) => { const m = mul(V, st.ctm); return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; };
    const scaleOf = () => { const m = mul(V, st.ctm); return Math.sqrt(Math.abs(m[0]*m[3] - m[1]*m[2])); };
    const emit = (stroke, fill) => {
      const s = subs.filter(sp => sp.pts.length > 1);
      if (s.length) {
        const k = scaleOf();
        paths.push({
          stroke: stroke ? st.stroke : null, fill: fill ? st.fill : null,
          width: st.lw * k, dash: (st.dash || []).map(d => d * k),
          subs: s.map(sp => ({ pts: sp.pts, closed: sp.closed })), curved,
        });
      }
      subs = []; cur = null; curved = false;
    };
    const { fnArray: fn, argsArray: args } = ol;
    for (let i = 0; i < fn.length; i++) {
      const f = fn[i], a = args[i];
      switch (f) {
        case OPS.save: stack.push({ ...st }); break;
        case OPS.restore: Object.assign(st, stack.pop() || {}); break;
        case OPS.transform: st.ctm = mul(st.ctm, a); break;
        case OPS.setStrokeRGBColor: st.stroke = toHex(a); break;
        case OPS.setFillRGBColor: st.fill = toHex(a); break;
        case OPS.setLineWidth: st.lw = a[0]; break;
        case OPS.setDash: st.dash = Array.from(a[0] || []); break;
        case OPS.setGState:
          for (const [k, v] of a[0]) { if (k === 'LW') st.lw = v; else if (k === 'D') st.dash = Array.from(v[0] || []); }
          break;
        case OPS.constructPath: {
          const ops = a[0], c = a[1]; let k = 0;
          for (const op of ops) {
            if (op === OPS.moveTo) { cur = { pts: [P(c[k], c[k+1])], closed: false }; subs.push(cur); k += 2; }
            else if (op === OPS.lineTo) { if (!cur) { cur = { pts: [], closed: false }; subs.push(cur); } cur.pts.push(P(c[k], c[k+1])); k += 2; }
            else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
              const n = op === OPS.curveTo ? 6 : 4;
              if (cur && cur.pts.length) {
                const p0 = cur.pts[cur.pts.length - 1];
                let p1, p2, p3;
                if (op === OPS.curveTo) { p1 = P(c[k], c[k+1]); p2 = P(c[k+2], c[k+3]); p3 = P(c[k+4], c[k+5]); }
                else if (op === OPS.curveTo2) { p1 = p0; p2 = P(c[k], c[k+1]); p3 = P(c[k+2], c[k+3]); }
                else { p1 = P(c[k], c[k+1]); p2 = P(c[k+2], c[k+3]); p3 = p2; }
                bez(p0, p1, p2, p3, cur.pts); curved = true;
              }
              k += n;
            }
            else if (op === OPS.closePath) { if (cur && cur.pts.length) { cur.closed = true; const s = cur.pts[0]; cur = { pts: [s], closed: false }; subs.push(cur); } }
            else if (op === OPS.rectangle) {
              const x = c[k], y = c[k+1], w = c[k+2], h = c[k+3]; k += 4;
              subs.push({ pts: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], closed: true }); cur = null;
            }
          }
          break;
        }
        case OPS.stroke: case OPS.closeStroke: emit(true, false); break;
        case OPS.fill: case OPS.eoFill: emit(false, true); break;
        case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: emit(true, true); break;
        case OPS.endPath: subs = []; cur = null; curved = false; break;
      }
    }
    const tc = await page.getTextContent();
    const texts = tc.items.filter(t => t.str && t.str.trim()).map(t => {
      const m = mul(V, t.transform);
      return { str: t.str, x: m[4], y: m[5], size: Math.hypot(m[2], m[3]), w: t.width, angle: Math.atan2(m[1], m[0]) };
    });
    return { width: vp.width, height: vp.height, paths, texts };
  }
  return { read };
})();
if (typeof module !== 'undefined') module.exports = PDFVec;
