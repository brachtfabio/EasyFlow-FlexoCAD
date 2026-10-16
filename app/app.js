// ===== Aplicativo =====
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const V = Viewer.create($('c'));
  let sheets = [];          // fichas carregadas
  let cur = null;           // caixa em exibição
  let fold = 1, anim = null, spin = false, sel = -1, panel = null, selLine = null;
  let thickness = null;     // espessura escolhida pelo usuário (mm) ou automática
  let preferTech = false;   // usar a geometria da ficha técnica mesmo havendo faca na de impressão
  let piece = 0;            // folha com várias caixas: qual montar
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- utilidades de interface ----------
  function setBusy(t) { $('busy').hidden = !t; if (t) $('busy').textContent = t; }
  function showMsg(t) { $('msg').hidden = !t; $('msg').textContent = t || ''; }
  let toastT = 0;
  function toast(t) { $('toast').textContent = t; $('toast').hidden = false; clearTimeout(toastT); toastT = setTimeout(() => $('toast').hidden = true, 2600); }

  // ---------- estilos salvos ----------
  const KEY = 'montador-caixa-estilos';
  const signature = m => `${m.faces.length}-${m.hinges.length}-${Math.round(m.W / 5) * 5}x${Math.round(m.H / 5) * 5}`;
  const loadStyles = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const saveStyles = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; } };

  // ---------- leitura dos PDFs ----------
  async function addFiles(files) {
    const pdfs = [...files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { showMsg('Envie arquivos PDF.'); return; }
    if (!window.pdfjsLib) { showMsg('Não consegui carregar o leitor de PDF. Verifique a conexão e recarregue a página.'); return; }
    showMsg(null);
    for (const file of pdfs) {
      setBusy(`Lendo ${file.name}…`);
      try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        let entry = null;
        for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
          const page = await doc.getPage(n);
          const vec = await PDFVec.read(pdfjsLib, page);
          try { const sh = Sheet.analyze(vec); entry = { name: file.name, kind: sh.kind, page, vec, sheet: sh }; break; }
          catch (e) { if (!entry) entry = { name: file.name, kind: guessKind(vec), page, vec, sheet: null, error: e.message }; }
        }
        // uma ficha de cada tipo: a nova substitui a anterior do mesmo tipo
        sheets = sheets.filter(s => s.kind !== entry.kind && !s.sample);
        sheets.push(entry);
      } catch (e) { showMsg(`Não consegui abrir ${file.name}: ${e.message}`); }
    }
    preferTech = false; sel = -1; piece = 0;
    await rebuild();
    setBusy(null);
  }
  function guessKind(vec) {
    const t = vec.texts.map(x => x.str).join(' ').toLowerCase();
    return /faca de corte|ficha de forma|item da forma/.test(t) && !/ajustes imp/.test(t) ? 'tecnica' : 'impressao';
  }

  // ---------- montagem ----------
  async function rebuild(keepView) {
    const print = sheets.find(s => s.kind !== 'tecnica'), tech = sheets.find(s => s.kind === 'tecnica');
    const printOK = print && print.sheet && print.sheet.dieline && print.sheet.dieline.hinges.length >= 3;
    const techOK = tech && tech.sheet;
    let geom = null, warns = [];
    if (preferTech && techOK) geom = tech;
    else if (printOK && !(print.sheet.outlined && techOK)) geom = print;
    else if (techOK) geom = tech;
    else if (print && print.sheet) geom = print;
    renderChips(print, tech, geom);
    if (!geom) {
      cur = null;
      showMsg('Não encontrei a faca nesse PDF. O app precisa da faca desenhada em vetor (linhas de corte e vinco). Se tiver a ficha técnica (forma), envie junto.');
      return;
    }
    setBusy('Montando a caixa…');
    const pieceList = (geom.sheet.dieline.pieces || []).map((p, i) => ({ ...p, i })).filter(p => p.copyOf < 0);
    if (!pieceList.some(p => p.i === piece)) piece = pieceList.length ? pieceList[0].i : 0;
    let { model, recipe } = Styles.auto(geom.sheet, { thickness: thickness || undefined, piece });
    const sig = signature(model) + (piece ? '-p' + piece : '');
    const saved = loadStyles()[sig];
    const auto = JSON.parse(JSON.stringify(recipe));
    if (saved) { recipe = { ...recipe, ...saved, prog: { ...recipe.prog, ...saved.prog }, savedStyle: true }; }
    // arte
    let art = null, hide = null, colors = [];
    if (print && print.page && (print.sheet || geom === tech)) {
      const region = print.sheet ? print.sheet.dieline.bbox : null;
      if (region) {
        const prev = cur && cur.printName === print.name ? cur.hide : null;
        hide = prev || defaultHide(print);
        colors = layerColors(print);
        art = await Texture.renderArt(print.page, region, hide, Math.min(4096, V.renderer.capabilities.maxTextureSize));
        Texture.overlayCuts(art, model);
      } else warns.push('a ficha de impressão não tem a faca, então a arte não pôde ser posicionada');
    }
    if (!art) art = Texture.kraft(model, 2048);
    if (print && !print.sheet && !techOK) warns.push(print.error || 'faca não encontrada');
    if (geom.sheet.scaleSource === 'tamanho real do PDF') warns.push('não achei as medidas escritas na ficha; usei o tamanho do desenho');
    if (geom.sheet.outlined) warns.push('a faca veio como contorno preenchido e foi reconstruída; confira os detalhes ou envie também a ficha técnica');
    if (print && tech && print.sheet && tech.sheet) {
      const c = compare(print.sheet, tech.sheet);
      if (c.bad) warns.push(`a conferência encontrou ${c.bad} diferença${c.bad > 1 ? 's' : ''} entre as fichas (abra "Conferência")`);
    }
    cur = { model, recipe, auto, art, hide, colors, geom, print, tech, sig, printName: print && print.name, warns, pieceList };
    V.setBox({ model, recipe, art });
    fold = 1; $('fold').value = 1000; V.setT(1); updPlay(); renderTicks();
    if (!keepView) V.frame('iso', true);
    renderSpecs(); renderSide();
    showMsg(warns.length ? 'Atenção: ' + warns.join('; ') + '.' : null);
    if (saved) toast('Estilo salvo para esta faca aplicado');
    setBusy(null);
  }
  function defaultHide(print) {
    const stroke = new Set(), fill = new Set(), text = new Set();
    if (print.sheet && !print.sheet.outlined) stroke.add(print.sheet.dieline.color);
    if (print.sheet && print.sheet.outlined) fill.add(print.sheet.dieline.color);
    // cotas escritas na cor da faca (comum em fichas de outros fornecedores): somem da arte quando a cor não é preta
    if (print.sheet) { const c = print.sheet.dieline.color, [r, g, b] = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)); if (0.3 * r + 0.59 * g + 0.11 * b > 70) { text.add(c); fill.add(c); } }
    print.vec.paths.forEach(p => {
      if (p.stroke && Texture.isAnnotation(p.stroke)) stroke.add(p.stroke);
      if (p.fill && Texture.isAnnotation(p.fill)) fill.add(p.fill);
    });
    return { stroke, fill, text };
  }
  function layerColors(print) {
    const m = new Map();
    print.vec.paths.forEach(p => { if (p.stroke) m.set(p.stroke, (m.get(p.stroke) || 0) + 1); });
    const list = [...m.entries()].filter(([c]) => !/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/.test(c)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
    if (print.sheet && !list.includes(print.sheet.dieline.color)) list.unshift(print.sheet.dieline.color);
    return list;
  }

  // ---------- conferência entre ficha de impressão e ficha técnica ----------
  function measures(sheet) {
    const { model: m, recipe: r } = Styles.auto(sheet);
    const tr = Fold.tree(m, r.root);
    const { M } = Fold.poses(m, tr, r.prog, 1, null);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    m.faces.forEach((F, f) => { if (M[f]) F.poly.forEach(p => box.expandByPoint(v.set(p[0], p[1], 0).applyMatrix4(M[f]))); });
    const s = box.getSize(new THREE.Vector3());
    const rsc = Styles.detectRSC(m);
    let panels = null, body = null;
    if (rsc) { panels = rsc.panels.map(f => m.faces[f].w).sort((a, b) => a - b); body = m.faces[rsc.panels[0]].h; }
    const dims = [s.x, s.y, s.z].sort((a, b) => b - a);
    return { model: m, W: m.W, H: m.H, panels, body, dims, faces: m.faces.length, hinges: m.hinges.length, interna: sheet.info.interna };
  }
  function compare(a, b) {
    const A = measures(a), B = measures(b), rows = [];
    const tol = 2.5;
    const add = (label, x, y) => rows.push({ label, x, y, bad: x != null && y != null && Math.abs(x - y) > tol });
    add('Chapa aberta — largura', A.W, B.W);
    add('Chapa aberta — altura', A.H, B.H);
    if (A.panels && B.panels) A.panels.forEach((p, i) => add(`Painel ${i + 1}`, p, B.panels[i]));
    if (A.body && B.body) add('Altura do corpo', A.body, B.body);
    ['Montada — maior', 'Montada — média', 'Montada — menor'].forEach((l, i) => add(l, A.dims[i], B.dims[i]));
    add('Painéis encontrados', A.faces, B.faces); rows[rows.length - 1].count = true; rows[rows.length - 1].bad = A.faces !== B.faces;
    add('Vincos encontrados', A.hinges, B.hinges); rows[rows.length - 1].count = true; rows[rows.length - 1].bad = A.hinges !== B.hinges;
    return { A, B, rows, bad: rows.filter(r => r.bad).length };
  }

  // ---------- painéis de interface ----------
  function renderChips(print, tech, geom) {
    const chip = (s, role) => s ? `<span class="chip"><span class="role">${role}</span><b>${esc(s.name)}</b>${s === geom ? ' <span class="role">· faca</span>' : ''}<button data-rm="${esc(s.name)}" aria-label="Remover ${esc(s.name)}">×</button></span>` : '';
    $('chips').innerHTML = chip(print && print.sample ? null : print, 'Impressão') + chip(tech, 'Técnica');
    $('chips').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { sheets = sheets.filter(s => s.name !== b.dataset.rm); if (sheets.length) rebuild(); else loadSample(); });
    const main = print || tech;
    const info = main && main.sheet ? main.sheet.info : {};
    $('title').innerHTML = esc(info.produto || info.cliente || (main ? main.name.replace(/\.pdf$/i, '') : 'Caixa')) + (info.item ? `<small>item ${esc(info.item)}</small>` : '');
  }
  function boxDims() {
    const st = V.state; if (!st) return null;
    const { M } = Fold.poses(st.model, st.tr, st.recipe.prog, 1, st.offsets);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    st.model.faces.forEach((F, f) => { if (M[f]) F.poly.forEach(p => box.expandByPoint(v.set(p[0], p[1], 0).applyMatrix4(M[f]))); });
    const s = box.getSize(new THREE.Vector3());
    return [s.x, s.y, s.z];
  }
  function renderSpecs() {
    if (!cur) { $('specs').innerHTML = ''; return; }
    const g = cur.geom.sheet, d = boxDims() || [0, 0, 0];
    const outer = cur.recipe.orient === 'base' ? [d[0], d[1], d[2]] : [d[0], d[2], d[1]];
    const okSrc = g.scaleSource !== 'tamanho real do PDF';
    $('specs').innerHTML = `
      <span class="style">${esc(cur.recipe.label)}${cur.recipe.savedStyle ? ' · estilo salvo' : ''}</span>
      ${cur.pieceList && cur.pieceList.length > 1 ? `<span class="pieces" role="group" aria-label="Peças da folha">Peça ${cur.pieceList.map((p, k) => `<button data-piece="${p.i}" class="${p.i === piece ? 'on' : ''}">${k + 1}</button>`).join('')}</span>` : ''}
      <span>Montada <b>${outer.map(v => Math.round(v)).join(' × ')}</b> mm</span>
      <span>Chapa <b>${Math.round(cur.model.W)} × ${Math.round(cur.model.H)}</b></span>
      ${g.info.interna ? `<span>Interna <b>${esc(g.info.interna)}</b></span>` : ''}
      <span>Papelão <b>${fmt(cur.model.thickness)} mm</b>${g.flute && g.flute.onda !== '?' && !thickness ? ` (onda ${esc(g.flute.onda)})` : ''}</span>
      <span class="src ${okSrc ? 'ok' : 'warn'}">Escala: ${esc(g.scaleSource)}</span>
      <span class="tools">
        <button data-panel="dobras" class="${panel === 'dobras' ? 'on' : ''}">Dobras</button>
        <button data-panel="conf" class="${panel === 'conf' ? 'on' : ''}">Conferência</button>
        <button data-panel="arte" class="${panel === 'arte' ? 'on' : ''}">Arte e papelão</button>
      </span>`;
    $('specs').querySelectorAll('[data-piece]').forEach(b => b.onclick = () => { piece = +b.dataset.piece; sel = -1; rebuild(); });
    $('specs').querySelectorAll('[data-panel]').forEach(b => b.onclick = () => { panel = panel === b.dataset.panel ? null : b.dataset.panel; renderSpecs(); renderSide(); });
  }
  function renderSide() {
    const el = $('side'), wasHidden = el.hidden;
    if (!panel || !cur) { el.hidden = true; clearSel(); if (!wasHidden) setTimeout(() => V.frame('iso'), 60); return; }
    el.hidden = false;
    const close = `<button data-close aria-label="Fechar painel">×</button>`;
    if (panel === 'dobras') el.innerHTML = editorHTML(close);
    else if (panel === 'conf') el.innerHTML = confHTML(close);
    else el.innerHTML = arteHTML(close);
    el.querySelector('[data-close]').onclick = () => { panel = null; renderSpecs(); renderSide(); };
    if (panel === 'dobras') bindEditor(); else if (panel === 'conf') drawOverlay(); else bindArte();
    if (el.hidden !== wasHidden) setTimeout(() => V.frame('iso'), 60);
  }

  // ---------- editor de dobras ----------
  function editorHTML(close) {
    const st = V.state, m = cur.model, r = cur.recipe;
    let selHTML = '<p>Clique num painel da caixa para editar a dobra dele.</p>';
    if (sel >= 0 && st && st.tr.depth[sel] >= 0) {
      const F = m.faces[sel], par = st.tr.parent[sel];
      if (par < 0) selHTML = `<div class="sel"><div class="t">Painel ${F.id}<span>${Math.round(F.w)} × ${Math.round(F.h)} mm</span></div><p>Este é o painel base: fica parado e os outros dobram em volta dele.</p></div>`;
      else {
        const hid = st.tr.via[sel], p = r.prog[hid] || { angle: 0, stage: 1 };
        selHTML = `<div class="sel">
          <div class="t">Painel ${F.id}<span>${Math.round(F.w)} × ${Math.round(F.h)} mm · preso ao ${m.faces[par].id}</span></div>
          <div class="field"><label for="ang">Ângulo da dobra (graus)</label>
            <div class="row"><input type="number" id="ang" step="5" value="${p.angle}">
              ${[-180, -90, 0, 90, 180].map(a => `<button data-a="${a}">${a > 0 ? '+' : ''}${a}°</button>`).join('')}</div>
            <p>Positivo dobra para dentro (o lado impresso fica para fora). Negativo dobra ao contrário.</p></div>
          <div class="field"><label for="stg">Etapa</label>
            <div class="row"><button data-s="-1" aria-label="Etapa anterior">−</button><input type="number" id="stg" step="0.5" value="${p.stage}"><button data-s="1" aria-label="Próxima etapa">+</button></div>
            <p>Painéis da mesma etapa dobram juntos; quem dobra depois fica por cima.</p></div>
          <div class="row"><button id="mkroot">Usar como painel base</button></div>
        </div>`;
      }
    }
    return `<h2>Dobras ${close}</h2>
      ${selHTML}
      <div class="field"><span class="lbl">Posição da caixa</span>
        <div class="row"><button data-or="front" class="${r.orient !== 'base' ? 'on' : ''}">Em pé</button><button data-or="base" class="${r.orient === 'base' ? 'on' : ''}">Deitada (pelo fundo)</button></div></div>
      ${(r.notes || []).map(n => `<p>${esc(n)}</p>`).join('')}
      <div class="field"><span class="lbl">Estilo desta faca</span>
        <div class="row"><button id="savest">Salvar estilo</button><button id="resetst">Voltar ao automático</button></div>
        <p>O estilo salvo é aplicado sozinho quando uma faca igual for aberta neste navegador.</p>
        <div class="row"><button id="copyst">Copiar estilo</button><button id="pastest">Colar estilo</button></div>
        <textarea id="sttext" hidden placeholder="Cole aqui o estilo copiado e clique em Aplicar"></textarea>
        <div class="row"><button id="applyst" hidden>Aplicar</button></div></div>`;
  }
  function bindEditor() {
    const st = V.state, r = cur.recipe;
    const hid = sel >= 0 && st.tr.parent[sel] >= 0 ? st.tr.via[sel] : null;
    const set = (k, v) => { if (hid == null) return; r.prog[hid] = { ...(r.prog[hid] || { angle: 90, stage: 1 }), [k]: v }; r.savedStyle = false; applyRecipe(); };
    const ang = $('ang'), stg = $('stg');
    if (ang) ang.onchange = () => set('angle', +ang.value || 0);
    document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => set('angle', +b.dataset.a));
    if (stg) stg.onchange = () => set('stage', +stg.value || 0);
    document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => set('stage', (r.prog[hid]?.stage || 0) + (+b.dataset.s)));
    const mk = $('mkroot'); if (mk) mk.onclick = () => { r.root = sel; applyRecipe(); };
    document.querySelectorAll('[data-or]').forEach(b => b.onclick = () => { r.orient = b.dataset.or; applyRecipe(true); });
    $('savest').onclick = () => {
      const all = loadStyles(); all[cur.sig] = { root: r.root, orient: r.orient, prog: r.prog, label: r.label };
      toast(saveStyles(all) ? 'Estilo salvo para esta faca' : 'Este navegador não permite salvar; use "Copiar estilo"');
      r.savedStyle = true; renderSpecs();
    };
    $('resetst').onclick = () => { const all = loadStyles(); delete all[cur.sig]; saveStyles(all); cur.recipe = JSON.parse(JSON.stringify(cur.auto)); sel = -1; applyRecipe(true); toast('Estilo automático restaurado'); };
    $('copyst').onclick = async () => {
      const txt = JSON.stringify({ sig: cur.sig, root: r.root, orient: r.orient, prog: r.prog });
      try { await navigator.clipboard.writeText(txt); toast('Estilo copiado'); }
      catch (e) { const t = $('sttext'); t.hidden = false; t.value = txt; t.select(); toast('Selecionado: copie com Ctrl+C'); }
    };
    $('pastest').onclick = () => { $('sttext').hidden = false; $('applyst').hidden = false; $('sttext').value = ''; $('sttext').focus(); };
    $('applyst').onclick = () => {
      try {
        const o = JSON.parse($('sttext').value);
        if (o.root == null || !o.prog) throw new Error();
        Object.assign(r, { root: o.root, orient: o.orient || r.orient, prog: o.prog }); applyRecipe(true);
        toast(o.sig && o.sig !== cur.sig ? 'Estilo aplicado (era de uma faca diferente; confira)' : 'Estilo aplicado');
      } catch (e) { toast('Esse texto não é um estilo válido'); }
    };
  }
  function applyRecipe(reframe) {
    const T = fold;
    V.setBox({ model: cur.model, recipe: cur.recipe, art: cur.art });
    V.setT(T); renderTicks();
    if (reframe) V.frame('iso', true);
    renderSpecs(); renderSide(); highlight();
  }
  function clearSel() { if (selLine) { selLine.parent && selLine.parent.remove(selLine); selLine.geometry.dispose(); selLine = null; } }
  function highlight() {
    clearSel();
    const st = V.state; if (sel < 0 || !st || !st.objs[sel] || panel !== 'dobras') return;
    const mesh = st.objs[sel];
    selLine = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--sel').trim() || '#2a6fdb', depthTest: false }));
    selLine.renderOrder = 10; mesh.add(selLine);
  }

  // ---------- conferência ----------
  function confHTML(close) {
    const { print, tech } = cur;
    if (!(print && tech && print.sheet && tech.sheet)) {
      return `<h2>Conferência ${close}</h2><p>Envie também a outra ficha (a de impressão e a técnica) para conferir as medidas uma contra a outra.</p>
        <p>Cada ficha é lida sozinha e as medidas são comparadas: chapa aberta, painéis, altura e caixa montada.</p>`;
    }
    const c = compare(print.sheet, tech.sheet);
    cur.conf = c;
    const cell = (v, r) => v == null ? '—' : r.count ? v : fmt(v);
    return `<h2>Conferência ${close}</h2>
      <p>${c.bad ? `<b>${c.bad}</b> diferença${c.bad > 1 ? 's' : ''} acima de 2,5 mm.` : 'As duas fichas batem (diferenças até 2,5 mm).'}</p>
      <div style="overflow-x:auto"><table class="conf"><thead><tr><th>Medida</th><th>Impressão</th><th>Técnica</th></tr></thead><tbody>
      ${c.rows.map(r => `<tr><td>${r.label}</td><td>${cell(r.x, r)}</td><td class="${r.bad ? 'bad' : r.x != null && r.y != null ? 'good' : ''}">${cell(r.y, r)}</td></tr>`).join('')}
      </tbody></table></div>
      <canvas class="overlay" id="ov"></canvas>
      <div class="legend"><span><i style="background:var(--accent)"></i>Impressão</span><span><i style="background:var(--fg)"></i>Técnica</span></div>
      <div class="field"><span class="lbl">Montar com a faca da</span>
        <div class="row"><button data-g="print" class="${cur.geom === print ? 'on' : ''}">Ficha de impressão</button><button data-g="tech" class="${cur.geom === tech ? 'on' : ''}">Ficha técnica</button></div></div>`;
  }
  function drawOverlay() {
    document.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { preferTech = b.dataset.g === 'tech'; rebuild(true).then(() => { panel = 'conf'; renderSpecs(); renderSide(); }); });
    const cv = $('ov'); if (!cv || !cur.conf) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio);
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const ctx = cv.getContext('2d'), A = cur.conf.A.model, B = cur.conf.B.model;
    const W = Math.max(A.W, B.W), H = Math.max(A.H, B.H), s = Math.min(cv.width / W, cv.height / H) * 0.92;
    const css = getComputedStyle(document.documentElement);
    const draw = (m, color, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.4 * dpr; ctx.setLineDash(dash);
      for (const F of m.faces) { ctx.beginPath(); F.poly.forEach((p, i) => { const x = cv.width / 2 + p[0] * s, y = cv.height / 2 - p[1] * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); }
    };
    draw(A, css.getPropertyValue('--accent').trim(), []);
    draw(B, css.getPropertyValue('--fg').trim(), [4 * dpr, 3 * dpr]);
  }

  // ---------- arte e papelão ----------
  function arteHTML(close) {
    const t = cur.model.thickness;
    const opts = [['', 'Automática'], ['1.6', 'Onda E — 1,6 mm'], ['3', 'Onda B — 3 mm'], ['4', 'Onda C — 4 mm'], ['4.5', 'Onda EB — 4,5 mm'], ['6.5', 'Onda BC — 6,5 mm']];
    return `<h2>Arte e papelão ${close}</h2>
      <div class="field"><label for="esp">Espessura do papelão</label>
        <select id="esp">${opts.map(([v, l]) => `<option value="${v}" ${String(thickness ?? '') === v ? 'selected' : ''}>${l}${!v ? ` (${fmt(t)} mm)` : ''}</option>`).join('')}</select></div>
      ${cur.hide ? `<div class="field"><span class="lbl">Traços escondidos na arte</span>
        <p>A faca e as cotas técnicas não são impressas. Marque o que deve sumir da arte.</p>
        <div class="layers">${cur.colors.map(c => `<label><input type="checkbox" data-col="${c}" ${cur.hide.stroke.has(c) ? 'checked' : ''}><span class="sw" style="background:${c}"></span>${cur.print.sheet && c === cur.print.sheet.dieline.color ? 'Faca' : c}</label>`).join('')}</div></div>` : '<p>Esta caixa está sem arte (só a ficha técnica foi enviada), então aparece em kraft liso com os picotes marcados.</p>'}`;
  }
  function bindArte() {
    $('esp').onchange = e => { thickness = e.target.value ? +e.target.value : null; rebuild(true).then(() => { panel = 'arte'; renderSpecs(); renderSide(); }); };
    document.querySelectorAll('[data-col]').forEach(cb => cb.onchange = async () => {
      cb.checked ? cur.hide.stroke.add(cb.dataset.col) : cur.hide.stroke.delete(cb.dataset.col);
      setBusy('Redesenhando a arte…');
      try {
        cur.art = await Texture.renderArt(cur.print.page, cur.print.sheet.dieline.bbox, cur.hide, Math.min(4096, V.renderer.capabilities.maxTextureSize));
        Texture.overlayCuts(cur.art, cur.model); applyRecipe();
      } finally { setBusy(null); }
    });
  }

  // ---------- controles de dobra ----------
  function renderTicks() {
    const st = V.state; const n = st ? Fold.timeline(st.recipe.prog).stages.length : 1;
    const k = Math.min(n, Math.max(0, Math.ceil(fold * n - 1e-6)));
    $('ticks').innerHTML = `<span class="${fold < 0.01 ? 'act' : ''}">Aberta</span><span class="${fold > 0.01 && fold < 0.99 ? 'act' : ''}">${fold > 0.01 && fold < 0.99 ? `Etapa ${k} de ${n}` : `${n} etapas`}</span><span class="${fold >= 0.99 ? 'act' : ''}">Montada</span>`;
    $('pct').textContent = Math.round(fold * 100) + '%';
  }
  function updPlay() { $('play').textContent = fold > .5 ? 'Abrir' : 'Montar'; }
  $('fold').oninput = e => { anim = null; fold = e.target.value / 1000; V.setT(fold); renderTicks(); updPlay(); };
  $('play').onclick = () => {
    const to = fold > .5 ? 0 : 1;
    if (reduced) { fold = to; $('fold').value = fold * 1000; V.setT(fold); renderTicks(); updPlay(); V.frame(to ? 'iso' : 'top'); return; }
    const n = V.state ? Fold.timeline(V.state.recipe.prog).stages.length : 3;
    anim = { from: fold, to, t: 0, dur: Math.min(9, 1.6 + n * 0.75) };
    if (!to) V.frame(cur && cur.recipe.orient === 'base' ? 'top' : 'front');
  };
  $('spin').onclick = e => { spin = !spin; e.currentTarget.classList.toggle('on', spin); V.controls.autoRotate = spin; V.controls.autoRotateSpeed = 1.5; };
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => V.frame(b.dataset.view));
  let last = performance.now();
  (function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / anim.dur);
      fold = anim.from + (anim.to - anim.from) * anim.t;
      $('fold').value = fold * 1000; V.setT(fold); renderTicks();
      if (anim.t >= 1) { anim = null; updPlay(); if (fold > .5) V.frame('iso'); }
    }
    requestAnimationFrame(tick);
  })(last);

  // seleção de painel (clique sem arrastar)
  let down = null;
  $('c').addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  $('c').addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !cur) return;
    const r = $('c').getBoundingClientRect();
    const hit = V.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (!hit) return;
    sel = hit.face;
    if (panel !== 'dobras') { panel = 'dobras'; renderSpecs(); }
    renderSide(); highlight();
  });

  // ---------- envio de arquivos ----------
  $('file').onchange = e => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; };
  let dragN = 0;
  addEventListener('dragenter', e => { e.preventDefault(); dragN++; $('drop').hidden = false; });
  addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('drop').hidden = true; });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('drop').hidden = true; if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });

  // ---------- exemplo inicial ----------
  async function loadSample() {
    const img = new Image();
    await new Promise(res => { img.onload = res; img.onerror = res; img.src = SAMPLE.art; });
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 2; cv.height = img.naturalHeight || 2;
    cv.getContext('2d').drawImage(img, 0, 0);
    const sheet = SAMPLE.sheet;
    const { model, recipe } = Styles.auto(sheet);
    sheets = [{ name: SAMPLE.name, kind: 'impressao', sheet, sample: true }];
    cur = { model, recipe, auto: JSON.parse(JSON.stringify(recipe)), art: cv, hide: null, colors: [], geom: sheets[0], print: null, tech: null, sig: signature(model), warns: [] };
    renderChips(sheets[0], null, sheets[0]);
    $('title').innerHTML = `Caixa padrão<small>envie o seu PDF para montar a sua caixa</small>`;
    V.setBox({ model, recipe, art: cv }); fold = 1; V.setT(1); V.frame('iso', true);
    renderTicks(); updPlay(); renderSpecs(); showMsg(null);
  }
  window.__montador = { addFiles, get cur() { return cur; }, V, setFold: v => { fold = v; $('fold').value = v * 1000; V.setT(v); renderTicks(); } };
  loadSample();
})();
