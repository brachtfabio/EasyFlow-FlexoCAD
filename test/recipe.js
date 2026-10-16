const { loadPage } = require('./load');
const PDFVec = require('../src/pdfvec');
const Sheet = require('../src/sheet');
const Fold = require('../src/fold');
const Styles = require('../src/styles');
(async () => {
  const f = process.argv[2];
  const { pdfjsLib, page } = await loadPage(f);
  const sh = Sheet.analyze(await PDFVec.read(pdfjsLib, page));
  const model = Fold.buildModel(sh);
  const r = Styles.detect(model);
  const tr = Fold.tree(model, r.root);
  console.log(r.label, 'root face', model.faces[r.root].id, 'chain', JSON.stringify(Styles.detectRSC(model)));
  for (const f of tr.order) {
    const F = model.faces[f];
    const p = tr.parent[f] >= 0 ? model.faces[tr.parent[f]].id : '-';
    const pr = r.prog[tr.via[f]] || {};
    console.log(`face ${F.id} (idx ${f}) ${F.w.toFixed(0)}x${F.h.toFixed(0)} c=${F.c.map(v=>v.toFixed(0))} parent ${p} angle ${pr.angle} stage ${pr.stage}`);
  }
})();
