// Teste em lote: lê cada PDF, monta a caixa e compara com a medida interna da ficha.
// uso: node test/batch.js pasta/*.pdf  [--json saida.json]
const { loadPage } = require('./load');
global.THREE = require('three');
global.Outline = require('../src/outline');
const PDFVec = require('../src/pdfvec');
const Sheet = require('../src/sheet');
const Fold = require('../src/fold');
const Styles = require('../src/styles');
const fs = require('fs');

function dimsOf(model, recipe) {
  const tr = Fold.tree(model, recipe.root);
  const offs = Fold.layerOffsets(model, tr, recipe.prog);
  const { M } = Fold.poses(model, tr, recipe.prog, 1, offs);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  model.faces.forEach((F, f) => { if (M[f]) F.poly.forEach(p => box.expandByPoint(v.set(p[0], p[1], 0).applyMatrix4(M[f]))); });
  const s = box.getSize(new THREE.Vector3());
  return { dims: [s.x, s.y, s.z], loose: model.faces.length - tr.order.length };
}
const nums = s => s ? (s.match(/\d+(?:[.,]\d+)?/g) || []).map(v => parseFloat(v.replace(',', '.'))) : [];

(async () => {
  const args = process.argv.slice(2);
  const ji = args.indexOf('--json'); let jsonOut = null;
  if (ji >= 0) { jsonOut = args[ji + 1]; args.splice(ji, 2); }
  const rows = [];
  for (const f of args) {
    const name = f.split('/').pop();
    const r = { name };
    const t0 = Date.now();
    try {
      const { pdfjsLib, page } = await loadPage(f);
      const vec = await PDFVec.read(pdfjsLib, page);
      const sh = Sheet.analyze(vec);
      r.kind = sh.kind; r.scale = sh.scaleSource; r.outlined = !!sh.outlined; r.color = sh.dieline.color;
      r.panels = sh.dieline.panels.length; r.hinges = sh.dieline.hinges.length;
      r.cliente = sh.info.cliente; r.produto = sh.info.produto; r.interna = sh.info.interna;
      const { model, recipe: rec } = Styles.auto(sh);
      r.pieces = (sh.dieline.pieces || []).filter(p => p.copyOf < 0).length; r.rot = model.rot;
      r.style = rec.style;
      r.problems = [...(sh.problems || []), ...Styles.checkMeasures(sh, model, rec)];
      const d = dimsOf(model, rec);
      r.loose = d.loose;
      const got = d.dims.slice().sort((a, b) => b - a);
      const exp = nums(sh.info.interna).slice(0, 3).sort((a, b) => b - a);
      r.got = got.map(v => Math.round(v));
      if (exp.length === 3) {
        // caixa montada (externa) deve ficar entre a interna e a interna + ~4 espessuras + folga
        const err = got.map((g, i) => g - exp[i]);
        r.err = err.map(v => Math.round(v));
        const t = model.thickness;
        r.ok = err.every(e => e > -t * 2 - 2 && e < t * 6 + 12);
      } else r.ok = null;
    } catch (e) { r.error = e.message.slice(0, 90); }
    r.ms = Date.now() - t0;
    rows.push(r);
    const st = r.error ? 'ERRO ' + r.error : `${(r.style || '').padEnd(9)} p${String(r.panels).padStart(2)} v${String(r.hinges).padStart(2)} ${r.scale === 'tamanho real do PDF' ? '1:1!' : '    '} int ${String(r.interna || '-').padEnd(18)} got ${r.got.join('x').padEnd(14)} ${r.ok === true ? 'OK' : r.ok === false ? 'DIF ' + r.err.join(',') : '?'}${r.loose ? ' soltos ' + r.loose : ''}${r.outlined ? ' contorno' : ''}${r.rot ? ' girada' : ''}${r.pieces > 1 ? ' peças ' + r.pieces : ''}${r.problems && r.problems.length ? ' AVISO-ARQUIVO ' + r.problems.length : ''}`;
    console.log(name.padEnd(18), (r.kind || '').padEnd(10), st);
  }
  const ok = rows.filter(r => r.ok === true).length, err = rows.filter(r => r.error).length;
  console.log(`\n${rows.length} arquivos: ${ok} OK, ${rows.filter(r => r.ok === false).length} com diferença, ${rows.filter(r => r.ok === null && !r.error).length} sem medida para conferir, ${err} erros`);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
})();
