const { loadPage } = require('./load');
const PDFVec = require('../src/pdfvec');
const Sheet = require('../src/sheet'); global.Outline = require('../src/outline');
(async () => {
  for (const f of process.argv.slice(2)) {
    const { pdfjsLib, page } = await loadPage(f);
    const vec = await PDFVec.read(pdfjsLib, page);
    try {
      const s = Sheet.analyze(vec);
      const b = s.dieline.bbox;
      console.log(f.split('/').pop().padEnd(16), s.kind.padEnd(10), 'escala', s.scaleSource, 'mm:', ((b.x1-b.x0)/s.SX).toFixed(0)+'x'+((b.y1-b.y0)/s.SY).toFixed(0), 'sx/sy', (s.SX/s.SY).toFixed(3), 'espelho', s.mirror, 'onda', s.flute.onda);
      console.log('   ', JSON.stringify(s.info));
    } catch (e) { console.log(f, 'ERRO', e.message); }
  }
})();
