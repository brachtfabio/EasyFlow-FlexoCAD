const { loadPage } = require('./load');
const PDFVec = require('../src/pdfvec');
const Dieline = require('../src/dieline');
const fs = require('fs');
const { execSync } = require('child_process');
const hsl2hex = h => { const f = n => { const k = (n + h / 30) % 12, a = 0.6 * Math.min(0.8, 1 - 0.8); const c = 0.8 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, '0'); }; return '#' + f(0) + f(8) + f(4); };
(async () => {
  for (const f of process.argv.slice(2)) {
    const name = f.split('/').pop().replace('.pdf', '');
    const { pdfjsLib, page } = await loadPage(f);
    const vec = await PDFVec.read(pdfjsLib, page);
    let d;
    try { d = require('../src/sheet').analyze(vec).dieline; } catch (e) { console.log(name, 'ERRO', e.message, JSON.stringify(e.details || '').slice(0, 300)); continue; }
    const b = d.bbox, pad = (b.x1 - b.x0) * 0.03;
    const vb = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad];
    const sw = (b.x1 - b.x0) / 900;
    const pts = p => p.map(q => q.join(',')).join(' ');
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="1400" height="${Math.round(1400 * vb[3] / vb[2])}"><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="white"/>`;
    d.panels.forEach((p, i) => {
      const hue = (i * 67) % 360;
      const dpath = 'M' + p.poly.map(q => q.join(',')).join('L') + 'Z' + p.holes.map(h => 'M' + h.map(q => q.join(',')).join('L') + 'Z').join('');
      svg += `<path d="${dpath}" fill="${hsl2hex(hue)}" fill-rule="evenodd" stroke="#333" stroke-width="${sw}"/>`;
      svg += `<text x="${p.ip[0]}" y="${p.ip[1]}" font-size="${sw * 14}" fill="#000">${p.id}</text>`;
    });
    d.hinges.forEach(h => { svg += `<line x1="${h.p0[0]}" y1="${h.p0[1]}" x2="${h.p1[0]}" y2="${h.p1[1]}" stroke="${h.curved ? 'orange' : 'red'}" stroke-width="${sw * 2.5}"/>`; });
    d.perfs.forEach(s => { svg += `<line x1="${s[0][0]}" y1="${s[0][1]}" x2="${s[1][0]}" y2="${s[1][1]}" stroke="green" stroke-width="${sw * 2}"/>`; });
    d.slits.forEach(s => { svg += `<line x1="${s[0][0]}" y1="${s[0][1]}" x2="${s[1][0]}" y2="${s[1][1]}" stroke="blue" stroke-width="${sw * 2}"/>`; });
    svg += '</svg>';
    fs.writeFileSync(`out/${name}.svg`, svg);
    execSync(`python3 -c "import cairosvg;cairosvg.svg2png(url='out/${name}.svg',write_to='out/${name}.png')"`);
    console.log(name, 'cor', d.color, 'painéis', d.panels.length, 'vincos', d.hinges.length, 'furos', d.panels.reduce((s, p) => s + p.holes.length, 0), 'picotes', d.perfs.length, 'soltos', d.slits.length, 'tol', d.tol.toFixed(2));
  }
})();
