const { loadPage } = require('./load');
const PDFVec = require('../src/pdfvec');
const Sheet = require('../src/sheet');
const Fold = require('../src/fold');
const Styles = require('../src/styles');
const THREE = require('three');
(async () => {
  for (const f of process.argv.slice(2)) {
    const name = f.split('/').pop();
    try {
      const { pdfjsLib, page } = await loadPage(f);
      const vec = await PDFVec.read(pdfjsLib, page);
      const sh = Sheet.analyze(vec);
      const model = Fold.buildModel(sh);
      const r = Styles.detect(model);
      const tr = Fold.tree(model, r.root);
      const t0 = Date.now();
      const offs = Fold.layerOffsets(model, tr, r.prog);
      const { M } = Fold.poses(model, tr, r.prog, 1, offs);
      const box = new THREE.Box3();
      model.faces.forEach((F, i) => F.poly.forEach(p => box.expandByPoint(new THREE.Vector3(p[0], p[1], 0).applyMatrix4(M[i]))));
      const s = box.getSize(new THREE.Vector3());
      const unreached = tr.order.length < model.faces.length ? ` (${model.faces.length - tr.order.length} painéis soltos)` : '';
      console.log(name.padEnd(16), r.style.padEnd(9), 'raiz', r.root, 'final', [s.x, s.y, s.z].map(v => v.toFixed(0)).join('x'), 'interna', sh.info.interna, 'camadas', offs.filter(Boolean).length, (Date.now() - t0) + 'ms' + unreached);
    } catch (e) { console.log(name, 'ERRO', e.message); }
  }
})();
