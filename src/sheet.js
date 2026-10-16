// ===== Ficha → dados da caixa =====
// Identifica o tipo de ficha (impressão / técnica), lê os campos, acha a escala real (mm)
// e diz se o desenho está em vista interna (espelhado em relação ao lado impresso).
const Sheet = (() => {
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isLabel = s => /:\s*$/.test(s.trim());

  function field(texts, labels) {
    for (const label of [].concat(labels)) {
      const L = norm(label);
      const lab = texts.find(t => norm(t.str).startsWith(L));
      if (!lab) continue;
      const after = lab.str.slice(lab.str.indexOf(':') + 1).trim();
      if (after && !/^_+$/.test(after)) return after;
      const sz = lab.size || 8;
      const right = texts.filter(t => t !== lab && !isLabel(t.str) && Math.abs(t.y - lab.y) < sz * 0.7 && t.x > lab.x && t.x - lab.x < sz * 40)
        .sort((a, b) => a.x - b.x);
      // valor à direita, antes do próximo rótulo da mesma linha
      const nextLab = texts.filter(t => t !== lab && isLabel(t.str) && Math.abs(t.y - lab.y) < sz * 0.7 && t.x > lab.x).sort((a, b) => a.x - b.x)[0];
      const rr = right.filter(t => !nextLab || t.x < nextLab.x).filter(t => t.str.trim() && !/^_+$/.test(t.str.trim()));
      if (rr.length) {
        // só textos colados uns nos outros (evita pegar o cabeçalho da coluna ao lado)
        const out = [rr[0]];
        for (let i = 1; i < rr.length; i++) { const p = out[out.length - 1]; if (rr[i].x - (p.x + (p.w || p.str.length * sz * 0.5)) < sz * 1.5) out.push(rr[i]); else break; }
        return out.map(t => t.str.trim()).join(' ').replace(/^_+|_+$/g, '').trim();
      }
      const below = texts.filter(t => t !== lab && !isLabel(t.str) && t.y > lab.y && t.y - lab.y < sz * 2.6 && Math.abs(t.x - lab.x) < sz * 4)
        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
      if (below.length) return below[0].str.trim();
    }
    return null;
  }
  const nums = s => s ? (s.match(/\d+(?:[.,]\d+)?/g) || []).map(v => parseFloat(v.replace(',', '.'))) : [];

  function flute(text) {
    // espessura aproximada do papelão por tipo de onda (mm)
    const t = (text || '').toUpperCase();
    if (/\bBC\b|\bCB\b|DUPLA/.test(t)) return { onda: 'BC', esp: 6.5 };
    if (/\bEB\b|\bBE\b/.test(t)) return { onda: 'EB', esp: 4.5 };
    if (/\bC\b/.test(t)) return { onda: 'C', esp: 4 };
    if (/\bE\b/.test(t)) return { onda: 'E', esp: 1.6 };
    if (/\bB\b/.test(t)) return { onda: 'B', esp: 3 };
    return null;
  }

  function analyze(vec, DielineMod) {
    const D = DielineMod || (typeof Dieline !== 'undefined' ? Dieline : require('./dieline'));
    const texts = vec.texts;
    const all = norm(texts.map(t => t.str).join(' | '));
    const kind = /faca de corte|ficha de forma|arquivo da forma|item da forma/.test(all) && !/ajustes imp/.test(all) ? 'tecnica'
      : /ajustes imp|ficha de aprova|ficha de impress/.test(all) ? 'impressao' : 'desconhecida';
    const info = {
      cliente: field(texts, ['Cliente:']),
      produto: field(texts, ['Produto:']),
      item: field(texts, ['Item:', 'Item da Caixa:']),
      itemForma: field(texts, ['Item Forma:', 'Item da Forma:']),
      interna: field(texts, ['Med. Interna:', 'Medidas Internas:', 'M.I.:']),
      imp: field(texts, ['Ajustes Imp.:']),
      ond: field(texts, ['Ajustes Ond.:']),
      vista: field(texts, ['Vista:']),
      po: field(texts, ['PO:']),
      onda: field(texts, ['Onda:']),
      estilo: field(texts, ['Estilo:']),
      obs: field(texts, ['Obs.:']),
      // fichas de outros fornecedores: a medida costuma vir solta no texto, ex. "400x235x180" ou "300x150x100-30"
      medidaSolta: (texts.map(t => t.str).join(' ').match(/\b(\d{2,4})\s*[xX]\s*(\d{2,4})\s*[xX]\s*(\d{2,4})(?!\s*mm)/) || [])[0] || null,
      fornecedor: /trombini/.test(all) ? 'Trombini' : /flexograv/.test(all) ? 'Flexograv' : null,
    };
    let dl = null, err = null, outlined = false;
    try { dl = D.analyze(vec); } catch (e) { err = e; }
    if (!dl || dl.hinges.length < 3) {
      // faca exportada como contorno preenchido
      const OL = typeof Outline !== 'undefined' ? Outline : require('./outline');
      for (const v2 of OL.convert(vec).slice(0, 2)) {
        if (dl && dl._sc > 0 && dl.hinges.length >= 3) break;
        for (const k of [1, 1.8, 2.6]) {
          try {
            const w = Math.max(...v2.paths.map(p => p.width));
            const d2 = D.analyze(v2, { tol: w * k });
            const sc = d2.score - d2.slits.length * 0.5;
            if (!dl || sc > (dl._sc ?? dl.score)) { dl = d2; dl._sc = sc; outlined = true; }
          } catch (e) { }
        }
      }
    }
    if (!dl) throw err || new Error('Não encontrei a faca no PDF.');
    // problemas do próprio arquivo, mostrados como aviso no app
    const problems = [];
    // letras convertidas em curvas ao exportar (caso real: fichas Adair Andreazza): não há texto para ler
    if (texts.map(t => t.str).join('').replace(/[^A-Za-zÀ-ú]/g, '').length < 5)
      problems.push('a ficha não tem texto legível (as letras foram convertidas em curvas ao exportar o PDF), então não deu para ler cliente, produto e medidas');
    if (!info.interna && info.medidaSolta) info.interna = info.medidaSolta;
    // campo preenchido na linha errada (caso real: ficha Adilson Dalacua, a "Med. Interna" trazia os ajustes
    // "30 - 494 - 326 - 496 - 325" e a medida 480 X 310 X 252 estava na linha do Produto): usa a medida solta
    else if (info.medidaSolta && !/\d\s*[xX]\s*\d/.test(info.interna || '')) {
      problems.push(`os campos da ficha estão fora do lugar (a "Med. Interna" diz "${info.interna}"); usei a medida ${info.medidaSolta} escrita em outra linha`);
      info.interna = info.medidaSolta;
    }
    const bw = dl.bbox.x1 - dl.bbox.x0, bh = dl.bbox.y1 - dl.bbox.y0;
    let SX = null, SY = null, source = null;
    // 1) ficha de impressão: soma dos ajustes = largura e altura totais da chapa
    const imp = nums(info.imp), ond = nums(info.ond);
    if (imp.length) {
      const wmm = imp.reduce((a, b) => a + b, 0), hmm = ond.reduce((a, b) => a + b, 0);
      const sx = bw / wmm, sy = hmm ? bh / hmm : null;
      if (!sy || Math.abs(sx - sy) / sx < 0.06) { SX = sx; SY = sy || sx; source = 'ajustes da ficha'; }
      else if (hmm && Math.abs(bw / hmm - bh / wmm) / (bw / hmm) < 0.06) { SX = bw / hmm; SY = bh / wmm; source = 'ajustes da ficha'; }
    }
    // 2) ficha técnica: cotas totais (o maior par de números coerente com largura × altura do desenho)
    if (!SX) {
      const cand = texts.map(t => ({ v: parseFloat(t.str.replace(',', '.')), t })).filter(c => /^\s*\d{2,5}([.,]\d+)?\s*$/.test(c.t.str) && c.v > 10);
      const horiz = cand.filter(c => Math.abs(Math.sin(c.t.angle)) < 0.3), vert = cand.filter(c => Math.abs(Math.cos(c.t.angle)) < 0.3);
      let best = null;
      for (const h of horiz) for (const v of vert) {
        const sx = bw / h.v, sy = bh / v.v;
        const err = Math.abs(sx - sy) / sx;
        if (err < 0.015 && (!best || h.v + v.v > best.h + best.v)) best = { h: h.v, v: v.v, sx, sy };
      }
      if (best) { SX = best.sx; SY = best.sy; source = 'cotas do desenho'; info.total = [best.h, best.v]; }
    }
    // ajuste com um número só (ex.: "1912") às vezes é a chapa inteira com várias caixas: confere com a medida interna
    const scaleFromInterna = () => {
      const mi = nums(info.interna);
      if (mi.length !== 3) return null;
      let best = null;
      for (const p of dl.panels) {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of p.poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) {
          const sx = (x1 - x0) / mi[i], sy = (y1 - y0) / mi[j];
          if (Math.abs(sx - sy) / sx < 0.04 && (!best || p.area > best.area)) best = { area: p.area, s: (sx + sy) / 2 };
        }
      }
      return best ? best.s : null;
    };
    if (SX && imp.length === 1) {
      const s2 = scaleFromInterna();
      if (s2 && Math.abs(s2 - SX) / SX > 0.15) { SX = SY = s2; source = 'medidas internas'; }
    }
    // 3) medidas internas casadas com o maior painel de mesmas proporções
    if (!SX) {
      const mi = nums(info.interna);
      if (mi.length === 3) {
        let best = null;
        for (const p of dl.panels) {
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const q of p.poly) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) {
            const sx = (x1 - x0) / mi[i], sy = (y1 - y0) / mi[j];
            if (Math.abs(sx - sy) / sx < 0.04 && (!best || p.area > best.area)) best = { area: p.area, sx, sy };
          }
        }
        if (best) { SX = SY = (best.sx + best.sy) / 2; source = 'medidas internas'; }
      }
    }
    if (!SX) { SX = SY = 72 / 25.4; source = 'tamanho real do PDF'; }
    const mirror = kind === 'tecnica' ? !/extern/i.test(info.vista || 'interna') : /intern/i.test(info.vista || '');
    const fl = flute(info.onda) || flute((info.po || '').split(/\s+/).pop()) || { onda: '?', esp: 3 };
    return { kind, info, dieline: dl, outlined, SX, SY, scaleSource: source, mirror, flute: fl, page: { w: vec.width, h: vec.height }, problems };
  }
  return { analyze, field, nums };
})();
if (typeof module !== 'undefined') module.exports = Sheet;
