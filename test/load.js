const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
async function loadPage(file) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  return { pdfjsLib, page: await doc.getPage(1), doc };
}
module.exports = { loadPage, pdfjsLib };
