global.THREE=require('three');global.Outline=require('../src/outline');
const { loadPage } = require('./load'); const PDFVec=require('../src/pdfvec'); const D=require('../src/dieline');
(async()=>{ for (const f of process.argv.slice(2)) { console.log('==', f); const {pdfjsLib,page}=await loadPage(f); const v=await PDFVec.read(pdfjsLib,page); try { D.analyze(v,{debugAll:true}); } catch(e){ console.log('erro', e.message); } } })();
