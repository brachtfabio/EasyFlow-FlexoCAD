// ===== Arte =====
// Renderiza a área da faca no PDF escondendo traços técnicos (faca, cotas), ou gera um kraft liso
// com os picotes desenhados quando a ficha não tem arte.
const Texture = (() => {
  const hexOf = s => {
    if (typeof s !== 'string') return null;
    s = s.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : null;
  };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const near = (a, b, tol = 14) => { const x = rgb(a), y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < tol; };
  // cores típicas de anotação técnica (cotas em ciano/magenta) — não são impressas
  const isAnnotation = h => { const [r, g, b] = rgb(h); return (r < 40 && g > 140 && b > 200) || (r > 200 && g < 100 && b > 120); };

  async function renderArt(page, region, hide, maxSize) {
    const w = region.x1 - region.x0, h = region.y1 - region.y0;
    const scale = Math.min(maxSize / w, maxSize / h, Math.sqrt(16e6 / (w * h)));
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(w * scale)); cv.height = Math.max(2, Math.round(h * scale));
    const ctx = cv.getContext('2d');
    const hs = [...(hide.stroke || [])], hf = [...(hide.fill || [])];
    const hidS = s => { const x = hexOf(s); return x && hs.some(c => near(x, c)); };
    const hidF = s => { const x = hexOf(s); return x && hf.some(c => near(x, c)); };
    // o pdf.js desenha também em telas auxiliares (transparências), então o filtro vai no protótipo durante a renderização
    const proto = CanvasRenderingContext2D.prototype, saved = {};
    for (const fn of ['stroke', 'strokeRect', 'strokeText']) { const o = saved[fn] = proto[fn]; proto[fn] = function (...a) { if (hidS(this.strokeStyle)) return; return o.apply(this, a); }; }
    const ht = [...(hide.text || [])];
    const hidT = s => { const x = hexOf(s); return x && ht.some(c => near(x, c)); };
    for (const fn of ['fill', 'fillRect']) { const o = saved[fn] = proto[fn]; proto[fn] = function (...a) { if (hidF(this.fillStyle)) return; return o.apply(this, a); }; }
    { const o = saved.fillText = proto.fillText; proto.fillText = function (...a) { if (hidF(this.fillStyle) || hidT(this.fillStyle)) return; return o.apply(this, a); }; }
    try {
      const vp = page.getViewport({ scale, offsetX: -region.x0 * scale, offsetY: -region.y0 * scale });
      await page.render({ canvasContext: ctx, viewport: vp, background: 'rgb(255,255,255)' }).promise;
    } finally { Object.assign(proto, saved); }
    return cv;
  }

  // kraft liso (ficha técnica sem arte), com marcas de picote e cortes soltos
  function kraft(model, maxSize) {
    const ar = (model.W0 || model.W) / (model.H0 || model.H);
    const cv = document.createElement('canvas');
    cv.width = Math.round(ar >= 1 ? maxSize : maxSize * ar); cv.height = Math.round(ar >= 1 ? maxSize / ar : maxSize);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#c49a62'; ctx.fillRect(0, 0, cv.width, cv.height);
    // fibras sutis
    const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    for (let i = 0; i < cv.width * cv.height / 900; i++) {
      ctx.fillStyle = rnd() < .5 ? 'rgba(90,60,25,0.05)' : 'rgba(255,235,200,0.05)';
      ctx.fillRect(rnd() * cv.width, rnd() * cv.height, 1 + rnd() * 6, 1);
    }
    const P = q => { const uv = model.uvOf(q); return [uv[0] * cv.width, (1 - uv[1]) * cv.height]; };
    ctx.lineWidth = Math.max(1, cv.width / 1500);
    ctx.strokeStyle = 'rgba(60,40,20,0.55)'; ctx.setLineDash([cv.width / 300, cv.width / 400]);
    for (const s of model.perfs) { const a = P(s[0]), b = P(s[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(50,30,15,0.7)';
    for (const s of model.slits) { const a = P(s[0]), b = P(s[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    return cv;
  }

  // textura da borda (miolo ondulado entre as duas capas)
  function flute() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#7a5a33'; c.fillRect(0, 0, 128, 64);
    c.fillStyle = '#c9a36e'; c.fillRect(0, 0, 128, 9); c.fillRect(0, 55, 128, 9);
    c.strokeStyle = '#d6b27c'; c.lineWidth = 5; c.beginPath();
    for (let x = 0; x <= 128; x++) { const y = 32 + Math.sin(x / 128 * Math.PI * 2) * 20; x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    return cv;
  }
  // picotes e cortes soltos desenhados por cima da arte (a faca foi escondida na renderização)
  function overlayCuts(cv, model) {
    const ctx = cv.getContext('2d');
    const P = q => { const uv = model.uvOf(q); return [uv[0] * cv.width, (1 - uv[1]) * cv.height]; };
    const lw = Math.max(1, cv.width / 1800);
    ctx.save(); ctx.lineCap = 'butt';
    ctx.lineWidth = lw * 1.2; ctx.strokeStyle = 'rgba(40,30,20,0.55)'; ctx.setLineDash([lw * 6, lw * 5]);
    for (const s of model.perfs) { const a = P(s[0]), b = P(s[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(40,30,20,0.6)';
    for (const s of model.slits) { const a = P(s[0]), b = P(s[1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    ctx.restore();
    return cv;
  }
  return { renderArt, kraft, flute, isAnnotation, hexOf, near, overlayCuts };
})();
if (typeof module !== 'undefined') module.exports = Texture;
